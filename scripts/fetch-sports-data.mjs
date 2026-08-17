#!/usr/bin/env node
/**
 * Downloads the current season's teams and fixtures for every league in
 * `leagues.mjs` and writes them into `public/data/`.
 *
 * The output is committed to the repository and served from the app's own
 * origin. That is deliberate:
 *   - no CORS surprises, no API key, no rate limit at runtime;
 *   - the Android build ships the data inside the APK, so league and team
 *     pickers work with no network at all;
 *   - a scheduled workflow refreshes it, so the app does not depend on a third
 *     party being up at the moment a user opens the bet form.
 *
 * Run with `npm run fetch:sports`.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { LEAGUES } from './leagues.mjs';

const API = 'https://site.api.espn.com/apis/site/v2/sports';
const OUT_DIR = new URL('../public/data/', import.meta.url);

const TIMEOUT_MS = 30_000;
const RETRIES = 3;

async function getJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      // Back off before retrying; the API rate-limits bursts.
      if (attempt < RETRIES) await new Promise((r) => setTimeout(r, attempt * 1500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${url} failed after ${RETRIES} attempts: ${lastError?.message}`);
}

/**
 * Season window as a YYYYMMDD-YYYYMMDD range.
 * Seasons that cross new year start in the previous calendar year when we are
 * in the early months, so the range always covers the campaign in progress.
 */
function seasonRange(season, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based

  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (y, m, d) => `${y}${pad(m)}${pad(d)}`;

  switch (season) {
    case 'aug-may':
    case 'jul-may':
    case 'sep-may': {
      const startMonth = season === 'jul-may' ? 7 : season === 'sep-may' ? 9 : 8;
      // Before June we are in the second half of a campaign that began last year.
      const startYear = month < 5 ? year - 1 : year;
      return [fmt(startYear, startMonth, 1), fmt(startYear + 1, 6, 30)];
    }
    case 'aug-feb': {
      const startYear = month < 2 ? year - 1 : year;
      return [fmt(startYear, 8, 1), fmt(startYear + 1, 3, 1)];
    }
    case 'aug-jan': {
      const startYear = month < 2 ? year - 1 : year;
      return [fmt(startYear, 8, 1), fmt(startYear + 1, 2, 1)];
    }
    case 'oct-jun': {
      const startYear = month < 7 ? year - 1 : year;
      return [fmt(startYear, 10, 1), fmt(startYear + 1, 7, 15)];
    }
    case 'nov-apr': {
      const startYear = month < 6 ? year - 1 : year;
      return [fmt(startYear, 11, 1), fmt(startYear + 1, 5, 1)];
    }
    case 'apr-nov':
    default:
      // Calendar-year seasons (Scandinavia) need no cross-year handling.
      return [fmt(year, 1, 1), fmt(year, 12, 31)];
  }
}

async function fetchTeams(league) {
  const [sport, slug] = league.espn;
  const limit = league.teamLimit ? `?limit=${league.teamLimit}` : '';
  const data = await getJson(`${API}/${sport}/${slug}/teams${limit}`);
  const entries = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];

  return entries
    .map((entry) => entry.team)
    .filter(Boolean)
    .map((team) => ({
      id: String(team.id),
      name: team.displayName ?? team.name ?? '',
      short: team.shortDisplayName ?? team.abbreviation ?? '',
      abbr: team.abbreviation ?? '',
    }))
    .filter((t) => t.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Steps a YYYYMMDD string forward by `days`. */
function addDays(yyyymmdd, days) {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

const WINDOW_DAYS = 45;

/**
 * Fixtures for the whole season.
 *
 * The scoreboard endpoint caps a response at 1000 events and 404s on some very
 * long ranges, so the season is walked in windows and the results merged. Teams
 * seen here are returned too, because a few leagues expose fixtures but no
 * team roster.
 */
async function fetchFixtures(league) {
  const [sport, slug] = league.espn;
  const [seasonStart, seasonEnd] = seasonRange(league.season);

  const byId = new Map();
  const teamsSeen = new Map();
  let windowStart = seasonStart;

  while (windowStart < seasonEnd) {
    const windowEnd = addDays(windowStart, WINDOW_DAYS) > seasonEnd
      ? seasonEnd
      : addDays(windowStart, WINDOW_DAYS);

    let data;
    try {
      data = await getJson(
        `${API}/${sport}/${slug}/scoreboard?dates=${windowStart}-${windowEnd}&limit=1000`,
      );
    } catch {
      // An empty or unavailable window is normal out of season; keep walking.
      windowStart = addDays(windowEnd, 1);
      continue;
    }

    for (const event of data?.events ?? []) {
      const competitors = event.competitions?.[0]?.competitors;
      if (!competitors || competitors.length < 2) continue;

      const home = competitors.find((c) => c.homeAway === 'home')?.team;
      const away = competitors.find((c) => c.homeAway === 'away')?.team;
      if (!home || !away) continue;

      for (const team of [home, away]) {
        if (!teamsSeen.has(String(team.id))) {
          teamsSeen.set(String(team.id), {
            id: String(team.id),
            name: team.displayName ?? team.name ?? '',
            short: team.shortDisplayName ?? team.abbreviation ?? '',
            abbr: team.abbreviation ?? '',
          });
        }
      }

      byId.set(String(event.id), {
        id: String(event.id),
        // Minute precision is plenty and keeps the payload small.
        d: (event.date ?? '').slice(0, 16),
        h: String(home.id),
        a: String(away.id),
      });
    }

    windowStart = addDays(windowEnd, 1);
  }

  return {
    fixtures: [...byId.values()].sort((a, b) => a.d.localeCompare(b.d)),
    teamsFromFixtures: [...teamsSeen.values()].filter((t) => t.name),
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const catalog = { generatedAt: new Date().toISOString(), leagues: [] };
  const fixtures = { generatedAt: catalog.generatedAt, leagues: {} };
  const failures = [];

  for (const league of LEAGUES) {
    process.stdout.write(`• ${league.id} … `);
    try {
      let teams = [];
      try {
        teams = await fetchTeams(league);
      } catch (err) {
        failures.push(`${league.id} teams: ${err.message}`);
      }

      let matches = [];
      try {
        const result = await fetchFixtures(league);
        matches = result.fixtures;
        // Some leagues expose no team roster at all; the fixtures still name
        // every team, so fall back to those rather than shipping an empty
        // picker.
        if (teams.length === 0 && result.teamsFromFixtures.length > 0) {
          teams = result.teamsFromFixtures.sort((a, b) => a.name.localeCompare(b.name));
        }
      } catch (err) {
        // Teams alone still make the pickers useful, so a missing schedule is
        // a warning rather than a failure.
        failures.push(`${league.id} fixtures: ${err.message}`);
      }

      if (teams.length === 0) {
        failures.push(`${league.id}: no teams available`);
        console.log('skipped (no teams)');
        continue;
      }

      catalog.leagues.push({
        id: league.id,
        sport: league.sport,
        name: league.name,
        country: league.country,
        teams,
      });
      fixtures.leagues[league.id] = matches;

      console.log(`${teams.length} teams, ${matches.length} fixtures`);
    } catch (err) {
      failures.push(`${league.id}: ${err.message}`);
      console.log(`FAILED (${err.message})`);
    }
  }

  if (catalog.leagues.length === 0) {
    throw new Error('every league failed — refusing to overwrite the data files');
  }

  await writeFile(new URL('catalog.json', OUT_DIR), JSON.stringify(catalog));
  await writeFile(new URL('fixtures.json', OUT_DIR), JSON.stringify(fixtures));

  const totalTeams = catalog.leagues.reduce((n, l) => n + l.teams.length, 0);
  const totalFixtures = Object.values(fixtures.leagues).reduce((n, f) => n + f.length, 0);

  console.log(
    `\n${catalog.leagues.length} leagues · ${totalTeams} teams · ${totalFixtures} fixtures`,
  );
  if (failures.length > 0) {
    console.log('\nWarnings:');
    for (const f of failures) console.log(`  - ${f}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

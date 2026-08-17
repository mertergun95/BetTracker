import { newId } from './ids';
import { parseOdds } from './odds';
import { settleBet } from './settlement';
import type {
  Bankroll,
  Bet,
  BetStructure,
  BuilderPick,
  Selection,
  SelectionStatus,
  Settings,
  Transaction,
} from './types';

/**
 * Separator between a leg's builder picks inside one CSV cell.
 * The `market` and `pick` columns are split on it and zipped back together, so
 * a bet builder survives a round trip through a spreadsheet.
 */
const PICK_SEPARATOR = ' | ';

/**
 * Backup, export and import.
 *
 * Since the app has no server, the JSON backup IS the user's safety net and
 * the only way to move data between devices. It is versioned so future schema
 * changes can migrate old files rather than reject them.
 */

export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: 'bettracker-backup';
  version: number;
  exportedAt: number;
  bankrolls: Bankroll[];
  bets: Bet[];
  transactions: Transaction[];
  settings?: Settings;
}

export function buildBackup(data: {
  bankrolls: Bankroll[];
  bets: Bet[];
  transactions: Transaction[];
  settings?: Settings;
}): BackupFile {
  return {
    format: 'bettracker-backup',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    ...data,
  };
}

export interface BackupParseResult {
  ok: boolean;
  error?: string;
  data?: BackupFile;
}

export function parseBackup(text: string): BackupParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalidJson' };
  }

  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'invalidFormat' };
  const candidate = raw as Partial<BackupFile>;
  if (candidate.format !== 'bettracker-backup') return { ok: false, error: 'invalidFormat' };
  if (typeof candidate.version !== 'number' || candidate.version > BACKUP_VERSION) {
    return { ok: false, error: 'unsupportedVersion' };
  }
  if (!Array.isArray(candidate.bets) || !Array.isArray(candidate.bankrolls)) {
    return { ok: false, error: 'invalidFormat' };
  }

  return {
    ok: true,
    data: {
      format: 'bettracker-backup',
      version: candidate.version,
      exportedAt: candidate.exportedAt ?? Date.now(),
      bankrolls: candidate.bankrolls,
      bets: candidate.bets,
      transactions: candidate.transactions ?? [],
      settings: candidate.settings,
    },
  };
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/** Column order of the CSV export, and what the importer expects. */
export const CSV_COLUMNS = [
  'bet_id',
  'date',
  'bankroll',
  'structure',
  'system_sizes',
  'bookmaker',
  'sport',
  'competition',
  'event',
  'market',
  'pick',
  'side',
  'odds',
  'closing_odds',
  'status',
  'stake',
  'commission',
  'free_bet',
  'cashout',
  'each_way_fraction',
  'tipster',
  'tags',
  'note',
  'profit',
] as const;

function escapeCsv(value: unknown): string {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * One row per selection. Rows sharing a `bet_id` reassemble into one bet, so
 * multi-leg accumulators and systems survive a round trip.
 */
export function betsToCsv(bets: Bet[], bankrollNames: Map<string, string> = new Map()): string {
  const lines: string[] = [CSV_COLUMNS.join(',')];

  for (const bet of bets) {
    const settlement = settleBet(bet);
    bet.selections.forEach((sel, index) => {
      const row: Record<(typeof CSV_COLUMNS)[number], unknown> = {
        bet_id: bet.id,
        date: new Date(bet.placedAt).toISOString(),
        bankroll: bankrollNames.get(bet.bankrollId) ?? bet.bankrollId,
        structure: bet.structure,
        system_sizes: bet.system?.sizes.join('+') ?? '',
        bookmaker: bet.bookmaker,
        sport: sel.sport,
        competition: sel.competition,
        event: sel.event,
        market: sel.picks.map((p) => p.market).join(PICK_SEPARATOR),
        pick: sel.picks.map((p) => p.pick).join(PICK_SEPARATOR),
        side: sel.side,
        odds: sel.odds,
        closing_odds: sel.closingOdds ?? '',
        status: sel.status,
        // Bet-level values belong to the bet, not each leg; repeating them
        // would double-count on import.
        stake: index === 0 ? bet.unitStake : '',
        commission: index === 0 ? bet.commission : '',
        free_bet: index === 0 ? (bet.freeBet ? '1' : '0') : '',
        cashout: index === 0 ? (bet.cashOutAmount ?? '') : '',
        each_way_fraction: index === 0 ? (bet.eachWay?.fraction ?? '') : '',
        tipster: index === 0 ? (bet.tipster ?? '') : '',
        tags: index === 0 ? bet.tags.join('|') : '',
        note: index === 0 ? (bet.note ?? '') : '',
        profit: index === 0 ? settlement.profit.toFixed(2) : '',
      };
      lines.push(CSV_COLUMNS.map((c) => escapeCsv(row[c])).join(','));
    });
  }

  return lines.join('\n');
}

/** RFC 4180 style parser: handles quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const stripped = text.replace(/^﻿/, '');

  for (let i = 0; i < stripped.length; i++) {
    const char = stripped[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (stripped[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',' || char === ';') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface CsvImportResult {
  bets: Bet[];
  /** Row numbers (1-based, counting the header) that could not be read. */
  skipped: number[];
  errors: string[];
}

const VALID_STATUSES: SelectionStatus[] = [
  'pending',
  'won',
  'lost',
  'void',
  'half_won',
  'half_lost',
];

function normaliseStatus(raw: string): SelectionStatus {
  const s = raw.trim().toLowerCase().replace(/[\s-]/g, '_');
  if (VALID_STATUSES.includes(s as SelectionStatus)) return s as SelectionStatus;
  // Accept the words people actually type, in both languages.
  const aliases: Record<string, SelectionStatus> = {
    win: 'won',
    winner: 'won',
    kazandi: 'won',
    kazandı: 'won',
    lose: 'lost',
    loss: 'lost',
    kaybetti: 'lost',
    iade: 'void',
    refund: 'void',
    refunded: 'void',
    push: 'void',
    cancelled: 'void',
    canceled: 'void',
    open: 'pending',
    bekliyor: 'pending',
    half_win: 'half_won',
    half_loss: 'half_lost',
  };
  return aliases[s] ?? 'pending';
}

/** Zips the market and pick cells back into builder picks. */
function parsePicks(marketCell: string, pickCell: string): BuilderPick[] {
  const markets = marketCell ? marketCell.split(PICK_SEPARATOR) : [];
  const picks = pickCell ? pickCell.split(PICK_SEPARATOR) : [];
  const count = Math.max(markets.length, picks.length, 1);

  return Array.from({ length: count }, (_, i) => ({
    id: newId('pk_'),
    market: (markets[i] ?? '').trim(),
    pick: (picks[i] ?? '').trim(),
  }));
}

function normaliseStructure(raw: string): BetStructure {
  const s = raw.trim().toLowerCase();
  if (s.startsWith('acc') || s.startsWith('komb') || s === 'parlay' || s === 'multi') {
    return 'accumulator';
  }
  if (s.startsWith('sys') || s.startsWith('sis')) return 'system';
  return 'single';
}

/**
 * Reads a CSV back into bets. Unparseable rows are skipped and reported rather
 * than aborting the whole import — a bad row in the middle of a year of
 * history should not cost the user the other 500.
 */
export function csvToBets(
  text: string,
  options: { bankrollId: string; defaultBookmaker?: string },
): CsvImportResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const skipped: number[] = [];

  if (rows.length < 2) return { bets: [], skipped, errors: ['emptyFile'] };

  const header = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = (name: string) => header.indexOf(name);

  const idx = {
    betId: col('bet_id'),
    date: col('date'),
    structure: col('structure'),
    systemSizes: col('system_sizes'),
    bookmaker: col('bookmaker'),
    sport: col('sport'),
    competition: col('competition'),
    event: col('event'),
    market: col('market'),
    pick: col('pick'),
    side: col('side'),
    odds: col('odds'),
    closingOdds: col('closing_odds'),
    status: col('status'),
    stake: col('stake'),
    commission: col('commission'),
    freeBet: col('free_bet'),
    cashout: col('cashout'),
    eachWay: col('each_way_fraction'),
    tipster: col('tipster'),
    tags: col('tags'),
    note: col('note'),
  };

  if (idx.odds === -1 || idx.stake === -1) {
    return { bets: [], skipped, errors: ['missingRequiredColumns'] };
  }

  const get = (row: string[], i: number): string => (i >= 0 ? (row[i] ?? '').trim() : '');
  const num = (v: string): number | null => {
    if (!v) return null;
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  // Group rows into bets, keeping first-seen order.
  const groups = new Map<string, { rows: string[][]; rowNumbers: number[] }>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const oddsText = get(row, idx.odds);
    const odds = parseOdds(oddsText);
    if (odds === null || odds <= 1) {
      skipped.push(i + 1);
      continue;
    }
    // Rows without a bet_id are standalone singles.
    const key = get(row, idx.betId) || `__row_${i}`;
    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
      group.rowNumbers.push(i + 1);
    } else {
      groups.set(key, { rows: [row], rowNumbers: [i + 1] });
    }
  }

  const bets: Bet[] = [];

  for (const [, group] of groups) {
    const first = group.rows[0]!;

    const stake = num(get(first, idx.stake));
    if (stake === null || stake < 0) {
      skipped.push(...group.rowNumbers);
      continue;
    }

    const dateText = get(first, idx.date);
    const parsedDate = dateText ? Date.parse(dateText) : NaN;
    const placedAt = Number.isFinite(parsedDate) ? parsedDate : Date.now();

    const selections: Selection[] = group.rows.map((row) => {
      const odds = parseOdds(get(row, idx.odds)) ?? 1;
      const closing = parseOdds(get(row, idx.closingOdds));
      const sideText = get(row, idx.side).toLowerCase();
      return {
        id: newId('sel_'),
        event: get(row, idx.event) || '—',
        sport: get(row, idx.sport) || 'other',
        competition: get(row, idx.competition),
        picks: parsePicks(get(row, idx.market), get(row, idx.pick)),
        odds,
        side: sideText === 'lay' ? 'lay' : 'back',
        closingOdds: closing !== null && closing > 1 ? closing : undefined,
        status: normaliseStatus(get(row, idx.status)),
      };
    });

    const structureText = get(first, idx.structure);
    let structure: BetStructure = structureText
      ? normaliseStructure(structureText)
      : selections.length > 1
        ? 'accumulator'
        : 'single';
    // A single can only hold one leg; grouped rows must be a multiple.
    if (structure === 'single' && selections.length > 1) structure = 'accumulator';

    const sizesText = get(first, idx.systemSizes);
    const sizes = sizesText
      .split(/[+,;]/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    const cashout = num(get(first, idx.cashout));
    const ewFraction = num(get(first, idx.eachWay));
    const freeBetText = get(first, idx.freeBet).toLowerCase();
    const tagsText = get(first, idx.tags);

    const bet: Bet = {
      id: newId('bet_'),
      bankrollId: options.bankrollId,
      structure,
      selections,
      unitStake: stake,
      bookmaker: get(first, idx.bookmaker) || options.defaultBookmaker || 'Other',
      commission: num(get(first, idx.commission)) ?? 0,
      system:
        structure === 'system' && sizes.length > 0
          ? { sizes, preset: 'custom' }
          : structure === 'system'
            ? { sizes: [selections.length], preset: 'custom' }
            : undefined,
      eachWay: ewFraction !== null && ewFraction > 0 ? { places: 3, fraction: ewFraction } : undefined,
      freeBet: freeBetText === '1' || freeBetText === 'true' || freeBetText === 'yes',
      cashOutAmount: cashout !== null ? cashout : undefined,
      tipster: get(first, idx.tipster) || undefined,
      tags: tagsText ? tagsText.split(/[|,]/).map((t) => t.trim()).filter(Boolean) : [],
      note: get(first, idx.note) || undefined,
      placedAt,
      settledAt: selections.every((s) => s.status !== 'pending') ? placedAt : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    bets.push(bet);
  }

  return { bets, skipped: skipped.sort((a, b) => a - b), errors };
}

/* ------------------------------------------------------------------ *
 * Browser download helper
 * ------------------------------------------------------------------ */

/** Triggers a file download from an in-memory string. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke on the next tick so the click has definitely been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

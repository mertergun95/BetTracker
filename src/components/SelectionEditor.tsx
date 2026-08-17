import { useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import { newId } from '@/core/ids';
import { COMMON_MARKETS, SPORTS, sportIcon } from '@/core/reference';
import {
  countryFlag,
  findLeague,
  fixturesForLeague,
  leaguesForSports,
  type Catalog,
  type FixtureFile,
} from '@/core/sportsData';
import type { BuilderPick, Selection } from '@/core/types';
import { Field, NumberInput, Segmented, Select, TextInput } from './ui';

/**
 * Editor for one leg of a bet.
 *
 * A leg carries several picks under a single price — that is what a bet
 * builder is, and why odds live here rather than on each pick.
 *
 * The match is chosen from the bundled fixture catalogue where possible:
 * pick a league, then either a scheduled fixture or the two teams directly.
 * Everything still falls back to free text when the catalogue has no entry.
 */

type MatchMode = 'fixture' | 'teams' | 'manual';

export default function SelectionEditor({
  selection,
  index,
  canRemove,
  allowedSports,
  catalog,
  fixtures,
  showSide,
  eachWay,
  onChange,
  onRemove,
}: {
  selection: Selection;
  index: number;
  canRemove: boolean;
  /** Sports the bankroll accepts; empty means no restriction. */
  allowedSports: string[];
  catalog: Catalog;
  fixtures: FixtureFile;
  showSide: boolean;
  eachWay: boolean;
  onChange: (patch: Partial<Selection>) => void;
  onRemove: () => void;
}) {
  const { t, formatDate } = useI18n();

  // A new leg opens on the fixture tab — picking a scheduled match is the
  // fastest path and the reason the catalogue is bundled. A saved leg reopens
  // on whichever tab it was entered with, so editing never rewrites the event.
  const [mode, setMode] = useState<MatchMode>(() => {
    if (selection.fixtureId) return 'fixture';
    if (selection.homeTeam) return 'teams';
    // Free text already typed must not be hidden behind another tab.
    return selection.event ? 'manual' : 'fixture';
  });

  const leagues = useMemo(
    () => leaguesForSports(catalog, allowedSports),
    [catalog, allowedSports],
  );

  const league = selection.leagueId ? findLeague(catalog, selection.leagueId) : undefined;

  const upcoming = useMemo(
    () =>
      selection.leagueId
        ? fixturesForLeague(catalog, fixtures, selection.leagueId, {
            windowDaysBack: 3,
            windowDaysForward: 30,
          })
        : [],
    [catalog, fixtures, selection.leagueId],
  );

  const sportOptions = useMemo(() => {
    const keys = allowedSports.length > 0 ? allowedSports : SPORTS.map((s) => s.key);
    return keys.map((key) => ({
      value: key,
      label: `${sportIcon(key)}  ${t(`sport.${key}` as 'sport.football')}`,
    }));
  }, [allowedSports, t]);

  function selectLeague(leagueId: string) {
    const next = findLeague(catalog, leagueId);
    onChange({
      leagueId: leagueId || undefined,
      competition: next?.name ?? '',
      sport: next?.sport ?? selection.sport,
      // The old match belongs to the old league.
      fixtureId: undefined,
      homeTeam: undefined,
      awayTeam: undefined,
      event: '',
      eventAt: undefined,
    });
  }

  function selectFixture(fixtureId: string) {
    const match = upcoming.find((f) => f.id === fixtureId);
    if (!match) {
      onChange({ fixtureId: undefined });
      return;
    }
    onChange({
      fixtureId: match.id,
      homeTeam: match.home.name,
      awayTeam: match.away.name,
      event: match.label,
      eventAt: match.kickoff,
    });
  }

  function selectTeam(which: 'home' | 'away', teamName: string) {
    const home = which === 'home' ? teamName : (selection.homeTeam ?? '');
    const away = which === 'away' ? teamName : (selection.awayTeam ?? '');
    onChange({
      homeTeam: home || undefined,
      awayTeam: away || undefined,
      // Teams picked by hand no longer point at a scheduled fixture.
      fixtureId: undefined,
      event: home && away ? `${home} - ${away}` : home || away,
    });
  }

  function patchPick(pickId: string, patch: Partial<BuilderPick>) {
    onChange({
      picks: selection.picks.map((p) => (p.id === pickId ? { ...p, ...patch } : p)),
    });
  }

  function addPick() {
    onChange({
      picks: [...selection.picks, { id: newId('pk_'), market: '', pick: '' }],
    });
  }

  function removePick(pickId: string) {
    onChange({ picks: selection.picks.filter((p) => p.id !== pickId) });
  }

  const isBuilder = selection.picks.length > 1;
  const teamOptions = (league?.teams ?? []).map((team) => ({ value: team.name, label: team.name }));

  return (
    <div className="leg">
      <div className="leg__head">
        <span className="leg__index">{index + 1}</span>
        <span className="leg__title">
          {selection.event || t('bet.selectMatch')}
          {isBuilder && (
            <span className="badge badge--pending" style={{ marginLeft: 8 }}>
              {t('bet.builder')} ×{selection.picks.length}
            </span>
          )}
        </span>
        {canRemove && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onRemove}
            aria-label={t('bet.removeSelection')}
          >
            ✕
          </button>
        )}
      </div>

      <div className="stack" style={{ gap: 10 }}>
        {/* Sport is only a choice when the bankroll allows more than one. */}
        {sportOptions.length > 1 && (
          <div className="form-grid">
            <Field label={t('bet.sport')}>
              <Select
                value={selection.sport}
                onChange={(v) => onChange({ sport: v })}
                options={sportOptions}
              />
            </Field>
            <Field label={t('bet.competition')}>
              <Select
                value={selection.leagueId ?? ''}
                onChange={selectLeague}
                placeholder={t('bet.leaguePlaceholder')}
                options={leagues
                  .filter((l) => l.sport === selection.sport)
                  .map((l) => ({
                    value: l.id,
                    label: `${countryFlag(l.country)} ${l.name}`,
                  }))}
              />
            </Field>
          </div>
        )}

        {sportOptions.length <= 1 && (
          <Field label={t('bet.competition')}>
            <Select
              value={selection.leagueId ?? ''}
              onChange={selectLeague}
              placeholder={t('bet.leaguePlaceholder')}
              options={leagues.map((l) => ({
                value: l.id,
                label: `${countryFlag(l.country)} ${l.name}`,
              }))}
            />
          </Field>
        )}

        {/* Match */}
        <Field label={t('bet.event')}>
          <div className="stack" style={{ gap: 8 }}>
            <Segmented<MatchMode>
              block
              value={mode}
              onChange={setMode}
              options={[
                { value: 'fixture', label: `${t('bet.fixture')}${upcoming.length ? ` (${upcoming.length})` : ''}` },
                { value: 'teams', label: t('bet.teams') },
                { value: 'manual', label: t('bet.manual') },
              ]}
            />

            {mode === 'fixture' &&
              (upcoming.length > 0 ? (
                <Select
                  value={selection.fixtureId ?? ''}
                  onChange={selectFixture}
                  placeholder={t('bet.selectMatch')}
                  options={upcoming.map((f) => ({
                    value: f.id,
                    label: `${formatDate(f.kickoff, 'dateTime')} · ${f.label}`,
                  }))}
                />
              ) : (
                <div className="banner banner--info">
                  {selection.leagueId ? t('bet.noFixtures') : t('bet.pickLeagueFirst')}
                </div>
              ))}

            {mode === 'teams' &&
              (teamOptions.length > 0 ? (
                <div className="form-grid">
                  <Select
                    value={selection.homeTeam ?? ''}
                    onChange={(v) => selectTeam('home', v)}
                    placeholder={t('bet.homeTeam')}
                    options={teamOptions}
                  />
                  <Select
                    value={selection.awayTeam ?? ''}
                    onChange={(v) => selectTeam('away', v)}
                    placeholder={t('bet.awayTeam')}
                    options={teamOptions}
                  />
                </div>
              ) : (
                <div className="banner banner--info">{t('bet.pickLeagueFirst')}</div>
              ))}

            {mode === 'manual' && (
              <>
                <TextInput
                  value={selection.event}
                  onChange={(v) => onChange({ event: v, fixtureId: undefined })}
                  placeholder="Galatasaray - Fenerbahçe"
                />
                {!selection.leagueId && (
                  <TextInput
                    value={selection.competition}
                    onChange={(v) => onChange({ competition: v })}
                    placeholder={t('bet.competition')}
                  />
                )}
              </>
            )}
          </div>
        </Field>

        {/* Picks — several of these on one event is a bet builder */}
        <div>
          <div className="row row--between" style={{ marginBottom: 6 }}>
            <span className="field__label">{t('bet.picks')}</span>
            <button type="button" className="btn btn--sm" onClick={addPick}>
              + {t('bet.addPick')}
            </button>
          </div>

          <div className="stack" style={{ gap: 7 }}>
            {selection.picks.map((pick, pickIndex) => (
              <div className="pick-row" key={pick.id}>
                <TextInput
                  value={pick.market}
                  onChange={(v) => patchPick(pick.id, { market: v })}
                  list="markets-list"
                  placeholder={t('bet.market')}
                />
                <TextInput
                  value={pick.pick}
                  onChange={(v) => patchPick(pick.id, { pick: v })}
                  placeholder={t('bet.pick')}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={selection.picks.length === 1}
                  onClick={() => removePick(pick.id)}
                  aria-label={`${t('action.delete')} ${pickIndex + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {isBuilder && <p className="field__hint" style={{ marginTop: 6 }}>{t('bet.builder.hint')}</p>}
        </div>

        {/* One price for the whole leg */}
        <div className="form-grid">
          <Field label={isBuilder ? t('bet.builderOdds') : t('bet.odds')}>
            <NumberInput
              value={selection.odds || undefined}
              onChange={(v) => onChange({ odds: v ?? 0 })}
              min={1}
              step={0.01}
              placeholder="2.00"
            />
          </Field>
          <Field label={t('bet.closingOdds')} hint={t('common.optional')}>
            <NumberInput
              value={selection.closingOdds}
              onChange={(v) => onChange({ closingOdds: v })}
              min={1}
              step={0.01}
            />
          </Field>
          <Field label={t('bets.filter.status')}>
            <Select
              value={selection.status}
              onChange={(v) => onChange({ status: v })}
              options={(
                ['pending', 'won', 'lost', 'void', 'half_won', 'half_lost'] as const
              ).map((s) => ({ value: s, label: t(`status.${s}` as 'status.won') }))}
            />
          </Field>
          {showSide && (
            <Field label={t('bet.side')}>
              <Segmented
                block
                value={selection.side}
                onChange={(v) => onChange({ side: v })}
                options={[
                  { value: 'back', label: t('bet.side.back') },
                  { value: 'lay', label: t('bet.side.lay') },
                ]}
              />
            </Field>
          )}
          {eachWay && (
            <Field label={t('bet.eachWay.placed')}>
              <Segmented
                block
                value={(selection.placed ?? selection.status === 'won') ? 'yes' : 'no'}
                onChange={(v) => onChange({ placed: v === 'yes' })}
                options={[
                  { value: 'yes', label: t('common.yes') },
                  { value: 'no', label: t('common.no') },
                ]}
              />
            </Field>
          )}
        </div>
      </div>

      <datalist id="markets-list">
        {COMMON_MARKETS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
}

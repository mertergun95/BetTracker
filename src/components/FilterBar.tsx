import { useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import { applyFilter } from '@/core/store';
import { SPORTS } from '@/core/reference';
import type { Bet, BetFilter, BetStatus, BetStructure } from '@/core/types';
import { Field, Modal, NumberInput, Select, TextInput } from './ui';

/** Named date ranges, resolved against "now" each time they are applied. */
export type RangeKey =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom';

export function resolveRange(key: RangeKey): { from?: number; to?: number } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();

  switch (key) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'last7': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case 'last30': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case 'thisMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
        to: endOfDay(now),
      };
    case 'lastMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime(),
      };
    case 'thisYear':
      return { from: new Date(now.getFullYear(), 0, 1).getTime(), to: endOfDay(now) };
    case 'all':
    case 'custom':
    default:
      return {};
  }
}

export interface FilterState {
  range: RangeKey;
  filter: BetFilter;
}

export const EMPTY_FILTER: FilterState = { range: 'all', filter: {} };

/**
 * Applies a filter state to a list of bets. The named range is resolved here
 * rather than stored as timestamps, so "this month" keeps meaning this month
 * instead of silently freezing on the day it was picked — a bug users of other
 * trackers complain about.
 */
export function useFilteredBets(bets: Bet[], state: FilterState): Bet[] {
  return useMemo(() => {
    const range = state.range === 'custom' ? {} : resolveRange(state.range);
    const merged: BetFilter = {
      ...state.filter,
      ...(state.range === 'custom' ? {} : range),
    };
    return applyFilter(bets, merged);
  }, [bets, state]);
}

/** Number of non-empty conditions, for the "N filters active" badge. */
export function countActiveFilters(state: FilterState): number {
  let count = state.range !== 'all' ? 1 : 0;
  const f = state.filter;
  const lists = [f.sports, f.bookmakers, f.competitions, f.tipsters, f.tags, f.structures, f.statuses];
  for (const list of lists) if (list && list.length > 0) count++;
  if (f.search) count++;
  if (f.minOdds !== undefined || f.maxOdds !== undefined) count++;
  if (f.minStake !== undefined || f.maxStake !== undefined) count++;
  if (state.range === 'custom' && (f.from !== undefined || f.to !== undefined)) count++;
  return count;
}

const RANGE_KEYS: RangeKey[] = [
  'all',
  'today',
  'yesterday',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'custom',
];

const STATUSES: BetStatus[] = ['pending', 'won', 'lost', 'void', 'partial', 'cashed_out'];
const STRUCTURES: BetStructure[] = ['single', 'accumulator', 'system'];

/** Multi-select rendered as toggleable chips. */
function ChipMulti<T extends string>({
  values,
  selected,
  onChange,
  label,
}: {
  values: { value: T; label: string }[];
  selected: T[] | undefined;
  onChange: (next: T[] | undefined) => void;
  label: string;
}) {
  if (values.length === 0) return null;
  const active = selected ?? [];
  return (
    <Field label={label}>
      <div className="chip-row">
        {values.map((v) => {
          const on = active.includes(v.value);
          return (
            <button
              key={v.value}
              type="button"
              className={`chip${on ? ' is-active' : ''}`}
              onClick={() => {
                const next = on ? active.filter((x) => x !== v.value) : [...active, v.value];
                onChange(next.length > 0 ? next : undefined);
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

export function FilterBar({
  state,
  onChange,
  bets,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  /** Unfiltered list, used to offer only values that actually occur. */
  bets: Bet[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(state);

  const setFilter = (patch: Partial<BetFilter>) =>
    onChange({ ...state, filter: { ...state.filter, ...patch } });

  // Only offer values present in the data, so the panel stays short.
  const available = useMemo(() => {
    const sports = new Set<string>();
    const competitions = new Set<string>();
    const bookmakers = new Set<string>();
    const tipsters = new Set<string>();
    const tags = new Set<string>();
    for (const bet of bets) {
      if (bet.bookmaker) bookmakers.add(bet.bookmaker);
      if (bet.tipster) tipsters.add(bet.tipster);
      for (const tag of bet.tags) tags.add(tag);
      for (const s of bet.selections) {
        sports.add(s.sport);
        if (s.competition) competitions.add(s.competition);
      }
    }
    return {
      sports: [...sports].sort(),
      competitions: [...competitions].sort().slice(0, 60),
      bookmakers: [...bookmakers].sort(),
      tipsters: [...tipsters].sort(),
      tags: [...tags].sort(),
    };
  }, [bets]);

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <TextInput
            value={state.filter.search ?? ''}
            onChange={(v) => setFilter({ search: v || undefined })}
            placeholder={t('bets.filter.search')}
          />
        </div>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          ⚙ {t('bets.filters')}
          {activeCount > 0 && (
            <span className="badge badge--pending" style={{ marginLeft: 2 }}>
              {activeCount}
            </span>
          )}
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => onChange(EMPTY_FILTER)}
          >
            {t('bets.filter.clearAll')}
          </button>
        )}
      </div>

      {/* Quick range chips stay visible; they are the filter people use most. */}
      <div className="chip-row chip-row--scroll" style={{ marginBottom: 12 }}>
        {RANGE_KEYS.filter((k) => k !== 'custom').map((key) => (
          <button
            key={key}
            type="button"
            className={`chip${state.range === key ? ' is-active' : ''}`}
            onClick={() => onChange({ ...state, range: key })}
          >
            {t(`range.${key}` as 'range.all')}
          </button>
        ))}
      </div>

      {open && (
        <Modal
          title={t('bets.filters')}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onChange(EMPTY_FILTER);
                  setOpen(false);
                }}
              >
                {t('bets.filter.clearAll')}
              </button>
              <button type="button" className="btn btn--primary" onClick={() => setOpen(false)}>
                {t('action.apply')}
              </button>
            </>
          }
        >
          <div className="stack">
            <Field label={t('bets.filter.dateRange')}>
              <Select
                value={state.range}
                onChange={(v) => onChange({ ...state, range: v })}
                options={RANGE_KEYS.map((k) => ({
                  value: k,
                  label: t(`range.${k}` as 'range.all'),
                }))}
              />
            </Field>

            {state.range === 'custom' && (
              <div className="form-grid">
                <Field label={t('bets.filter.from')}>
                  <input
                    className="input"
                    type="date"
                    value={state.filter.from ? new Date(state.filter.from).toISOString().slice(0, 10) : ''}
                    onChange={(e) => {
                      const v = Date.parse(e.target.value);
                      setFilter({ from: Number.isFinite(v) ? v : undefined });
                    }}
                  />
                </Field>
                <Field label={t('bets.filter.to')}>
                  <input
                    className="input"
                    type="date"
                    value={state.filter.to ? new Date(state.filter.to).toISOString().slice(0, 10) : ''}
                    onChange={(e) => {
                      const v = Date.parse(e.target.value);
                      // Include the whole end day, not just its midnight.
                      setFilter({ to: Number.isFinite(v) ? v + 86_399_999 : undefined });
                    }}
                  />
                </Field>
              </div>
            )}

            <ChipMulti
              label={t('bets.filter.status')}
              values={STATUSES.map((s) => ({ value: s, label: t(`status.${s}` as 'status.won') }))}
              selected={state.filter.statuses}
              onChange={(v) => setFilter({ statuses: v })}
            />

            <ChipMulti
              label={t('bets.filter.structure')}
              values={STRUCTURES.map((s) => ({
                value: s,
                label: t(`bet.structure.${s}` as 'bet.structure.single'),
              }))}
              selected={state.filter.structures}
              onChange={(v) => setFilter({ structures: v })}
            />

            <ChipMulti
              label={t('bets.filter.sport')}
              values={available.sports.map((s) => ({
                value: s,
                label: SPORTS.some((x) => x.key === s) ? t(`sport.${s}` as 'sport.football') : s,
              }))}
              selected={state.filter.sports}
              onChange={(v) => setFilter({ sports: v })}
            />

            <ChipMulti
              label={t('bets.filter.bookmaker')}
              values={available.bookmakers.map((s) => ({ value: s, label: s }))}
              selected={state.filter.bookmakers}
              onChange={(v) => setFilter({ bookmakers: v })}
            />

            <ChipMulti
              label={t('bets.filter.competition')}
              values={available.competitions.map((s) => ({ value: s, label: s }))}
              selected={state.filter.competitions}
              onChange={(v) => setFilter({ competitions: v })}
            />

            <ChipMulti
              label={t('bets.filter.tipster')}
              values={available.tipsters.map((s) => ({ value: s, label: s }))}
              selected={state.filter.tipsters}
              onChange={(v) => setFilter({ tipsters: v })}
            />

            <ChipMulti
              label={t('bets.filter.tag')}
              values={available.tags.map((s) => ({ value: s, label: s }))}
              selected={state.filter.tags}
              onChange={(v) => setFilter({ tags: v })}
            />

            <div className="form-grid">
              <Field label={`${t('bets.filter.oddsRange')} — min`}>
                <NumberInput
                  value={state.filter.minOdds}
                  onChange={(v) => setFilter({ minOdds: v })}
                  min={1}
                  step={0.1}
                />
              </Field>
              <Field label={`${t('bets.filter.oddsRange')} — max`}>
                <NumberInput
                  value={state.filter.maxOdds}
                  onChange={(v) => setFilter({ maxOdds: v })}
                  min={1}
                  step={0.1}
                />
              </Field>
              <Field label={`${t('bets.filter.stakeRange')} — min`}>
                <NumberInput
                  value={state.filter.minStake}
                  onChange={(v) => setFilter({ minStake: v })}
                  min={0}
                />
              </Field>
              <Field label={`${t('bets.filter.stakeRange')} — max`}>
                <NumberInput
                  value={state.filter.maxStake}
                  onChange={(v) => setFilter({ maxStake: v })}
                  min={0}
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

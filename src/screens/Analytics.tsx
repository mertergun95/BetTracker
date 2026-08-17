import { useMemo, useState } from 'react';
import { useApp } from '@/state/AppContext';
import { useI18n } from '@/i18n';
import {
  breakdownBy,
  computeStats,
  dailyProfit,
  monthlyBreakdown,
  oddsBand,
  toSettledBets,
  weekdayBreakdown,
  type BreakdownRow,
} from '@/core/stats';
import { combinedOdds } from '@/core/settlement';
import { formatOdds } from '@/core/odds';
import { SPORTS } from '@/core/reference';
import { realisedRtp } from '@/core/calculators';
import { DistributionChart, HBarList, ProfitCalendar } from '@/components/charts';
import BankrollSwitcher from '@/components/BankrollSwitcher';
import { Card, EmptyState, Segmented, Stat, signTone } from '@/components/ui';
import { FilterBar, EMPTY_FILTER, useFilteredBets, type FilterState } from '@/components/FilterBar';

type SortKey = 'profit' | 'yield' | 'betCount' | 'turnover';

/** Breakdown table with a bar behind the profit column. */
function BreakdownTable({
  rows,
  currency,
  sortKey,
  onSortChange,
  minBets,
}: {
  rows: BreakdownRow[];
  currency: string;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  minBets: number;
}) {
  const { t, formatMoney, formatPercent, formatNumber } = useI18n();

  const sorted = useMemo(() => {
    const filtered = rows.filter((r) => r.betCount >= minBets);
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'yield':
          return b.yield - a.yield;
        case 'betCount':
          return b.betCount - a.betCount;
        case 'turnover':
          return b.turnover - a.turnover;
        case 'profit':
        default:
          return b.profit - a.profit;
      }
    });
  }, [rows, sortKey, minBets]);

  const maxAbs = useMemo(
    () => sorted.reduce((acc, r) => Math.max(acc, Math.abs(r.profit)), 0),
    [sorted],
  );

  if (sorted.length === 0) {
    return <EmptyState message={t('analytics.noData')} />;
  }

  const header = (key: SortKey, label: string) => (
    <th className="table__sortable" onClick={() => onSortChange(key)}>
      {label}
      {sortKey === key ? ' ▾' : ''}
    </th>
  );

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t('common.name')}</th>
            {header('betCount', t('stat.betCount'))}
            <th>{t('stat.hitRate')}</th>
            {header('turnover', t('stat.turnover'))}
            {header('profit', t('stat.profit'))}
            {header('yield', t('stat.yield'))}
            <th>{t('stat.avgOdds')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const width = maxAbs > 0 ? (Math.abs(row.profit) / maxAbs) * 100 : 0;
            return (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{formatNumber(row.betCount)}</td>
                <td>{formatPercent(row.hitRate, 0)}</td>
                <td>{formatMoney(row.turnover, currency, { compact: true })}</td>
                <td className={row.profit >= 0 ? 'is-positive' : 'is-negative'}>
                  <span className="bar-cell">
                    <span
                      className="bar-cell__fill"
                      style={{
                        width: `${width}%`,
                        right: 0,
                        background: row.profit >= 0 ? 'var(--viz-pos)' : 'var(--viz-neg)',
                      }}
                    />
                    <span className="bar-cell__text">
                      {formatMoney(row.profit, currency, { sign: true })}
                    </span>
                  </span>
                </td>
                <td className={row.yield >= 0 ? 'is-positive' : 'is-negative'}>
                  {formatPercent(row.yield)}
                </td>
                <td>{row.avgOdds > 0 ? row.avgOdds.toFixed(2) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type DimensionKey =
  | 'sport'
  | 'bookmaker'
  | 'competition'
  | 'structure'
  | 'tipster'
  | 'tag'
  | 'odds'
  | 'weekday'
  | 'month'
  | 'side';

export default function Analytics() {
  const { t, formatMoney, formatPercent, formatNumber } = useI18n();
  const { scopedBets, currency, settings, bankrolls, activeBankroll, activeBankrollId } = useApp();

  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTER);
  const [dimension, setDimension] = useState<DimensionKey>('sport');
  const [sortKey, setSortKey] = useState<SortKey>('profit');
  const [minBets, setMinBets] = useState(1);
  const [calendarMonths, setCalendarMonths] = useState(6);

  const bets = useFilteredBets(scopedBets, filterState);

  const baseCapital = useMemo(
    () =>
      activeBankrollId
        ? (activeBankroll?.startingCapital ?? 0)
        : bankrolls.reduce((sum, b) => sum + b.startingCapital, 0),
    [activeBankroll, activeBankrollId, bankrolls],
  );

  const stats = useMemo(
    () => computeStats(bets, { startingCapital: baseCapital }),
    [bets, baseCapital],
  );

  const sportLabel = (key: string) =>
    SPORTS.some((s) => s.key === key) ? t(`sport.${key}` as 'sport.football') : key;

  const rows = useMemo((): BreakdownRow[] => {
    switch (dimension) {
      case 'sport':
        return breakdownBy(bets, (b) => [...new Set(b.selections.map((s) => s.sport))], sportLabel);
      case 'bookmaker':
        return breakdownBy(bets, (b) => b.bookmaker || t('common.unknown'));
      case 'competition':
        return breakdownBy(bets, (b) =>
          [...new Set(b.selections.map((s) => s.competition).filter(Boolean))],
        );
      case 'structure':
        return breakdownBy(bets, (b) => b.structure, (k) =>
          t(`bet.structure.${k}` as 'bet.structure.single'),
        );
      case 'tipster':
        return breakdownBy(bets, (b) => b.tipster);
      case 'tag':
        return breakdownBy(bets, (b) => b.tags);
      case 'odds':
        return breakdownBy(bets, (b) => oddsBand(combinedOdds(b))).sort((a, b) =>
          a.key.localeCompare(b.key),
        );
      case 'weekday':
        return weekdayBreakdown(bets)
          .map((r) => ({ ...r, label: t(`weekday.${r.key}` as 'weekday.0') }))
          .sort((a, b) => Number(a.key) - Number(b.key));
      case 'month':
        return monthlyBreakdown(bets);
      case 'side':
        return breakdownBy(
          bets,
          (b) => [...new Set(b.selections.map((s) => s.side))],
          (k) => t(`bet.side.${k}` as 'bet.side.back'),
        );
      default:
        return [];
    }
  }, [bets, dimension, t]);

  const daily = useMemo(() => dailyProfit(bets), [bets]);

  /** Money split across winning, losing and voided bets. */
  const stakeSplit = useMemo(() => {
    let won = 0;
    let lost = 0;
    let voided = 0;
    for (const s of toSettledBets(bets)) {
      if (s.profit > 0) won += s.risk;
      else if (s.profit < 0) lost += s.risk;
      else voided += s.risk;
    }
    return { won, lost, voided };
  }, [bets]);

  const outcomeDistribution = useMemo(
    () => [
      { key: 'won', label: t('status.won'), value: stats.wonCount, signal: 1 },
      { key: 'lost', label: t('status.lost'), value: stats.lostCount, signal: -1 },
      { key: 'void', label: t('status.void'), value: stats.voidCount, signal: 0 },
      { key: 'pending', label: t('status.pending'), value: stats.pendingCount, signal: 0 },
    ],
    [stats, t],
  );

  const monthlySeries = useMemo(
    () =>
      monthlyBreakdown(bets).map((r) => ({
        key: r.key,
        label: r.key.slice(2),
        value: r.profit,
      })),
    [bets],
  );

  const rtp = realisedRtp(stats.totalStaked, stats.totalReturned);

  if (bankrolls.length === 0) {
    return (
      <Card>
        <EmptyState icon="💰" title={t('bankroll.empty')} />
      </Card>
    );
  }

  const DIMENSIONS: { key: DimensionKey; label: string }[] = [
    { key: 'sport', label: t('analytics.bySport') },
    { key: 'bookmaker', label: t('analytics.byBookmaker') },
    { key: 'competition', label: t('analytics.byCompetition') },
    { key: 'structure', label: t('analytics.byStructure') },
    { key: 'odds', label: t('analytics.byOdds') },
    { key: 'weekday', label: t('analytics.byWeekday') },
    { key: 'month', label: t('analytics.byMonth') },
    { key: 'tipster', label: t('analytics.byTipster') },
    { key: 'tag', label: t('analytics.byTag') },
    { key: 'side', label: t('analytics.bySide') },
  ];

  return (
    <>
      <header className="page-head">
        <div className="page-head__titles">
          <h1>{t('analytics.title')}</h1>
          <p className="page-head__sub">
            {t('bets.showing', { shown: bets.length, total: scopedBets.length })}
          </p>
        </div>
        <div className="page-head__actions">
          <BankrollSwitcher />
        </div>
      </header>

      <FilterBar state={filterState} onChange={setFilterState} bets={scopedBets} />

      {bets.length === 0 ? (
        <Card>
          <EmptyState icon="📈" title={t('analytics.noData')} />
        </Card>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {/* Full statistics grid */}
          <Card title={t('analytics.allStats')}>
            <div className="grid grid--kpi">
              <Stat
                label={t('stat.profit')}
                value={formatMoney(stats.profit, currency, { sign: true })}
                tone={signTone(stats.profit)}
              />
              <Stat
                label={t('stat.yield')}
                value={formatPercent(stats.yield)}
                tone={signTone(stats.yield)}
              />
              <Stat label={t('stat.turnover')} value={formatMoney(stats.turnover, currency)} />
              <Stat label={t('stat.totalReturned')} value={formatMoney(stats.totalReturned, currency)} />
              <Stat label={t('stat.rtp')} value={formatPercent(rtp)} />
              <Stat label={t('stat.betCount')} value={formatNumber(stats.betCount)} />
              <Stat label={t('stat.selectionCount')} value={formatNumber(stats.selectionCount)} />
              <Stat label={t('stat.settledCount')} value={formatNumber(stats.settledCount)} />
              <Stat label={t('stat.pendingCount')} value={formatNumber(stats.pendingCount)} />
              <Stat label={t('stat.wonCount')} value={formatNumber(stats.wonCount)} tone="positive" />
              <Stat label={t('stat.lostCount')} value={formatNumber(stats.lostCount)} tone="negative" />
              <Stat label={t('stat.voidCount')} value={formatNumber(stats.voidCount)} />
              <Stat label={t('stat.cashedOutCount')} value={formatNumber(stats.cashedOutCount)} />
              <Stat label={t('stat.hitRate')} value={formatPercent(stats.hitRate)} />
              <Stat
                label={t('stat.profitFactor')}
                value={
                  Number.isFinite(stats.profitFactor)
                    ? formatNumber(stats.profitFactor, { maximumFractionDigits: 2 })
                    : '∞'
                }
                tone={stats.profitFactor >= 1 ? 'positive' : 'negative'}
              />
              <Stat label={t('stat.avgStake')} value={formatMoney(stats.avgStake, currency)} />
              <Stat
                label={t('stat.avgOdds')}
                value={stats.avgOdds > 0 ? formatOdds(stats.avgOdds, settings.oddsFormat) : '—'}
              />
              <Stat
                label={t('stat.medianOdds')}
                value={stats.medianOdds > 0 ? formatOdds(stats.medianOdds, settings.oddsFormat) : '—'}
              />
              <Stat
                label={t('stat.avgWinningOdds')}
                value={stats.avgWinningOdds > 0 ? stats.avgWinningOdds.toFixed(2) : '—'}
              />
              <Stat
                label={t('stat.avgLosingOdds')}
                value={stats.avgLosingOdds > 0 ? stats.avgLosingOdds.toFixed(2) : '—'}
              />
              <Stat
                label={t('stat.avgProfitPerBet')}
                value={formatMoney(stats.avgProfitPerBet, currency, { sign: true })}
                tone={signTone(stats.avgProfitPerBet)}
              />
              <Stat
                label={t('stat.biggestWin')}
                value={formatMoney(stats.biggestWin, currency)}
                tone="positive"
              />
              <Stat
                label={t('stat.biggestLoss')}
                value={formatMoney(stats.biggestLoss, currency)}
                tone="negative"
              />
              <Stat label={t('stat.biggestStake')} value={formatMoney(stats.biggestStake, currency)} />
              <Stat
                label={t('stat.highestOdds')}
                value={stats.highestOdds > 0 ? stats.highestOdds.toFixed(2) : '—'}
              />
              <Stat label={t('stat.longestWinStreak')} value={formatNumber(stats.longestWinStreak)} />
              <Stat label={t('stat.longestLossStreak')} value={formatNumber(stats.longestLossStreak)} />
              <Stat
                label={t('stat.currentStreak')}
                value={
                  stats.currentStreak === 0
                    ? '—'
                    : `${stats.currentStreak > 0 ? '↑' : '↓'} ${Math.abs(stats.currentStreak)}`
                }
                tone={signTone(stats.currentStreak)}
              />
              <Stat
                label={t('stat.maxDrawdown')}
                value={formatMoney(stats.maxDrawdown, currency)}
                tone={stats.maxDrawdown > 0 ? 'negative' : 'neutral'}
                sub={formatPercent(stats.maxDrawdownPct)}
              />
              <Stat label={t('stat.stdDevProfit')} value={formatMoney(stats.stdDevProfit, currency)} />
              <Stat
                label={t('stat.sharpe')}
                value={formatNumber(stats.sharpe, { maximumFractionDigits: 2 })}
                tone={signTone(stats.sharpe)}
              />
              <Stat label={t('stat.commissionPaid')} value={formatMoney(stats.commissionPaid, currency)} />
              <Stat
                label={t('stat.pendingStake')}
                value={formatMoney(stats.pendingStake, currency)}
                sub={`${t('stat.potentialProfit')} ${formatMoney(stats.potentialProfit, currency, { compact: true })}`}
              />
            </div>
          </Card>

          {/* Closing line value */}
          <Card title={t('clv.title')} hint={t('clv.explain')}>
            {stats.clvBetCount === 0 ? (
              <div className="banner banner--info">{t('clv.noData')}</div>
            ) : (
              <div className="grid grid--kpi">
                <Stat
                  label={t('clv.avgClv')}
                  value={formatPercent(stats.avgClv, 2)}
                  tone={signTone(stats.avgClv)}
                />
                <Stat label={t('clv.positiveRate')} value={formatPercent(stats.positiveClvRate)} />
                <Stat label={t('clv.betCount')} value={formatNumber(stats.clvBetCount)} />
                <Stat
                  label={t('clv.totalEv')}
                  value={formatMoney(stats.totalEv, currency, { sign: true })}
                  tone={signTone(stats.totalEv)}
                />
                <Stat
                  label={t('clv.luck')}
                  value={formatMoney(stats.luck, currency, { sign: true })}
                  tone={signTone(stats.luck)}
                />
              </div>
            )}
          </Card>

          {/* Breakdown */}
          <Card
            title={t('analytics.breakdown')}
            action={
              <div className="row row--tight">
                <label className="small muted">
                  {t('analytics.minBets')}
                  <input
                    className="input input--num"
                    type="number"
                    min={1}
                    value={minBets}
                    onChange={(e) => setMinBets(Math.max(1, Number(e.target.value) || 1))}
                    style={{ width: 70, marginLeft: 6, display: 'inline-block' }}
                  />
                </label>
              </div>
            }
          >
            <div className="chip-row chip-row--scroll" style={{ marginBottom: 12 }}>
              {DIMENSIONS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={`chip${dimension === d.key ? ' is-active' : ''}`}
                  onClick={() => setDimension(d.key)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              <HBarList
                data={rows
                  .filter((r) => r.betCount >= minBets)
                  .map((r) => ({
                    key: r.key,
                    label: r.label,
                    value: r.profit,
                    sub: `${r.betCount}`,
                  }))}
                format={(v) => formatMoney(v, currency, { sign: true, compact: true })}
              />
            </div>

            <BreakdownTable
              rows={rows}
              currency={currency}
              sortKey={sortKey}
              onSortChange={setSortKey}
              minBets={minBets}
            />
          </Card>

          {/* Calendar */}
          <Card
            title={t('analytics.calendar')}
            action={
              <Segmented
                value={String(calendarMonths)}
                onChange={(v) => setCalendarMonths(Number(v))}
                options={[
                  { value: '3', label: '3' },
                  { value: '6', label: '6' },
                  { value: '12', label: '12' },
                ]}
              />
            }
          >
            <ProfitCalendar daily={daily} currency={currency} months={calendarMonths} />
          </Card>

          {/* Distribution */}
          <div className="grid grid--2">
            <Card title={t('analytics.distribution')}>
              <DistributionChart
                data={outcomeDistribution}
                format={(v) => formatNumber(v)}
              />
            </Card>

            <Card title={t('analytics.stakeBreakdown')}>
              <HBarList
                data={[
                  { key: 'won', label: t('analytics.stakeWon'), value: stakeSplit.won },
                  { key: 'lost', label: t('analytics.stakeLost'), value: -stakeSplit.lost },
                  { key: 'void', label: t('analytics.stakeVoid'), value: stakeSplit.voided },
                ]}
                format={(v) => formatMoney(Math.abs(v), currency)}
              />
            </Card>
          </div>

          {monthlySeries.length > 1 && (
            <Card title={t('analytics.byMonth')}>
              <DistributionChart
                data={monthlySeries}
                format={(v) => formatMoney(v, currency, { compact: true })}
              />
            </Card>
          )}
        </div>
      )}
    </>
  );
}

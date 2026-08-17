import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, emptyBet } from '@/state/AppContext';
import { useI18n } from '@/i18n';
import { breakdownBy, computeStats, equityCurve, toSettledBets } from '@/core/stats';
import { isSettled } from '@/core/settlement';
import { formatOdds } from '@/core/odds';
import { SPORTS } from '@/core/reference';
import { EquityChart, HBarList } from '@/components/charts';
import MiniBetRow from '@/components/MiniBetRow';
import BetForm from '@/components/BetForm';
import BankrollSwitcher from '@/components/BankrollSwitcher';
import { Card, EmptyState, Segmented, Stat, signTone } from '@/components/ui';
import { FilterBar, EMPTY_FILTER, useFilteredBets, type FilterState } from '@/components/FilterBar';
import type { Bet } from '@/core/types';

/** Card with its own header, count badge and internally scrolling body. */
function Panel({
  title,
  count,
  action,
  scroll,
  flush,
  children,
  className = '',
}: {
  title: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  scroll?: boolean;
  flush?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel__head">
        <h2 className="panel__title">
          {title}
          {count !== undefined && <span className="panel__count">{count}</span>}
        </h2>
        {action}
      </header>
      <div
        className={[
          'panel__body',
          flush ? 'panel__body--flush' : '',
          scroll ? 'panel__body--scroll' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const { t, formatMoney, formatPercent, formatNumber } = useI18n();
  const {
    bankrolls,
    scopedBets,
    scopedTransactions,
    activeBankroll,
    activeBankrollId,
    currency,
    settings,
  } = useApp();

  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTER);
  const [editing, setEditing] = useState<Bet | null>(null);
  const [curveMode, setCurveMode] = useState<'profit' | 'balance'>('profit');

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

  const invested = useMemo(
    () =>
      baseCapital +
      scopedTransactions.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0),
    [baseCapital, scopedTransactions],
  );

  const balance = useMemo(
    () => baseCapital + scopedTransactions.reduce((sum, tx) => sum + tx.amount, 0) + stats.profit,
    [baseCapital, scopedTransactions, stats.profit],
  );

  const curve = useMemo(
    () => equityCurve(bets, baseCapital, scopedTransactions),
    [bets, baseCapital, scopedTransactions],
  );

  const roi = invested > 0 ? stats.profit / invested : 0;

  /** Open bets, soonest kick-off first so the next one to watch is on top. */
  const openBets = useMemo(
    () =>
      bets
        .filter((b) => !isSettled(b))
        .sort((a, b) => {
          const aAt = a.selections[0]?.eventAt ?? a.placedAt;
          const bAt = b.selections[0]?.eventAt ?? b.placedAt;
          return aAt - bAt;
        }),
    [bets],
  );

  const recentlySettled = useMemo(
    () => [...toSettledBets(bets)].reverse().slice(0, 12).map((s) => s.bet),
    [bets],
  );

  /** Last ten results as a win/loss strip. */
  const form = useMemo(
    () =>
      [...toSettledBets(bets)]
        .slice(-10)
        .reverse()
        .map((s) => ({ id: s.bet.id, profit: s.profit })),
    [bets],
  );

  const todayStats = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const todays = bets.filter((b) => (b.settledAt ?? b.placedAt) >= start.getTime());
    return computeStats(todays);
  }, [bets]);

  const topSports = useMemo(
    () =>
      breakdownBy(
        bets,
        (b) => [...new Set(b.selections.map((s) => s.sport))],
        (key) => (SPORTS.some((s) => s.key === key) ? t(`sport.${key}` as 'sport.football') : key),
      ).slice(0, 6),
    [bets, t],
  );

  const newBet = () =>
    setEditing(
      emptyBet(activeBankrollId ?? bankrolls[0]!.id, {
        unitStake: activeBankroll?.defaultStake ?? 0,
        commission: settings.defaultCommission,
        bookmaker: settings.defaultBookmaker,
      }, activeBankroll?.sports ?? []),
    );

  if (bankrolls.length === 0) {
    return (
      <>
        <header className="page-head">
          <div className="page-head__titles">
            <h1>{t('dash.title')}</h1>
          </div>
        </header>
        <Card>
          <EmptyState
            icon="💰"
            title={t('bankroll.empty')}
            message={t('settings.storageNote')}
            action={
              <Link to="/bankrolls" className="btn btn--primary">
                {t('bankroll.new')}
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <header className="page-head">
        <div className="page-head__titles">
          <h1>{t('dash.title')}</h1>
          <p className="page-head__sub">
            {activeBankroll?.name ?? t('bankroll.allBankrolls')} ·{' '}
            {t('bets.showing', { shown: bets.length, total: scopedBets.length })}
          </p>
        </div>
        <div className="page-head__actions">
          <BankrollSwitcher />
          <button type="button" className="btn btn--primary" onClick={newBet}>
            + {t('bet.new')}
          </button>
        </div>
      </header>

      <FilterBar state={filterState} onChange={setFilterState} bets={scopedBets} />

      {scopedBets.length === 0 ? (
        <Card>
          <EmptyState
            icon="🎯"
            title={t('dash.noData')}
            action={
              <button type="button" className="btn btn--primary" onClick={newBet}>
                {t('dash.addFirstBet')}
              </button>
            }
          />
        </Card>
      ) : (
        <div className="stack" style={{ gap: 13 }}>
          {/* KPI rail */}
          <div className="grid grid--kpi">
            <Stat
              label={t('dash.profit')}
              value={formatMoney(stats.profit, currency, { sign: true })}
              tone={signTone(stats.profit)}
              sub={`${stats.settledCount} ${t('dash.settledBets').toLowerCase()}`}
            />
            <Stat
              label={t('dash.yield')}
              value={formatPercent(stats.yield)}
              tone={signTone(stats.yield)}
              sub={`${t('dash.turnover')} ${formatMoney(stats.turnover, currency, { compact: true })}`}
            />
            <Stat
              label={t('dash.roi')}
              value={formatPercent(roi)}
              tone={signTone(roi)}
              sub={`${t('bankroll.invested')} ${formatMoney(invested, currency, { compact: true })}`}
            />
            <Stat
              label={t('dash.hitRate')}
              value={formatPercent(stats.hitRate)}
              sub={`${stats.wonCount}${t('common.of')}${stats.wonCount + stats.lostCount}`}
            />
            <Stat
              label={t('dash.balance')}
              value={formatMoney(balance, currency)}
              tone={signTone(balance - invested)}
              sub={`${t('dash.capitalGrowth')} ${formatPercent(invested > 0 ? balance / invested - 1 : 0)}`}
            />
            <Stat
              label={t('dash.openBets')}
              value={formatNumber(stats.pendingCount)}
              sub={`${t('dash.pendingStake')} ${formatMoney(stats.pendingStake, currency, { compact: true })}`}
            />
          </div>

          {/* Chart beside the live bets */}
          <div className="board">
            <Panel
              title={curveMode === 'profit' ? t('dash.equityCurve') : t('dash.balance')}
              action={
                <Segmented
                  value={curveMode}
                  onChange={setCurveMode}
                  options={[
                    { value: 'profit', label: t('dash.profit') },
                    { value: 'balance', label: t('dash.balance') },
                  ]}
                />
              }
            >
              <EquityChart points={curve} currency={currency} mode={curveMode} height={288} />
            </Panel>

            <Panel
              title={`⏳ ${t('dash.openPanel')}`}
              count={openBets.length}
              flush
              scroll
              action={
                <Link to="/bets" className="btn btn--ghost btn--sm">
                  {t('action.viewAll')} →
                </Link>
              }
            >
              {openBets.length === 0 ? (
                <div className="empty small" style={{ padding: 28 }}>
                  {t('dash.noOpenBets')}
                </div>
              ) : (
                openBets.map((bet) => (
                  <MiniBetRow
                    key={bet.id}
                    bet={bet}
                    currency={currency}
                    oddsFormat={settings.oddsFormat}
                    onOpen={() => setEditing(bet)}
                  />
                ))
              )}
            </Panel>

            <Panel
              title={`✅ ${t('dash.settledPanel')}`}
              count={stats.settledCount}
              flush
              scroll
            >
              {recentlySettled.length === 0 ? (
                <div className="empty small" style={{ padding: 28 }}>
                  {t('dash.noSettledBets')}
                </div>
              ) : (
                recentlySettled.map((bet) => (
                  <MiniBetRow
                    key={bet.id}
                    bet={bet}
                    currency={currency}
                    oddsFormat={settings.oddsFormat}
                    onOpen={() => setEditing(bet)}
                  />
                ))
              )}
            </Panel>

            <div className="stack" style={{ gap: 13 }}>
              <Panel title={`📅 ${t('dash.todayPanel')}`}>
                <div className="grid grid--kpi" style={{ gap: 9 }}>
                  <Stat
                    label={t('stat.profit')}
                    value={formatMoney(todayStats.profit, currency, { sign: true })}
                    tone={signTone(todayStats.profit)}
                  />
                  <Stat label={t('stat.betCount')} value={formatNumber(todayStats.betCount)} />
                  <Stat
                    label={t('stat.turnover')}
                    value={formatMoney(todayStats.turnover, currency, { compact: true })}
                  />
                </div>
              </Panel>

              <Panel title={`🔥 ${t('dash.formPanel')}`}>
                {form.length === 0 ? (
                  <div className="small muted">{t('dash.noSettledBets')}</div>
                ) : (
                  <>
                    <div className="form-strip">
                      {form.map((f) => (
                        <span
                          key={f.id}
                          className="form-strip__dot"
                          title={formatMoney(f.profit, currency, { sign: true })}
                          style={{
                            background:
                              f.profit > 0
                                ? 'var(--viz-pos)'
                                : f.profit < 0
                                  ? 'var(--viz-neg)'
                                  : 'var(--surface-3)',
                            color: f.profit === 0 ? 'var(--text-muted)' : '#fff',
                          }}
                        >
                          {f.profit > 0 ? 'W' : f.profit < 0 ? 'L' : '–'}
                        </span>
                      ))}
                    </div>
                    <p className="tiny faint" style={{ marginTop: 8 }}>
                      {t('dash.last10')} ·{' '}
                      {t('stat.currentStreak')}:{' '}
                      {stats.currentStreak === 0
                        ? '—'
                        : `${stats.currentStreak > 0 ? '↑' : '↓'} ${Math.abs(stats.currentStreak)}`}
                    </p>
                  </>
                )}
              </Panel>
            </div>

            <Panel title={`🏅 ${t('analytics.bySport')}`}>
              <HBarList
                data={topSports.map((r) => ({
                  key: r.key,
                  label: r.label,
                  value: r.profit,
                  sub: `${r.betCount}`,
                }))}
                format={(v) => formatMoney(v, currency, { sign: true, compact: true })}
              />
            </Panel>

            {stats.clvBetCount > 0 && (
              <Panel title={`🎯 ${t('clv.title')}`} className="board__wide">
                <div className="grid grid--kpi">
                  <Stat
                    label={t('clv.avgClv')}
                    value={formatPercent(stats.avgClv, 2)}
                    tone={signTone(stats.avgClv)}
                  />
                  <Stat label={t('clv.positiveRate')} value={formatPercent(stats.positiveClvRate)} />
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
                  <Stat label={t('clv.betCount')} value={formatNumber(stats.clvBetCount)} />
                  <Stat
                    label={t('dash.avgOdds')}
                    value={stats.avgOdds > 0 ? formatOdds(stats.avgOdds, settings.oddsFormat) : '—'}
                  />
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}

      <button type="button" className="fab" aria-label={t('bet.new')} onClick={newBet}>
        +
      </button>

      {editing && <BetForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

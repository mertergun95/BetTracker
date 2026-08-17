import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, emptyBet } from '@/state/AppContext';
import { useI18n } from '@/i18n';
import { computeStats, equityCurve } from '@/core/stats';
import { formatOdds } from '@/core/odds';
import { EquityChart } from '@/components/charts';
import BetList from '@/components/BetList';
import BetForm from '@/components/BetForm';
import BankrollSwitcher from '@/components/BankrollSwitcher';
import { Card, EmptyState, Segmented, Stat, signTone } from '@/components/ui';
import { FilterBar, EMPTY_FILTER, useFilteredBets, type FilterState } from '@/components/FilterBar';
import type { Bet } from '@/core/types';

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

  // Opening capital of whatever is in scope. Drawdown percentages need it.
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

  // Capital invested is the starting capital plus every deposit, so ROI is
  // measured against money actually committed rather than the opening balance.
  const invested = useMemo(() => {
    const base = baseCapital;
    const deposits = scopedTransactions
      .filter((tx) => tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0);
    return base + deposits;
  }, [baseCapital, scopedTransactions]);

  const balance = useMemo(
    () => baseCapital + scopedTransactions.reduce((sum, tx) => sum + tx.amount, 0) + stats.profit,
    [baseCapital, scopedTransactions, stats.profit],
  );

  const curve = useMemo(
    () => equityCurve(bets, baseCapital, scopedTransactions),
    [bets, baseCapital, scopedTransactions],
  );

  const roi = invested > 0 ? stats.profit / invested : 0;
  const recent = useMemo(() => bets.slice(0, 8), [bets]);

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
          <button
            type="button"
            className="btn btn--primary"
            onClick={() =>
              setEditing(
                emptyBet(activeBankrollId ?? bankrolls[0]!.id, {
                  unitStake: activeBankroll?.defaultStake ?? 0,
                  commission: settings.defaultCommission,
                }),
              )
            }
          >
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
              <button
                type="button"
                className="btn btn--primary"
                onClick={() =>
                  setEditing(
                    emptyBet(activeBankrollId ?? bankrolls[0]!.id, {
                      unitStake: activeBankroll?.defaultStake ?? 0,
                    }),
                  )
                }
              >
                {t('dash.addFirstBet')}
              </button>
            }
          />
        </Card>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
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
            <Stat
              label={t('dash.avgOdds')}
              value={stats.avgOdds > 0 ? formatOdds(stats.avgOdds, settings.oddsFormat) : '—'}
              sub={`${t('dash.avgStake')} ${formatMoney(stats.avgStake, currency, { compact: true })}`}
            />
            <Stat
              label={t('stat.maxDrawdown')}
              value={formatMoney(stats.maxDrawdown, currency)}
              tone={stats.maxDrawdown > 0 ? 'negative' : 'neutral'}
              sub={formatPercent(stats.maxDrawdownPct)}
            />
          </div>

          <Card
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
            <EquityChart points={curve} currency={currency} mode={curveMode} />
          </Card>

          {stats.clvBetCount > 0 && (
            <Card title={t('clv.title')} hint={t('clv.explain')}>
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
              </div>
            </Card>
          )}

          <Card
            flush
            title={t('dash.recentBets')}
            action={
              <Link to="/bets" className="btn btn--ghost btn--sm">
                {t('action.viewAll')} →
              </Link>
            }
          >
            {recent.length === 0 ? (
              <EmptyState message={t('bets.empty')} />
            ) : (
              <BetList
                bets={recent}
                currency={currency}
                oddsFormat={settings.oddsFormat}
                onOpen={setEditing}
              />
            )}
          </Card>

          <Card title={t('analytics.allStats')}>
            <div className="grid grid--kpi">
              <Stat label={t('stat.profitFactor')} value={
                Number.isFinite(stats.profitFactor) ? formatNumber(stats.profitFactor, { maximumFractionDigits: 2 }) : '∞'
              } />
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
                label={t('stat.sharpe')}
                value={formatNumber(stats.sharpe, { maximumFractionDigits: 2 })}
                tone={signTone(stats.sharpe)}
              />
              <Stat
                label={t('stat.commissionPaid')}
                value={formatMoney(stats.commissionPaid, currency)}
              />
              <Stat
                label={t('stat.potentialProfit')}
                value={formatMoney(stats.potentialProfit, currency)}
                sub={`${stats.pendingCount} ${t('stat.pendingCount').toLowerCase()}`}
              />
            </div>
          </Card>
        </div>
      )}

      <button
        type="button"
        className="fab"
        aria-label={t('bet.new')}
        onClick={() =>
          setEditing(
            emptyBet(activeBankrollId ?? bankrolls[0]!.id, {
              unitStake: activeBankroll?.defaultStake ?? 0,
              commission: settings.defaultCommission,
            }),
          )
        }
      >
        +
      </button>

      {editing && <BetForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

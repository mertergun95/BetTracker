import type { Bet, Transaction } from './types';
import { closingLineValue, combinedOdds, isSettled, potentialReturn, settleBet } from './settlement';

/**
 * Statistics engine.
 *
 * Every figure here is derived from an already-filtered list of bets, so the
 * same code powers the dashboard, the analyser and any saved view.
 *
 * Terminology, fixed across the whole app:
 *   turnover  — money put at risk (see `Settlement.risk`)
 *   yield     — profit / turnover, the efficiency of the betting itself
 *   ROI       — profit / capital invested, the return on the bankroll
 */

export interface SettledBet {
  bet: Bet;
  profit: number;
  risk: number;
  stake: number;
  returned: number;
  odds: number;
  settledAt: number;
}

export interface AggregateStats {
  /* Volume */
  betCount: number;
  settledCount: number;
  pendingCount: number;
  selectionCount: number;

  /* Outcomes */
  wonCount: number;
  lostCount: number;
  voidCount: number;
  cashedOutCount: number;
  hitRate: number;

  /* Money */
  turnover: number;
  totalStaked: number;
  totalReturned: number;
  profit: number;
  pendingStake: number;
  potentialProfit: number;
  commissionPaid: number;

  /* Ratios */
  yield: number;
  profitFactor: number;
  avgStake: number;
  avgOdds: number;
  avgWinningOdds: number;
  avgLosingOdds: number;
  avgProfitPerBet: number;
  medianOdds: number;

  /* Extremes */
  biggestWin: number;
  biggestLoss: number;
  biggestStake: number;
  highestOdds: number;

  /* Streaks */
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreak: number;

  /* Risk */
  maxDrawdown: number;
  maxDrawdownPct: number;
  stdDevProfit: number;
  sharpe: number;

  /* Closing line */
  clvBetCount: number;
  avgClv: number;
  positiveClvRate: number;
  totalEv: number;
  /** Actual profit minus expected value: positive means running above EV. */
  luck: number;
}

export const EMPTY_STATS: AggregateStats = {
  betCount: 0,
  settledCount: 0,
  pendingCount: 0,
  selectionCount: 0,
  wonCount: 0,
  lostCount: 0,
  voidCount: 0,
  cashedOutCount: 0,
  hitRate: 0,
  turnover: 0,
  totalStaked: 0,
  totalReturned: 0,
  profit: 0,
  pendingStake: 0,
  potentialProfit: 0,
  commissionPaid: 0,
  yield: 0,
  profitFactor: 0,
  avgStake: 0,
  avgOdds: 0,
  avgWinningOdds: 0,
  avgLosingOdds: 0,
  avgProfitPerBet: 0,
  medianOdds: 0,
  biggestWin: 0,
  biggestLoss: 0,
  biggestStake: 0,
  highestOdds: 0,
  longestWinStreak: 0,
  longestLossStreak: 0,
  currentStreak: 0,
  maxDrawdown: 0,
  maxDrawdownPct: 0,
  stdDevProfit: 0,
  sharpe: 0,
  clvBetCount: 0,
  avgClv: 0,
  positiveClvRate: 0,
  totalEv: 0,
  luck: 0,
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

/** Settled bets in chronological order, with their money breakdown resolved. */
export function toSettledBets(bets: Bet[]): SettledBet[] {
  return bets
    .filter((b) => isSettled(b))
    .map((bet) => {
      const s = settleBet(bet);
      return {
        bet,
        profit: s.profit,
        risk: s.risk,
        stake: s.totalStake,
        returned: s.returned,
        odds: combinedOdds(bet),
        settledAt: bet.settledAt ?? bet.placedAt,
      };
    })
    .sort((a, b) => a.settledAt - b.settledAt);
}

export interface StatsOptions {
  /**
   * Bankroll the bets were placed from. Only affects `maxDrawdownPct`, which
   * is meaningless without a capital base to measure the fall against.
   */
  startingCapital?: number;
}

export function computeStats(bets: Bet[], options: StatsOptions = {}): AggregateStats {
  if (bets.length === 0) return { ...EMPTY_STATS };

  const settled = toSettledBets(bets);
  const pending = bets.filter((b) => !isSettled(b));

  let turnover = 0;
  let totalStaked = 0;
  let totalReturned = 0;
  let profit = 0;
  let commissionPaid = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let won = 0;
  let lost = 0;
  let voided = 0;
  let cashedOut = 0;
  let biggestWin = 0;
  let biggestLoss = 0;
  let biggestStake = 0;
  let highestOdds = 0;

  const oddsAll: number[] = [];
  const oddsWon: number[] = [];
  const oddsLost: number[] = [];
  const profits: number[] = [];

  for (const s of settled) {
    const full = settleBet(s.bet);
    turnover += s.risk;
    totalStaked += s.stake;
    totalReturned += s.returned;
    profit += s.profit;
    commissionPaid += full.commissionPaid;
    profits.push(s.profit);

    if (full.status === 'cashed_out') cashedOut++;

    if (s.profit > 0) {
      won++;
      grossWin += s.profit;
      oddsWon.push(s.odds);
      if (s.profit > biggestWin) biggestWin = s.profit;
    } else if (s.profit < 0) {
      lost++;
      grossLoss += -s.profit;
      oddsLost.push(s.odds);
      if (s.profit < biggestLoss) biggestLoss = s.profit;
    } else {
      voided++;
    }

    oddsAll.push(s.odds);
    if (s.stake > biggestStake) biggestStake = s.stake;
    if (s.odds > highestOdds) highestOdds = s.odds;
  }

  let pendingStake = 0;
  let potentialProfit = 0;
  for (const b of pending) {
    const s = settleBet(b);
    pendingStake += s.risk;
    potentialProfit += potentialReturn(b) - s.totalStake;
  }

  const decided = won + lost;
  const mean = profits.length > 0 ? profit / profits.length : 0;
  const variance =
    profits.length > 1
      ? profits.reduce((acc, p) => acc + (p - mean) ** 2, 0) / (profits.length - 1)
      : 0;
  const stdDevProfit = Math.sqrt(variance);

  const { maxDrawdown, maxDrawdownPct } = drawdown(settled, options.startingCapital ?? 0);
  const streaks = streakStats(settled);
  const clv = clvStats(bets);

  return {
    betCount: bets.length,
    settledCount: settled.length,
    pendingCount: pending.length,
    selectionCount: bets.reduce((acc, b) => acc + b.selections.length, 0),

    wonCount: won,
    lostCount: lost,
    voidCount: voided,
    cashedOutCount: cashedOut,
    hitRate: decided > 0 ? won / decided : 0,

    turnover,
    totalStaked,
    totalReturned,
    profit,
    pendingStake,
    potentialProfit,
    commissionPaid,

    yield: turnover > 0 ? profit / turnover : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgStake: settled.length > 0 ? totalStaked / settled.length : 0,
    avgOdds: oddsAll.length > 0 ? oddsAll.reduce((a, b) => a + b, 0) / oddsAll.length : 0,
    avgWinningOdds: oddsWon.length > 0 ? oddsWon.reduce((a, b) => a + b, 0) / oddsWon.length : 0,
    avgLosingOdds: oddsLost.length > 0 ? oddsLost.reduce((a, b) => a + b, 0) / oddsLost.length : 0,
    avgProfitPerBet: settled.length > 0 ? profit / settled.length : 0,
    medianOdds: median(oddsAll),

    biggestWin,
    biggestLoss,
    biggestStake,
    highestOdds,

    ...streaks,

    maxDrawdown,
    maxDrawdownPct,
    stdDevProfit,
    // Risk-adjusted return per bet, in units of one standard deviation.
    sharpe: stdDevProfit > 0 ? mean / stdDevProfit : 0,

    ...clv,
  };
}

/**
 * Largest peak-to-trough fall of the equity curve.
 *
 * `startingCapital` matters for the percentage: measured against cumulative
 * profit alone, a run that goes negative before it ever goes positive has a
 * peak of zero and would report a 0% drawdown however deep the hole got.
 * Against the bankroll the figure is always meaningful.
 */
export function drawdown(
  settled: SettledBet[],
  startingCapital = 0,
): {
  maxDrawdown: number;
  maxDrawdownPct: number;
} {
  let equity = startingCapital;
  let peak = startingCapital;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  for (const s of settled) {
    equity += s.profit;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      // With no capital supplied, fall back to the peak profit; when that is
      // zero or negative there is no sensible denominator, so report 0.
      maxDrawdownPct = peak > 0 ? dd / peak : 0;
    }
  }

  return { maxDrawdown, maxDrawdownPct };
}

function streakStats(settled: SettledBet[]): {
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreak: number;
} {
  let longestWin = 0;
  let longestLoss = 0;
  let run = 0;

  for (const s of settled) {
    // Voids and pushes leave a streak intact rather than breaking it.
    if (s.profit === 0) continue;
    const isWin = s.profit > 0;
    if (run === 0 || (isWin && run > 0) || (!isWin && run < 0)) {
      run = isWin ? run + 1 : run - 1;
    } else {
      run = isWin ? 1 : -1;
    }
    if (run > longestWin) longestWin = run;
    if (-run > longestLoss) longestLoss = -run;
  }

  return { longestWinStreak: longestWin, longestLossStreak: longestLoss, currentStreak: run };
}

function clvStats(bets: Bet[]): {
  clvBetCount: number;
  avgClv: number;
  positiveClvRate: number;
  totalEv: number;
  luck: number;
} {
  let count = 0;
  let clvSum = 0;
  let positive = 0;
  let evSum = 0;
  let actual = 0;

  for (const bet of bets) {
    const v = closingLineValue(bet);
    if (!v) continue;
    count++;
    clvSum += v.clv;
    if (v.clv > 0) positive++;
    evSum += v.ev;
    if (isSettled(bet)) actual += settleBet(bet).profit;
  }

  return {
    clvBetCount: count,
    avgClv: count > 0 ? clvSum / count : 0,
    positiveClvRate: count > 0 ? positive / count : 0,
    totalEv: evSum,
    luck: actual - evSum,
  };
}

/* ------------------------------------------------------------------ *
 * Breakdowns
 * ------------------------------------------------------------------ */

export interface BreakdownRow {
  key: string;
  label: string;
  betCount: number;
  wonCount: number;
  lostCount: number;
  hitRate: number;
  turnover: number;
  profit: number;
  yield: number;
  avgOdds: number;
}

/**
 * Groups bets by an arbitrary key and computes the headline figures per group.
 * `keyFn` may return several keys, so a bet with three tags counts once under
 * each tag.
 */
export function breakdownBy(
  bets: Bet[],
  keyFn: (bet: Bet) => string[] | string | undefined,
  labelFn: (key: string) => string = (k) => k,
): BreakdownRow[] {
  const groups = new Map<string, Bet[]>();

  for (const bet of bets) {
    const raw = keyFn(bet);
    if (raw === undefined) continue;
    const keys = Array.isArray(raw) ? raw : [raw];
    for (const key of keys) {
      if (!key) continue;
      const list = groups.get(key);
      if (list) list.push(bet);
      else groups.set(key, [bet]);
    }
  }

  const rows: BreakdownRow[] = [];
  for (const [key, group] of groups) {
    const s = computeStats(group);
    rows.push({
      key,
      label: labelFn(key),
      betCount: s.betCount,
      wonCount: s.wonCount,
      lostCount: s.lostCount,
      hitRate: s.hitRate,
      turnover: s.turnover,
      profit: s.profit,
      yield: s.yield,
      avgOdds: s.avgOdds,
    });
  }

  return rows.sort((a, b) => b.profit - a.profit);
}

/** Odds buckets used by the odds-range analyser. */
export const ODDS_BANDS: { key: string; min: number; max: number }[] = [
  { key: '1.00-1.50', min: 1, max: 1.5 },
  { key: '1.50-2.00', min: 1.5, max: 2 },
  { key: '2.00-3.00', min: 2, max: 3 },
  { key: '3.00-5.00', min: 3, max: 5 },
  { key: '5.00-10.00', min: 5, max: 10 },
  { key: '10.00+', min: 10, max: Infinity },
];

export function oddsBand(odds: number): string {
  return ODDS_BANDS.find((b) => odds >= b.min && odds < b.max)?.key ?? '10.00+';
}

/* ------------------------------------------------------------------ *
 * Time series
 * ------------------------------------------------------------------ */

export interface CurvePoint {
  t: number;
  /** Cumulative profit from bets only. */
  profit: number;
  /** Bankroll balance including deposits and withdrawals. */
  balance: number;
  betIndex: number;
}

/**
 * Cumulative profit and bankroll balance over time. Transactions are folded in
 * chronologically so the balance line reflects real deposits and withdrawals.
 */
export function equityCurve(
  bets: Bet[],
  startingCapital: number,
  transactions: Transaction[] = [],
): CurvePoint[] {
  const settled = toSettledBets(bets);

  type Event = { t: number; profit: number; cash: number; isBet: boolean };
  const events: Event[] = [
    ...settled.map((s) => ({ t: s.settledAt, profit: s.profit, cash: 0, isBet: true })),
    ...transactions.map((tx) => ({ t: tx.occurredAt, profit: 0, cash: tx.amount, isBet: false })),
  ].sort((a, b) => a.t - b.t);

  const points: CurvePoint[] = [];
  let profit = 0;
  let balance = startingCapital;
  let betIndex = 0;

  // Anchor the curve at the starting capital so a fresh bankroll still renders.
  const firstT = events[0]?.t ?? Date.now();
  points.push({ t: firstT - 1, profit: 0, balance: startingCapital, betIndex: 0 });

  for (const e of events) {
    profit += e.profit;
    balance += e.profit + e.cash;
    if (e.isBet) betIndex += 1;
    points.push({ t: e.t, profit, balance, betIndex });
  }

  return points;
}

/** Local-date key (YYYY-MM-DD) so calendar buckets match the user's day. */
export function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Profit per calendar day, for the heatmap. */
export function dailyProfit(bets: Bet[]): Map<string, { profit: number; count: number }> {
  const map = new Map<string, { profit: number; count: number }>();
  for (const s of toSettledBets(bets)) {
    const key = dayKey(s.settledAt);
    const entry = map.get(key) ?? { profit: 0, count: 0 };
    entry.profit += s.profit;
    entry.count += 1;
    map.set(key, entry);
  }
  return map;
}

/** Profit by weekday, index 0 = Monday through 6 = Sunday. */
export function weekdayBreakdown(bets: Bet[]): BreakdownRow[] {
  return breakdownBy(bets, (bet) => {
    const settledAt = bet.settledAt ?? bet.placedAt;
    // JS weeks start on Sunday; shift so Monday is 0, which is what TR/EN
    // calendars in the UI expect.
    const jsDay = new Date(settledAt).getDay();
    return String((jsDay + 6) % 7);
  });
}

/** Profit per calendar month, keyed YYYY-MM. */
export function monthlyBreakdown(bets: Bet[]): BreakdownRow[] {
  return breakdownBy(bets, (bet) => {
    const d = new Date(bet.settledAt ?? bet.placedAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }).sort((a, b) => a.key.localeCompare(b.key));
}

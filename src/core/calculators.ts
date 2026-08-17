import { bookOverround, impliedProbability } from './odds';

/**
 * Betting calculators. All pure functions — no state, no I/O — so the same
 * code backs the calculator screens and the suggestions shown on the bet form.
 */

/* ------------------------------------------------------------------ *
 * Dutching — split a stake across mutually exclusive outcomes so the
 * profit is the same whichever one lands.
 * ------------------------------------------------------------------ */

export interface DutchingLeg {
  odds: number;
  /** Commission on winnings for this book, as a percentage. */
  commission?: number;
}

export interface DutchingResult {
  stakes: number[];
  returns: number[];
  /** Profit if any one outcome wins. Equal across outcomes by construction. */
  profit: number;
  totalStake: number;
  overround: number;
  /** True when the outcomes are priced generously enough to lock in a profit. */
  isArb: boolean;
  /** Profit as a percentage of the total stake. */
  roi: number;
}

export function dutching(legs: DutchingLeg[], totalStake: number): DutchingResult {
  const valid = legs.filter((l) => Number.isFinite(l.odds) && l.odds > 1);
  if (valid.length === 0 || totalStake <= 0) {
    return {
      stakes: legs.map(() => 0),
      returns: legs.map(() => 0),
      profit: 0,
      totalStake: 0,
      overround: 0,
      isArb: false,
      roi: 0,
    };
  }

  // Commission lowers the effective payout, so weight by the net odds.
  const netOdds = legs.map((l) => {
    if (!Number.isFinite(l.odds) || l.odds <= 1) return 0;
    const c = Math.max(0, l.commission ?? 0) / 100;
    return 1 + (l.odds - 1) * (1 - c);
  });

  const weightSum = netOdds.reduce((sum, o) => sum + (o > 1 ? 1 / o : 0), 0);
  if (weightSum <= 0) {
    return {
      stakes: legs.map(() => 0),
      returns: legs.map(() => 0),
      profit: 0,
      totalStake: 0,
      overround: 0,
      isArb: false,
      roi: 0,
    };
  }

  const stakes = netOdds.map((o) => (o > 1 ? (totalStake * (1 / o)) / weightSum : 0));
  const returns = stakes.map((s, i) => s * (netOdds[i] ?? 0));
  const payout = totalStake / weightSum;
  const profit = payout - totalStake;
  const overround = bookOverround(legs.map((l) => l.odds));

  return {
    stakes,
    returns,
    profit,
    totalStake,
    overround,
    isArb: weightSum < 1,
    roi: totalStake > 0 ? profit / totalStake : 0,
  };
}

/* ------------------------------------------------------------------ *
 * Surebet / arbitrage
 * ------------------------------------------------------------------ */

export interface SurebetResult extends DutchingResult {
  /** Guaranteed profit percentage of the market, i.e. 1/overround - 1. */
  edge: number;
}

/**
 * Same distribution as dutching, but framed as an arbitrage check: the caller
 * cares whether `isArb` holds and how big the edge is.
 */
export function surebet(legs: DutchingLeg[], totalStake: number): SurebetResult {
  const result = dutching(legs, totalStake);
  const netOdds = legs.map((l) => {
    const c = Math.max(0, l.commission ?? 0) / 100;
    return Number.isFinite(l.odds) && l.odds > 1 ? 1 + (l.odds - 1) * (1 - c) : 0;
  });
  const weightSum = netOdds.reduce((sum, o) => sum + (o > 1 ? 1 / o : 0), 0);
  return { ...result, edge: weightSum > 0 ? 1 / weightSum - 1 : 0 };
}

/* ------------------------------------------------------------------ *
 * Hedging / cash out — lay off an open back bet at the current price.
 * ------------------------------------------------------------------ */

export interface HedgeInput {
  /** Stake of the original back bet. */
  backStake: number;
  /** Odds the back bet was taken at. */
  backOdds: number;
  /** Lay price now available. */
  layOdds: number;
  /** Exchange commission, as a percentage. */
  commission?: number;
}

export interface HedgeResult {
  /** Lay stake that equalises the outcome. */
  layStake: number;
  liability: number;
  /** Locked-in profit, identical whichever way the event goes. */
  lockedProfit: number;
  /** Profit if the selection wins, laying nothing (for comparison). */
  profitIfWinNoHedge: number;
  /** Profit if the selection wins, after hedging. */
  profitIfWin: number;
  /** Profit if the selection loses, after hedging. */
  profitIfLose: number;
  /** Lay stake that leaves all profit on the selection winning. */
  freeBetLayStake: number;
}

/**
 * Equal-profit hedge. Solving
 *   backStake*(backOdds-1) - layStake*(layOdds-1) = layStake*(1-c) - backStake
 * gives layStake = backStake*backOdds / (layOdds - c).
 */
export function hedge(input: HedgeInput): HedgeResult {
  const { backStake, backOdds, layOdds } = input;
  const c = Math.max(0, input.commission ?? 0) / 100;

  if (backStake <= 0 || backOdds <= 1 || layOdds <= 1 || layOdds - c <= 0) {
    return {
      layStake: 0,
      liability: 0,
      lockedProfit: 0,
      profitIfWinNoHedge: backStake * (backOdds - 1),
      profitIfWin: 0,
      profitIfLose: 0,
      freeBetLayStake: 0,
    };
  }

  const layStake = (backStake * backOdds) / (layOdds - c);
  const liability = layStake * (layOdds - 1);
  const profitIfWin = backStake * (backOdds - 1) - liability;
  const profitIfLose = layStake * (1 - c) - backStake;

  return {
    layStake,
    liability,
    // Both branches are equal by construction; average away float noise.
    lockedProfit: (profitIfWin + profitIfLose) / 2,
    profitIfWinNoHedge: backStake * (backOdds - 1),
    profitIfWin,
    profitIfLose,
    // Laying only the stake back leaves the winnings riding on the selection.
    freeBetLayStake: backStake / (layOdds - c),
  };
}

/* ------------------------------------------------------------------ *
 * Staking plans
 * ------------------------------------------------------------------ */

export type StakingPlan =
  | 'flat'
  | 'percentage'
  | 'kelly'
  | 'fractionalKelly'
  | 'levelToWin'
  | 'martingale'
  | 'fibonacci'
  | 'dalembert';

export interface StakingInput {
  plan: StakingPlan;
  bankroll: number;
  odds: number;
  /** Estimated win probability, 0..1. Required by the Kelly plans. */
  probability?: number;
  /** Flat stake, or the unit for the progressive plans. */
  unit?: number;
  /** Percentage of bankroll for the percentage plan. */
  percent?: number;
  /** Kelly fraction, e.g. 0.25 for quarter Kelly. */
  kellyFraction?: number;
  /** Consecutive losses so far, for the progressive plans. */
  lossStreak?: number;
  /** Target profit for the level-to-win plan. */
  targetProfit?: number;
}

export interface StakingResult {
  stake: number;
  /** Fraction of the bankroll this stake represents. */
  bankrollFraction: number;
  /** p*odds - 1. Positive means the price is a value bet at that probability. */
  edge: number;
  /** Expected value of the recommended stake. */
  ev: number;
  /** Set when the plan cannot recommend a stake, e.g. Kelly with no edge. */
  warning?: string;
}

/** nth Fibonacci number, 1-indexed: 1, 1, 2, 3, 5, 8 … */
function fibonacci(n: number): number {
  let a = 1;
  let b = 1;
  for (let i = 1; i < n; i++) {
    [a, b] = [b, a + b];
  }
  return a;
}

export function stakeSuggestion(input: StakingInput): StakingResult {
  const { plan, bankroll, odds } = input;
  const unit = input.unit ?? 0;
  const lossStreak = Math.max(0, input.lossStreak ?? 0);
  const p = input.probability ?? 0;
  const b = odds - 1;
  const edge = p > 0 ? p * odds - 1 : 0;

  let stake = 0;
  let warning: string | undefined;

  switch (plan) {
    case 'flat':
      stake = unit;
      break;

    case 'percentage':
      stake = (bankroll * (input.percent ?? 1)) / 100;
      break;

    case 'kelly':
    case 'fractionalKelly': {
      if (p <= 0 || p >= 1) {
        warning = 'probabilityRequired';
        break;
      }
      if (b <= 0) {
        warning = 'oddsTooLow';
        break;
      }
      // f* = (bp - q) / b
      const full = (b * p - (1 - p)) / b;
      if (full <= 0) {
        warning = 'noEdge';
        stake = 0;
        break;
      }
      const fraction = plan === 'kelly' ? 1 : (input.kellyFraction ?? 0.25);
      stake = bankroll * full * fraction;
      break;
    }

    case 'levelToWin': {
      // Stake whatever it takes to win a fixed amount.
      const target = input.targetProfit ?? unit;
      stake = b > 0 ? target / b : 0;
      break;
    }

    case 'martingale':
      // Double after every loss, so the next win recovers the whole run.
      stake = unit * 2 ** lossStreak;
      break;

    case 'fibonacci':
      stake = unit * fibonacci(lossStreak + 1);
      break;

    case 'dalembert':
      // Add one unit per loss instead of doubling.
      stake = unit * (1 + lossStreak);
      break;
  }

  stake = Math.max(0, stake);
  // Never recommend staking more than the bankroll holds.
  if (bankroll > 0 && stake > bankroll) {
    stake = bankroll;
    warning = warning ?? 'cappedAtBankroll';
  }

  const ev = p > 0 ? stake * (p * b - (1 - p)) : 0;

  return {
    stake,
    bankrollFraction: bankroll > 0 ? stake / bankroll : 0,
    edge,
    ev,
    warning,
  };
}

/* ------------------------------------------------------------------ *
 * Return to player
 * ------------------------------------------------------------------ */

export interface RtpResult {
  /** Fraction of turnover paid back, e.g. 0.94 for a 6% margin market. */
  rtp: number;
  /** Bookmaker margin, 1 - rtp. */
  margin: number;
  overround: number;
  /** Fair, vig-free odds in the same order as the input. */
  fairOdds: number[];
}

/** RTP implied by a full set of market prices. */
export function marketRtp(decimalOdds: number[]): RtpResult {
  const valid = decimalOdds.filter((o) => Number.isFinite(o) && o > 1);
  if (valid.length === 0) {
    return { rtp: 0, margin: 0, overround: 0, fairOdds: decimalOdds.map(() => 0) };
  }
  const overround = bookOverround(valid);
  const rtp = overround > 0 ? 1 / overround : 0;
  const fairOdds = decimalOdds.map((o) =>
    Number.isFinite(o) && o > 1 && overround > 0 ? o * overround : 0,
  );
  return { rtp, margin: 1 - rtp, overround, fairOdds };
}

/** Realised RTP of a betting history: how much of the turnover came back. */
export function realisedRtp(totalStaked: number, totalReturned: number): number {
  return totalStaked > 0 ? totalReturned / totalStaked : 0;
}

/* ------------------------------------------------------------------ *
 * Profit simulation
 * ------------------------------------------------------------------ */

export interface SimulationInput {
  bets: number;
  stake: number;
  odds: number;
  /** Win probability per bet, 0..1. */
  winRate: number;
  startingBankroll: number;
  /** Stake as a percentage of the current bankroll instead of a fixed amount. */
  compounding?: boolean;
  /** Number of Monte Carlo runs. */
  runs?: number;
  seed?: number;
}

export interface SimulationResult {
  /** Deterministic expectation, ignoring variance. */
  expectedProfit: number;
  expectedYield: number;
  /** Percentile outcomes across the Monte Carlo runs. */
  p5: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
  /** Share of runs that ended below the starting bankroll. */
  lossProbability: number;
  /** Share of runs that hit zero. */
  ruinProbability: number;
  /** One representative equity path, for charting. */
  samplePath: number[];
}

/**
 * Deterministic PRNG (mulberry32) so a given seed always produces the same
 * simulation — the chart should not reshuffle on every re-render.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate(input: SimulationInput): SimulationResult {
  const runs = Math.max(1, Math.min(input.runs ?? 2000, 20000));
  const n = Math.max(1, Math.min(input.bets, 10000));
  const b = input.odds - 1;
  const rand = mulberry32(input.seed ?? 42);

  const expectedPerBet = input.stake * (input.winRate * b - (1 - input.winRate));
  const expectedProfit = expectedPerBet * n;
  const turnover = input.stake * n;

  const finals: number[] = [];
  let samplePath: number[] = [];
  let ruined = 0;

  for (let r = 0; r < runs; r++) {
    let bankroll = input.startingBankroll;
    const path: number[] = [bankroll];
    let busted = false;

    for (let i = 0; i < n; i++) {
      const stake = input.compounding
        ? (bankroll * input.stake) / Math.max(input.startingBankroll, 1e-9)
        : input.stake;
      if (stake <= 0 || bankroll <= 0) {
        busted = true;
        break;
      }
      const applied = Math.min(stake, bankroll);
      bankroll += rand() < input.winRate ? applied * b : -applied;
      if (bankroll <= 0) {
        bankroll = 0;
        busted = true;
        path.push(0);
        break;
      }
      path.push(bankroll);
    }

    if (busted) ruined++;
    finals.push(bankroll);
    if (r === 0) samplePath = path;
  }

  const sorted = [...finals].sort((a, z) => a - z);
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

  return {
    expectedProfit,
    expectedYield: turnover > 0 ? expectedProfit / turnover : 0,
    p5: pick(0.05) - input.startingBankroll,
    p25: pick(0.25) - input.startingBankroll,
    median: pick(0.5) - input.startingBankroll,
    p75: pick(0.75) - input.startingBankroll,
    p95: pick(0.95) - input.startingBankroll,
    lossProbability: finals.filter((f) => f < input.startingBankroll).length / finals.length,
    ruinProbability: ruined / runs,
    samplePath,
  };
}

/* ------------------------------------------------------------------ *
 * Capital distribution across bookmakers
 * ------------------------------------------------------------------ */

export interface CapitalAllocation {
  bookmaker: string;
  /** Share of turnover this book has historically taken, 0..1. */
  share: number;
  suggested: number;
  current?: number;
  delta?: number;
}

/**
 * Suggests how to spread a bankroll across bookmakers in proportion to how
 * much is actually bet through each one, so funds sit where they get used.
 */
export function allocateCapital(
  turnoverByBookmaker: { bookmaker: string; turnover: number; current?: number }[],
  totalCapital: number,
): CapitalAllocation[] {
  const total = turnoverByBookmaker.reduce((sum, b) => sum + Math.max(0, b.turnover), 0);
  if (total <= 0) {
    const even = turnoverByBookmaker.length > 0 ? totalCapital / turnoverByBookmaker.length : 0;
    return turnoverByBookmaker.map((b) => ({
      bookmaker: b.bookmaker,
      share: turnoverByBookmaker.length > 0 ? 1 / turnoverByBookmaker.length : 0,
      suggested: even,
      current: b.current,
      delta: b.current === undefined ? undefined : even - b.current,
    }));
  }

  return turnoverByBookmaker
    .map((b) => {
      const share = Math.max(0, b.turnover) / total;
      const suggested = totalCapital * share;
      return {
        bookmaker: b.bookmaker,
        share,
        suggested,
        current: b.current,
        delta: b.current === undefined ? undefined : suggested - b.current,
      };
    })
    .sort((a, b) => b.suggested - a.suggested);
}

/* ------------------------------------------------------------------ *
 * Value check — used inline on the bet form
 * ------------------------------------------------------------------ */

export interface ValueCheck {
  impliedProbability: number;
  edge: number;
  fairOdds: number;
  isValue: boolean;
}

export function valueCheck(odds: number, estimatedProbability: number): ValueCheck {
  const implied = impliedProbability(odds);
  const edge = estimatedProbability * odds - 1;
  return {
    impliedProbability: implied,
    edge,
    fairOdds: estimatedProbability > 0 ? 1 / estimatedProbability : 0,
    isValue: edge > 0,
  };
}

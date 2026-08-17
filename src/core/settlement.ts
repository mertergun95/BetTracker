import type { Bet, BetStatus, Selection, SelectionStatus } from './types';
import { indexCombinations, systemLineCount } from './systems';

/**
 * Settlement engine.
 *
 * Convention that the whole app depends on: `Selection.status` is written from
 * the BETTOR's point of view, not the sporting outcome. A lay selection is
 * 'won' when the thing laid failed to win. This keeps "won" meaning "made
 * money" everywhere, including in the statistics layer.
 */

export interface Settlement {
  status: BetStatus;
  /** Number of individual bet lines (systems and each-way multiply this). */
  lineCount: number;
  /** Nominal stake across every line. */
  totalStake: number;
  /**
   * Money actually at risk. Equals `totalStake` for normal back bets, the
   * liability for lay bets, and 0 for free bets. This is the denominator for
   * ROI, so it is what "staked" means in the statistics.
   */
  risk: number;
  /** Gross return, including the stake back for winning non-free bets. */
  returned: number;
  /** Net result. 0 while the bet is unsettled. */
  profit: number;
  commissionPaid: number;
  settled: boolean;
}

/** Effective decimal multiplier of one leg's win part. `null` = still pending. */
export function legMultiplier(status: SelectionStatus, odds: number): number | null {
  switch (status) {
    case 'won':
      return odds;
    case 'lost':
      return 0;
    case 'void':
      return 1;
    // Quarter-line Asian handicaps split the stake in two halves, one settling
    // at the odds and one returned. That decomposes linearly into a single
    // effective multiplier.
    case 'half_won':
      return (odds + 1) / 2;
    case 'half_lost':
      return 0.5;
    case 'pending':
    default:
      return null;
  }
}

/** Place-part odds for an each-way bet, e.g. 1/5 of a 11.0 shot -> 3.0. */
export function placeOdds(odds: number, fraction: number): number {
  return 1 + (odds - 1) * fraction;
}

/** Effective multiplier of one leg's place part. */
function placeMultiplier(selection: Selection, fraction: number): number | null {
  if (selection.status === 'pending') return null;
  if (selection.status === 'void') return 1;
  // A winner has necessarily placed, so `placed` only needs setting for the
  // in-between case of a selection that lost but still finished in the places.
  const placed = selection.placed ?? selection.status === 'won';
  return placed ? placeOdds(selection.odds, fraction) : 0;
}

/** Liability of a lay: what is lost if the laid selection wins. */
export function layLiability(backerStake: number, layOdds: number): number {
  return backerStake * (layOdds - 1);
}

/** How many bet lines a bet produces, before the each-way doubling. */
export function baseLineCount(bet: Bet): number {
  if (bet.structure === 'system' && bet.system) {
    return systemLineCount(bet.system, bet.selections.length);
  }
  return 1;
}

/** How many lines in total, including the each-way place part. */
export function lineCount(bet: Bet): number {
  return baseLineCount(bet) * (bet.eachWay ? 2 : 1);
}

/** Nominal stake across every line. */
export function totalStake(bet: Bet): number {
  return bet.unitStake * lineCount(bet);
}

/**
 * Money at risk. Lay bets risk the liability rather than the stake, and free
 * bets risk nothing.
 */
export function riskAmount(bet: Bet): number {
  if (bet.freeBet) return 0;
  const first = bet.selections[0];
  if (bet.structure === 'single' && first?.side === 'lay') {
    return layLiability(bet.unitStake, first.odds);
  }
  return totalStake(bet);
}

/** Product of every leg's odds. Meaningless for systems, which have many lines. */
export function combinedOdds(bet: Bet): number {
  return bet.selections.reduce((acc, s) => acc * s.odds, 1);
}

/** Product of every leg's closing odds, or null if any leg is missing one. */
export function combinedClosingOdds(bet: Bet): number | null {
  let product = 1;
  for (const s of bet.selections) {
    if (s.closingOdds === undefined || !Number.isFinite(s.closingOdds)) return null;
    product *= s.closingOdds;
  }
  return product;
}

/**
 * Gross return if every still-pending leg wins. Used for the "potential
 * return" readout on open bets.
 */
export function potentialReturn(bet: Bet): number {
  const optimistic: Bet = {
    ...bet,
    selections: bet.selections.map((s) =>
      s.status === 'pending' ? { ...s, status: 'won' as SelectionStatus, placed: true } : s,
    ),
    cashOutAmount: undefined,
  };
  return settleBet(optimistic).returned;
}

/** Sums the gross return of every line of a back bet. */
function grossReturn(bet: Bet): number | null {
  const n = bet.selections.length;
  const stake = bet.unitStake;
  let total = 0;

  const sizes =
    bet.structure === 'system' && bet.system
      ? bet.system.sizes
      : [n]; // singles have n === 1; accumulators use all legs at once

  // A single with several selections would be ambiguous, so the bet form keeps
  // singles to exactly one selection. Guard anyway.
  if (bet.structure === 'single' && n !== 1) return null;

  for (const size of sizes) {
    for (const combo of indexCombinations(n, size)) {
      // Win part
      let winProduct = 1;
      for (const i of combo) {
        const sel = bet.selections[i];
        if (!sel) return null;
        const m = legMultiplier(sel.status, sel.odds);
        if (m === null) return null;
        winProduct *= m;
      }
      total += stake * winProduct;

      // Place part of an each-way bet is an independent line at place odds.
      if (bet.eachWay) {
        let placeProduct = 1;
        for (const i of combo) {
          const sel = bet.selections[i];
          if (!sel) return null;
          const m = placeMultiplier(sel, bet.eachWay.fraction);
          if (m === null) return null;
          placeProduct *= m;
        }
        total += stake * placeProduct;
      }
    }
  }

  return total;
}

/** Settlement of a lay single, which does not go through the line machinery. */
function settleLaySingle(bet: Bet): Settlement {
  const sel = bet.selections[0]!;
  const stake = bet.unitStake;
  const liability = layLiability(stake, sel.odds);
  const commissionRate = Math.max(0, bet.commission) / 100;

  const base: Omit<Settlement, 'profit' | 'commissionPaid' | 'returned' | 'status' | 'settled'> = {
    lineCount: 1,
    totalStake: stake,
    risk: liability,
  };

  if (sel.status === 'pending') {
    return { ...base, status: 'pending', returned: 0, profit: 0, commissionPaid: 0, settled: false };
  }

  // Gross win/loss before commission, from the layer's point of view.
  let gross: number;
  switch (sel.status) {
    case 'won':
      gross = stake;
      break;
    case 'lost':
      gross = -liability;
      break;
    case 'half_won':
      gross = stake / 2;
      break;
    case 'half_lost':
      gross = -liability / 2;
      break;
    case 'void':
    default:
      gross = 0;
  }

  const commissionPaid = gross > 0 ? gross * commissionRate : 0;
  const profit = gross - commissionPaid;

  return {
    ...base,
    status: profit > 0 ? 'won' : profit < 0 ? 'lost' : 'void',
    returned: liability + profit,
    profit,
    commissionPaid,
    settled: true,
  };
}

/**
 * Settles a bet and returns the full money breakdown.
 * Pure and total: never throws, and returns a pending settlement for anything
 * it cannot resolve.
 */
export function settleBet(bet: Bet): Settlement {
  const lines = lineCount(bet);
  const stakeTotal = totalStake(bet);
  const risk = riskAmount(bet);
  const commissionRate = Math.max(0, bet.commission) / 100;

  const pending: Settlement = {
    status: 'pending',
    lineCount: lines,
    totalStake: stakeTotal,
    risk,
    returned: 0,
    profit: 0,
    commissionPaid: 0,
    settled: false,
  };

  if (bet.selections.length === 0) return pending;

  // Cashing out overrides the sporting outcome entirely.
  if (bet.cashOutAmount !== undefined && Number.isFinite(bet.cashOutAmount)) {
    const profit = bet.cashOutAmount - (bet.freeBet ? 0 : risk);
    return {
      status: 'cashed_out',
      lineCount: lines,
      totalStake: stakeTotal,
      risk,
      returned: bet.cashOutAmount,
      profit,
      commissionPaid: 0,
      settled: true,
    };
  }

  const first = bet.selections[0]!;
  if (bet.structure === 'single' && first.side === 'lay') {
    return settleLaySingle(bet);
  }

  const gross = grossReturn(bet);
  if (gross === null) return pending;

  // A free bet does not hand the stake back, so a losing one costs nothing and
  // a winning one pays only the winnings.
  const rawProfit = bet.freeBet ? Math.max(0, gross - stakeTotal) : gross - stakeTotal;
  const commissionPaid = rawProfit > 0 ? rawProfit * commissionRate : 0;
  const profit = rawProfit - commissionPaid;
  // Money actually credited back to the account.
  const returned = bet.freeBet ? profit : risk + profit;

  const allVoid = bet.selections.every((s) => s.status === 'void');
  let status: BetStatus;
  if (allVoid) {
    status = 'void';
  } else if (bet.structure === 'system') {
    status = systemStatus(bet, profit);
  } else {
    status = profit > 0 ? 'won' : profit < 0 ? 'lost' : 'void';
  }

  return {
    status,
    lineCount: lines,
    totalStake: stakeTotal,
    risk,
    returned,
    profit,
    commissionPaid,
    settled: true,
  };
}

/** Systems routinely win some lines and lose others; surface that as 'partial'. */
function systemStatus(bet: Bet, profit: number): BetStatus {
  const anyLost = bet.selections.some((s) => s.status === 'lost' || s.status === 'half_lost');
  const anyWon = bet.selections.some((s) => s.status === 'won' || s.status === 'half_won');
  if (anyLost && anyWon) return 'partial';
  return profit > 0 ? 'won' : profit < 0 ? 'lost' : 'void';
}

/** True when every selection has a final outcome. */
export function isSettled(bet: Bet): boolean {
  if (bet.cashOutAmount !== undefined) return true;
  return bet.selections.length > 0 && bet.selections.every((s) => s.status !== 'pending');
}

/* ------------------------------------------------------------------ *
 * Closing line value
 * ------------------------------------------------------------------ */

export interface ClosingLineValue {
  /** Odds actually taken. */
  taken: number;
  /** Odds at market close. */
  closing: number;
  /** taken/closing - 1. Positive means the price beat the close. */
  clv: number;
  /**
   * Expected value in currency, treating the closing price as the true
   * probability. Uses the money at risk, so it is comparable across bets.
   */
  ev: number;
}

/**
 * CLV and EV for a bet, or null when any leg lacks a closing price.
 * Lay bets are inverted: for a layer, a closing price ABOVE the price laid is
 * the profitable direction.
 */
export function closingLineValue(bet: Bet): ClosingLineValue | null {
  const closing = combinedClosingOdds(bet);
  if (closing === null || closing <= 1) return null;

  const taken = combinedOdds(bet);
  if (taken <= 1) return null;

  const isLay = bet.structure === 'single' && bet.selections[0]?.side === 'lay';
  const clv = isLay ? closing / taken - 1 : taken / closing - 1;

  // Probability implied by the closing line, treated as the true probability.
  const p = 1 / closing;
  const risk = riskAmount(bet);
  const stake = totalStake(bet);

  let ev: number;
  if (isLay) {
    // Layer wins the backer's stake with probability (1 - p), loses liability
    // with probability p.
    ev = (1 - p) * stake - p * risk;
  } else {
    ev = p * stake * (taken - 1) - (1 - p) * stake;
  }

  return { taken, closing, clv, ev };
}

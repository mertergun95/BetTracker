import { describe, expect, it } from 'vitest';
import type { Bet, Selection, SelectionStatus } from './types';
import {
  americanToDecimal,
  decimalToAmerican,
  decimalToFractional,
  fractionalToDecimal,
  parseOdds,
  removeVig,
} from './odds';
import {
  closingLineValue,
  combinedOdds,
  isSettled,
  layLiability,
  lineCount,
  placeOdds,
  potentialReturn,
  settleBet,
  totalStake,
} from './settlement';
import { combinations, indexCombinations, systemLineCount } from './systems';
import { computeStats, drawdown, equityCurve, oddsBand, toSettledBets } from './stats';
import { allocateCapital, dutching, hedge, marketRtp, simulate, stakeSuggestion, surebet } from './calculators';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

let idCounter = 0;
function sel(odds: number, status: SelectionStatus = 'pending', extra: Partial<Selection> = {}): Selection {
  return {
    id: `s${idCounter++}`,
    event: 'A - B',
    sport: 'football',
    competition: 'Test Lig',
    picks: [{ id: `p${idCounter++}`, market: '1X2', pick: 'A' }],
    odds,
    side: 'back',
    status,
    ...extra,
  };
}

function bet(overrides: Partial<Bet> = {}): Bet {
  return {
    id: `b${idCounter++}`,
    bankrollId: 'bk1',
    structure: 'single',
    selections: [sel(2)],
    unitStake: 100,
    bookmaker: 'Test',
    commission: 0,
    tags: [],
    placedAt: 1_700_000_000_000,
    settledAt: 1_700_000_100_000,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

/* ------------------------------------------------------------------ *
 * Odds
 * ------------------------------------------------------------------ */

describe('odds conversion', () => {
  it('converts decimal to American in both directions', () => {
    expect(decimalToAmerican(3)).toBe(200);
    expect(decimalToAmerican(1.5)).toBe(-200);
    expect(decimalToAmerican(2)).toBe(100);
    near(americanToDecimal(200), 3);
    near(americanToDecimal(-200), 1.5);
  });

  it('round-trips decimal through fractional', () => {
    for (const d of [1.2, 1.5, 2, 2.5, 3.75, 11, 26]) {
      const [n, den] = decimalToFractional(d);
      near(fractionalToDecimal(n, den), d, 1e-6);
    }
  });

  it('reduces fractional odds to lowest terms', () => {
    expect(decimalToFractional(2)).toEqual([1, 1]);
    expect(decimalToFractional(1.5)).toEqual([1, 2]);
    expect(decimalToFractional(2.875)).toEqual([15, 8]);
  });

  it('parses every input format', () => {
    near(parseOdds('2.50')!, 2.5);
    near(parseOdds('2,50')!, 2.5);
    near(parseOdds('+150')!, 2.5);
    near(parseOdds('-200')!, 1.5);
    near(parseOdds('3/2')!, 2.5);
    near(parseOdds('150', 'american')!, 2.5);
    expect(parseOdds('abc')).toBeNull();
    expect(parseOdds('')).toBeNull();
  });

  it('removes the margin so fair probabilities sum to one', () => {
    const fair = removeVig([1.9, 1.9]);
    near(fair[0]!, 2);
    near(fair[1]!, 2);
    const sum = fair.reduce((acc, o) => acc + 1 / o, 0);
    near(sum, 1);
  });
});

/* ------------------------------------------------------------------ *
 * Combinatorics
 * ------------------------------------------------------------------ */

describe('systems', () => {
  it('computes binomial coefficients', () => {
    expect(combinations(3, 2)).toBe(3);
    expect(combinations(4, 2)).toBe(6);
    expect(combinations(8, 4)).toBe(70);
    expect(combinations(3, 5)).toBe(0);
  });

  it('enumerates combinations without repeats', () => {
    const combos = indexCombinations(4, 2);
    expect(combos).toHaveLength(6);
    expect(combos[0]).toEqual([0, 1]);
    expect(combos[5]).toEqual([2, 3]);
  });

  it('counts the standard full-cover bets', () => {
    expect(systemLineCount({ sizes: [2, 3] }, 3)).toBe(4); // Trixie
    expect(systemLineCount({ sizes: [1, 2, 3] }, 3)).toBe(7); // Patent
    expect(systemLineCount({ sizes: [2, 3, 4] }, 4)).toBe(11); // Yankee
    expect(systemLineCount({ sizes: [1, 2, 3, 4] }, 4)).toBe(15); // Lucky 15
    expect(systemLineCount({ sizes: [2, 3, 4, 5, 6] }, 6)).toBe(57); // Heinz
    expect(systemLineCount({ sizes: [2, 3, 4, 5, 6, 7, 8] }, 8)).toBe(247); // Goliath
  });
});

/* ------------------------------------------------------------------ *
 * Settlement
 * ------------------------------------------------------------------ */

describe('single back bets', () => {
  it('settles a winner', () => {
    const s = settleBet(bet({ selections: [sel(2.5, 'won')], unitStake: 100 }));
    expect(s.status).toBe('won');
    near(s.profit, 150);
    near(s.returned, 250);
    near(s.risk, 100);
  });

  it('settles a loser', () => {
    const s = settleBet(bet({ selections: [sel(2.5, 'lost')] }));
    expect(s.status).toBe('lost');
    near(s.profit, -100);
  });

  it('returns the stake on a void', () => {
    const s = settleBet(bet({ selections: [sel(2.5, 'void')] }));
    expect(s.status).toBe('void');
    near(s.profit, 0);
    near(s.returned, 100);
  });

  it('leaves pending bets unsettled', () => {
    const b = bet({ selections: [sel(2.5, 'pending')] });
    expect(isSettled(b)).toBe(false);
    expect(settleBet(b).status).toBe('pending');
    near(potentialReturn(b), 250);
  });

  it('applies commission to net winnings only', () => {
    const win = settleBet(bet({ selections: [sel(3, 'won')], commission: 5 }));
    near(win.profit, 200 * 0.95);
    near(win.commissionPaid, 10);

    const loss = settleBet(bet({ selections: [sel(3, 'lost')], commission: 5 }));
    near(loss.profit, -100);
    near(loss.commissionPaid, 0);
  });

  it('splits the stake on quarter-line handicaps', () => {
    near(settleBet(bet({ selections: [sel(2, 'half_won')] })).profit, 50);
    near(settleBet(bet({ selections: [sel(2, 'half_lost')] })).profit, -50);
  });
});

describe('lay bets', () => {
  it('wins the backer stake when the lay comes in', () => {
    const s = settleBet(
      bet({ selections: [sel(3, 'won', { side: 'lay' })], unitStake: 100, commission: 5 }),
    );
    expect(s.status).toBe('won');
    near(s.profit, 95);
    near(s.risk, 200); // liability is what was actually at risk
  });

  it('loses the liability when the lay goes down', () => {
    const s = settleBet(bet({ selections: [sel(3, 'lost', { side: 'lay' })], unitStake: 100 }));
    near(s.profit, -200);
    near(s.risk, 200);
  });

  it('computes liability directly', () => {
    near(layLiability(100, 3), 200);
    near(layLiability(50, 1.5), 25);
  });
});

describe('accumulators', () => {
  it('multiplies the odds of every leg', () => {
    const b = bet({
      structure: 'accumulator',
      selections: [sel(2, 'won'), sel(1.5, 'won'), sel(3, 'won')],
      unitStake: 10,
    });
    near(combinedOdds(b), 9);
    const s = settleBet(b);
    near(s.returned, 90);
    near(s.profit, 80);
  });

  it('is lost as soon as one leg loses', () => {
    const s = settleBet(
      bet({
        structure: 'accumulator',
        selections: [sel(2, 'won'), sel(1.5, 'lost'), sel(3, 'won')],
        unitStake: 10,
      }),
    );
    expect(s.status).toBe('lost');
    near(s.profit, -10);
  });

  it('treats a void leg as odds of 1', () => {
    const s = settleBet(
      bet({
        structure: 'accumulator',
        selections: [sel(2, 'won'), sel(1.5, 'void'), sel(3, 'won')],
        unitStake: 10,
      }),
    );
    near(s.returned, 60);
    near(s.profit, 50);
  });
});

describe('system bets', () => {
  it('stakes every combination and pays the winning ones', () => {
    const b = bet({
      structure: 'system',
      system: { sizes: [2, 3], preset: 'trixie' },
      selections: [sel(2, 'won'), sel(2, 'won'), sel(2, 'won')],
      unitStake: 10,
    });
    expect(lineCount(b)).toBe(4);
    near(totalStake(b), 40);
    const s = settleBet(b);
    // 3 doubles at 4.0 = 120, plus 1 treble at 8.0 = 80
    near(s.returned, 200);
    near(s.profit, 160);
  });

  it('still pays out when one leg fails', () => {
    const b = bet({
      structure: 'system',
      system: { sizes: [2], preset: 'custom' },
      selections: [sel(2, 'won'), sel(2, 'won'), sel(2, 'lost')],
      unitStake: 10,
    });
    // 3 doubles staked (30); only the pairing of the two winners returns 40.
    const s = settleBet(b);
    near(s.returned, 40);
    near(s.profit, 10);
    expect(s.status).toBe('partial');
  });

  it('builds a Yankee out of 11 lines', () => {
    const b = bet({
      structure: 'system',
      system: { sizes: [2, 3, 4], preset: 'yankee' },
      selections: [sel(2, 'won'), sel(2, 'won'), sel(2, 'won'), sel(2, 'won')],
      unitStake: 1,
    });
    expect(lineCount(b)).toBe(11);
    // 6 doubles @4 + 4 trebles @8 + 1 fourfold @16 = 24 + 32 + 16 = 72
    near(settleBet(b).returned, 72);
  });
});

describe('each-way bets', () => {
  it('doubles the stake and pays win plus place', () => {
    const b = bet({
      selections: [sel(11, 'won')],
      unitStake: 10,
      eachWay: { places: 3, fraction: 0.2 },
    });
    near(totalStake(b), 20);
    near(placeOdds(11, 0.2), 3);
    const s = settleBet(b);
    near(s.returned, 110 + 30);
    near(s.profit, 120);
  });

  it('pays the place part alone when the selection only places', () => {
    const b = bet({
      selections: [sel(11, 'lost', { placed: true })],
      unitStake: 10,
      eachWay: { places: 3, fraction: 0.2 },
    });
    const s = settleBet(b);
    near(s.returned, 30);
    near(s.profit, 10);
  });

  it('loses both parts when the selection is unplaced', () => {
    const b = bet({
      selections: [sel(11, 'lost', { placed: false })],
      unitStake: 10,
      eachWay: { places: 3, fraction: 0.2 },
    });
    near(settleBet(b).profit, -20);
  });
});

describe('free bets and cash out', () => {
  it('does not return the stake of a winning free bet', () => {
    const s = settleBet(bet({ selections: [sel(3, 'won')], unitStake: 100, freeBet: true }));
    near(s.profit, 200);
    near(s.risk, 0);
  });

  it('costs nothing when a free bet loses', () => {
    const s = settleBet(bet({ selections: [sel(3, 'lost')], unitStake: 100, freeBet: true }));
    near(s.profit, 0);
  });

  it('overrides the outcome when cashed out', () => {
    const s = settleBet(
      bet({ selections: [sel(3, 'pending')], unitStake: 100, cashOutAmount: 150 }),
    );
    expect(s.status).toBe('cashed_out');
    near(s.profit, 50);
  });
});

/* ------------------------------------------------------------------ *
 * Closing line value
 * ------------------------------------------------------------------ */

describe('closing line value', () => {
  it('is positive when the price beat the close', () => {
    const v = closingLineValue(bet({ selections: [sel(2, 'won', { closingOdds: 1.8 })] }))!;
    near(v.clv, 2 / 1.8 - 1);
    near(v.ev, (1 / 1.8) * 100 * 1 - (1 - 1 / 1.8) * 100);
  });

  it('inverts the direction for a lay', () => {
    const v = closingLineValue(
      bet({ selections: [sel(2, 'won', { side: 'lay', closingOdds: 2.2 })] }),
    )!;
    expect(v.clv).toBeGreaterThan(0);
  });

  it('is unavailable when a leg has no closing price', () => {
    expect(closingLineValue(bet({ selections: [sel(2, 'won')] }))).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Statistics
 * ------------------------------------------------------------------ */

describe('statistics', () => {
  const history = [
    bet({ selections: [sel(2, 'won')], unitStake: 100, settledAt: 1 }),
    bet({ selections: [sel(2, 'lost')], unitStake: 100, settledAt: 2 }),
    bet({ selections: [sel(3, 'won')], unitStake: 100, settledAt: 3 }),
    bet({ selections: [sel(1.5, 'lost')], unitStake: 100, settledAt: 4 }),
    bet({ selections: [sel(4, 'pending')], unitStake: 100, settledAt: undefined }),
  ];

  it('counts outcomes and computes yield', () => {
    const s = computeStats(history);
    expect(s.betCount).toBe(5);
    expect(s.settledCount).toBe(4);
    expect(s.pendingCount).toBe(1);
    expect(s.wonCount).toBe(2);
    expect(s.lostCount).toBe(2);
    near(s.hitRate, 0.5);
    near(s.turnover, 400);
    // +100 -100 +200 -100 = +100 on 400 staked
    near(s.profit, 100);
    near(s.yield, 0.25);
    near(s.pendingStake, 100);
  });

  it('computes the profit factor and extremes', () => {
    const s = computeStats(history);
    near(s.profitFactor, 300 / 200);
    near(s.biggestWin, 200);
    near(s.biggestLoss, -100);
    near(s.avgStake, 100);
  });

  it('tracks streaks', () => {
    const streaky = [
      bet({ selections: [sel(2, 'won')], settledAt: 1 }),
      bet({ selections: [sel(2, 'won')], settledAt: 2 }),
      bet({ selections: [sel(2, 'won')], settledAt: 3 }),
      bet({ selections: [sel(2, 'lost')], settledAt: 4 }),
      bet({ selections: [sel(2, 'lost')], settledAt: 5 }),
    ];
    const s = computeStats(streaky);
    expect(s.longestWinStreak).toBe(3);
    expect(s.longestLossStreak).toBe(2);
    expect(s.currentStreak).toBe(-2);
  });

  it('measures the worst peak-to-trough fall', () => {
    const settled = toSettledBets([
      bet({ selections: [sel(3, 'won')], unitStake: 100, settledAt: 1 }), // +200 peak 200
      bet({ selections: [sel(2, 'lost')], unitStake: 100, settledAt: 2 }), // 100
      bet({ selections: [sel(2, 'lost')], unitStake: 100, settledAt: 3 }), // 0
      bet({ selections: [sel(2, 'won')], unitStake: 100, settledAt: 4 }), // 100
    ]);
    const dd = drawdown(settled);
    near(dd.maxDrawdown, 200);
    near(dd.maxDrawdownPct, 1);
  });

  it('measures the drawdown percentage against the bankroll when given one', () => {
    // A run that loses first has no positive profit peak, so without a capital
    // base the percentage has no meaningful denominator.
    const losingFirst = toSettledBets([
      bet({ selections: [sel(2, 'lost')], unitStake: 100, settledAt: 1 }),
      bet({ selections: [sel(2, 'lost')], unitStake: 100, settledAt: 2 }),
    ]);
    near(drawdown(losingFirst).maxDrawdownPct, 0);
    const withCapital = drawdown(losingFirst, 1000);
    near(withCapital.maxDrawdown, 200);
    near(withCapital.maxDrawdownPct, 0.2);
  });

  it('reports drawdown through computeStats when a bankroll is supplied', () => {
    const s = computeStats(
      [
        bet({ selections: [sel(2, 'lost')], unitStake: 100, settledAt: 1 }),
        bet({ selections: [sel(2, 'won')], unitStake: 100, settledAt: 2 }),
      ],
      { startingCapital: 500 },
    );
    near(s.maxDrawdown, 100);
    near(s.maxDrawdownPct, 0.2);
  });

  it('builds an equity curve that folds in transactions', () => {
    const curve = equityCurve(
      [bet({ selections: [sel(2, 'won')], unitStake: 100, settledAt: 10 })],
      1000,
      [
        {
          id: 't1',
          bankrollId: 'bk1',
          kind: 'deposit',
          amount: 500,
          occurredAt: 20,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    );
    expect(curve).toHaveLength(3);
    near(curve[0]!.balance, 1000);
    near(curve[1]!.balance, 1100);
    near(curve[2]!.balance, 1600);
    near(curve[2]!.profit, 100);
  });

  it('buckets odds into bands', () => {
    expect(oddsBand(1.2)).toBe('1.00-1.50');
    expect(oddsBand(2.5)).toBe('2.00-3.00');
    expect(oddsBand(50)).toBe('10.00+');
  });

  it('returns zeroed stats for an empty history', () => {
    const s = computeStats([]);
    expect(s.betCount).toBe(0);
    expect(s.yield).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Calculators
 * ------------------------------------------------------------------ */

describe('dutching', () => {
  it('equalises the return across outcomes', () => {
    const r = dutching([{ odds: 2 }, { odds: 4 }, { odds: 8 }], 100);
    const [a, b, c] = r.returns;
    near(a!, b!, 1e-9);
    near(b!, c!, 1e-9);
    near(r.stakes.reduce((x, y) => x + y, 0), 100);
  });

  it('detects an arbitrage and prices the edge', () => {
    const r = surebet([{ odds: 2.1 }, { odds: 2.1 }], 100);
    expect(r.isArb).toBe(true);
    near(r.profit, 5, 1e-9);
    expect(r.edge).toBeGreaterThan(0);
  });

  it('reports no arb on an overround market', () => {
    const r = surebet([{ odds: 1.9 }, { odds: 1.9 }], 100);
    expect(r.isArb).toBe(false);
    expect(r.profit).toBeLessThan(0);
  });

  it('accounts for exchange commission', () => {
    const withCommission = dutching([{ odds: 2.1, commission: 5 }, { odds: 2.1 }], 100);
    const without = dutching([{ odds: 2.1 }, { odds: 2.1 }], 100);
    expect(withCommission.profit).toBeLessThan(without.profit);
  });
});

describe('hedging', () => {
  it('locks the same profit on both outcomes', () => {
    const h = hedge({ backStake: 100, backOdds: 3, layOdds: 2.5 });
    near(h.layStake, 120);
    near(h.liability, 180);
    near(h.profitIfWin, 20);
    near(h.profitIfLose, 20);
    near(h.lockedProfit, 20);
  });

  it('still balances once commission is charged', () => {
    const h = hedge({ backStake: 100, backOdds: 3, layOdds: 2.5, commission: 5 });
    near(h.profitIfWin, h.profitIfLose, 1e-9);
  });

  it('locks a loss when the price has moved against you', () => {
    const h = hedge({ backStake: 100, backOdds: 2, layOdds: 3 });
    expect(h.lockedProfit).toBeLessThan(0);
  });
});

describe('staking plans', () => {
  it('applies the Kelly criterion', () => {
    const r = stakeSuggestion({ plan: 'kelly', bankroll: 1000, odds: 2, probability: 0.6 });
    near(r.stake, 200);
    near(r.edge, 0.2);
  });

  it('scales down for fractional Kelly', () => {
    const r = stakeSuggestion({
      plan: 'fractionalKelly',
      bankroll: 1000,
      odds: 2,
      probability: 0.6,
      kellyFraction: 0.25,
    });
    near(r.stake, 50);
  });

  it('recommends nothing without an edge', () => {
    const r = stakeSuggestion({ plan: 'kelly', bankroll: 1000, odds: 2, probability: 0.4 });
    expect(r.stake).toBe(0);
    expect(r.warning).toBe('noEdge');
  });

  it('progresses the martingale and fibonacci ladders', () => {
    near(stakeSuggestion({ plan: 'martingale', bankroll: 10000, odds: 2, unit: 10, lossStreak: 3 }).stake, 80);
    near(stakeSuggestion({ plan: 'fibonacci', bankroll: 10000, odds: 2, unit: 10, lossStreak: 4 }).stake, 50);
    near(stakeSuggestion({ plan: 'dalembert', bankroll: 10000, odds: 2, unit: 10, lossStreak: 3 }).stake, 40);
  });

  it('never recommends more than the bankroll', () => {
    const r = stakeSuggestion({ plan: 'martingale', bankroll: 100, odds: 2, unit: 10, lossStreak: 10 });
    near(r.stake, 100);
    expect(r.warning).toBe('cappedAtBankroll');
  });

  it('stakes to win a fixed amount', () => {
    const r = stakeSuggestion({ plan: 'levelToWin', bankroll: 1000, odds: 3, targetProfit: 100 });
    near(r.stake, 50);
  });
});

describe('return to player', () => {
  it('derives the margin from a market', () => {
    const r = marketRtp([1.9, 1.9]);
    near(r.overround, 2 / 1.9);
    near(r.rtp, 0.95);
    near(r.margin, 0.05);
    near(r.fairOdds[0]!, 2);
  });
});

describe('simulation', () => {
  it('matches the analytic expectation and is deterministic', () => {
    const input = {
      bets: 100,
      stake: 10,
      odds: 2,
      winRate: 0.55,
      startingBankroll: 1000,
      runs: 500,
      seed: 7,
    };
    const a = simulate(input);
    const b = simulate(input);
    near(a.expectedProfit, 100); // 10 * (0.55*1 - 0.45) * 100
    expect(a.median).toBe(b.median);
    expect(a.p5).toBeLessThanOrEqual(a.median);
    expect(a.median).toBeLessThanOrEqual(a.p95);
  });

  it('reports ruin when the edge is hopeless', () => {
    const r = simulate({
      bets: 200,
      stake: 200,
      odds: 2,
      winRate: 0.1,
      startingBankroll: 400,
      runs: 200,
      seed: 3,
    });
    expect(r.ruinProbability).toBeGreaterThan(0.5);
  });
});

describe('capital allocation', () => {
  it('splits capital in proportion to turnover', () => {
    const rows = allocateCapital(
      [
        { bookmaker: 'A', turnover: 750, current: 100 },
        { bookmaker: 'B', turnover: 250, current: 400 },
      ],
      1000,
    );
    near(rows[0]!.suggested, 750);
    near(rows[0]!.delta!, 650);
    near(rows[1]!.suggested, 250);
  });

  it('splits evenly when there is no history', () => {
    const rows = allocateCapital(
      [
        { bookmaker: 'A', turnover: 0 },
        { bookmaker: 'B', turnover: 0 },
      ],
      1000,
    );
    near(rows[0]!.suggested, 500);
  });
});

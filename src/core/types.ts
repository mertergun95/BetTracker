/**
 * Domain model.
 *
 * All monetary values are plain numbers in the bankroll's currency.
 * All odds stored internally are DECIMAL odds; American and fractional are
 * presentation formats only (see `odds.ts`).
 * All timestamps are epoch milliseconds (UTC).
 */

export type OddsFormat = 'decimal' | 'american' | 'fractional';

/** Which side of the exchange the money is on. Fixed-odds bookmakers are 'back'. */
export type BetSide = 'back' | 'lay';

/** How the selections combine into bets. */
export type BetStructure = 'single' | 'accumulator' | 'system';

/**
 * Outcome of one selection.
 * `half_won` / `half_lost` cover Asian handicap quarter lines, where half the
 * stake settles at the odds and half is returned.
 */
export type SelectionStatus =
  | 'pending'
  | 'won'
  | 'lost'
  | 'void'
  | 'half_won'
  | 'half_lost';

/** Outcome of a whole bet, derived from its selections unless cashed out. */
export type BetStatus =
  | 'pending'
  | 'won'
  | 'lost'
  | 'void'
  | 'partial'
  | 'cashed_out';

export interface Selection {
  id: string;
  /** e.g. "Galatasaray - Fenerbahçe" */
  event: string;
  /** Key from `sports.ts`, e.g. "football" */
  sport: string;
  /** e.g. "Süper Lig" */
  competition: string;
  /** e.g. "1X2", "Over/Under 2.5", "Asian Handicap -0.25" */
  market: string;
  /** The actual pick, e.g. "Galatasaray", "Over 2.5" */
  pick: string;
  /** Decimal odds taken. For a lay this is the lay price. */
  odds: number;
  side: BetSide;
  /**
   * Decimal odds at the moment the market closed. Optional — only bets that
   * have it participate in CLV/EV statistics.
   */
  closingOdds?: number;
  status: SelectionStatus;
  /** Kick-off / start time, if known. */
  eventAt?: number;
  /**
   * For each-way bets: did the selection finish in the paying places?
   * Ignored when the bet is not each-way.
   */
  placed?: boolean;
}

/** Each-way terms. Total stake becomes 2x the unit stake (win part + place part). */
export interface EachWayTerms {
  /** Number of paying places, e.g. 3. Informational — settlement uses `placed`. */
  places: number;
  /** Place odds fraction of the win odds, e.g. 0.2 for 1/5. */
  fraction: number;
}

/**
 * A system bet is defined by which combination sizes are covered.
 * Examples with n selections:
 *   [2]          from 3 -> "2/3", 3 bets
 *   [2,3]        from 3 -> Trixie, 4 bets
 *   [1,2,3]      from 3 -> Patent, 7 bets
 *   [2,3,4]      from 4 -> Yankee, 11 bets
 *   [1,2,3,4]    from 4 -> Lucky 15, 15 bets
 */
export interface SystemTerms {
  sizes: number[];
  /** Preset key from `systems.ts`, or 'custom'. Presentation only. */
  preset?: string;
}

export interface Bet {
  id: string;
  bankrollId: string;
  structure: BetStructure;
  selections: Selection[];
  /**
   * Stake per individual bet line.
   * - single / accumulator: the whole stake (one line).
   * - system: the unit stake, multiplied by the number of combinations.
   * - each-way: doubled, because the win and place parts are separate lines.
   * Use `totalStake()` from `settlement.ts` rather than reading this directly.
   */
  unitStake: number;
  bookmaker: string;
  /** Exchange commission on net winnings, as a percentage (5 = 5%). */
  commission: number;
  eachWay?: EachWayTerms;
  system?: SystemTerms;
  /** Free bets do not return the stake, and the stake is not counted as risked. */
  freeBet?: boolean;
  placedAt: number;
  settledAt?: number;
  /** Amount received from cashing out. When set, it overrides normal settlement. */
  cashOutAmount?: number;
  tipster?: string;
  tags: string[];
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export type TransactionKind = 'deposit' | 'withdrawal' | 'adjustment' | 'bonus';

export interface Transaction {
  id: string;
  bankrollId: string;
  kind: TransactionKind;
  /** Positive for deposits/bonuses, negative for withdrawals. */
  amount: number;
  bookmaker?: string;
  note?: string;
  occurredAt: number;
  createdAt: number;
}

export interface Bankroll {
  id: string;
  name: string;
  currency: string;
  /** Money put in at creation. Further movements are `Transaction`s. */
  startingCapital: number;
  /** Default stake used to prefill the bet form. */
  defaultStake: number;
  /** Free-form notepad, one per bankroll. */
  note: string;
  color: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type Language = 'tr' | 'en';

export interface Settings {
  id: 'settings';
  language: Language;
  theme: ThemeMode;
  oddsFormat: OddsFormat;
  /** Bankroll shown on launch. */
  activeBankrollId?: string;
  /** User-extensible lists, seeded on first run. */
  bookmakers: string[];
  tipsters: string[];
  /** Stake unit used by the staking calculator, as a % of bankroll. */
  defaultCommission: number;
  updatedAt: number;
}

/** Filters applied to the bet list and to every statistic derived from it. */
export interface BetFilter {
  bankrollIds?: string[];
  from?: number;
  to?: number;
  sports?: string[];
  competitions?: string[];
  bookmakers?: string[];
  tipsters?: string[];
  tags?: string[];
  structures?: BetStructure[];
  sides?: BetSide[];
  statuses?: BetStatus[];
  minOdds?: number;
  maxOdds?: number;
  minStake?: number;
  maxStake?: number;
  /** Matches event, pick, competition, market or note. */
  search?: string;
}

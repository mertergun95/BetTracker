/**
 * Reference data seeded on first run. Everything here is a starting point:
 * users can add their own bookmakers, tipsters and tags, and any sport string
 * typed into a bet is accepted even if it is not on this list.
 */

export interface SportDef {
  key: string;
  icon: string;
  /** Labels live in the i18n files under `sport.<key>`. */
}

/** 44 sports, matching the breadth of the mainstream trackers. */
export const SPORTS: SportDef[] = [
  { key: 'football', icon: '⚽' },
  { key: 'basketball', icon: '🏀' },
  { key: 'tennis', icon: '🎾' },
  { key: 'volleyball', icon: '🏐' },
  { key: 'iceHockey', icon: '🏒' },
  { key: 'handball', icon: '🤾' },
  { key: 'baseball', icon: '⚾' },
  { key: 'americanFootball', icon: '🏈' },
  { key: 'rugby', icon: '🏉' },
  { key: 'cricket', icon: '🏏' },
  { key: 'golf', icon: '⛳' },
  { key: 'boxing', icon: '🥊' },
  { key: 'mma', icon: '🥋' },
  { key: 'formula1', icon: '🏎️' },
  { key: 'motogp', icon: '🏍️' },
  { key: 'cycling', icon: '🚴' },
  { key: 'athletics', icon: '🏃' },
  { key: 'swimming', icon: '🏊' },
  { key: 'darts', icon: '🎯' },
  { key: 'snooker', icon: '🎱' },
  { key: 'tableTennis', icon: '🏓' },
  { key: 'badminton', icon: '🏸' },
  { key: 'esports', icon: '🎮' },
  { key: 'horseRacing', icon: '🐎' },
  { key: 'greyhounds', icon: '🐕' },
  { key: 'waterPolo', icon: '🤽' },
  { key: 'floorball', icon: '🏑' },
  { key: 'lacrosse', icon: '🥍' },
  { key: 'futsal', icon: '⚽' },
  { key: 'beachVolleyball', icon: '🏐' },
  { key: 'aussieRules', icon: '🏉' },
  { key: 'gaelic', icon: '🍀' },
  { key: 'bandy', icon: '🏒' },
  { key: 'curling', icon: '🥌' },
  { key: 'skiing', icon: '⛷️' },
  { key: 'skiJumping', icon: '🎿' },
  { key: 'biathlon', icon: '🎿' },
  { key: 'chess', icon: '♟️' },
  { key: 'sailing', icon: '⛵' },
  { key: 'surfing', icon: '🏄' },
  { key: 'weightlifting', icon: '🏋️' },
  { key: 'wrestling', icon: '🤼' },
  { key: 'politics', icon: '🗳️' },
  { key: 'other', icon: '🎲' },
];

export const SPORT_KEYS = SPORTS.map((s) => s.key);

export function sportIcon(key: string): string {
  return SPORTS.find((s) => s.key === key)?.icon ?? '🎲';
}

/** Seed bookmaker list. Exchanges are flagged so the form can default commission. */
export interface BookmakerDef {
  name: string;
  exchange?: boolean;
  defaultCommission?: number;
}

export const DEFAULT_BOOKMAKERS: BookmakerDef[] = [
  { name: 'Bet365' },
  { name: 'Pinnacle' },
  { name: 'Betfair Exchange', exchange: true, defaultCommission: 5 },
  { name: 'Smarkets', exchange: true, defaultCommission: 2 },
  { name: 'Matchbook', exchange: true, defaultCommission: 1.5 },
  { name: 'Stake' },
  { name: 'Nesine' },
  { name: 'Bilyoner' },
  { name: 'Misli' },
  { name: 'Tuttur' },
  { name: 'Oley' },
  { name: 'İddaa' },
  { name: '1xBet' },
  { name: 'Betano' },
  { name: 'Unibet' },
  { name: 'William Hill' },
  { name: 'Marathonbet' },
  { name: 'Betway' },
  { name: 'Bwin' },
  { name: 'DraftKings' },
  { name: 'FanDuel' },
  { name: 'Other' },
];

export function bookmakerDef(name: string): BookmakerDef | undefined {
  return DEFAULT_BOOKMAKERS.find((b) => b.name.toLowerCase() === name.toLowerCase());
}

/** Common markets, offered as autocomplete suggestions on the bet form. */
export const COMMON_MARKETS: string[] = [
  '1X2',
  'Double Chance',
  'Draw No Bet',
  'Over/Under 0.5',
  'Over/Under 1.5',
  'Over/Under 2.5',
  'Over/Under 3.5',
  'Both Teams To Score',
  'Asian Handicap',
  'European Handicap',
  'Correct Score',
  'HT/FT',
  'First Goalscorer',
  'Anytime Goalscorer',
  'Corners',
  'Cards',
  'Moneyline',
  'Point Spread',
  'Total Points',
  'Player Props',
  'Set Betting',
  'Game Handicap',
  'Outright / Winner',
  'To Qualify',
  'Top 10 Finish',
  'Method of Victory',
  'Round Betting',
];

/** Currencies offered when creating a bankroll. */
export const CURRENCIES: { code: string; symbol: string }[] = [
  { code: 'TRY', symbol: '₺' },
  { code: 'EUR', symbol: '€' },
  { code: 'USD', symbol: '$' },
  { code: 'GBP', symbol: '£' },
  { code: 'CHF', symbol: 'CHF' },
  { code: 'SEK', symbol: 'kr' },
  { code: 'PLN', symbol: 'zł' },
  { code: 'BRL', symbol: 'R$' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'USDT', symbol: '₮' },
  { code: 'BTC', symbol: '₿' },
];

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

/** Palette offered for bankroll colour-coding. */
export const BANKROLL_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

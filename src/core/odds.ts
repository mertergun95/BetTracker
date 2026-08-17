import type { OddsFormat } from './types';

/** Decimal odds below this are not payable (you cannot win less than nothing). */
export const MIN_DECIMAL_ODDS = 1.01;

export function isValidDecimalOdds(odds: number): boolean {
  return Number.isFinite(odds) && odds >= 1;
}

/* ------------------------------------------------------------------ *
 * Conversions
 * ------------------------------------------------------------------ */

export function decimalToAmerican(decimal: number): number {
  if (!isValidDecimalOdds(decimal) || decimal === 1) return 0;
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1));
}

export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0) return 1;
  return american > 0 ? american / 100 + 1 : 100 / -american + 1;
}

/** Greatest common divisor, used to reduce fractional odds to lowest terms. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function decimalToFractional(decimal: number): [number, number] {
  if (!isValidDecimalOdds(decimal) || decimal === 1) return [0, 1];
  const profit = decimal - 1;
  // Approximate with a denominator up to 1000; standard betting fractions
  // (1/5, 4/11, 15/8 ...) all reduce cleanly well within that bound.
  let bestNum = 1;
  let bestDen = 1;
  let bestErr = Infinity;
  for (let den = 1; den <= 1000; den++) {
    const num = Math.round(profit * den);
    if (num < 1) continue;
    const err = Math.abs(profit - num / den);
    if (err < bestErr - 1e-12) {
      bestErr = err;
      bestNum = num;
      bestDen = den;
      if (err < 1e-9) break;
    }
  }
  const d = gcd(bestNum, bestDen);
  return [bestNum / d, bestDen / d];
}

export function fractionalToDecimal(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 1;
  }
  return numerator / denominator + 1;
}

/* ------------------------------------------------------------------ *
 * Display
 * ------------------------------------------------------------------ */

export function formatOdds(decimal: number, format: OddsFormat): string {
  if (!isValidDecimalOdds(decimal)) return '—';
  switch (format) {
    case 'american': {
      const a = decimalToAmerican(decimal);
      return a > 0 ? `+${a}` : String(a);
    }
    case 'fractional': {
      const [n, d] = decimalToFractional(decimal);
      return `${n}/${d}`;
    }
    case 'decimal':
    default:
      return decimal.toFixed(2);
  }
}

/**
 * Parses odds typed in any format.
 * "2.50" -> 2.5 | "+150" / "-200" -> American | "3/2" -> fractional
 * Returns null when the input is not parseable as odds.
 */
export function parseOdds(input: string, assumed: OddsFormat = 'decimal'): number | null {
  const raw = input.trim().replace(',', '.');
  if (!raw) return null;

  if (raw.includes('/')) {
    const [n, d] = raw.split('/');
    const num = Number(n);
    const den = Number(d);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return fractionalToDecimal(num, den);
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) return null;

  // An explicit sign always means American, whatever the assumed format is.
  if (raw.startsWith('+') || raw.startsWith('-')) return americanToDecimal(value);
  if (assumed === 'american') return americanToDecimal(value);
  return value;
}

/* ------------------------------------------------------------------ *
 * Probability
 * ------------------------------------------------------------------ */

/** Implied probability including the bookmaker's margin. */
export function impliedProbability(decimal: number): number {
  return isValidDecimalOdds(decimal) && decimal > 0 ? 1 / decimal : 0;
}

export function probabilityToDecimal(p: number): number {
  return p > 0 && p <= 1 ? 1 / p : 0;
}

/**
 * Total implied probability of a market. Above 1 means the book is overround
 * (the bookmaker's edge); below 1 means an arbitrage exists.
 */
export function bookOverround(decimalOdds: number[]): number {
  return decimalOdds.reduce((sum, o) => sum + impliedProbability(o), 0);
}

/**
 * Removes the bookmaker margin from a set of odds by scaling every implied
 * probability down proportionally (the "multiplicative" method).
 * Returns fair decimal odds in the same order.
 */
export function removeVig(decimalOdds: number[]): number[] {
  const overround = bookOverround(decimalOdds);
  if (overround <= 0) return decimalOdds.map(() => 0);
  return decimalOdds.map((o) => probabilityToDecimal(impliedProbability(o) / overround));
}

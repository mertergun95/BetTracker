import type { SystemTerms } from './types';

/** Binomial coefficient C(n, k). */
export function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < kk; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

/** Every k-sized combination of indices 0..n-1. */
export function indexCombinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  if (k < 0 || k > n) return out;
  const current: number[] = [];

  const walk = (start: number) => {
    if (current.length === k) {
      out.push([...current]);
      return;
    }
    // Stop early once too few indices remain to complete a combination.
    for (let i = start; i <= n - (k - current.length); i++) {
      current.push(i);
      walk(i + 1);
      current.pop();
    }
  };

  walk(0);
  return out;
}

/** Number of individual bet lines a system produces over n selections. */
export function systemLineCount(terms: SystemTerms, n: number): number {
  return terms.sizes.reduce((sum, size) => sum + combinations(n, size), 0);
}

export interface SystemPreset {
  key: string;
  label: string;
  /** Exact number of selections this preset requires. */
  selections: number;
  sizes: number[];
}

/**
 * The standard UK full-cover bets. `sizes` lists which combination sizes are
 * covered, so settlement needs no special-casing per preset.
 */
export const SYSTEM_PRESETS: SystemPreset[] = [
  { key: 'trixie', label: 'Trixie', selections: 3, sizes: [2, 3] },
  { key: 'patent', label: 'Patent', selections: 3, sizes: [1, 2, 3] },
  { key: 'yankee', label: 'Yankee', selections: 4, sizes: [2, 3, 4] },
  { key: 'lucky15', label: 'Lucky 15', selections: 4, sizes: [1, 2, 3, 4] },
  { key: 'canadian', label: 'Canadian / Super Yankee', selections: 5, sizes: [2, 3, 4, 5] },
  { key: 'lucky31', label: 'Lucky 31', selections: 5, sizes: [1, 2, 3, 4, 5] },
  { key: 'heinz', label: 'Heinz', selections: 6, sizes: [2, 3, 4, 5, 6] },
  { key: 'lucky63', label: 'Lucky 63', selections: 6, sizes: [1, 2, 3, 4, 5, 6] },
  { key: 'superheinz', label: 'Super Heinz', selections: 7, sizes: [2, 3, 4, 5, 6, 7] },
  { key: 'goliath', label: 'Goliath', selections: 8, sizes: [2, 3, 4, 5, 6, 7, 8] },
];

export function presetByKey(key: string): SystemPreset | undefined {
  return SYSTEM_PRESETS.find((p) => p.key === key);
}

/** Human label for an arbitrary system, e.g. "2/4" or "2,3/4". */
export function systemLabel(terms: SystemTerms, n: number): string {
  if (terms.preset && terms.preset !== 'custom') {
    const preset = presetByKey(terms.preset);
    if (preset) return preset.label;
  }
  return `${[...terms.sizes].sort((a, b) => a - b).join(',')}/${n}`;
}

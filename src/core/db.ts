import Dexie, { type Table } from 'dexie';
import type { Bankroll, Bet, Settings, Tombstone, Transaction } from './types';

/**
 * IndexedDB schema.
 *
 * Only the fields actually used for range queries are indexed. Everything else
 * (sport, competition, tags, odds, status) is filtered in memory: a personal
 * betting history is thousands of rows, not millions, and keeping selections
 * nested is worth far more than index-driven filtering would be.
 */
export class BetTrackerDb extends Dexie {
  bankrolls!: Table<Bankroll, string>;
  bets!: Table<Bet, string>;
  transactions!: Table<Transaction, string>;
  settings!: Table<Settings, string>;
  tombstones!: Table<Tombstone, string>;

  constructor(name = 'bettracker') {
    super(name);

    this.version(1).stores({
      bankrolls: 'id, name, archived, createdAt',
      bets: 'id, bankrollId, placedAt, settledAt, bookmaker, tipster, structure, [bankrollId+placedAt]',
      transactions: 'id, bankrollId, occurredAt, [bankrollId+occurredAt]',
      settings: 'id',
    });

    // v2 adds bet-builder picks, bankroll sport restrictions and the deletion
    // tombstones that cross-device sync needs.
    this.version(2)
      .stores({
        bankrolls: 'id, name, archived, createdAt',
        bets: 'id, bankrollId, placedAt, settledAt, bookmaker, tipster, structure, [bankrollId+placedAt]',
        transactions: 'id, bankrollId, occurredAt, [bankrollId+occurredAt]',
        settings: 'id',
        tombstones: 'id, kind, deletedAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('bets')
          .toCollection()
          .modify((bet: { selections?: LegacySelection[] }) => {
            bet.selections = (bet.selections ?? []).map(migrateSelection);
          });

        await tx
          .table('bankrolls')
          .toCollection()
          .modify((bankroll: Bankroll) => {
            // Existing bankrolls accepted anything, and must keep doing so.
            bankroll.sports ??= [];
          });
      });
  }
}

/** Shape of a selection before v2: one market and one pick, flat. */
interface LegacySelection {
  id: string;
  market?: string;
  pick?: string;
  picks?: { id: string; market: string; pick: string }[];
  [key: string]: unknown;
}

/**
 * Folds a pre-v2 selection's flat `market`/`pick` into the `picks` array.
 * Exported so the backup importer can accept old export files too.
 */
export function migrateSelection<T extends LegacySelection>(selection: T): T {
  if (Array.isArray(selection.picks) && selection.picks.length > 0) return selection;

  const { market, pick, ...rest } = selection;
  return {
    ...(rest as T),
    picks: [
      {
        id: `${selection.id}_p0`,
        market: market ?? '',
        pick: pick ?? '',
      },
    ],
  };
}

export const db = new BetTrackerDb();

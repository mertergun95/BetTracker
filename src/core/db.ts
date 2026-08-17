import Dexie, { type Table } from 'dexie';
import type { Bankroll, Bet, Settings, Transaction } from './types';

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

  constructor(name = 'bettracker') {
    super(name);
    this.version(1).stores({
      bankrolls: 'id, name, archived, createdAt',
      bets: 'id, bankrollId, placedAt, settledAt, bookmaker, tipster, structure, [bankrollId+placedAt]',
      transactions: 'id, bankrollId, occurredAt, [bankrollId+occurredAt]',
      settings: 'id',
    });
  }
}

export const db = new BetTrackerDb();

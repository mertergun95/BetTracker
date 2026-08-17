import { db } from './db';
import { newId } from './ids';
import { DEFAULT_BOOKMAKERS } from './reference';
import { isSettled, settleBet } from './settlement';
import type {
  Bankroll,
  Bet,
  BetFilter,
  Settings,
  Tombstone,
  Transaction,
} from './types';

/**
 * Data access, behind an interface.
 *
 * Everything above this line talks to `DataStore`, never to Dexie directly, so
 * a synced backend can be added later by writing a second implementation and
 * swapping the export at the bottom of this file. Nothing else has to change.
 */
export interface DataStore {
  listBankrolls(includeArchived?: boolean): Promise<Bankroll[]>;
  getBankroll(id: string): Promise<Bankroll | undefined>;
  saveBankroll(input: Partial<Bankroll> & { name: string }): Promise<Bankroll>;
  updateBankroll(id: string, patch: Partial<Bankroll>): Promise<void>;
  deleteBankroll(id: string): Promise<void>;

  listBets(filter?: BetFilter): Promise<Bet[]>;
  getBet(id: string): Promise<Bet | undefined>;
  saveBet(input: Omit<Bet, 'createdAt' | 'updatedAt'> & Partial<Pick<Bet, 'createdAt'>>): Promise<Bet>;
  updateBets(ids: string[], patch: Partial<Bet>): Promise<void>;
  deleteBets(ids: string[]): Promise<void>;

  listTransactions(bankrollId?: string): Promise<Transaction[]>;
  saveTransaction(input: Omit<Transaction, 'id' | 'createdAt'> & { id?: string }): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;

  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  /** Deletion records, so a sync does not resurrect what another device removed. */
  listTombstones(): Promise<Tombstone[]>;
  putTombstones(tombstones: Tombstone[]): Promise<void>;

  /** Writes a record without touching `updatedAt`. Used by the sync merger. */
  putRaw(data: { bankrolls?: Bankroll[]; bets?: Bet[]; transactions?: Transaction[] }): Promise<void>;

  /** Wipes every table. Used by "reset app" and before restoring a backup. */
  clearAll(): Promise<void>;
}

const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  language: 'tr',
  theme: 'system',
  oddsFormat: 'decimal',
  bookmakers: DEFAULT_BOOKMAKERS.map((b) => b.name),
  tipsters: [],
  defaultCommission: 0,
  defaultBookmaker: 'Stake',
  sidebarPinned: false,
  updatedAt: 0,
};

class IndexedDbStore implements DataStore {
  /* ---------------- Bankrolls ---------------- */

  async listBankrolls(includeArchived = false): Promise<Bankroll[]> {
    const all = await db.bankrolls.toArray();
    return all
      .filter((b) => includeArchived || !b.archived)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  getBankroll(id: string): Promise<Bankroll | undefined> {
    return db.bankrolls.get(id);
  }

  async saveBankroll(input: Partial<Bankroll> & { name: string }): Promise<Bankroll> {
    const now = Date.now();
    const existing = input.id ? await db.bankrolls.get(input.id) : undefined;
    const bankroll: Bankroll = {
      id: input.id ?? newId('bk_'),
      name: input.name,
      currency: input.currency ?? existing?.currency ?? 'TRY',
      sports: input.sports ?? existing?.sports ?? [],
      startingCapital: input.startingCapital ?? existing?.startingCapital ?? 0,
      defaultStake: input.defaultStake ?? existing?.defaultStake ?? 0,
      note: input.note ?? existing?.note ?? '',
      color: input.color ?? existing?.color ?? '#3b82f6',
      archived: input.archived ?? existing?.archived ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.bankrolls.put(bankroll);
    return bankroll;
  }

  async updateBankroll(id: string, patch: Partial<Bankroll>): Promise<void> {
    await db.bankrolls.update(id, { ...patch, updatedAt: Date.now() });
  }

  async deleteBankroll(id: string): Promise<void> {
    // Bets and transactions are meaningless without their bankroll, so they go
    // with it rather than being orphaned.
    await db.transaction('rw', db.bankrolls, db.bets, db.transactions, db.tombstones, async () => {
      const bets = await db.bets.where('bankrollId').equals(id).primaryKeys();
      const txs = await db.transactions.where('bankrollId').equals(id).primaryKeys();

      await db.bets.where('bankrollId').equals(id).delete();
      await db.transactions.where('bankrollId').equals(id).delete();
      await db.bankrolls.delete(id);

      await db.tombstones.bulkPut([
        tombstone('bankroll', id),
        ...bets.map((betId) => tombstone('bet', betId)),
        ...txs.map((txId) => tombstone('transaction', txId)),
      ]);
    });
  }

  /* ---------------- Bets ---------------- */

  async listBets(filter: BetFilter = {}): Promise<Bet[]> {
    let rows: Bet[];

    // Narrow with an index where one exists, then apply the rest in memory.
    if (filter.bankrollIds?.length === 1) {
      rows = await db.bets.where('bankrollId').equals(filter.bankrollIds[0]!).toArray();
    } else if (filter.bankrollIds?.length) {
      rows = await db.bets.where('bankrollId').anyOf(filter.bankrollIds).toArray();
    } else {
      rows = await db.bets.toArray();
    }

    return applyFilter(rows, filter).sort((a, b) => b.placedAt - a.placedAt);
  }

  getBet(id: string): Promise<Bet | undefined> {
    return db.bets.get(id);
  }

  async saveBet(
    input: Omit<Bet, 'createdAt' | 'updatedAt'> & Partial<Pick<Bet, 'createdAt'>>,
  ): Promise<Bet> {
    const now = Date.now();
    const existing = await db.bets.get(input.id);
    const settledNow = isSettled(input as Bet);

    const bet: Bet = {
      ...(input as Bet),
      // Stamp the settlement time the first time a bet becomes settled, so the
      // equity curve orders bets by when they actually resolved.
      settledAt: input.settledAt ?? (settledNow ? (existing?.settledAt ?? now) : undefined),
      createdAt: input.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.bets.put(bet);
    return bet;
  }

  async updateBets(ids: string[], patch: Partial<Bet>): Promise<void> {
    if (ids.length === 0) return;
    const now = Date.now();
    await db.transaction('rw', db.bets, async () => {
      for (const id of ids) {
        const existing = await db.bets.get(id);
        if (!existing) continue;
        const merged: Bet = { ...existing, ...patch, id, updatedAt: now };
        if (merged.settledAt === undefined && isSettled(merged)) merged.settledAt = now;
        await db.bets.put(merged);
      }
    });
  }

  async deleteBets(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.transaction('rw', db.bets, db.tombstones, async () => {
      await db.bets.bulkDelete(ids);
      await db.tombstones.bulkPut(ids.map((id) => tombstone('bet', id)));
    });
  }

  /* ---------------- Transactions ---------------- */

  async listTransactions(bankrollId?: string): Promise<Transaction[]> {
    const rows = bankrollId
      ? await db.transactions.where('bankrollId').equals(bankrollId).toArray()
      : await db.transactions.toArray();
    return rows.sort((a, b) => a.occurredAt - b.occurredAt);
  }

  async saveTransaction(
    input: Omit<Transaction, 'id' | 'createdAt'> & { id?: string },
  ): Promise<Transaction> {
    const existing = input.id ? await db.transactions.get(input.id) : undefined;
    const now = Date.now();
    const tx: Transaction = {
      ...input,
      id: input.id ?? newId('tx_'),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.transactions.put(tx);
    return tx;
  }

  async deleteTransaction(id: string): Promise<void> {
    await db.transaction('rw', db.transactions, db.tombstones, async () => {
      await db.transactions.delete(id);
      await db.tombstones.put(tombstone('transaction', id));
    });
  }

  listTombstones(): Promise<Tombstone[]> {
    return db.tombstones.toArray();
  }

  async putTombstones(tombstones: Tombstone[]): Promise<void> {
    if (tombstones.length === 0) return;
    await db.tombstones.bulkPut(tombstones);
  }

  async putRaw(data: {
    bankrolls?: Bankroll[];
    bets?: Bet[];
    transactions?: Transaction[];
  }): Promise<void> {
    await db.transaction('rw', db.bankrolls, db.bets, db.transactions, async () => {
      if (data.bankrolls?.length) await db.bankrolls.bulkPut(data.bankrolls);
      if (data.bets?.length) await db.bets.bulkPut(data.bets);
      if (data.transactions?.length) await db.transactions.bulkPut(data.transactions);
    });
  }

  /* ---------------- Settings ---------------- */

  async getSettings(): Promise<Settings> {
    const stored = await db.settings.get('settings');
    if (stored) return { ...DEFAULT_SETTINGS, ...stored };
    const fresh = { ...DEFAULT_SETTINGS, updatedAt: Date.now() };
    await db.settings.put(fresh);
    return fresh;
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const current = await this.getSettings();
    const next: Settings = { ...current, ...patch, id: 'settings', updatedAt: Date.now() };
    await db.settings.put(next);
    return next;
  }

  async clearAll(): Promise<void> {
    await db.transaction(
      'rw',
      db.bankrolls,
      db.bets,
      db.transactions,
      db.settings,
      db.tombstones,
      async () => {
        await Promise.all([
          db.bets.clear(),
          db.transactions.clear(),
          db.bankrolls.clear(),
          db.settings.clear(),
          db.tombstones.clear(),
        ]);
      },
    );
  }
}

function tombstone(kind: Tombstone['kind'], recordId: string): Tombstone {
  return { id: `${kind}:${recordId}`, kind, recordId, deletedAt: Date.now() };
}

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

/**
 * Applies a `BetFilter` in memory. Exported because the UI re-filters an
 * already-loaded list as the user moves sliders, without another DB round trip.
 */
export function applyFilter(bets: Bet[], filter: BetFilter): Bet[] {
  const search = filter.search?.trim().toLowerCase();

  return bets.filter((bet) => {
    if (filter.bankrollIds?.length && !filter.bankrollIds.includes(bet.bankrollId)) return false;
    if (filter.from !== undefined && bet.placedAt < filter.from) return false;
    if (filter.to !== undefined && bet.placedAt > filter.to) return false;
    if (filter.bookmakers?.length && !filter.bookmakers.includes(bet.bookmaker)) return false;
    if (filter.structures?.length && !filter.structures.includes(bet.structure)) return false;
    if (filter.tipsters?.length && !filter.tipsters.includes(bet.tipster ?? '')) return false;
    if (filter.tags?.length && !filter.tags.some((t) => bet.tags.includes(t))) return false;

    if (filter.sports?.length && !bet.selections.some((s) => filter.sports!.includes(s.sport))) {
      return false;
    }
    if (
      filter.competitions?.length &&
      !bet.selections.some((s) => filter.competitions!.includes(s.competition))
    ) {
      return false;
    }
    if (filter.sides?.length && !bet.selections.some((s) => filter.sides!.includes(s.side))) {
      return false;
    }

    const settlement = settleBet(bet);
    if (filter.statuses?.length && !filter.statuses.includes(settlement.status)) return false;

    if (filter.minStake !== undefined && settlement.totalStake < filter.minStake) return false;
    if (filter.maxStake !== undefined && settlement.totalStake > filter.maxStake) return false;

    if (filter.minOdds !== undefined || filter.maxOdds !== undefined) {
      const odds = bet.selections.reduce((acc, s) => acc * s.odds, 1);
      if (filter.minOdds !== undefined && odds < filter.minOdds) return false;
      if (filter.maxOdds !== undefined && odds > filter.maxOdds) return false;
    }

    if (search) {
      const haystack = [
        bet.note ?? '',
        bet.bookmaker,
        bet.tipster ?? '',
        ...bet.tags,
        ...bet.selections.flatMap((s) => [
          s.event,
          s.competition,
          s.homeTeam ?? '',
          s.awayTeam ?? '',
          ...s.picks.flatMap((p) => [p.market, p.pick]),
        ]),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export const store: DataStore = new IndexedDbStore();

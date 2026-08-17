import { describe, expect, it } from 'vitest';
import {
  decodeBase64,
  emptySnapshot,
  encodeBase64,
  mergeSnapshots,
  type SyncSnapshot,
} from './sync';
import type { Bankroll, Bet, Tombstone, Transaction } from './types';

function bankroll(id: string, updatedAt: number, name = id): Bankroll {
  return {
    id,
    name,
    currency: 'TRY',
    sports: [],
    startingCapital: 1000,
    defaultStake: 100,
    note: '',
    color: '#000',
    archived: false,
    createdAt: 0,
    updatedAt,
  };
}

function bet(id: string, updatedAt: number, unitStake = 100): Bet {
  return {
    id,
    bankrollId: 'bk1',
    structure: 'single',
    selections: [
      {
        id: `${id}_s`,
        event: 'A - B',
        sport: 'football',
        competition: 'L',
        picks: [{ id: `${id}_p`, market: '1X2', pick: 'A' }],
        odds: 2,
        side: 'back',
        status: 'won',
      },
    ],
    unitStake,
    bookmaker: 'Stake',
    commission: 0,
    tags: [],
    placedAt: 0,
    createdAt: 0,
    updatedAt,
  };
}

function transaction(id: string, updatedAt: number, amount = 100): Transaction {
  return {
    id,
    bankrollId: 'bk1',
    kind: 'deposit',
    amount,
    occurredAt: 0,
    createdAt: 0,
    updatedAt,
  };
}

function grave(kind: Tombstone['kind'], recordId: string, deletedAt: number): Tombstone {
  return { id: `${kind}:${recordId}`, kind, recordId, deletedAt };
}

function snapshot(partial: Partial<SyncSnapshot>): SyncSnapshot {
  return { ...emptySnapshot(), updatedAt: 1000, ...partial };
}

describe('base64 transport', () => {
  it('round-trips non-ASCII text', () => {
    const text = 'Galatasaray – Fenerbahçe · ₺1.234,56 · 🎯';
    expect(decodeBase64(encodeBase64(text))).toBe(text);
  });

  it('tolerates the line wrapping GitHub adds', () => {
    const encoded = encodeBase64('x'.repeat(200));
    const wrapped = encoded.replace(/(.{60})/g, '$1\n');
    expect(decodeBase64(wrapped)).toBe('x'.repeat(200));
  });
});

describe('merging two devices', () => {
  it('keeps bets added independently on each side', () => {
    const local = snapshot({ bets: [bet('a', 10), bet('b', 20)] });
    const remote = snapshot({ bets: [bet('a', 10), bet('c', 30)] });

    const { merged, stats } = mergeSnapshots(local, remote);
    expect(merged.bets.map((b) => b.id).sort()).toEqual(['a', 'b', 'c']);
    expect(stats.incoming).toBe(1);
    expect(stats.outgoing).toBe(1);
  });

  it('takes the newer copy when both edited the same bet', () => {
    const local = snapshot({ bets: [bet('a', 50, 250)] });
    const remote = snapshot({ bets: [bet('a', 90, 500)] });

    const { merged } = mergeSnapshots(local, remote);
    expect(merged.bets).toHaveLength(1);
    expect(merged.bets[0]!.unitStake).toBe(500);
  });

  it('prefers the local copy when timestamps tie', () => {
    const local = snapshot({ bets: [bet('a', 50, 111)] });
    const remote = snapshot({ bets: [bet('a', 50, 999)] });
    expect(mergeSnapshots(local, remote).merged.bets[0]!.unitStake).toBe(111);
  });

  it('merges bankrolls and transactions the same way', () => {
    const local = snapshot({
      bankrolls: [bankroll('bk1', 10, 'local')],
      transactions: [transaction('t1', 10, 100)],
    });
    const remote = snapshot({
      bankrolls: [bankroll('bk1', 20, 'remote'), bankroll('bk2', 5)],
      transactions: [transaction('t1', 20, 500), transaction('t2', 5)],
    });

    const { merged } = mergeSnapshots(local, remote);
    expect(merged.bankrolls.find((b) => b.id === 'bk1')!.name).toBe('remote');
    expect(merged.bankrolls.map((b) => b.id).sort()).toEqual(['bk1', 'bk2']);
    expect(merged.transactions.find((t) => t.id === 't1')!.amount).toBe(500);
  });
});

describe('deletions', () => {
  it('removes a record the other device deleted', () => {
    const local = snapshot({ bets: [bet('a', 10), bet('b', 10)] });
    const remote = snapshot({ bets: [bet('a', 10)], tombstones: [grave('bet', 'b', 20)] });

    const { merged } = mergeSnapshots(local, remote);
    expect(merged.bets.map((b) => b.id)).toEqual(['a']);
    expect(merged.tombstones).toHaveLength(1);
  });

  it('does not resurrect a deleted record on the next sync', () => {
    // Device A deletes, syncs. Device B still holds the stale copy and syncs.
    const afterFirstSync = snapshot({ bets: [], tombstones: [grave('bet', 'b', 20)] });
    const staleDevice = snapshot({ bets: [bet('b', 10)] });

    const { merged } = mergeSnapshots(staleDevice, afterFirstSync);
    expect(merged.bets).toHaveLength(0);
  });

  it('keeps a record edited after the delete, and drops the stale tombstone', () => {
    const local = snapshot({ bets: [bet('b', 99, 750)] });
    const remote = snapshot({ bets: [], tombstones: [grave('bet', 'b', 20)] });

    const { merged } = mergeSnapshots(local, remote);
    expect(merged.bets).toHaveLength(1);
    expect(merged.bets[0]!.unitStake).toBe(750);
    // The tombstone lost, so it must not linger and re-kill the record later.
    expect(merged.tombstones).toHaveLength(0);
  });

  it('deletes bankrolls and transactions by tombstone too', () => {
    const local = snapshot({
      bankrolls: [bankroll('bk1', 10), bankroll('bk2', 10)],
      transactions: [transaction('t1', 10)],
    });
    const remote = snapshot({
      tombstones: [grave('bankroll', 'bk2', 30), grave('transaction', 't1', 30)],
    });

    const { merged } = mergeSnapshots(local, remote);
    expect(merged.bankrolls.map((b) => b.id)).toEqual(['bk1']);
    expect(merged.transactions).toHaveLength(0);
  });

  it('keeps the later of two tombstones for the same record', () => {
    const local = snapshot({ tombstones: [grave('bet', 'x', 10)] });
    const remote = snapshot({ tombstones: [grave('bet', 'x', 40)] });
    expect(mergeSnapshots(local, remote).merged.tombstones[0]!.deletedAt).toBe(40);
  });
});

describe('shared settings', () => {
  it('takes the settings from whichever side wrote last', () => {
    const local = snapshot({
      updatedAt: 100,
      shared: { bookmakers: ['A'], tipsters: [], defaultBookmaker: 'A', defaultCommission: 0 },
    });
    const remote = snapshot({
      updatedAt: 200,
      shared: { bookmakers: ['B'], tipsters: [], defaultBookmaker: 'B', defaultCommission: 5 },
    });

    expect(mergeSnapshots(local, remote).merged.shared?.defaultBookmaker).toBe('B');
  });

  it('falls back to local settings when the remote has none', () => {
    const local = snapshot({
      shared: { bookmakers: ['A'], tipsters: [], defaultBookmaker: 'Stake', defaultCommission: 0 },
    });
    expect(mergeSnapshots(local, emptySnapshot()).merged.shared?.defaultBookmaker).toBe('Stake');
  });
});

describe('merging against an empty remote', () => {
  it('is a no-op that preserves everything local', () => {
    const local = snapshot({
      bankrolls: [bankroll('bk1', 10)],
      bets: [bet('a', 10), bet('b', 20)],
      transactions: [transaction('t1', 10)],
    });

    const { merged, stats } = mergeSnapshots(local, emptySnapshot());
    expect(merged.bets).toHaveLength(2);
    expect(merged.bankrolls).toHaveLength(1);
    expect(stats.incoming).toBe(0);
    expect(stats.outgoing).toBe(4);
  });
});

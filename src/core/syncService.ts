import { store } from './store';
import {
  SyncError,
  emptySnapshot,
  mergeSnapshots,
  pickShared,
  pull,
  push,
  type MergeResult,
  type SyncSnapshot,
} from './sync';
import type { SyncConfig } from './types';

/**
 * Orchestrates one sync round: read local, read remote, merge, write both.
 *
 * Kept separate from `sync.ts` so the merge logic stays pure and testable while
 * this file owns the I/O and the retry.
 */

export interface SyncOutcome {
  stats: MergeResult['stats'];
  sha: string;
  at: number;
}

async function readLocalSnapshot(): Promise<SyncSnapshot> {
  const [bankrolls, bets, transactions, tombstones, settings] = await Promise.all([
    store.listBankrolls(true),
    store.listBets(),
    store.listTransactions(),
    store.listTombstones(),
    store.getSettings(),
  ]);

  return {
    ...emptySnapshot(),
    updatedAt: Date.now(),
    bankrolls,
    bets,
    transactions,
    tombstones,
    shared: pickShared(settings),
  };
}

/**
 * Replaces the local database with the merged snapshot.
 *
 * Records are written raw so their `updatedAt` survives — going through the
 * normal save path would restamp every row and make the next merge think this
 * device edited everything.
 */
async function writeLocalSnapshot(snapshot: SyncSnapshot): Promise<void> {
  const [existingBankrolls, existingBets, existingTx] = await Promise.all([
    store.listBankrolls(true),
    store.listBets(),
    store.listTransactions(),
  ]);

  const keepBankrolls = new Set(snapshot.bankrolls.map((b) => b.id));
  const keepBets = new Set(snapshot.bets.map((b) => b.id));
  const keepTx = new Set(snapshot.transactions.map((t) => t.id));

  // Anything the merge dropped was deleted on another device.
  const staleBets = existingBets.filter((b) => !keepBets.has(b.id)).map((b) => b.id);
  if (staleBets.length > 0) await store.deleteBets(staleBets);

  for (const tx of existingTx) {
    if (!keepTx.has(tx.id)) await store.deleteTransaction(tx.id);
  }
  for (const bankroll of existingBankrolls) {
    if (!keepBankrolls.has(bankroll.id)) await store.deleteBankroll(bankroll.id);
  }

  await store.putRaw({
    bankrolls: snapshot.bankrolls,
    bets: snapshot.bets,
    transactions: snapshot.transactions,
  });
  await store.putTombstones(snapshot.tombstones);

  if (snapshot.shared) {
    await store.updateSettings({
      bookmakers: snapshot.shared.bookmakers,
      tipsters: snapshot.shared.tipsters,
      defaultBookmaker: snapshot.shared.defaultBookmaker,
      defaultCommission: snapshot.shared.defaultCommission,
    });
  }
}

/**
 * Runs a full sync.
 *
 * On a 409/422 the remote moved between the pull and the push — another device
 * synced in the same moment — so the round is repeated once against the newer
 * blob rather than forcing the write.
 */
export async function runSync(config: SyncConfig, attempt = 0): Promise<SyncOutcome> {
  const local = await readLocalSnapshot();
  const remote = await pull(config);

  const { merged, stats } = mergeSnapshots(local, remote.snapshot ?? emptySnapshot());

  try {
    const { sha } = await push(config, merged, remote.sha);
    await writeLocalSnapshot(merged);
    const at = Date.now();
    await store.updateSettings({ sync: { ...config, lastSyncAt: at, lastSha: sha } });
    return { stats, sha, at };
  } catch (err) {
    if (err instanceof SyncError && err.code === 'conflict' && attempt === 0) {
      return runSync(config, attempt + 1);
    }
    throw err;
  }
}

/** Pulls without writing, so the user can see what is on the remote first. */
export async function previewRemote(config: SyncConfig): Promise<{
  found: boolean;
  bets: number;
  bankrolls: number;
  updatedAt: number;
}> {
  const remote = await pull(config);
  if (!remote.snapshot) return { found: false, bets: 0, bankrolls: 0, updatedAt: 0 };
  return {
    found: true,
    bets: remote.snapshot.bets.length,
    bankrolls: remote.snapshot.bankrolls.length,
    updatedAt: remote.snapshot.updatedAt,
  };
}

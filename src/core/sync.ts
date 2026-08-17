import type {
  Bankroll,
  Bet,
  Settings,
  SyncConfig,
  Tombstone,
  Transaction,
} from './types';

/**
 * Cross-device sync through a private GitHub repository.
 *
 * The app has no backend, so the repository IS the backend: one JSON snapshot
 * file, written with the user's own fine-grained token. Every device pulls the
 * snapshot, merges it into its local database record by record, and pushes the
 * result back.
 *
 * The merge is per record rather than per file, so two devices that both added
 * bets while offline keep both sets. Deletions travel as tombstones, because a
 * plain merge would otherwise resurrect anything another device removed.
 */

export const SNAPSHOT_VERSION = 1;

export interface SyncSnapshot {
  format: 'bettracker-sync';
  version: number;
  updatedAt: number;
  bankrolls: Bankroll[];
  bets: Bet[];
  transactions: Transaction[];
  tombstones: Tombstone[];
  /** Only the parts of settings that make sense on every device. */
  shared?: SharedSettings;
}

/**
 * Settings that follow the user between devices. Theme, language, sidebar
 * state, the active bankroll and the sync credentials stay local on purpose.
 */
export interface SharedSettings {
  bookmakers: string[];
  tipsters: string[];
  defaultBookmaker: string;
  defaultCommission: number;
}

export function pickShared(settings: Settings): SharedSettings {
  return {
    bookmakers: settings.bookmakers,
    tipsters: settings.tipsters,
    defaultBookmaker: settings.defaultBookmaker,
    defaultCommission: settings.defaultCommission,
  };
}

/* ------------------------------------------------------------------ *
 * Merge
 * ------------------------------------------------------------------ */

interface Versioned {
  id: string;
  updatedAt: number;
}

/**
 * Unions two lists by id, keeping whichever copy was written later.
 * Ties go to the local copy, which keeps the merge stable when clocks agree.
 */
function mergeById<T extends Versioned>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of remote) byId.set(item.id, item);
  for (const item of local) {
    const other = byId.get(item.id);
    if (!other || item.updatedAt >= other.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function mergeTombstones(local: Tombstone[], remote: Tombstone[]): Tombstone[] {
  const byId = new Map<string, Tombstone>();
  for (const item of [...remote, ...local]) {
    const other = byId.get(item.id);
    if (!other || item.deletedAt > other.deletedAt) byId.set(item.id, item);
  }
  return [...byId.values()];
}

/**
 * Drops records a tombstone has buried.
 *
 * A record survives its own tombstone only if it was edited *after* the delete,
 * which is how a re-added bet on one device beats a stale delete from another.
 */
function applyTombstones<T extends Versioned>(
  records: T[],
  tombstones: Tombstone[],
  kind: Tombstone['kind'],
): { kept: T[]; resurrected: string[] } {
  const graves = new Map<string, number>();
  for (const t of tombstones) {
    if (t.kind === kind) graves.set(t.recordId, t.deletedAt);
  }

  const kept: T[] = [];
  const resurrected: string[] = [];
  for (const record of records) {
    const deletedAt = graves.get(record.id);
    if (deletedAt === undefined || record.updatedAt > deletedAt) {
      kept.push(record);
      if (deletedAt !== undefined) resurrected.push(record.id);
    }
  }

  return { kept, resurrected };
}

export interface MergeResult {
  merged: SyncSnapshot;
  stats: {
    bankrolls: number;
    bets: number;
    transactions: number;
    /** Records added or updated locally as a result of the merge. */
    incoming: number;
    /** Records this device contributes that the remote did not have. */
    outgoing: number;
    deleted: number;
  };
}

export function mergeSnapshots(local: SyncSnapshot, remote: SyncSnapshot): MergeResult {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);

  const bankrolls = applyTombstones(
    mergeById(local.bankrolls, remote.bankrolls),
    tombstones,
    'bankroll',
  );
  const bets = applyTombstones(mergeById(local.bets, remote.bets), tombstones, 'bet');
  const transactions = applyTombstones(
    mergeById(local.transactions, remote.transactions),
    tombstones,
    'transaction',
  );

  // A tombstone whose record came back to life has been overruled; dropping it
  // stops it fighting the record on every future sync.
  const overruled = new Set([
    ...bankrolls.resurrected.map((id) => `bankroll:${id}`),
    ...bets.resurrected.map((id) => `bet:${id}`),
    ...transactions.resurrected.map((id) => `transaction:${id}`),
  ]);
  const liveTombstones = tombstones.filter((t) => !overruled.has(t.id));

  const localIds = new Set([
    ...local.bankrolls.map((b) => b.id),
    ...local.bets.map((b) => b.id),
    ...local.transactions.map((t) => t.id),
  ]);
  const remoteIds = new Set([
    ...remote.bankrolls.map((b) => b.id),
    ...remote.bets.map((b) => b.id),
    ...remote.transactions.map((t) => t.id),
  ]);

  let incoming = 0;
  for (const id of remoteIds) if (!localIds.has(id)) incoming++;
  let outgoing = 0;
  for (const id of localIds) if (!remoteIds.has(id)) outgoing++;

  return {
    merged: {
      format: 'bettracker-sync',
      version: SNAPSHOT_VERSION,
      updatedAt: Date.now(),
      bankrolls: bankrolls.kept,
      bets: bets.kept,
      transactions: transactions.kept,
      tombstones: liveTombstones,
      // Whichever side wrote its shared settings later wins outright; they are
      // small lists, not worth a per-entry merge.
      shared: (remote.updatedAt > local.updatedAt ? remote.shared : local.shared) ?? local.shared,
    },
    stats: {
      bankrolls: bankrolls.kept.length,
      bets: bets.kept.length,
      transactions: transactions.kept.length,
      incoming,
      outgoing,
      deleted: liveTombstones.length,
    },
  };
}

/* ------------------------------------------------------------------ *
 * GitHub transport
 * ------------------------------------------------------------------ */

const API = 'https://api.github.com';

export class SyncError extends Error {
  constructor(
    /** Translation key under `sync.error.*`. */
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'SyncError';
  }
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** UTF-8 safe base64, which `btoa` alone is not. */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(base64: string): string {
  // The contents API wraps its base64 at 60 characters.
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function translateHttpError(status: number): SyncError {
  switch (status) {
    case 401:
      return new SyncError('badToken');
    case 403:
      return new SyncError('forbidden');
    case 404:
      return new SyncError('notFound');
    case 409:
    case 422:
      return new SyncError('conflict');
    default:
      return new SyncError('http', `HTTP ${status}`);
  }
}

export interface RemoteState {
  snapshot: SyncSnapshot | null;
  sha: string | null;
}

const EMPTY_SNAPSHOT: SyncSnapshot = {
  format: 'bettracker-sync',
  version: SNAPSHOT_VERSION,
  updatedAt: 0,
  bankrolls: [],
  bets: [],
  transactions: [],
  tombstones: [],
};

export function emptySnapshot(): SyncSnapshot {
  return { ...EMPTY_SNAPSHOT };
}

/** Reads the snapshot file. A missing file is a valid "nothing synced yet". */
export async function pull(config: SyncConfig): Promise<RemoteState> {
  const url =
    `${API}/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(config.path)}` +
    `?ref=${encodeURIComponent(config.branch)}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: headers(config.token) });
  } catch {
    throw new SyncError('network');
  }

  if (res.status === 404) return { snapshot: null, sha: null };
  if (!res.ok) throw translateHttpError(res.status);

  const body = (await res.json()) as { content?: string; sha?: string };
  if (!body.content || !body.sha) throw new SyncError('badResponse');

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64(body.content));
  } catch {
    throw new SyncError('corrupt');
  }

  const snapshot = parsed as Partial<SyncSnapshot>;
  if (snapshot.format !== 'bettracker-sync') throw new SyncError('corrupt');
  if ((snapshot.version ?? 0) > SNAPSHOT_VERSION) throw new SyncError('newerVersion');

  return {
    snapshot: {
      ...emptySnapshot(),
      ...snapshot,
      bankrolls: snapshot.bankrolls ?? [],
      bets: snapshot.bets ?? [],
      transactions: snapshot.transactions ?? [],
      tombstones: snapshot.tombstones ?? [],
    },
    sha: body.sha,
  };
}

/** Writes the snapshot back. `sha` must be the blob the merge was based on. */
export async function push(
  config: SyncConfig,
  snapshot: SyncSnapshot,
  sha: string | null,
): Promise<{ sha: string }> {
  const url = `${API}/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(config.path)}`;

  const body = {
    message: `Sync ${new Date(snapshot.updatedAt).toISOString()} · ${snapshot.bets.length} bets`,
    content: encodeBase64(JSON.stringify(snapshot)),
    branch: config.branch,
    ...(sha ? { sha } : {}),
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers(config.token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SyncError('network');
  }

  if (!res.ok) throw translateHttpError(res.status);

  const result = (await res.json()) as { content?: { sha?: string } };
  const newSha = result.content?.sha;
  if (!newSha) throw new SyncError('badResponse');
  return { sha: newSha };
}

/** Confirms the token can reach the repository before anything is written. */
export async function testConnection(config: SyncConfig): Promise<{ ok: true; private: boolean }> {
  let res: Response;
  try {
    res = await fetch(`${API}/repos/${config.owner}/${config.repo}`, {
      headers: headers(config.token),
    });
  } catch {
    throw new SyncError('network');
  }
  if (!res.ok) throw translateHttpError(res.status);
  const repo = (await res.json()) as { private?: boolean };
  return { ok: true, private: Boolean(repo.private) };
}

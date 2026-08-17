import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { store } from '@/core/store';
import { newId } from '@/core/ids';
import { runSync } from '@/core/syncService';
import { SyncError } from '@/core/sync';
import type {
  Bankroll,
  Bet,
  Settings,
  ThemeMode,
  Transaction,
} from '@/core/types';

/**
 * Single source of truth for everything loaded from IndexedDB.
 *
 * The whole dataset is held in memory: a personal betting history is small,
 * and having it resident means filters, breakdowns and charts recompute
 * instantly without touching the database.
 */

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'error';

export interface SyncState {
  status: SyncStatus;
  /** Translation key under `sync.error.*`, when status is 'error'. */
  errorCode?: string;
  lastSyncAt?: number;
  lastStats?: { incoming: number; outgoing: number; bets: number };
}

export interface AppState {
  ready: boolean;
  settings: Settings;
  bankrolls: Bankroll[];
  bets: Bet[];
  transactions: Transaction[];

  /** Bankroll the UI is scoped to. `null` means every bankroll at once. */
  activeBankrollId: string | null;
  setActiveBankrollId: (id: string | null) => void;
  activeBankroll: Bankroll | null;
  /** Currency to render amounts in; falls back to the first bankroll's. */
  currency: string;

  /** Bets belonging to the active bankroll (or all of them). */
  scopedBets: Bet[];
  scopedTransactions: Transaction[];

  reload: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;

  saveBankroll: (input: Partial<Bankroll> & { name: string }) => Promise<Bankroll>;
  deleteBankroll: (id: string) => Promise<void>;

  saveBet: (bet: Bet) => Promise<void>;
  updateBets: (ids: string[], patch: Partial<Bet>) => Promise<void>;
  deleteBets: (ids: string[]) => Promise<void>;

  saveTransaction: (input: Omit<Transaction, 'id' | 'createdAt'> & { id?: string }) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  sync: SyncState;
  /** Runs a sync round now. Returns false when sync is not configured. */
  syncNow: () => Promise<boolean>;

  resetAll: () => Promise<void>;
  restoreBackup: (data: {
    bankrolls: Bankroll[];
    bets: Bet[];
    transactions: Transaction[];
    settings?: Settings;
  }) => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

const FALLBACK_SETTINGS: Settings = {
  id: 'settings',
  language: 'tr',
  theme: 'system',
  oddsFormat: 'decimal',
  bookmakers: [],
  tipsters: [],
  defaultCommission: 0,
  defaultBookmaker: 'Stake',
  sidebarPinned: false,
  updatedAt: 0,
};

/** Applies the theme to the document root so CSS variables can switch on it. */
function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'system' && prefersDark);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(FALLBACK_SETTINGS);
  const [bankrolls, setBankrolls] = useState<Bankroll[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeBankrollId, setActiveBankrollIdState] = useState<string | null>(null);

  // The mutation callbacks fire this without depending on it, so they stay
  // referentially stable and do not re-render every consumer on a settings change.
  const queueSyncRef = useRef<() => void>(() => {});

  const reload = useCallback(async () => {
    const [loadedSettings, loadedBankrolls, loadedBets, loadedTx] = await Promise.all([
      store.getSettings(),
      store.listBankrolls(true),
      store.listBets(),
      store.listTransactions(),
    ]);
    setSettings(loadedSettings);
    setBankrolls(loadedBankrolls);
    setBets(loadedBets);
    setTransactions(loadedTx);
    return loadedSettings;
  }, []);

  // Initial load, plus first-run bankroll creation.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const loadedSettings = await reload();
      if (cancelled) return;

      const existing = await store.listBankrolls(true);
      let initialId = loadedSettings.activeBankrollId ?? null;
      if (initialId && !existing.some((b) => b.id === initialId)) initialId = null;
      if (!initialId && existing.length === 1) initialId = existing[0]!.id;

      setActiveBankrollIdState(initialId);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Keep the document theme in sync, including live OS changes.
  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  const setActiveBankrollId = useCallback((id: string | null) => {
    setActiveBankrollIdState(id);
    void store.updateSettings({ activeBankrollId: id ?? undefined });
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = await store.updateSettings(patch);
    setSettings(next);
  }, []);

  const saveBankroll = useCallback(
    async (input: Partial<Bankroll> & { name: string }) => {
      const saved = await store.saveBankroll(input);
      setBankrolls(await store.listBankrolls(true));
      // A first bankroll becomes the active one immediately, so the user is not
      // left staring at an "all bankrolls" view with a single entry.
      setActiveBankrollIdState((current) => current ?? saved.id);
      queueSyncRef.current();
      return saved;
    },
    [],
  );

  const deleteBankroll = useCallback(
    async (id: string) => {
      await store.deleteBankroll(id);
      const [nextBankrolls, nextBets, nextTx] = await Promise.all([
        store.listBankrolls(true),
        store.listBets(),
        store.listTransactions(),
      ]);
      setBankrolls(nextBankrolls);
      setBets(nextBets);
      setTransactions(nextTx);
      setActiveBankrollIdState((current) => (current === id ? null : current));
      queueSyncRef.current();
    },
    [],
  );

  const saveBet = useCallback(
    async (bet: Bet) => {
      await store.saveBet(bet);
      setBets(await store.listBets());
      queueSyncRef.current();
    },
    [],
  );

  const updateBets = useCallback(async (ids: string[], patch: Partial<Bet>) => {
    await store.updateBets(ids, patch);
    setBets(await store.listBets());
    queueSyncRef.current();
  }, []);

  const deleteBets = useCallback(async (ids: string[]) => {
    await store.deleteBets(ids);
    setBets(await store.listBets());
    queueSyncRef.current();
  }, []);

  const saveTransaction = useCallback(
    async (input: Omit<Transaction, 'id' | 'createdAt'> & { id?: string }) => {
      await store.saveTransaction(input);
      setTransactions(await store.listTransactions());
      queueSyncRef.current();
    },
    [],
  );

  const deleteTransaction = useCallback(async (id: string) => {
    await store.deleteTransaction(id);
    setTransactions(await store.listTransactions());
    queueSyncRef.current();
  }, []);

  /* ---------------- Sync ---------------- */

  const [sync, setSync] = useState<SyncState>({ status: 'off' });
  // A ref, not state: the debounce timer must not retrigger renders, and the
  // dirty flag has to survive between them.
  const pendingPush = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncNow = useCallback(async (): Promise<boolean> => {
    const current = await store.getSettings();
    const config = current.sync;
    if (!config?.token || !config.owner || !config.repo) {
      setSync({ status: 'off' });
      return false;
    }

    setSync((prev) => ({ ...prev, status: 'syncing' }));
    try {
      const outcome = await runSync(config);
      await reload();
      setSync({
        status: 'ok',
        lastSyncAt: outcome.at,
        lastStats: {
          incoming: outcome.stats.incoming,
          outgoing: outcome.stats.outgoing,
          bets: outcome.stats.bets,
        },
      });
      return true;
    } catch (err) {
      setSync({
        status: 'error',
        errorCode: err instanceof SyncError ? err.code : 'http',
      });
      return false;
    }
  }, [reload]);

  /**
   * Queues a push after a local change. The delay coalesces a burst of edits
   * — settling ten bets in a row — into one commit instead of ten.
   */
  const queueSync = useCallback(() => {
    if (!settings.sync?.auto || !settings.sync.token) return;
    if (pendingPush.current) clearTimeout(pendingPush.current);
    pendingPush.current = setTimeout(() => {
      pendingPush.current = null;
      void syncNow();
    }, 4000);
  }, [settings.sync?.auto, settings.sync?.token, syncNow]);

  // Pull once on launch when sync is configured.
  useEffect(() => {
    if (!ready) return;
    if (!settings.sync?.token || !settings.sync.auto) {
      setSync((prev) => (prev.status === 'off' ? prev : { status: 'off' }));
      return;
    }
    void syncNow();
    // Deliberately runs only when sync is switched on or the app becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, settings.sync?.token, settings.sync?.auto]);

  useEffect(
    () => () => {
      if (pendingPush.current) clearTimeout(pendingPush.current);
    },
    [],
  );

  queueSyncRef.current = queueSync;

  const resetAll = useCallback(async () => {
    await store.clearAll();
    await reload();
    setActiveBankrollIdState(null);
  }, [reload]);

  const restoreBackup = useCallback(
    async (data: {
      bankrolls: Bankroll[];
      bets: Bet[];
      transactions: Transaction[];
      settings?: Settings;
    }) => {
      await store.clearAll();
      for (const b of data.bankrolls) await store.saveBankroll(b);
      for (const bet of data.bets) await store.saveBet(bet);
      for (const tx of data.transactions) await store.saveTransaction(tx);
      if (data.settings) {
        // The restored file's own id must not overwrite the settings key.
        const { id: _ignored, ...rest } = data.settings;
        await store.updateSettings(rest);
      }
      const loaded = await reload();
      setActiveBankrollIdState(loaded.activeBankrollId ?? data.bankrolls[0]?.id ?? null);
    },
    [reload],
  );

  const activeBankroll = useMemo(
    () => bankrolls.find((b) => b.id === activeBankrollId) ?? null,
    [bankrolls, activeBankrollId],
  );

  const scopedBets = useMemo(
    () => (activeBankrollId ? bets.filter((b) => b.bankrollId === activeBankrollId) : bets),
    [bets, activeBankrollId],
  );

  const scopedTransactions = useMemo(
    () =>
      activeBankrollId
        ? transactions.filter((t) => t.bankrollId === activeBankrollId)
        : transactions,
    [transactions, activeBankrollId],
  );

  const currency = activeBankroll?.currency ?? bankrolls[0]?.currency ?? 'TRY';

  const value = useMemo<AppState>(
    () => ({
      ready,
      settings,
      bankrolls,
      bets,
      transactions,
      activeBankrollId,
      setActiveBankrollId,
      activeBankroll,
      currency,
      scopedBets,
      scopedTransactions,
      reload: async () => {
        await reload();
      },
      updateSettings,
      saveBankroll,
      deleteBankroll,
      saveBet,
      updateBets,
      deleteBets,
      saveTransaction,
      deleteTransaction,
      sync,
      syncNow,
      resetAll,
      restoreBackup,
    }),
    [
      ready,
      settings,
      bankrolls,
      bets,
      transactions,
      activeBankrollId,
      setActiveBankrollId,
      activeBankroll,
      currency,
      scopedBets,
      scopedTransactions,
      reload,
      updateSettings,
      saveBankroll,
      deleteBankroll,
      saveBet,
      updateBets,
      deleteBets,
      saveTransaction,
      deleteTransaction,
      sync,
      syncNow,
      resetAll,
      restoreBackup,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** Convenience for creating a blank bet bound to the active bankroll. */
export function emptyBet(
  bankrollId: string,
  defaults: Partial<Bet> = {},
  /** Sports the bankroll accepts; the first one seeds the blank selection. */
  allowedSports: string[] = [],
): Bet {
  const now = Date.now();
  return {
    id: newId('bet_'),
    bankrollId,
    structure: 'single',
    selections: [
      {
        id: newId('sel_'),
        event: '',
        sport: allowedSports[0] ?? 'football',
        competition: '',
        picks: [{ id: newId('pk_'), market: '', pick: '' }],
        odds: 0,
        side: 'back',
        status: 'pending',
      },
    ],
    unitStake: 0,
    bookmaker: '',
    commission: 0,
    tags: [],
    placedAt: now,
    createdAt: now,
    updatedAt: now,
    ...defaults,
  };
}

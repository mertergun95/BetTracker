import { useState } from 'react';
import { useApp } from '@/state/AppContext';
import { useI18n, type TranslationKey } from '@/i18n';
import { SyncError, testConnection } from '@/core/sync';
import { previewRemote } from '@/core/syncService';
import type { SyncConfig } from '@/core/types';
import { Card, Checkbox, ConfirmDialog, Field, TextInput } from './ui';

const DEFAULTS: SyncConfig = {
  owner: '',
  repo: 'bettracker-data',
  branch: 'main',
  path: 'bettracker.json',
  token: '',
  auto: true,
};

type Notice = { kind: 'info' | 'warn' | 'error'; text: string };

/** Setup and status for cross-device sync against a private GitHub repo. */
export default function SyncSettings() {
  const { t, formatDate } = useI18n();
  const { settings, updateSettings, sync, syncNow } = useApp();

  const [draft, setDraft] = useState<SyncConfig>(settings.sync ?? DEFAULTS);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const connected = Boolean(settings.sync?.token);

  function errorText(err: unknown): string {
    const code = err instanceof SyncError ? err.code : 'http';
    return t(`sync.error.${code}` as TranslationKey);
  }

  async function handleTest() {
    if (!draft.owner || !draft.repo || !draft.token) {
      setNotice({ kind: 'error', text: t('sync.error.incomplete') });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const info = await testConnection(draft);
      const remote = await previewRemote(draft);

      const lines = [t('sync.connected', { repo: `${draft.owner}/${draft.repo}` })];
      // A public repo would expose the betting history to anyone who finds it.
      if (!info.private) lines.push(t('sync.notPrivate'));
      lines.push(
        remote.found
          ? t('sync.remoteFound', {
              bets: remote.bets,
              bankrolls: remote.bankrolls,
              when: formatDate(remote.updatedAt, 'dateTime'),
            })
          : t('sync.remoteEmpty'),
      );

      setNotice({ kind: info.private ? 'info' : 'warn', text: lines.join(' ') });
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleConnect() {
    if (!draft.owner || !draft.repo || !draft.token) {
      setNotice({ kind: 'error', text: t('sync.error.incomplete') });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await testConnection(draft);
      await updateSettings({ sync: draft });
      const ok = await syncNow();
      if (!ok) setNotice({ kind: 'error', text: t('sync.error.incomplete') });
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={`🔄 ${t('sync.title')}`}>
      <p className="card__hint" style={{ marginBottom: 14 }}>
        {t('sync.intro')}
      </p>

      {connected && (
        <div className="row row--between" style={{ marginBottom: 14 }}>
          <div className="row row--tight" style={{ minWidth: 0 }}>
            <span
              className={`sync-dot ${
                sync.status === 'syncing'
                  ? 'sync-dot--busy'
                  : sync.status === 'error'
                    ? 'sync-dot--error'
                    : 'sync-dot--ok'
              }`}
            />
            <span className="small">
              {settings.sync?.lastSyncAt
                ? t('sync.lastSync', {
                    when: formatDate(settings.sync.lastSyncAt, 'dateTime'),
                  })
                : t('sync.never')}
              {sync.lastStats
                ? ` · ${t('sync.pulled', { count: sync.lastStats.incoming })} · ${t('sync.pushed', {
                    count: sync.lastStats.outgoing,
                  })}`
                : ''}
            </span>
          </div>
          <div className="row row--tight">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy || sync.status === 'syncing'}
              onClick={() => void syncNow()}
            >
              ⟳ {t('sync.now')}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setConfirmDisconnect(true)}
            >
              {t('sync.disconnect')}
            </button>
          </div>
        </div>
      )}

      {!connected && (
        <details style={{ marginBottom: 14 }}>
          <summary className="small muted" style={{ cursor: 'pointer', marginBottom: 8 }}>
            {t('sync.setup')}
          </summary>
          <ol className="steps">
            <li>{t('sync.setup.step1')}</li>
            <li>{t('sync.setup.step2')}</li>
            <li>{t('sync.setup.step3')}</li>
          </ol>
        </details>
      )}

      <div className="stack">
        <div className="form-grid">
          <Field label={t('sync.owner')}>
            <TextInput
              value={draft.owner}
              onChange={(v) => setDraft({ ...draft, owner: v.trim() })}
              placeholder="mertergun95"
            />
          </Field>
          <Field label={t('sync.repo')}>
            <TextInput
              value={draft.repo}
              onChange={(v) => setDraft({ ...draft, repo: v.trim() })}
              placeholder="bettracker-data"
            />
          </Field>
          <Field label={t('sync.branch')}>
            <TextInput
              value={draft.branch}
              onChange={(v) => setDraft({ ...draft, branch: v.trim() || 'main' })}
            />
          </Field>
          <Field label={t('sync.path')}>
            <TextInput
              value={draft.path}
              onChange={(v) => setDraft({ ...draft, path: v.trim() || 'bettracker.json' })}
            />
          </Field>
        </div>

        <Field label={t('sync.token')} hint={t('sync.token.hint')}>
          <TextInput
            type="password"
            value={draft.token}
            onChange={(v) => setDraft({ ...draft, token: v.trim() })}
            placeholder="github_pat_…"
          />
        </Field>

        <Checkbox
          checked={draft.auto}
          onChange={(v) => {
            setDraft({ ...draft, auto: v });
            if (connected) void updateSettings({ sync: { ...draft, auto: v } });
          }}
          label={`${t('sync.auto')} — ${t('sync.auto.hint')}`}
        />

        {notice && (
          <div
            className={`banner banner--${
              notice.kind === 'error' ? 'error' : notice.kind === 'warn' ? 'warn' : 'info'
            }`}
          >
            {notice.text}
          </div>
        )}

        <div className="row">
          <button type="button" className="btn" disabled={busy} onClick={() => void handleTest()}>
            {t('sync.test')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void handleConnect()}
          >
            {connected ? t('action.save') : t('sync.connect')}
          </button>
        </div>
      </div>

      {confirmDisconnect && (
        <ConfirmDialog
          danger
          message={t('sync.disconnectConfirm')}
          confirmLabel={t('sync.disconnect')}
          onCancel={() => setConfirmDisconnect(false)}
          onConfirm={async () => {
            await updateSettings({ sync: undefined });
            setDraft({ ...DEFAULTS });
            setConfirmDisconnect(false);
          }}
        />
      )}
    </Card>
  );
}

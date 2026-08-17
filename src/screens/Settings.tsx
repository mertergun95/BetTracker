import { useState } from 'react';
import { useApp } from '@/state/AppContext';
import { useI18n } from '@/i18n';
import { buildBackup, betsToCsv, csvToBets, downloadFile, parseBackup } from '@/core/io';
import { store } from '@/core/store';
import { CURRENCIES } from '@/core/reference';
import SyncSettings from '@/components/SyncSettings';
import {
  Card,
  ConfirmDialog,
  Field,
  FilePicker,
  Segmented,
  Select,
  TextInput,
  useToast,
} from '@/components/ui';
import type { Language, OddsFormat, ThemeMode } from '@/core/types';

const APP_VERSION = '0.1.0';

export default function Settings() {
  const { t } = useI18n();
  const {
    settings,
    updateSettings,
    bankrolls,
    bets,
    transactions,
    resetAll,
    restoreBackup,
    reload,
    activeBankrollId,
  } = useApp();
  const { toast, show } = useToast();

  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [importTarget, setImportTarget] = useState(activeBankrollId ?? bankrolls[0]?.id ?? '');
  const [newBookmaker, setNewBookmaker] = useState('');
  const [newTipster, setNewTipster] = useState('');

  const stamp = new Date().toISOString().slice(0, 10);

  function exportJson() {
    const backup = buildBackup({ bankrolls, bets, transactions, settings });
    downloadFile(`bettracker-backup-${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json');
  }

  function exportCsv() {
    const names = new Map(bankrolls.map((b) => [b.id, b.name]));
    downloadFile(`bettracker-bets-${stamp}.csv`, betsToCsv(bets, names), 'text/csv');
  }

  async function handleCsv(text: string) {
    const target = importTarget || bankrolls[0]?.id;
    if (!target) {
      show(t('bet.needBankroll'));
      return;
    }
    const result = csvToBets(text, { bankrollId: target });
    if (result.errors.length > 0) {
      const reason = t(`error.${result.errors[0]}` as 'error.generic');
      show(t('settings.importFailed', { reason }));
      return;
    }
    for (const bet of result.bets) await store.saveBet(bet);
    await reload();
    show(
      result.skipped.length > 0
        ? t('settings.importedSkipped', {
            count: result.bets.length,
            skipped: result.skipped.length,
          })
        : t('settings.imported', { count: result.bets.length }),
    );
  }

  return (
    <>
      <header className="page-head">
        <div className="page-head__titles">
          <h1>{t('settings.title')}</h1>
        </div>
      </header>

      <div className="stack" style={{ gap: 14 }}>
        {/* Appearance */}
        <Card title={t('settings.appearance')}>
          <div className="stack">
            <Field label={t('common.language')}>
              <Segmented<Language>
                block
                value={settings.language}
                onChange={(v) => updateSettings({ language: v })}
                options={[
                  { value: 'tr', label: 'Türkçe' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </Field>

            <Field label={t('common.theme')}>
              <Segmented<ThemeMode>
                block
                value={settings.theme}
                onChange={(v) => updateSettings({ theme: v })}
                options={[
                  { value: 'light', label: t('settings.theme.light') },
                  { value: 'dark', label: t('settings.theme.dark') },
                  { value: 'system', label: t('settings.theme.system') },
                ]}
              />
            </Field>

            <Field label={t('settings.oddsFormat')}>
              <Segmented<OddsFormat>
                block
                value={settings.oddsFormat}
                onChange={(v) => updateSettings({ oddsFormat: v })}
                options={[
                  { value: 'decimal', label: `${t('calc.decimal')} 2.50` },
                  { value: 'american', label: `${t('calc.american')} +150` },
                  { value: 'fractional', label: `${t('calc.fractional')} 3/2` },
                ]}
              />
            </Field>

            <Field label={t('bet.bookmaker')}>
              <TextInput
                value={settings.defaultBookmaker}
                onChange={(v) => updateSettings({ defaultBookmaker: v })}
                list="default-bookmaker-list"
              />
            </Field>
            <datalist id="default-bookmaker-list">
              {settings.bookmakers.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>

            <Field label={`${t('settings.defaultCommission')} (%)`}>
              <input
                className="input input--num"
                type="number"
                min={0}
                step={0.5}
                value={settings.defaultCommission}
                onChange={(e) =>
                  updateSettings({ defaultCommission: Number(e.target.value) || 0 })
                }
              />
            </Field>
          </div>
        </Card>

        <SyncSettings />

        {/* Data */}
        <Card title={t('settings.data')}>
          <div className="banner banner--info" style={{ marginBottom: 14 }}>
            {t('settings.storageNote')}
          </div>

          <div className="stack">
            <div className="row row--between">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{t('settings.exportJson')}</div>
                <div className="tiny muted">{t('settings.exportJson.hint')}</div>
              </div>
              <button type="button" className="btn btn--primary" onClick={exportJson}>
                ⬇ {t('action.export')}
              </button>
            </div>

            <div className="divider" />

            <div className="row row--between">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{t('settings.exportCsv')}</div>
                <div className="tiny muted">{t('settings.exportCsv.hint')}</div>
              </div>
              <button type="button" className="btn" onClick={exportCsv}>
                ⬇ CSV
              </button>
            </div>

            <div className="divider" />

            <div className="row row--between">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{t('settings.importJson')}</div>
                <div className="tiny muted">{t('settings.importJson.hint')}</div>
              </div>
              <FilePicker
                accept="application/json,.json"
                onFile={(text) => setPendingRestore(parseBackup(text))}
              >
                ⬆ {t('action.import')}
              </FilePicker>
            </div>

            <div className="divider" />

            <div>
              <div style={{ fontWeight: 600 }}>{t('settings.importCsv')}</div>
              <div className="tiny muted" style={{ marginBottom: 10 }}>
                {t('settings.importCsv.hint')}
              </div>
              <div className="row">
                {bankrolls.length > 0 && (
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <Select
                      value={importTarget}
                      onChange={setImportTarget}
                      options={bankrolls.map((b) => ({ value: b.id, label: b.name }))}
                    />
                  </div>
                )}
                <FilePicker accept="text/csv,.csv,.txt" onFile={handleCsv}>
                  ⬆ CSV
                </FilePicker>
              </div>
            </div>
          </div>
        </Card>

        {/* Lists */}
        <Card title={t('settings.lists')}>
          <div className="stack">
            <div>
              <div className="field__label" style={{ marginBottom: 6 }}>
                {t('settings.bookmakers')}
              </div>
              <div className="chip-row" style={{ marginBottom: 8 }}>
                {settings.bookmakers.map((b) => (
                  <span key={b} className="chip">
                    {b}
                    <button
                      type="button"
                      className="chip__remove"
                      aria-label={`remove ${b}`}
                      onClick={() =>
                        updateSettings({
                          bookmakers: settings.bookmakers.filter((x) => x !== b),
                        })
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="row">
                <div style={{ flex: 1, minWidth: 160 }}>
                  <TextInput
                    value={newBookmaker}
                    onChange={setNewBookmaker}
                    placeholder={t('settings.addBookmaker')}
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const name = newBookmaker.trim();
                    if (!name || settings.bookmakers.includes(name)) return;
                    updateSettings({ bookmakers: [...settings.bookmakers, name] });
                    setNewBookmaker('');
                  }}
                >
                  {t('action.add')}
                </button>
              </div>
            </div>

            <div className="divider" />

            <div>
              <div className="field__label" style={{ marginBottom: 6 }}>
                {t('settings.tipsters')}
              </div>
              <div className="chip-row" style={{ marginBottom: 8 }}>
                {settings.tipsters.map((b) => (
                  <span key={b} className="chip">
                    {b}
                    <button
                      type="button"
                      className="chip__remove"
                      aria-label={`remove ${b}`}
                      onClick={() =>
                        updateSettings({ tipsters: settings.tipsters.filter((x) => x !== b) })
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
                {settings.tipsters.length === 0 && (
                  <span className="tiny faint">{t('common.empty')}</span>
                )}
              </div>
              <div className="row">
                <div style={{ flex: 1, minWidth: 160 }}>
                  <TextInput
                    value={newTipster}
                    onChange={setNewTipster}
                    placeholder={t('settings.addTipster')}
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const name = newTipster.trim();
                    if (!name || settings.tipsters.includes(name)) return;
                    updateSettings({ tipsters: [...settings.tipsters, name] });
                    setNewTipster('');
                  }}
                >
                  {t('action.add')}
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* About */}
        <Card title={t('settings.about')}>
          <div className="stack" style={{ gap: 6 }}>
            <div className="row row--between">
              <span className="muted">{t('settings.version')}</span>
              <span className="mono">{APP_VERSION}</span>
            </div>
            <div className="row row--between">
              <span className="muted">{t('bankroll.title')}</span>
              <span className="num">{bankrolls.length}</span>
            </div>
            <div className="row row--between">
              <span className="muted">{t('bet.bets')}</span>
              <span className="num">{bets.length}</span>
            </div>
            <div className="row row--between">
              <span className="muted">{t('tx.title')}</span>
              <span className="num">{transactions.length}</span>
            </div>
            <div className="row row--between">
              <span className="muted">{t('common.currency')}</span>
              <span className="mono">
                {[...new Set(bankrolls.map((b) => b.currency))].join(', ') ||
                  CURRENCIES[0]!.code}
              </span>
            </div>
          </div>
        </Card>

        {/* Danger */}
        <Card title={t('settings.danger')}>
          <div className="row row--between">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{t('settings.resetApp')}</div>
              <div className="tiny muted">{t('settings.resetApp.hint')}</div>
            </div>
            <button type="button" className="btn btn--danger" onClick={() => setConfirmReset(true)}>
              {t('settings.resetApp')}
            </button>
          </div>
        </Card>
      </div>

      {confirmReset && (
        <ConfirmDialog
          danger
          message={t('settings.resetConfirm')}
          confirmLabel={t('action.delete')}
          onCancel={() => setConfirmReset(false)}
          onConfirm={async () => {
            await resetAll();
            setConfirmReset(false);
            show(t('action.confirm'));
          }}
        />
      )}

      {pendingRestore && (
        <ConfirmDialog
          danger
          message={
            pendingRestore.ok
              ? t('settings.importConfirm')
              : t(`error.${pendingRestore.error}` as 'error.generic')
          }
          confirmLabel={pendingRestore.ok ? t('action.import') : t('action.close')}
          onCancel={() => setPendingRestore(null)}
          onConfirm={async () => {
            if (pendingRestore.ok && pendingRestore.data) {
              await restoreBackup(pendingRestore.data);
              show(t('settings.restored'));
            }
            setPendingRestore(null);
          }}
        />
      )}

      {toast}
    </>
  );
}

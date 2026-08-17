import { useMemo, useState } from 'react';
import { useApp } from '@/state/AppContext';
import { useI18n } from '@/i18n';
import { computeStats, equityCurve } from '@/core/stats';
import { BANKROLL_COLORS, CURRENCIES } from '@/core/reference';
import { EquityChart } from '@/components/charts';
import {
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  NumberInput,
  Select,
  Stat,
  TextInput,
  signTone,
} from '@/components/ui';
import type { Bankroll, Transaction, TransactionKind } from '@/core/types';

export default function Bankrolls() {
  const { t, formatMoney, formatPercent, formatDate } = useI18n();
  const {
    bankrolls,
    bets,
    transactions,
    saveBankroll,
    deleteBankroll,
    saveTransaction,
    deleteTransaction,
    setActiveBankrollId,
    activeBankrollId,
  } = useApp();

  const [editing, setEditing] = useState<Partial<Bankroll> | null>(null);
  const [deleting, setDeleting] = useState<Bankroll | null>(null);
  const [txFor, setTxFor] = useState<Bankroll | null>(null);
  const [noteFor, setNoteFor] = useState<Bankroll | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = bankrolls.filter((b) => showArchived || !b.archived);

  /** Per-bankroll figures, computed once and reused by the cards below. */
  const summaries = useMemo(() => {
    const map = new Map<
      string,
      {
        profit: number;
        yield: number;
        balance: number;
        invested: number;
        betCount: number;
        pendingCount: number;
        curve: ReturnType<typeof equityCurve>;
      }
    >();

    for (const bankroll of bankrolls) {
      const own = bets.filter((b) => b.bankrollId === bankroll.id);
      const ownTx = transactions.filter((tx) => tx.bankrollId === bankroll.id);
      const stats = computeStats(own, { startingCapital: bankroll.startingCapital });
      const net = ownTx.reduce((sum, tx) => sum + tx.amount, 0);
      const deposits = ownTx.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
      map.set(bankroll.id, {
        profit: stats.profit,
        yield: stats.yield,
        balance: bankroll.startingCapital + net + stats.profit,
        invested: bankroll.startingCapital + deposits,
        betCount: stats.betCount,
        pendingCount: stats.pendingCount,
        curve: equityCurve(own, bankroll.startingCapital, ownTx),
      });
    }

    return map;
  }, [bankrolls, bets, transactions]);

  return (
    <>
      <header className="page-head">
        <div className="page-head__titles">
          <h1>{t('bankroll.title')}</h1>
          <p className="page-head__sub">{t('bankroll.compare')}</p>
        </div>
        <div className="page-head__actions">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            <span className="small">{t('bankroll.showArchived')}</span>
          </label>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setEditing({ name: '', currency: 'TRY', startingCapital: 0 })}
          >
            + {t('bankroll.new')}
          </button>
        </div>
      </header>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="💰"
            title={t('bankroll.empty')}
            action={
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setEditing({ name: '', currency: 'TRY', startingCapital: 0 })}
              >
                {t('bankroll.new')}
              </button>
            }
          />
        </Card>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {visible.map((bankroll) => {
            const s = summaries.get(bankroll.id);
            const ownTx = transactions
              .filter((tx) => tx.bankrollId === bankroll.id)
              .sort((a, b) => b.occurredAt - a.occurredAt);

            return (
              <Card key={bankroll.id}>
                <div className="card__head">
                  <div className="row row--tight" style={{ minWidth: 0 }}>
                    <span
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: 3,
                        background: bankroll.color,
                        flexShrink: 0,
                      }}
                    />
                    <h2 className="card__title">{bankroll.name}</h2>
                    {bankroll.archived && (
                      <span className="badge">{t('bankroll.archived')}</span>
                    )}
                    {activeBankrollId === bankroll.id && (
                      <span className="badge badge--pending">{t('bankroll.active')}</span>
                    )}
                  </div>
                  <div className="row row--tight">
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => setActiveBankrollId(bankroll.id)}
                    >
                      {t('bankroll.active')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => setTxFor(bankroll)}
                    >
                      {t('tx.title')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => setNoteFor(bankroll)}
                    >
                      📝 {t('bankroll.notepad')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => setEditing(bankroll)}
                    >
                      {t('action.edit')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setDeleting(bankroll)}
                    >
                      🗑
                    </button>
                  </div>
                </div>

                <div className="grid grid--kpi" style={{ marginBottom: 12 }}>
                  <Stat
                    label={t('bankroll.currentBalance')}
                    value={formatMoney(s?.balance ?? 0, bankroll.currency)}
                    tone={signTone((s?.balance ?? 0) - (s?.invested ?? 0))}
                  />
                  <Stat
                    label={t('stat.profit')}
                    value={formatMoney(s?.profit ?? 0, bankroll.currency, { sign: true })}
                    tone={signTone(s?.profit ?? 0)}
                  />
                  <Stat
                    label={t('stat.yield')}
                    value={formatPercent(s?.yield ?? 0)}
                    tone={signTone(s?.yield ?? 0)}
                  />
                  <Stat
                    label={t('bankroll.invested')}
                    value={formatMoney(s?.invested ?? 0, bankroll.currency)}
                  />
                  <Stat
                    label={t('stat.betCount')}
                    value={String(s?.betCount ?? 0)}
                    sub={`${s?.pendingCount ?? 0} ${t('stat.pendingCount').toLowerCase()}`}
                  />
                </div>

                {(s?.curve.length ?? 0) > 1 && (
                  <EquityChart
                    points={s!.curve}
                    currency={bankroll.currency}
                    mode="balance"
                    height={170}
                  />
                )}

                {ownTx.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary className="small muted" style={{ cursor: 'pointer' }}>
                      {t('tx.title')} ({ownTx.length})
                    </summary>
                    <div className="table-wrap" style={{ marginTop: 8 }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t('common.date')}</th>
                            <th>{t('tx.kind')}</th>
                            <th>{t('common.amount')}</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {ownTx.map((tx) => (
                            <tr key={tx.id}>
                              <td>{formatDate(tx.occurredAt)}</td>
                              <td>{t(`tx.${tx.kind}` as 'tx.deposit')}</td>
                              <td className={tx.amount >= 0 ? 'is-positive' : 'is-negative'}>
                                {formatMoney(tx.amount, bankroll.currency, { sign: true })}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm"
                                  onClick={() => deleteTransaction(tx.id)}
                                >
                                  🗑
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <BankrollDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await saveBankroll(data);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          danger
          message={t('bankroll.deleteConfirm', { name: deleting.name })}
          confirmLabel={t('action.delete')}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteBankroll(deleting.id);
            setDeleting(null);
          }}
        />
      )}

      {txFor && (
        <TransactionDialog
          bankroll={txFor}
          onClose={() => setTxFor(null)}
          onSave={async (tx) => {
            await saveTransaction(tx);
            setTxFor(null);
          }}
        />
      )}

      {noteFor && (
        <NotepadDialog
          bankroll={noteFor}
          onClose={() => setNoteFor(null)}
          onSave={async (note) => {
            await saveBankroll({ ...noteFor, note });
            setNoteFor(null);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Dialogs
 * ------------------------------------------------------------------ */

function BankrollDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<Bankroll>;
  onClose: () => void;
  onSave: (data: Partial<Bankroll> & { name: string }) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Partial<Bankroll>>({
    currency: 'TRY',
    startingCapital: 0,
    defaultStake: 0,
    color: BANKROLL_COLORS[0],
    ...initial,
  });
  const [error, setError] = useState('');

  return (
    <Modal
      title={initial.id ? t('bankroll.edit') : t('bankroll.new')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              if (!draft.name?.trim()) {
                setError(t('bankroll.nameRequired'));
                return;
              }
              onSave({ ...draft, name: draft.name.trim() });
            }}
          >
            {t('action.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label={t('bankroll.name')} error={error}>
          <TextInput
            value={draft.name ?? ''}
            onChange={(v) => {
              setDraft({ ...draft, name: v });
              setError('');
            }}
            placeholder="Ana kasa"
          />
        </Field>

        <div className="form-grid">
          <Field label={t('common.currency')}>
            <Select
              value={draft.currency ?? 'TRY'}
              onChange={(v) => setDraft({ ...draft, currency: v })}
              options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} ${c.symbol}` }))}
            />
          </Field>
          <Field label={t('bankroll.startingCapital')}>
            <NumberInput
              value={draft.startingCapital}
              onChange={(v) => setDraft({ ...draft, startingCapital: v ?? 0 })}
              min={0}
            />
          </Field>
          <Field label={t('bankroll.defaultStake')}>
            <NumberInput
              value={draft.defaultStake}
              onChange={(v) => setDraft({ ...draft, defaultStake: v ?? 0 })}
              min={0}
            />
          </Field>
        </div>

        <Field label={t('common.color')}>
          <div className="chip-row">
            {BANKROLL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                onClick={() => setDraft({ ...draft, color })}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: color,
                  border:
                    draft.color === color ? '3px solid var(--text)' : '1px solid var(--border)',
                }}
              />
            ))}
          </div>
        </Field>

        {initial.id && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={Boolean(draft.archived)}
              onChange={(e) => setDraft({ ...draft, archived: e.target.checked })}
            />
            <span>{t('bankroll.archive')}</span>
          </label>
        )}
      </div>
    </Modal>
  );
}

function TransactionDialog({
  bankroll,
  onClose,
  onSave,
}: {
  bankroll: Bankroll;
  onClose: () => void;
  onSave: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<TransactionKind>('deposit');
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  return (
    <Modal
      title={`${t('tx.new')} · ${bankroll.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              if (!amount || amount <= 0) {
                setError(t('tx.amountRequired'));
                return;
              }
              const parsed = Date.parse(date);
              onSave({
                bankrollId: bankroll.id,
                kind,
                // Withdrawals are stored negative so the balance is a plain sum.
                amount: kind === 'withdrawal' ? -Math.abs(amount) : Math.abs(amount),
                note: note || undefined,
                occurredAt: Number.isFinite(parsed) ? parsed : Date.now(),
              });
            }}
          >
            {t('action.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label={t('tx.kind')}>
          <Select
            value={kind}
            onChange={setKind}
            options={(['deposit', 'withdrawal', 'bonus', 'adjustment'] as TransactionKind[]).map(
              (k) => ({ value: k, label: t(`tx.${k}` as 'tx.deposit') }),
            )}
          />
        </Field>
        <Field label={`${t('common.amount')} (${bankroll.currency})`} error={error}>
          <NumberInput
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setError('');
            }}
            min={0}
          />
        </Field>
        <Field label={t('common.date')}>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label={t('common.notes')}>
          <TextInput value={note} onChange={setNote} />
        </Field>
      </div>
    </Modal>
  );
}

function NotepadDialog({
  bankroll,
  onClose,
  onSave,
}: {
  bankroll: Bankroll;
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const { t } = useI18n();
  const [note, setNote] = useState(bankroll.note);

  return (
    <Modal
      title={`${t('bankroll.notepad')} · ${bankroll.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('action.cancel')}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onSave(note)}>
            {t('action.save')}
          </button>
        </>
      }
    >
      <Field hint={t('bankroll.notepad.hint')}>
        <textarea
          className="textarea"
          style={{ minHeight: 260 }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

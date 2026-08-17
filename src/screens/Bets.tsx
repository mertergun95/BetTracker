import { useMemo, useState } from 'react';
import { useApp, emptyBet } from '@/state/AppContext';
import { useI18n } from '@/i18n';
import { computeStats } from '@/core/stats';
import { isSettled } from '@/core/settlement';
import BetList from '@/components/BetList';
import BetForm from '@/components/BetForm';
import BankrollSwitcher from '@/components/BankrollSwitcher';
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
  useToast,
} from '@/components/ui';
import { FilterBar, EMPTY_FILTER, useFilteredBets, type FilterState } from '@/components/FilterBar';
import type { Bet, SelectionStatus } from '@/core/types';

/** Marks every selection of a bet with one outcome — the common case. */
function settleAll(bet: Bet, status: SelectionStatus): Partial<Bet> {
  return {
    selections: bet.selections.map((s) => ({
      ...s,
      status,
      placed: status === 'won' ? true : s.placed,
    })),
    settledAt: status === 'pending' ? undefined : (bet.settledAt ?? Date.now()),
  };
}

export default function Bets() {
  const { t, formatMoney, formatPercent, formatNumber } = useI18n();
  const { bankrolls, scopedBets, activeBankroll, activeBankrollId, currency, settings, updateBets, deleteBets } =
    useApp();
  const { toast, show } = useToast();

  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTER);
  const [editing, setEditing] = useState<Bet | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [quickSettle, setQuickSettle] = useState(false);

  const bets = useFilteredBets(scopedBets, filterState);
  const stats = useMemo(() => computeStats(bets), [bets]);
  const pending = useMemo(() => bets.filter((b) => !isSettled(b)), [bets]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedBets = useMemo(
    () => bets.filter((b) => selected.has(b.id)),
    [bets, selected],
  );

  async function applyStatusToSelection(status: SelectionStatus) {
    for (const bet of selectedBets) {
      await updateBets([bet.id], settleAll(bet, status));
    }
    show(t('bet.selected', { count: selectedBets.length }));
    setSelected(new Set());
  }

  if (bankrolls.length === 0) {
    return (
      <Card>
        <EmptyState icon="💰" title={t('bankroll.empty')} />
      </Card>
    );
  }

  return (
    <>
      <header className="page-head">
        <div className="page-head__titles">
          <h1>{t('bets.title')}</h1>
          <p className="page-head__sub">
            {t('bets.showing', { shown: bets.length, total: scopedBets.length })}
          </p>
        </div>
        <div className="page-head__actions">
          <BankrollSwitcher />
          {pending.length > 0 && (
            <button type="button" className="btn" onClick={() => setQuickSettle(true)}>
              ⚡ {t('bets.quickSettle')} ({pending.length})
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            onClick={() =>
              setEditing(
                emptyBet(
                  activeBankrollId ?? bankrolls[0]!.id,
                  {
                    unitStake: activeBankroll?.defaultStake ?? 0,
                    commission: settings.defaultCommission,
                    bookmaker: settings.defaultBookmaker,
                  },
                  activeBankroll?.sports ?? [],
                ),
              )
            }
          >
            + {t('bet.new')}
          </button>
        </div>
      </header>

      <FilterBar state={filterState} onChange={setFilterState} bets={scopedBets} />

      {bets.length > 0 && (
        <div className="grid grid--kpi" style={{ marginBottom: 14 }}>
          <Stat
            label={t('stat.profit')}
            value={formatMoney(stats.profit, currency, { sign: true })}
            tone={signTone(stats.profit)}
          />
          <Stat label={t('stat.turnover')} value={formatMoney(stats.turnover, currency)} />
          <Stat
            label={t('stat.yield')}
            value={formatPercent(stats.yield)}
            tone={signTone(stats.yield)}
          />
          <Stat label={t('stat.hitRate')} value={formatPercent(stats.hitRate)} />
          <Stat label={t('stat.betCount')} value={formatNumber(stats.betCount)} />
        </div>
      )}

      {selected.size > 0 && (
        <div className="selection-bar">
          <strong>{t('bet.selected', { count: selected.size })}</strong>
          <div className="spacer" />
          <button type="button" className="btn btn--sm" onClick={() => applyStatusToSelection('won')}>
            ✓ {t('status.won')}
          </button>
          <button type="button" className="btn btn--sm" onClick={() => applyStatusToSelection('lost')}>
            ✗ {t('status.lost')}
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setBulkOpen(true)}>
            {t('bet.bulkEdit')}
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setConfirmDelete(true)}>
            {t('action.delete')}
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setSelected(new Set())}
            aria-label={t('action.deselect')}
          >
            ✕
          </button>
        </div>
      )}

      <Card flush>
        {bets.length === 0 ? (
          <EmptyState
            icon="🔍"
            title={scopedBets.length === 0 ? t('bets.emptyAll') : t('bets.empty')}
          />
        ) : (
          <>
            <div className="row" style={{ padding: '9px 14px', borderBottom: '1px solid var(--border)' }}>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.size === bets.length && bets.length > 0}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(bets.map((b) => b.id)) : new Set())
                  }
                />
                <span className="small">{t('action.selectAll')}</span>
              </label>
            </div>
            <BetList
              bets={bets}
              currency={currency}
              oddsFormat={settings.oddsFormat}
              selectable
              selectedIds={selected}
              onToggleSelect={toggle}
              onOpen={setEditing}
            />
          </>
        )}
      </Card>

      <button
        type="button"
        className="fab"
        aria-label={t('bet.new')}
        onClick={() =>
          setEditing(
            emptyBet(
              activeBankrollId ?? bankrolls[0]!.id,
              {
                unitStake: activeBankroll?.defaultStake ?? 0,
                commission: settings.defaultCommission,
                bookmaker: settings.defaultBookmaker,
              },
              activeBankroll?.sports ?? [],
            ),
          )
        }
      >
        +
      </button>

      {editing && <BetForm initial={editing} onClose={() => setEditing(null)} />}

      {confirmDelete && (
        <ConfirmDialog
          danger
          message={t('bet.deleteManyConfirm', { count: selected.size })}
          confirmLabel={t('action.delete')}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteBets([...selected]);
            setSelected(new Set());
            setConfirmDelete(false);
          }}
        />
      )}

      {bulkOpen && (
        <BulkEditDialog
          count={selected.size}
          onClose={() => setBulkOpen(false)}
          onApply={async (patch) => {
            await updateBets([...selected], patch);
            setSelected(new Set());
            setBulkOpen(false);
          }}
        />
      )}

      {quickSettle && (
        <QuickSettleDialog
          bets={pending}
          currency={currency}
          onClose={() => setQuickSettle(false)}
          onSettle={async (bet, status) => {
            await updateBets([bet.id], settleAll(bet, status));
          }}
        />
      )}

      {toast}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Bulk edit
 * ------------------------------------------------------------------ */

function BulkEditDialog({
  count,
  onClose,
  onApply,
}: {
  count: number;
  onClose: () => void;
  onApply: (patch: Partial<Bet>) => void;
}) {
  const { t } = useI18n();
  const { settings, bankrolls } = useApp();
  const [bookmaker, setBookmaker] = useState('');
  const [tipster, setTipster] = useState('');
  const [commission, setCommission] = useState<number | undefined>(undefined);
  const [bankrollId, setBankrollId] = useState('');
  const [tagsToAdd, setTagsToAdd] = useState('');

  return (
    <Modal
      title={`${t('bet.bulkEdit')} · ${t('bet.selected', { count })}`}
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
              // Only send fields the user actually filled in; everything else
              // must stay as it is on each bet.
              const patch: Partial<Bet> = {};
              if (bookmaker) patch.bookmaker = bookmaker;
              if (tipster) patch.tipster = tipster;
              if (commission !== undefined) patch.commission = commission;
              if (bankrollId) patch.bankrollId = bankrollId;
              if (tagsToAdd.trim()) {
                patch.tags = tagsToAdd
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
              }
              onApply(patch);
            }}
          >
            {t('action.apply')}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="card__hint">{t('bet.bulkEdit.hint')}</p>

        <Field label={t('bet.bookmaker')}>
          <TextInput value={bookmaker} onChange={setBookmaker} list="bookmakers-list-bulk" />
        </Field>
        <datalist id="bookmakers-list-bulk">
          {settings.bookmakers.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>

        <Field label={t('bet.tipster')}>
          <TextInput value={tipster} onChange={setTipster} />
        </Field>

        <Field label={`${t('bet.commission')} (%)`}>
          <NumberInput value={commission} onChange={setCommission} min={0} step={0.1} />
        </Field>

        {bankrolls.length > 1 && (
          <Field label={t('bankroll.bankroll')}>
            <Select
              value={bankrollId}
              onChange={setBankrollId}
              placeholder="—"
              options={bankrolls.map((b) => ({ value: b.id, label: b.name }))}
            />
          </Field>
        )}

        <Field label={t('bet.tags')} hint="a, b, c">
          <TextInput value={tagsToAdd} onChange={setTagsToAdd} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Quick settle
 * ------------------------------------------------------------------ */

function QuickSettleDialog({
  bets,
  currency,
  onClose,
  onSettle,
}: {
  bets: Bet[];
  currency: string;
  onClose: () => void;
  onSettle: (bet: Bet, status: SelectionStatus) => Promise<void>;
}) {
  const { t, formatMoney, formatDate } = useI18n();
  const [done, setDone] = useState<Set<string>>(new Set());

  const remaining = bets.filter((b) => !done.has(b.id));

  return (
    <Modal
      wide
      title={t('bets.quickSettle')}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--primary" onClick={onClose}>
          {t('action.close')}
        </button>
      }
    >
      {remaining.length === 0 ? (
        <EmptyState icon="✅" title={t('common.empty')} />
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {remaining.map((bet) => {
            const first = bet.selections[0];
            return (
              <div key={bet.id} className="card" style={{ background: 'var(--surface-2)', padding: 12 }}>
                <div className="row row--between" style={{ marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="truncate" style={{ fontWeight: 600 }}>
                      {bet.selections.length > 1
                        ? `${bet.selections.length}× ${t('bet.structure.accumulator')}`
                        : (first?.event || first?.picks[0]?.pick || '—')}
                    </div>
                    <div className="tiny muted">
                      {formatDate(bet.placedAt)} · {bet.bookmaker} ·{' '}
                      {formatMoney(bet.unitStake, currency)}
                    </div>
                  </div>
                </div>
                <div className="row row--tight">
                  {(['won', 'lost', 'void'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className="btn btn--sm"
                      onClick={async () => {
                        await onSettle(bet, status);
                        setDone((prev) => new Set(prev).add(bet.id));
                      }}
                    >
                      {t(`status.${status}` as 'status.won')}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

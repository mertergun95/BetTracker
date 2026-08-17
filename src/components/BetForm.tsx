import { useMemo, useState } from 'react';
import { useApp } from '@/state/AppContext';
import { useI18n, type TranslationKey } from '@/i18n';
import { newId } from '@/core/ids';
import { formatOdds } from '@/core/odds';
import {
  combinedOdds,
  layLiability,
  lineCount,
  potentialReturn,
  settleBet,
  totalStake,
} from '@/core/settlement';
import { SYSTEM_PRESETS, systemLabel } from '@/core/systems';
import { COMMON_MARKETS, SPORTS, bookmakerDef } from '@/core/reference';
import type {
  Bet,
  BetStructure,
  Selection,
  SelectionStatus,
} from '@/core/types';
import {
  Checkbox,
  Field,
  Modal,
  NumberInput,
  Segmented,
  Select,
  TagInput,
  TextInput,
} from './ui';

/** ISO date-time string for an `<input type="datetime-local">`, in local time. */
function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string, fallback: number): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const STATUS_OPTIONS: { value: SelectionStatus; key: TranslationKey }[] = [
  { value: 'pending', key: 'status.pending' },
  { value: 'won', key: 'status.won' },
  { value: 'lost', key: 'status.lost' },
  { value: 'void', key: 'status.void' },
  { value: 'half_won', key: 'status.half_won' },
  { value: 'half_lost', key: 'status.half_lost' },
];

export default function BetForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Bet;
  onClose: () => void;
  onSaved?: (bet: Bet) => void;
}) {
  const { t, formatMoney, formatPercent } = useI18n();
  const { settings, bankrolls, saveBet, currency: appCurrency } = useApp();
  const [bet, setBet] = useState<Bet>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(initial.eachWay || initial.freeBet || initial.cashOutAmount !== undefined),
  );

  const bankroll = bankrolls.find((b) => b.id === bet.bankrollId);
  const currency = bankroll?.currency ?? appCurrency;

  const patch = (changes: Partial<Bet>) => setBet((prev) => ({ ...prev, ...changes }));

  const patchSelection = (index: number, changes: Partial<Selection>) =>
    setBet((prev) => ({
      ...prev,
      selections: prev.selections.map((s, i) => (i === index ? { ...s, ...changes } : s)),
    }));

  const addSelection = () =>
    setBet((prev) => {
      const last = prev.selections[prev.selections.length - 1];
      return {
        ...prev,
        selections: [
          ...prev.selections,
          {
            id: newId('sel_'),
            event: '',
            // Carry the sport and competition forward; consecutive legs are
            // usually from the same card.
            sport: last?.sport ?? 'football',
            competition: last?.competition ?? '',
            market: '',
            pick: '',
            odds: 0,
            side: 'back',
            status: 'pending',
          },
        ],
      };
    });

  const removeSelection = (index: number) =>
    setBet((prev) => ({
      ...prev,
      selections: prev.selections.filter((_, i) => i !== index),
    }));

  const setStructure = (structure: BetStructure) => {
    setBet((prev) => {
      const next: Bet = { ...prev, structure };
      if (structure === 'single') {
        // A single holds one leg; keep the first and drop the rest.
        next.selections = prev.selections.slice(0, 1);
        next.system = undefined;
      } else {
        // Multiples are back-only, so reset any lay leg carried over.
        next.selections = prev.selections.map((s) => ({ ...s, side: 'back' as const }));
        if (structure === 'system') {
          const n = Math.max(2, next.selections.length);
          next.system = prev.system ?? { sizes: [Math.max(2, n - 1)], preset: 'custom' };
        } else {
          next.system = undefined;
        }
      }
      return next;
    });
  };

  /* ---------------- Derived preview ---------------- */

  const preview = useMemo(() => {
    const settlement = settleBet(bet);
    const isLaySingle = bet.structure === 'single' && bet.selections[0]?.side === 'lay';
    return {
      settlement,
      lines: lineCount(bet),
      stake: totalStake(bet),
      odds: combinedOdds(bet),
      potential: potentialReturn(bet),
      liability:
        isLaySingle && bet.selections[0]
          ? layLiability(bet.unitStake, bet.selections[0].odds)
          : null,
    };
  }, [bet]);

  /* ---------------- Validation ---------------- */

  function validate(): string[] {
    const found: string[] = [];
    if (!bet.bankrollId) found.push(t('bet.needBankroll'));
    if (bet.selections.length === 0) found.push(t('bet.needSelection'));
    if (!(bet.unitStake > 0)) found.push(t('bet.needStake'));
    if (bet.selections.some((s) => !(s.odds > 1))) found.push(t('bet.needOdds'));
    if (bet.structure === 'single' && bet.selections.length !== 1) {
      found.push(t('bet.singleNeedsOne'));
    }
    if (bet.structure === 'accumulator' && bet.selections.length < 2) {
      found.push(t('bet.accaNeedsTwo'));
    }
    if (bet.structure === 'system' && bet.selections.length < 2) {
      found.push(t('bet.systemNeedsTwo'));
    }
    if (bet.structure !== 'single' && bet.selections.some((s) => s.side === 'lay')) {
      found.push(t('bet.layOnlySingle'));
    }
    return found;
  }

  async function handleSave() {
    const found = validate();
    setErrors(found);
    if (found.length > 0) return;
    // Drop each-way terms that were toggled off but left in state.
    const cleaned: Bet = { ...bet, updatedAt: Date.now() };
    await saveBet(cleaned);
    onSaved?.(cleaned);
    onClose();
  }

  const sportOptions = useMemo(
    () =>
      SPORTS.map((s) => ({
        value: s.key,
        label: `${s.icon}  ${t(`sport.${s.key}` as 'sport.football')}`,
      })),
    [t],
  );

  const systemPresetOptions = useMemo(() => {
    const n = bet.selections.length;
    return [
      { value: 'custom', label: t('bet.system.custom') },
      ...SYSTEM_PRESETS.filter((p) => p.selections === n).map((p) => ({
        value: p.key,
        label: p.label,
      })),
    ];
  }, [bet.selections.length, t]);

  const marketListId = 'markets-list';

  return (
    <Modal
      wide
      title={initial.createdAt === initial.updatedAt ? t('bet.new') : t('bet.edit')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('action.cancel')}
          </button>
          <button type="button" className="btn btn--primary" onClick={handleSave}>
            {t('action.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        {errors.length > 0 && (
          <div className="banner banner--error">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Bankroll + structure */}
        <div className="form-grid">
          {bankrolls.length > 1 && (
            <Field label={t('bankroll.bankroll')}>
              <Select
                value={bet.bankrollId}
                onChange={(v) => patch({ bankrollId: v })}
                options={bankrolls.map((b) => ({ value: b.id, label: b.name }))}
              />
            </Field>
          )}
          <Field label={t('bet.placedAt')}>
            <input
              className="input"
              type="datetime-local"
              value={toLocalInput(bet.placedAt)}
              onChange={(e) => patch({ placedAt: fromLocalInput(e.target.value, bet.placedAt) })}
            />
          </Field>
        </div>

        <Field label={t('bet.structure')}>
          <Segmented
            block
            value={bet.structure}
            onChange={setStructure}
            options={[
              { value: 'single', label: t('bet.structure.single') },
              { value: 'accumulator', label: t('bet.structure.accumulator') },
              { value: 'system', label: t('bet.structure.system') },
            ]}
          />
        </Field>

        {bet.structure === 'system' && (
          <div className="form-grid">
            <Field label={t('bet.system.preset')}>
              <Select
                value={bet.system?.preset ?? 'custom'}
                onChange={(key) => {
                  const preset = SYSTEM_PRESETS.find((p) => p.key === key);
                  patch({
                    system: preset
                      ? { sizes: preset.sizes, preset: preset.key }
                      : { sizes: bet.system?.sizes ?? [2], preset: 'custom' },
                  });
                }}
                options={systemPresetOptions}
              />
            </Field>
            <Field
              label={t('bet.system.sizes')}
              hint={`${preview.lines} ${t('bet.lines')} · ${systemLabel(
                bet.system ?? { sizes: [2] },
                bet.selections.length,
              )}`}
            >
              <div className="chip-row">
                {Array.from({ length: bet.selections.length }, (_, i) => i + 1).map((size) => {
                  const active = bet.system?.sizes.includes(size) ?? false;
                  return (
                    <button
                      key={size}
                      type="button"
                      className={`chip${active ? ' is-active' : ''}`}
                      onClick={() => {
                        const current = bet.system?.sizes ?? [];
                        const next = active
                          ? current.filter((s) => s !== size)
                          : [...current, size].sort((a, b) => a - b);
                        patch({
                          system: { sizes: next.length > 0 ? next : [size], preset: 'custom' },
                        });
                      }}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        )}

        {/* Selections */}
        <div className="stack" style={{ gap: 10 }}>
          <div className="row row--between">
            <h3 className="card__title">{t('bet.selections')}</h3>
            {bet.structure !== 'single' && (
              <button type="button" className="btn btn--sm" onClick={addSelection}>
                + {t('bet.addSelection')}
              </button>
            )}
          </div>

          {bet.selections.map((sel, index) => (
            <div
              key={sel.id}
              className="card"
              style={{ background: 'var(--surface-2)', padding: 13 }}
            >
              <div className="row row--between" style={{ marginBottom: 9 }}>
                <span className="tiny faint">#{index + 1}</span>
                {bet.selections.length > 1 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => removeSelection(index)}
                  >
                    {t('bet.removeSelection')}
                  </button>
                )}
              </div>

              <div className="stack" style={{ gap: 10 }}>
                <div className="form-grid">
                  <Field label={t('bet.sport')}>
                    <Select
                      value={sel.sport}
                      onChange={(v) => patchSelection(index, { sport: v })}
                      options={sportOptions}
                    />
                  </Field>
                  <Field label={t('bet.competition')}>
                    <TextInput
                      value={sel.competition}
                      onChange={(v) => patchSelection(index, { competition: v })}
                      placeholder="Süper Lig"
                    />
                  </Field>
                </div>

                <Field label={t('bet.event')}>
                  <TextInput
                    value={sel.event}
                    onChange={(v) => patchSelection(index, { event: v })}
                    placeholder="Galatasaray - Fenerbahçe"
                  />
                </Field>

                <div className="form-grid">
                  <Field label={t('bet.market')}>
                    <TextInput
                      value={sel.market}
                      onChange={(v) => patchSelection(index, { market: v })}
                      list={marketListId}
                      placeholder="1X2"
                    />
                  </Field>
                  <Field label={t('bet.pick')}>
                    <TextInput
                      value={sel.pick}
                      onChange={(v) => patchSelection(index, { pick: v })}
                      placeholder="Galatasaray"
                    />
                  </Field>
                </div>

                <div className="form-grid">
                  <Field label={t('bet.odds')}>
                    <NumberInput
                      value={sel.odds || undefined}
                      onChange={(v) => patchSelection(index, { odds: v ?? 0 })}
                      min={1}
                      step={0.01}
                      placeholder="2.00"
                    />
                  </Field>
                  <Field
                    label={t('bet.closingOdds')}
                    hint={t('common.optional')}
                  >
                    <NumberInput
                      value={sel.closingOdds}
                      onChange={(v) => patchSelection(index, { closingOdds: v })}
                      min={1}
                      step={0.01}
                    />
                  </Field>
                  {bet.structure === 'single' && (
                    <Field label={t('bet.side')}>
                      <Segmented
                        block
                        value={sel.side}
                        onChange={(v) => patchSelection(index, { side: v })}
                        options={[
                          { value: 'back', label: t('bet.side.back') },
                          { value: 'lay', label: t('bet.side.lay') },
                        ]}
                      />
                    </Field>
                  )}
                </div>

                <div className="form-grid">
                  <Field label={t('bets.filter.status')}>
                    <Select
                      value={sel.status}
                      onChange={(v) => patchSelection(index, { status: v })}
                      options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.key) }))}
                    />
                  </Field>
                  {bet.eachWay && (
                    <Field label={t('bet.eachWay.placed')}>
                      <Checkbox
                        checked={sel.placed ?? sel.status === 'won'}
                        onChange={(v) => patchSelection(index, { placed: v })}
                        label={t('bet.eachWay.placed')}
                      />
                    </Field>
                  )}
                </div>
              </div>
            </div>
          ))}

          <datalist id={marketListId}>
            {COMMON_MARKETS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>

        {/* Stake and book */}
        <div className="form-grid">
          <Field
            label={bet.structure === 'system' ? t('bet.unitStake') : t('bet.stake')}
            hint={
              preview.lines > 1
                ? `${t('bet.totalStake')}: ${formatMoney(preview.stake, currency)}`
                : undefined
            }
          >
            <NumberInput
              value={bet.unitStake || undefined}
              onChange={(v) => patch({ unitStake: v ?? 0 })}
              min={0}
              step={0.01}
              placeholder={String(bankroll?.defaultStake || '')}
            />
          </Field>

          <Field label={t('bet.bookmaker')}>
            <TextInput
              value={bet.bookmaker}
              onChange={(v) => {
                // Exchanges carry a default commission; fill it in once so the
                // user is not typing 5% on every Betfair bet.
                const def = bookmakerDef(v);
                patch({
                  bookmaker: v,
                  commission:
                    def?.defaultCommission !== undefined && bet.commission === 0
                      ? def.defaultCommission
                      : bet.commission,
                });
              }}
              list="bookmakers-list"
              placeholder="Bet365"
            />
          </Field>

          <Field label={`${t('bet.commission')} (%)`}>
            <NumberInput
              value={bet.commission || undefined}
              onChange={(v) => patch({ commission: v ?? 0 })}
              min={0}
              step={0.1}
            />
          </Field>
        </div>

        <datalist id="bookmakers-list">
          {settings.bookmakers.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>

        <div className="form-grid">
          <Field label={t('bet.tipster')} hint={t('common.optional')}>
            <TextInput
              value={bet.tipster ?? ''}
              onChange={(v) => patch({ tipster: v || undefined })}
              list="tipsters-list"
            />
          </Field>
          <Field label={t('bet.tags')}>
            <TagInput
              tags={bet.tags}
              onChange={(tags) => patch({ tags })}
              placeholder="value, live, fade…"
            />
          </Field>
        </div>

        <datalist id="tipsters-list">
          {settings.tipsters.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>

        <Field label={t('bet.note')}>
          <textarea
            className="textarea"
            value={bet.note ?? ''}
            onChange={(e) => patch({ note: e.target.value || undefined })}
            placeholder={t('common.optional')}
          />
        </Field>

        {/* Advanced */}
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? '▾' : '▸'} {t('bet.freeBet')} · {t('bet.eachWay')} · {t('bet.cashOut')}
        </button>

        {showAdvanced && (
          <div className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="stack">
              <Checkbox
                checked={Boolean(bet.freeBet)}
                onChange={(v) => patch({ freeBet: v || undefined })}
                label={`${t('bet.freeBet')} — ${t('bet.freeBet.hint')}`}
              />

              <Checkbox
                checked={Boolean(bet.eachWay)}
                onChange={(v) =>
                  patch({ eachWay: v ? { places: 3, fraction: 0.2 } : undefined })
                }
                label={t('bet.eachWay')}
              />

              {bet.eachWay && (
                <div className="form-grid">
                  <Field label={t('bet.eachWay.places')}>
                    <NumberInput
                      value={bet.eachWay.places}
                      onChange={(v) =>
                        patch({ eachWay: { ...bet.eachWay!, places: v ?? 3 } })
                      }
                      min={1}
                      step={1}
                    />
                  </Field>
                  <Field label={t('bet.eachWay.fraction')} hint="1/5 = 0.2">
                    <NumberInput
                      value={bet.eachWay.fraction}
                      onChange={(v) =>
                        patch({ eachWay: { ...bet.eachWay!, fraction: v ?? 0.2 } })
                      }
                      min={0}
                      step={0.05}
                    />
                  </Field>
                </div>
              )}

              <Field label={t('bet.cashOutAmount')} hint={t('common.optional')}>
                <NumberInput
                  value={bet.cashOutAmount}
                  onChange={(v) => patch({ cashOutAmount: v })}
                  min={0}
                  step={0.01}
                />
              </Field>
            </div>
          </div>
        )}

        {/* Live preview */}
        <div className="card" style={{ background: 'var(--accent-soft)' }}>
          <div className="grid grid--kpi" style={{ gap: 8 }}>
            <div>
              <div className="stat__label">{t('bet.combinedOdds')}</div>
              <div className="stat__value" style={{ fontSize: '1.05rem' }}>
                {bet.structure === 'system'
                  ? `${preview.lines} ${t('bet.lines')}`
                  : formatOdds(preview.odds, settings.oddsFormat)}
              </div>
            </div>
            <div>
              <div className="stat__label">{t('bet.totalStake')}</div>
              <div className="stat__value" style={{ fontSize: '1.05rem' }}>
                {formatMoney(preview.stake, currency)}
              </div>
            </div>
            {preview.liability !== null ? (
              <div>
                <div className="stat__label">{t('bet.liability')}</div>
                <div className="stat__value is-negative" style={{ fontSize: '1.05rem' }}>
                  {formatMoney(preview.liability, currency)}
                </div>
              </div>
            ) : (
              <div>
                <div className="stat__label">{t('bet.potentialReturn')}</div>
                <div className="stat__value" style={{ fontSize: '1.05rem' }}>
                  {formatMoney(preview.potential, currency)}
                </div>
              </div>
            )}
            {preview.settlement.settled && (
              <div>
                <div className="stat__label">{t('bet.profit')}</div>
                <div
                  className={`stat__value ${
                    preview.settlement.profit >= 0 ? 'is-positive' : 'is-negative'
                  }`}
                  style={{ fontSize: '1.05rem' }}
                >
                  {formatMoney(preview.settlement.profit, currency, { sign: true })}
                </div>
              </div>
            )}
            {bet.commission > 0 && (
              <div>
                <div className="stat__label">{t('bet.commission')}</div>
                <div className="stat__value" style={{ fontSize: '1.05rem' }}>
                  {formatPercent(bet.commission / 100)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

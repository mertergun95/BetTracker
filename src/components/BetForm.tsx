import { useMemo, useState } from 'react';
import { useApp } from '@/state/AppContext';
import { useSportsData } from '@/state/useSportsData';
import { useI18n } from '@/i18n';
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
import { bookmakerDef, sportIcon } from '@/core/reference';
import type { Bet, Selection } from '@/core/types';
import SelectionEditor from './SelectionEditor';
import { Checkbox, Field, Modal, NumberInput, Select, TagInput, TextInput } from './ui';

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

/** A fresh leg, inheriting the league and sport of the one before it. */
export function newSelection(previous?: Selection, defaultSport = 'football'): Selection {
  return {
    id: newId('sel_'),
    event: '',
    sport: previous?.sport ?? defaultSport,
    competition: previous?.competition ?? '',
    leagueId: previous?.leagueId,
    picks: [{ id: newId('pk_'), market: '', pick: '' }],
    odds: 0,
    side: 'back',
    status: 'pending',
  };
}

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
  const { catalog, fixtures } = useSportsData();

  const [bet, setBet] = useState<Bet>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSystem, setIsSystem] = useState(initial.structure === 'system');
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(initial.eachWay || initial.freeBet || initial.cashOutAmount !== undefined),
  );

  const bankroll = bankrolls.find((b) => b.id === bet.bankrollId);
  const currency = bankroll?.currency ?? appCurrency;
  const allowedSports = bankroll?.sports ?? [];

  const patch = (changes: Partial<Bet>) => setBet((prev) => ({ ...prev, ...changes }));

  const patchSelection = (index: number, changes: Partial<Selection>) =>
    setBet((prev) => ({
      ...prev,
      selections: prev.selections.map((s, i) => (i === index ? { ...s, ...changes } : s)),
    }));

  /**
   * The structure is derived, not chosen: one leg is a single, several are an
   * accumulator, and the system toggle only appears once there is something to
   * combine. That is why there are no bet-type tabs on this form.
   */
  const structure = bet.selections.length <= 1 ? 'single' : isSystem ? 'system' : 'accumulator';

  const addSelection = () =>
    setBet((prev) => {
      const added = newSelection(prev.selections.at(-1), allowedSports[0]);
      // Lay only makes sense on a single, so combining resets any lay leg.
      const selections = [...prev.selections, added].map((s) => ({ ...s, side: 'back' as const }));
      return { ...prev, selections };
    });

  const removeSelection = (index: number) =>
    setBet((prev) => ({
      ...prev,
      selections: prev.selections.filter((_, i) => i !== index),
    }));

  /* ---------------- Derived preview ---------------- */

  const effectiveBet = useMemo<Bet>(
    () => ({
      ...bet,
      structure,
      system:
        structure === 'system'
          ? (bet.system ?? { sizes: [Math.max(2, bet.selections.length - 1)], preset: 'custom' })
          : undefined,
    }),
    [bet, structure],
  );

  const preview = useMemo(() => {
    const settlement = settleBet(effectiveBet);
    const isLaySingle =
      effectiveBet.structure === 'single' && effectiveBet.selections[0]?.side === 'lay';
    return {
      settlement,
      lines: lineCount(effectiveBet),
      stake: totalStake(effectiveBet),
      odds: combinedOdds(effectiveBet),
      potential: potentialReturn(effectiveBet),
      liability:
        isLaySingle && effectiveBet.selections[0]
          ? layLiability(effectiveBet.unitStake, effectiveBet.selections[0].odds)
          : null,
    };
  }, [effectiveBet]);

  /* ---------------- Validation ---------------- */

  function validate(): string[] {
    const found: string[] = [];
    if (!bet.bankrollId) found.push(t('bet.needBankroll'));
    if (bet.selections.length === 0) found.push(t('bet.needSelection'));
    if (!(bet.unitStake > 0)) found.push(t('bet.needStake'));
    if (bet.selections.some((s) => !(s.odds > 1))) found.push(t('bet.needOdds'));
    if (bet.selections.some((s) => !s.event.trim())) found.push(t('bet.needEvent'));
    if (bet.selections.some((s) => s.picks.every((p) => !p.pick.trim()))) {
      found.push(t('bet.needPick'));
    }
    if (structure === 'system' && bet.selections.length < 2) found.push(t('bet.systemNeedsTwo'));
    if (structure !== 'single' && bet.selections.some((s) => s.side === 'lay')) {
      found.push(t('bet.layOnlySingle'));
    }

    // A restricted bankroll must not silently accept a foreign sport, or its
    // whole point — clean per-sport statistics — is lost.
    if (allowedSports.length > 0) {
      const offending = bet.selections
        .filter((s) => !allowedSports.includes(s.sport))
        .map((s) => t(`sport.${s.sport}` as 'sport.football'));
      if (offending.length > 0) {
        found.push(
          t('bet.sportNotAllowed', {
            sport: [...new Set(offending)].join(', '),
            bankroll: bankroll?.name ?? '',
          }),
        );
      }
    }

    return found;
  }

  async function handleSave() {
    const found = validate();
    setErrors(found);
    if (found.length > 0) return;
    const cleaned: Bet = { ...effectiveBet, updatedAt: Date.now() };
    await saveBet(cleaned);
    onSaved?.(cleaned);
    onClose();
  }

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

  const sportSummary = useMemo(() => {
    if (allowedSports.length === 0) return null;
    return allowedSports
      .map((s) => `${sportIcon(s)} ${t(`sport.${s}` as 'sport.football')}`)
      .join(' · ');
  }, [allowedSports, t]);

  return (
    <Modal
      wide
      title={initial.createdAt === initial.updatedAt ? t('bet.new') : t('bet.edit')}
      onClose={onClose}
      footer={
        <>
          <div className="spacer small muted">
            {structure === 'single'
              ? t('bet.structure.single')
              : structure === 'system'
                ? systemLabel(
                    effectiveBet.system ?? { sizes: [2] },
                    bet.selections.length,
                  )
                : `${t('bet.structure.accumulator')} ×${bet.selections.length}`}
          </div>
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

        {sportSummary && (
          <div className="banner banner--info">
            {t('bet.bankrollSports', { sports: sportSummary })}
          </div>
        )}

        <div className="form-grid">
          {bankrolls.length > 1 && (
            <Field label={t('bankroll.bankroll')}>
              <Select
                value={bet.bankrollId}
                onChange={(v) => {
                  const next = bankrolls.find((b) => b.id === v);
                  patch({
                    bankrollId: v,
                    // Move the legs onto a sport the new bankroll accepts.
                    selections:
                      next && next.sports.length > 0
                        ? bet.selections.map((s) =>
                            next.sports.includes(s.sport)
                              ? s
                              : { ...s, sport: next.sports[0]!, leagueId: undefined, competition: '' },
                          )
                        : bet.selections,
                  });
                }}
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

        {/* Legs */}
        <div className="stack" style={{ gap: 10 }}>
          {bet.selections.map((selection, index) => (
            <SelectionEditor
              key={selection.id}
              selection={selection}
              index={index}
              canRemove={bet.selections.length > 1}
              allowedSports={allowedSports}
              catalog={catalog}
              fixtures={fixtures}
              showSide={bet.selections.length === 1}
              eachWay={Boolean(bet.eachWay)}
              onChange={(changes) => patchSelection(index, changes)}
              onRemove={() => removeSelection(index)}
            />
          ))}

          <button type="button" className="btn btn--block" onClick={addSelection}>
            + {t('bet.addSelection')}
          </button>

          {bet.selections.length > 1 && (
            <div className="card" style={{ background: 'var(--surface-2)', padding: 12 }}>
              <Checkbox
                checked={isSystem}
                onChange={setIsSystem}
                label={`${t('bet.playAsSystem')} — ${t('bet.playAsSystem.hint')}`}
              />

              {isSystem && (
                <div className="form-grid" style={{ marginTop: 10 }}>
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
                    hint={`${preview.lines} ${t('bet.lines')}`}
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
                                system: {
                                  sizes: next.length > 0 ? next : [size],
                                  preset: 'custom',
                                },
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
            </div>
          )}
        </div>

        {/* Stake and book */}
        <div className="form-grid">
          <Field
            label={structure === 'system' ? t('bet.unitStake') : t('bet.stake')}
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
              placeholder={settings.defaultBookmaker}
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
              suggestions={['value', 'live', 'fade', 'arb']}
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
                onChange={(v) => patch({ eachWay: v ? { places: 3, fraction: 0.2 } : undefined })}
                label={t('bet.eachWay')}
              />

              {bet.eachWay && (
                <div className="form-grid">
                  <Field label={t('bet.eachWay.places')}>
                    <NumberInput
                      value={bet.eachWay.places}
                      onChange={(v) => patch({ eachWay: { ...bet.eachWay!, places: v ?? 3 } })}
                      min={1}
                      step={1}
                    />
                  </Field>
                  <Field label={t('bet.eachWay.fraction')} hint="1/5 = 0.2">
                    <NumberInput
                      value={bet.eachWay.fraction}
                      onChange={(v) => patch({ eachWay: { ...bet.eachWay!, fraction: v ?? 0.2 } })}
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
                {structure === 'system'
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

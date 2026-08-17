import { useMemo, useState } from 'react';
import { useApp } from '@/state/AppContext';
import { useI18n, type TranslationKey } from '@/i18n';
import {
  allocateCapital,
  dutching,
  hedge,
  marketRtp,
  simulate,
  stakeSuggestion,
  surebet,
  type StakingPlan,
} from '@/core/calculators';
import {
  decimalToAmerican,
  decimalToFractional,
  impliedProbability,
  parseOdds,
} from '@/core/odds';
import { breakdownBy, computeStats } from '@/core/stats';
import { SimulationPath } from '@/components/charts';
import { Card, Field, NumberInput, Select, Stat, signTone } from '@/components/ui';

type ToolKey =
  | 'dutching'
  | 'surebet'
  | 'hedge'
  | 'staking'
  | 'rtp'
  | 'simulation'
  | 'converter'
  | 'allocation';

const TOOLS: { key: ToolKey; icon: string; title: TranslationKey; desc: TranslationKey }[] = [
  { key: 'staking', icon: '🎚', title: 'calc.staking', desc: 'calc.staking.desc' },
  { key: 'hedge', icon: '🔒', title: 'calc.hedge', desc: 'calc.hedge.desc' },
  { key: 'dutching', icon: '🍰', title: 'calc.dutching', desc: 'calc.dutching.desc' },
  { key: 'surebet', icon: '🛡', title: 'calc.surebet', desc: 'calc.surebet.desc' },
  { key: 'rtp', icon: '📉', title: 'calc.rtp', desc: 'calc.rtp.desc' },
  { key: 'simulation', icon: '🎲', title: 'calc.simulation', desc: 'calc.simulation.desc' },
  { key: 'converter', icon: '🔄', title: 'calc.converter', desc: 'calc.converter.desc' },
  { key: 'allocation', icon: '🏦', title: 'calc.allocation', desc: 'calc.allocation.desc' },
];

export default function Calculators() {
  const { t } = useI18n();
  const [tool, setTool] = useState<ToolKey>('staking');

  const active = TOOLS.find((x) => x.key === tool)!;

  return (
    <>
      <header className="page-head">
        <div className="page-head__titles">
          <h1>{t('calc.title')}</h1>
        </div>
      </header>

      <div className="chip-row chip-row--scroll" style={{ marginBottom: 14 }}>
        {TOOLS.map((x) => (
          <button
            key={x.key}
            type="button"
            className={`chip${tool === x.key ? ' is-active' : ''}`}
            onClick={() => setTool(x.key)}
          >
            {x.icon} {t(x.title)}
          </button>
        ))}
      </div>

      <Card title={`${active.icon} ${t(active.title)}`} hint={t(active.desc)}>
        {tool === 'staking' && <StakingTool />}
        {tool === 'hedge' && <HedgeTool />}
        {tool === 'dutching' && <DutchingTool mode="dutching" />}
        {tool === 'surebet' && <DutchingTool mode="surebet" />}
        {tool === 'rtp' && <RtpTool />}
        {tool === 'simulation' && <SimulationTool />}
        {tool === 'converter' && <ConverterTool />}
        {tool === 'allocation' && <AllocationTool />}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Staking
 * ------------------------------------------------------------------ */

function StakingTool() {
  const { t, formatMoney, formatPercent } = useI18n();
  const { currency, activeBankroll, bets } = useApp();

  const defaultBankroll = activeBankroll
    ? activeBankroll.startingCapital + computeStats(bets.filter((b) => b.bankrollId === activeBankroll.id)).profit
    : 1000;

  const [plan, setPlan] = useState<StakingPlan>('fractionalKelly');
  const [bankroll, setBankroll] = useState<number>(Math.max(0, Math.round(defaultBankroll)));
  const [odds, setOdds] = useState<number>(2);
  const [probability, setProbability] = useState<number>(55);
  const [unit, setUnit] = useState<number>(activeBankroll?.defaultStake || 10);
  const [percent, setPercent] = useState<number>(2);
  const [kellyFraction, setKellyFraction] = useState<number>(0.25);
  const [lossStreak, setLossStreak] = useState<number>(0);
  const [targetProfit, setTargetProfit] = useState<number>(50);

  const result = useMemo(
    () =>
      stakeSuggestion({
        plan,
        bankroll,
        odds,
        probability: probability / 100,
        unit,
        percent,
        kellyFraction,
        lossStreak,
        targetProfit,
      }),
    [plan, bankroll, odds, probability, unit, percent, kellyFraction, lossStreak, targetProfit],
  );

  const needsProbability = plan === 'kelly' || plan === 'fractionalKelly';
  const needsUnit = ['flat', 'martingale', 'fibonacci', 'dalembert'].includes(plan);
  const needsStreak = ['martingale', 'fibonacci', 'dalembert'].includes(plan);

  const PLANS: StakingPlan[] = [
    'flat',
    'percentage',
    'kelly',
    'fractionalKelly',
    'levelToWin',
    'martingale',
    'fibonacci',
    'dalembert',
  ];

  return (
    <div className="stack">
      <Field label={t('calc.plan')}>
        <Select
          value={plan}
          onChange={setPlan}
          options={PLANS.map((p) => ({
            value: p,
            label: t(`calc.plan.${p}` as 'calc.plan.flat'),
          }))}
        />
      </Field>

      <div className="form-grid">
        <Field label={`${t('calc.bankroll')} (${currency})`}>
          <NumberInput value={bankroll} onChange={(v) => setBankroll(v ?? 0)} min={0} />
        </Field>
        <Field label={t('bet.odds')}>
          <NumberInput value={odds} onChange={(v) => setOdds(v ?? 1)} min={1} step={0.01} />
        </Field>
        {needsProbability && (
          <Field label={`${t('calc.probability')} (%)`}>
            <NumberInput
              value={probability}
              onChange={(v) => setProbability(v ?? 0)}
              min={0}
              step={0.5}
            />
          </Field>
        )}
        {plan === 'fractionalKelly' && (
          <Field label={t('calc.kellyFraction')} hint="0.25 = 1/4 Kelly">
            <NumberInput
              value={kellyFraction}
              onChange={(v) => setKellyFraction(v ?? 0.25)}
              min={0.01}
              step={0.05}
            />
          </Field>
        )}
        {plan === 'percentage' && (
          <Field label={`${t('calc.percent')} (%)`}>
            <NumberInput value={percent} onChange={(v) => setPercent(v ?? 1)} min={0} step={0.1} />
          </Field>
        )}
        {needsUnit && (
          <Field label={`${t('calc.unit')} (${currency})`}>
            <NumberInput value={unit} onChange={(v) => setUnit(v ?? 0)} min={0} />
          </Field>
        )}
        {needsStreak && (
          <Field label={t('calc.lossStreak')}>
            <NumberInput
              value={lossStreak}
              onChange={(v) => setLossStreak(v ?? 0)}
              min={0}
              step={1}
            />
          </Field>
        )}
        {plan === 'levelToWin' && (
          <Field label={`${t('calc.targetProfit')} (${currency})`}>
            <NumberInput
              value={targetProfit}
              onChange={(v) => setTargetProfit(v ?? 0)}
              min={0}
            />
          </Field>
        )}
      </div>

      {result.warning && (
        <div className={`banner banner--${result.warning === 'noEdge' ? 'warn' : 'info'}`}>
          {t(`calc.warning.${result.warning}` as 'calc.warning.noEdge')}
        </div>
      )}

      <div className="grid grid--kpi">
        <Stat
          label={t('calc.suggestedStake')}
          value={formatMoney(result.stake, currency)}
          sub={`${formatPercent(result.bankrollFraction, 2)} ${t('calc.bankrollFraction')}`}
        />
        <Stat
          label={t('calc.edge')}
          value={formatPercent(result.edge, 2)}
          tone={signTone(result.edge)}
        />
        <Stat
          label={t('calc.expectedValue')}
          value={formatMoney(result.ev, currency, { sign: true })}
          tone={signTone(result.ev)}
        />
        <Stat
          label={t('calc.impliedProbability')}
          value={formatPercent(impliedProbability(odds), 1)}
        />
        <Stat
          label={t('calc.fairOdds')}
          value={probability > 0 ? (100 / probability).toFixed(2) : '—'}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Hedge / cash out
 * ------------------------------------------------------------------ */

function HedgeTool() {
  const { t, formatMoney } = useI18n();
  const { currency } = useApp();

  const [backStake, setBackStake] = useState(100);
  const [backOdds, setBackOdds] = useState(3);
  const [layOdds, setLayOdds] = useState(2.5);
  const [commission, setCommission] = useState(5);

  const result = useMemo(
    () => hedge({ backStake, backOdds, layOdds, commission }),
    [backStake, backOdds, layOdds, commission],
  );

  return (
    <div className="stack">
      <div className="form-grid">
        <Field label={`${t('calc.backStake')} (${currency})`}>
          <NumberInput value={backStake} onChange={(v) => setBackStake(v ?? 0)} min={0} />
        </Field>
        <Field label={t('calc.backOdds')}>
          <NumberInput value={backOdds} onChange={(v) => setBackOdds(v ?? 1)} min={1} step={0.01} />
        </Field>
        <Field label={t('calc.layOdds')}>
          <NumberInput value={layOdds} onChange={(v) => setLayOdds(v ?? 1)} min={1} step={0.01} />
        </Field>
        <Field label={`${t('bet.commission')} (%)`}>
          <NumberInput value={commission} onChange={(v) => setCommission(v ?? 0)} min={0} step={0.5} />
        </Field>
      </div>

      <div className="grid grid--kpi">
        <Stat label={t('calc.layStake')} value={formatMoney(result.layStake, currency)} />
        <Stat
          label={t('bet.liability')}
          value={formatMoney(result.liability, currency)}
          tone="negative"
        />
        <Stat
          label={t('calc.lockedProfit')}
          value={formatMoney(result.lockedProfit, currency, { sign: true })}
          tone={signTone(result.lockedProfit)}
        />
        <Stat
          label={t('calc.ifWins')}
          value={formatMoney(result.profitIfWin, currency, { sign: true })}
          tone={signTone(result.profitIfWin)}
        />
        <Stat
          label={t('calc.ifLoses')}
          value={formatMoney(result.profitIfLose, currency, { sign: true })}
          tone={signTone(result.profitIfLose)}
        />
        <Stat
          label={t('calc.freeBetLay')}
          value={formatMoney(result.freeBetLayStake, currency)}
          sub={t('calc.freeBetLay.hint')}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Dutching / surebet
 * ------------------------------------------------------------------ */

function DutchingTool({ mode }: { mode: 'dutching' | 'surebet' }) {
  const { t, formatMoney, formatPercent } = useI18n();
  const { currency } = useApp();

  const [total, setTotal] = useState(100);
  const [legs, setLegs] = useState<{ odds: number; commission: number }[]>([
    { odds: 2.1, commission: 0 },
    { odds: 2.1, commission: 0 },
  ]);

  const result = useMemo(
    () =>
      mode === 'surebet'
        ? surebet(legs, total)
        : { ...dutching(legs, total), edge: 0 },
    [legs, total, mode],
  );

  const setLeg = (index: number, patch: Partial<{ odds: number; commission: number }>) =>
    setLegs((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  return (
    <div className="stack">
      <Field label={`${t('calc.totalStake')} (${currency})`}>
        <NumberInput value={total} onChange={(v) => setTotal(v ?? 0)} min={0} />
      </Field>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('calc.outcome')}</th>
              <th>{t('bet.odds')}</th>
              <th>{t('bet.commission')} %</th>
              <th>{t('calc.stakePerOutcome')}</th>
              <th>{t('calc.return')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {legs.map((leg, i) => (
              <tr key={i}>
                <td>#{i + 1}</td>
                <td style={{ minWidth: 96 }}>
                  <NumberInput
                    value={leg.odds}
                    onChange={(v) => setLeg(i, { odds: v ?? 1 })}
                    min={1}
                    step={0.01}
                  />
                </td>
                <td style={{ minWidth: 90 }}>
                  <NumberInput
                    value={leg.commission}
                    onChange={(v) => setLeg(i, { commission: v ?? 0 })}
                    min={0}
                    step={0.5}
                  />
                </td>
                <td>{formatMoney(result.stakes[i] ?? 0, currency)}</td>
                <td>{formatMoney(result.returns[i] ?? 0, currency)}</td>
                <td>
                  {legs.length > 2 && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setLegs((prev) => prev.filter((_, x) => x !== i))}
                    >
                      🗑
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="btn btn--sm"
        onClick={() => setLegs((prev) => [...prev, { odds: 2, commission: 0 }])}
      >
        + {t('calc.addOutcome')}
      </button>

      {mode === 'surebet' && (
        <div className={`banner banner--${result.isArb ? 'info' : 'warn'}`}>
          {result.isArb ? `✅ ${t('calc.isArb')}` : `⚠ ${t('calc.noArb')}`}
        </div>
      )}

      <div className="grid grid--kpi">
        <Stat
          label={t('calc.guaranteedProfit')}
          value={formatMoney(result.profit, currency, { sign: true })}
          tone={signTone(result.profit)}
          sub={formatPercent(result.roi, 2)}
        />
        <Stat label={t('calc.overround')} value={formatPercent(result.overround, 2)} />
        <Stat
          label={t('calc.margin')}
          value={formatPercent(result.overround > 0 ? 1 - 1 / result.overround : 0, 2)}
        />
        {mode === 'surebet' && (
          <Stat
            label={t('calc.edge')}
            value={formatPercent(result.edge, 2)}
            tone={signTone(result.edge)}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * RTP / margin
 * ------------------------------------------------------------------ */

function RtpTool() {
  const { t, formatPercent } = useI18n();
  const [odds, setOdds] = useState<number[]>([2.1, 3.4, 3.6]);

  const result = useMemo(() => marketRtp(odds), [odds]);

  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('calc.outcome')}</th>
              <th>{t('bet.odds')}</th>
              <th>{t('calc.impliedProbability')}</th>
              <th>{t('calc.fairOdds')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {odds.map((o, i) => (
              <tr key={i}>
                <td>#{i + 1}</td>
                <td style={{ minWidth: 100 }}>
                  <NumberInput
                    value={o}
                    onChange={(v) =>
                      setOdds((prev) => prev.map((x, idx) => (idx === i ? (v ?? 1) : x)))
                    }
                    min={1}
                    step={0.01}
                  />
                </td>
                <td>{formatPercent(impliedProbability(o), 2)}</td>
                <td>{(result.fairOdds[i] ?? 0) > 0 ? result.fairOdds[i]!.toFixed(3) : '—'}</td>
                <td>
                  {odds.length > 2 && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setOdds((prev) => prev.filter((_, x) => x !== i))}
                    >
                      🗑
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="btn btn--sm"
        onClick={() => setOdds((prev) => [...prev, 2])}
      >
        + {t('calc.addOutcome')}
      </button>

      <div className="grid grid--kpi">
        <Stat label={t('stat.rtp')} value={formatPercent(result.rtp, 2)} />
        <Stat
          label={t('calc.margin')}
          value={formatPercent(result.margin, 2)}
          tone={result.margin > 0 ? 'negative' : 'positive'}
        />
        <Stat label={t('calc.overround')} value={formatPercent(result.overround, 2)} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Simulation
 * ------------------------------------------------------------------ */

function SimulationTool() {
  const { t, formatMoney, formatPercent } = useI18n();
  const { currency } = useApp();

  const [bets, setBets] = useState(200);
  const [stake, setStake] = useState(10);
  const [odds, setOdds] = useState(2);
  const [winRate, setWinRate] = useState(55);
  const [startingBankroll, setStartingBankroll] = useState(1000);
  const [compounding, setCompounding] = useState(false);

  const result = useMemo(
    () =>
      simulate({
        bets,
        stake,
        odds,
        winRate: winRate / 100,
        startingBankroll,
        compounding,
        runs: 2000,
        seed: 42,
      }),
    [bets, stake, odds, winRate, startingBankroll, compounding],
  );

  return (
    <div className="stack">
      <div className="form-grid">
        <Field label={t('calc.numBets')}>
          <NumberInput value={bets} onChange={(v) => setBets(Math.max(1, v ?? 1))} min={1} step={10} />
        </Field>
        <Field label={`${t('bet.stake')} (${currency})`}>
          <NumberInput value={stake} onChange={(v) => setStake(v ?? 0)} min={0} />
        </Field>
        <Field label={t('bet.odds')}>
          <NumberInput value={odds} onChange={(v) => setOdds(v ?? 1)} min={1} step={0.01} />
        </Field>
        <Field label={`${t('calc.winRate')} (%)`}>
          <NumberInput value={winRate} onChange={(v) => setWinRate(v ?? 0)} min={0} step={1} />
        </Field>
        <Field label={`${t('calc.startingBankroll')} (${currency})`}>
          <NumberInput
            value={startingBankroll}
            onChange={(v) => setStartingBankroll(v ?? 0)}
            min={0}
          />
        </Field>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={compounding}
          onChange={(e) => setCompounding(e.target.checked)}
        />
        <span>{t('calc.compounding')}</span>
      </label>

      <div className="grid grid--kpi">
        <Stat
          label={t('calc.expectedProfit')}
          value={formatMoney(result.expectedProfit, currency, { sign: true })}
          tone={signTone(result.expectedProfit)}
          sub={formatPercent(result.expectedYield, 2)}
        />
        <Stat
          label={t('calc.median')}
          value={formatMoney(result.median, currency, { sign: true })}
          tone={signTone(result.median)}
        />
        <Stat
          label={t('calc.percentile', { p: 5 })}
          value={formatMoney(result.p5, currency, { sign: true })}
          tone={signTone(result.p5)}
        />
        <Stat
          label={t('calc.percentile', { p: 95 })}
          value={formatMoney(result.p95, currency, { sign: true })}
          tone={signTone(result.p95)}
        />
        <Stat
          label={t('calc.lossProbability')}
          value={formatPercent(result.lossProbability)}
          tone={result.lossProbability > 0.5 ? 'negative' : 'default'}
        />
        <Stat
          label={t('calc.ruinProbability')}
          value={formatPercent(result.ruinProbability)}
          tone={result.ruinProbability > 0 ? 'negative' : 'positive'}
        />
      </div>

      <div>
        <h3 className="card__title" style={{ marginBottom: 8 }}>
          {t('calc.samplePath')}
        </h3>
        <SimulationPath
          path={result.samplePath}
          currency={currency}
          startingBankroll={startingBankroll}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Odds converter
 * ------------------------------------------------------------------ */

function ConverterTool() {
  const { t, formatPercent } = useI18n();
  const [text, setText] = useState('2.00');

  const decimal = useMemo(() => parseOdds(text) ?? 0, [text]);
  const valid = decimal > 1;
  const [num, den] = valid ? decimalToFractional(decimal) : [0, 1];
  const american = valid ? decimalToAmerican(decimal) : 0;

  return (
    <div className="stack">
      <Field
        label={t('bet.odds')}
        hint="2.50 · +150 · -200 · 3/2"
      >
        <input
          className="input input--num"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="2.00"
        />
      </Field>

      <div className="grid grid--kpi">
        <Stat label={t('calc.decimal')} value={valid ? decimal.toFixed(3) : '—'} />
        <Stat label={t('calc.american')} value={valid ? (american > 0 ? `+${american}` : String(american)) : '—'} />
        <Stat label={t('calc.fractional')} value={valid ? `${num}/${den}` : '—'} />
        <Stat
          label={t('calc.impliedProbability')}
          value={valid ? formatPercent(impliedProbability(decimal), 2) : '—'}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Capital allocation
 * ------------------------------------------------------------------ */

function AllocationTool() {
  const { t, formatMoney, formatPercent } = useI18n();
  const { currency, scopedBets, activeBankroll } = useApp();

  const [capital, setCapital] = useState(activeBankroll?.startingCapital || 1000);

  const turnoverByBookmaker = useMemo(
    () =>
      breakdownBy(scopedBets, (b) => b.bookmaker || t('common.unknown')).map((row) => ({
        bookmaker: row.label,
        turnover: row.turnover,
      })),
    [scopedBets, t],
  );

  const rows = useMemo(
    () => allocateCapital(turnoverByBookmaker, capital),
    [turnoverByBookmaker, capital],
  );

  return (
    <div className="stack">
      <Field label={`${t('calc.bankroll')} (${currency})`} hint={t('calc.allocation.hint')}>
        <NumberInput value={capital} onChange={(v) => setCapital(v ?? 0)} min={0} />
      </Field>

      {rows.length === 0 ? (
        <div className="banner banner--info">{t('analytics.noData')}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('bet.bookmaker')}</th>
                <th>{t('calc.share')}</th>
                <th>{t('stat.turnover')}</th>
                <th>{t('calc.suggested')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.bookmaker}>
                  <td>{row.bookmaker}</td>
                  <td>{formatPercent(row.share, 1)}</td>
                  <td>
                    {formatMoney(
                      turnoverByBookmaker.find((b) => b.bookmaker === row.bookmaker)?.turnover ?? 0,
                      currency,
                      { compact: true },
                    )}
                  </td>
                  <td>
                    <strong>{formatMoney(row.suggested, currency)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

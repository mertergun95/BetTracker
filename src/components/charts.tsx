import { useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useI18n } from '@/i18n';
import type { CurvePoint } from '@/core/stats';

/**
 * Charts.
 *
 * Colour rule for this file: marks encode profit polarity with the validated
 * blue<->red diverging pair (`--viz-pos` / `--viz-neg`), never green/red.
 * Green/red is reserved for text, where the printed +/- sign already carries
 * the meaning; in a heatmap cell colour is the only encoding and green/red
 * fails colourblind separation.
 */

const AXIS_STYLE = {
  fontSize: 11,
  fill: 'var(--viz-axis)',
} as const;

/* ------------------------------------------------------------------ *
 * Capital growth curve
 * ------------------------------------------------------------------ */

export function EquityChart({
  points,
  currency,
  mode = 'profit',
  height = 240,
}: {
  points: CurvePoint[];
  currency: string;
  /** 'profit' plots cumulative profit; 'balance' plots the bankroll. */
  mode?: 'profit' | 'balance';
  height?: number;
}) {
  const { formatMoney, formatDate, t } = useI18n();

  const data = useMemo(
    () => points.map((p) => ({ t: p.t, value: mode === 'profit' ? p.profit : p.balance })),
    [points, mode],
  );

  if (data.length < 2) {
    return (
      <div className="empty" style={{ padding: 32 }}>
        <div className="small">{t('analytics.noData')}</div>
      </div>
    );
  }

  const last = data[data.length - 1]!.value;
  const baseline = mode === 'profit' ? 0 : (data[0]?.value ?? 0);
  const up = last >= baseline;
  const color = up ? 'var(--viz-pos)' : 'var(--viz-neg)';
  const gradientId = `equity-${mode}-${up ? 'up' : 'down'}`;

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => formatDate(v)}
            tick={AXIS_STYLE}
            axisLine={false}
            tickLine={false}
            minTickGap={44}
          />
          <YAxis
            tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
            tick={AXIS_STYLE}
            axisLine={false}
            tickLine={false}
            width={62}
          />
          <ReferenceLine y={baseline} stroke="var(--viz-axis)" strokeDasharray="3 3" />
          <Tooltip
            cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const value = payload[0]?.value as number;
              return (
                <div className="chart__tooltip">
                  <div className="chart__tooltip-label">{formatDate(Number(label), 'long')}</div>
                  <div className="chart__tooltip-value">
                    {formatMoney(value, currency, { sign: mode === 'profit' })}
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--viz-surface)' }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Profit calendar
 * ------------------------------------------------------------------ */

/**
 * Buckets a value onto the 5-step diverging ramp, returning the fill and the
 * ink that stays legible on it in both themes.
 */
function rampColor(value: number, maxAbs: number): { background: string; color: string } {
  if (value === 0 || maxAbs <= 0) {
    return { background: 'var(--surface-3)', color: 'var(--text-muted)' };
  }
  const intensity = Math.min(1, Math.abs(value) / maxAbs);
  const step = Math.max(1, Math.ceil(intensity * 5));
  const slot = value > 0 ? 'pos' : 'neg';
  return {
    background: `var(--viz-${slot}-${step})`,
    color: `var(--viz-${slot}-${step}-ink)`,
  };
}

export function ProfitCalendar({
  daily,
  currency,
  months = 6,
}: {
  daily: Map<string, { profit: number; count: number }>;
  currency: string;
  months?: number;
}) {
  const { t, formatMoney, locale } = useI18n();
  const [hover, setHover] = useState<{ key: string; profit: number; count: number } | null>(null);

  const maxAbs = useMemo(() => {
    let max = 0;
    for (const { profit } of daily.values()) max = Math.max(max, Math.abs(profit));
    return max;
  }, [daily]);

  // Render the last `months` calendar months, oldest first.
  const monthBlocks = useMemo(() => {
    const now = new Date();
    const blocks: { year: number; month: number; days: (string | null)[] }[] = [];

    for (let offset = months - 1; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      // Shift so the grid starts on Monday.
      const leading = (new Date(year, month, 1).getDay() + 6) % 7;

      const days: (string | null)[] = Array.from({ length: leading }, () => null);
      for (let day = 1; day <= daysInMonth; day++) {
        days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
      blocks.push({ year, month, days });
    }

    return blocks;
  }, [months]);

  const monthName = (year: number, month: number) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
      new Date(year, month, 1),
    );

  const dowLabels = [0, 1, 2, 3, 4, 5, 6] as const;

  return (
    <div className="calendar">
      <div className="grid grid--3">
        {monthBlocks.map((block) => (
          <div className="calendar__month" key={`${block.year}-${block.month}`}>
            <div className="calendar__month-name">{monthName(block.year, block.month)}</div>
            <div className="calendar__grid">
              {dowLabels.map((d) => (
                <div className="calendar__dow" key={d}>
                  {t(`weekday.short.${d}` as `weekday.short.0`)}
                </div>
              ))}
              {block.days.map((key, i) => {
                if (key === null) {
                  return <div className="calendar__cell calendar__cell--empty" key={`pad-${i}`} />;
                }
                const entry = daily.get(key);
                const profit = entry?.profit ?? 0;
                const dayNumber = Number(key.slice(-2));
                const label = entry
                  ? `${key}: ${formatMoney(profit, currency, { sign: true })} · ${t('calendar.betsCount', { count: entry.count })}`
                  : `${key}: ${t('calendar.noBets')}`;
                return (
                  <div
                    key={key}
                    className={`calendar__cell${entry ? ' calendar__cell--has-bets' : ''}`}
                    style={entry ? rampColor(profit, maxAbs) : undefined}
                    title={label}
                    aria-label={label}
                    onMouseEnter={() =>
                      setHover(entry ? { key, profit, count: entry.count } : null)
                    }
                    onMouseLeave={() => setHover(null)}
                  >
                    {dayNumber}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="calendar__scale">
        <span>{t('calendar.legend.loss')}</span>
        {['--viz-neg-5', '--viz-neg-3', '--viz-neg-1'].map((v) => (
          <span key={v} className="calendar__scale-swatch" style={{ background: `var(${v})` }} />
        ))}
        <span className="calendar__scale-swatch" style={{ background: 'var(--surface-3)' }} />
        {['--viz-pos-1', '--viz-pos-3', '--viz-pos-5'].map((v) => (
          <span key={v} className="calendar__scale-swatch" style={{ background: `var(${v})` }} />
        ))}
        <span>{t('calendar.legend.profit')}</span>
      </div>

      {hover && (
        <div className="center small muted">
          {t('calendar.profitOn', { date: hover.key })}:{' '}
          <strong className="num">{formatMoney(hover.profit, currency, { sign: true })}</strong> ·{' '}
          {t('calendar.betsCount', { count: hover.count })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Horizontal breakdown bars
 * ------------------------------------------------------------------ */

export interface HBarDatum {
  key: string;
  label: string;
  value: number;
  sub?: ReactNode;
}

/**
 * Signed horizontal bars around a zero line. Every bar carries its own value
 * label, so colour is never the only encoding.
 */
export function HBarList({
  data,
  format,
  max = 12,
}: {
  data: HBarDatum[];
  format: (value: number) => string;
  max?: number;
}) {
  const { t } = useI18n();
  const shown = data.slice(0, max);

  const maxAbs = useMemo(
    () => shown.reduce((acc, d) => Math.max(acc, Math.abs(d.value)), 0),
    [shown],
  );

  if (shown.length === 0) {
    return <div className="empty small">{t('analytics.noData')}</div>;
  }

  // Bars grow from a central zero line when the data has both signs, and from
  // the left edge when it is all one sign.
  const hasNegative = shown.some((d) => d.value < 0);
  const hasPositive = shown.some((d) => d.value > 0);
  const zeroPct = hasNegative && hasPositive ? 50 : hasNegative ? 100 : 0;
  const scale = hasNegative && hasPositive ? 50 : 100;

  return (
    <div>
      {shown.map((d) => {
        const width = maxAbs > 0 ? (Math.abs(d.value) / maxAbs) * scale : 0;
        const positive = d.value >= 0;
        return (
          <div className="hbar" key={d.key}>
            <span className="hbar__label" title={d.label}>
              {d.label}
              {d.sub && <span className="faint tiny"> · {d.sub}</span>}
            </span>
            <div className="hbar__track">
              <span className="hbar__zero" style={{ left: `${zeroPct}%` }} />
              <span
                className="hbar__fill"
                style={{
                  background: positive ? 'var(--viz-pos)' : 'var(--viz-neg)',
                  width: `${width}%`,
                  left: positive ? `${zeroPct}%` : `${zeroPct - width}%`,
                }}
              />
            </div>
            <span className={`hbar__value ${positive ? 'is-positive' : 'is-negative'}`}>
              {format(d.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Outcome distribution
 * ------------------------------------------------------------------ */

export interface DistributionDatum {
  key: string;
  label: string;
  value: number;
  /** Signed value driving the colour; defaults to `value`. */
  signal?: number;
}

export function DistributionChart({
  data,
  format,
  height = 220,
}: {
  data: DistributionDatum[];
  format: (value: number) => string;
  height?: number;
}) {
  const { t } = useI18n();

  if (data.length === 0) {
    return <div className="empty small">{t('analytics.noData')}</div>;
  }

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <YAxis
            tick={AXIS_STYLE}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={format}
          />
          <ReferenceLine y={0} stroke="var(--viz-axis)" />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="chart__tooltip">
                  <div className="chart__tooltip-label">{String(label)}</div>
                  <div className="chart__tooltip-value">{format(payload[0]?.value as number)}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell
                key={d.key}
                fill={(d.signal ?? d.value) >= 0 ? 'var(--viz-pos)' : 'var(--viz-neg)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Simulation fan
 * ------------------------------------------------------------------ */

export function SimulationPath({
  path,
  currency,
  startingBankroll,
  height = 200,
}: {
  path: number[];
  currency: string;
  startingBankroll: number;
  height?: number;
}) {
  const { formatMoney, t } = useI18n();
  const data = useMemo(() => path.map((value, i) => ({ i, value })), [path]);

  if (data.length < 2) return <div className="empty small">{t('analytics.noData')}</div>;

  const final = data[data.length - 1]!.value;
  const up = final >= startingBankroll;
  const color = up ? 'var(--viz-pos)' : 'var(--viz-neg)';

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sim-${up ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="i" tick={AXIS_STYLE} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis
            tick={AXIS_STYLE}
            axisLine={false}
            tickLine={false}
            width={62}
            tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
          />
          <ReferenceLine y={startingBankroll} stroke="var(--viz-axis)" strokeDasharray="3 3" />
          <Tooltip
            cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="chart__tooltip">
                  <div className="chart__tooltip-label">#{String(label)}</div>
                  <div className="chart__tooltip-value">
                    {formatMoney(payload[0]?.value as number, currency)}
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#sim-${up ? 'up' : 'down'})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

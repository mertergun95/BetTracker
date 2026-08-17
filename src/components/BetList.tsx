import { useI18n } from '@/i18n';
import { formatOdds } from '@/core/odds';
import { combinedOdds, isSettled, settleBet } from '@/core/settlement';
import { systemLabel } from '@/core/systems';
import { sportIcon } from '@/core/reference';
import type { Bet, OddsFormat } from '@/core/types';
import { StatusBadge } from './ui';

/**
 * The bet row. Shows the whole bet at a glance and expands multi-leg bets
 * inline, because the legs are the reason a multiple won or lost.
 */
export function BetRow({
  bet,
  currency,
  oddsFormat,
  selected,
  selectable,
  onToggleSelect,
  onOpen,
}: {
  bet: Bet;
  currency: string;
  oddsFormat: OddsFormat;
  selected?: boolean;
  selectable?: boolean;
  onToggleSelect?: () => void;
  onOpen?: () => void;
}) {
  const { t, formatMoney, formatDate } = useI18n();
  const settlement = settleBet(bet);
  const settled = isSettled(bet);
  const multi = bet.selections.length > 1;
  const first = bet.selections[0];

  const title = multi
    ? `${bet.selections.length}× ${
        bet.structure === 'system'
          ? systemLabel(bet.system ?? { sizes: [2] }, bet.selections.length)
          : t('bet.structure.accumulator')
      }`
    : (first?.event || first?.picks[0]?.pick || '—');

  return (
    <div className={`bet-item${selected ? ' is-selected' : ''}`}>
      {selectable && (
        <input
          type="checkbox"
          checked={Boolean(selected)}
          onChange={onToggleSelect}
          style={{ marginTop: 3, width: 17, height: 17, accentColor: 'var(--accent)' }}
          aria-label={t('action.select')}
        />
      )}

      <button
        type="button"
        onClick={onOpen}
        className="bet-item__body"
        style={{ textAlign: 'left', background: 'none', padding: 0 }}
      >
        <div className="bet-item__top">
          <span className="bet-item__event">
            {first && !multi && `${sportIcon(first.sport)} `}
            {title}
          </span>
          <StatusBadge status={settlement.status} />
          {bet.freeBet && <span className="badge">{t('bet.freeBet')}</span>}
          {bet.eachWay && <span className="badge">E/W</span>}
          {first?.side === 'lay' && <span className="badge">{t('bet.side.lay')}</span>}
          {!multi && (first?.picks.length ?? 0) > 1 && (
            <span className="badge badge--pending">
              {t('bet.builder')} ×{first!.picks.length}
            </span>
          )}
        </div>

        {!multi && first && (
          <div className="bet-item__meta">
            {/* Several picks on one event means a bet builder; show them all. */}
            <span>
              {first.picks
                .map((p) => p.pick || p.market)
                .filter(Boolean)
                .join('  +  ') || '—'}
            </span>
            {first.competition && <span className="bet-item__dot">{first.competition}</span>}
          </div>
        )}

        <div className="bet-item__meta">
          <span>{formatDate(bet.placedAt, 'dateTime')}</span>
          {bet.bookmaker && <span className="bet-item__dot">{bet.bookmaker}</span>}
          <span className="bet-item__dot">
            @ {formatOdds(combinedOdds(bet), oddsFormat)}
          </span>
          {bet.tipster && <span className="bet-item__dot">{bet.tipster}</span>}
        </div>

        {bet.tags.length > 0 && (
          <div className="chip-row" style={{ marginTop: 5 }}>
            {bet.tags.map((tag) => (
              <span key={tag} className="badge">
                {tag}
              </span>
            ))}
          </div>
        )}

        {multi && (
          <div className="bet-item__legs">
            {bet.selections.map((s) => (
              <div className="bet-item__leg" key={s.id}>
                <span>{sportIcon(s.sport)}</span>
                <span className="truncate" style={{ flex: 1 }}>
                  {s.event || '—'}
                  {s.picks.some((p) => p.pick)
                    ? ` · ${s.picks.map((p) => p.pick).filter(Boolean).join(' + ')}`
                    : ''}
                </span>
                <span className="num">{formatOdds(s.odds, oddsFormat)}</span>
                <span
                  className={
                    s.status === 'won'
                      ? 'is-positive'
                      : s.status === 'lost'
                        ? 'is-negative'
                        : 'faint'
                  }
                >
                  {s.status === 'won' ? '✓' : s.status === 'lost' ? '✗' : '•'}
                </span>
              </div>
            ))}
          </div>
        )}
      </button>

      <div className="bet-item__right">
        <div
          className={`bet-item__profit ${
            !settled ? 'is-neutral' : settlement.profit > 0 ? 'is-positive' : settlement.profit < 0 ? 'is-negative' : 'is-neutral'
          }`}
        >
          {settled
            ? formatMoney(settlement.profit, currency, { sign: true })
            : formatMoney(settlement.risk, currency)}
        </div>
        <div className="bet-item__stake">
          {settled
            ? `${t('bet.stake')} ${formatMoney(settlement.totalStake, currency)}`
            : t('status.pending')}
        </div>
      </div>
    </div>
  );
}

export default function BetList({
  bets,
  currency,
  oddsFormat,
  selectedIds,
  onToggleSelect,
  onOpen,
  selectable,
}: {
  bets: Bet[];
  currency: string;
  oddsFormat: OddsFormat;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onOpen?: (bet: Bet) => void;
  selectable?: boolean;
}) {
  return (
    <div>
      {bets.map((bet) => (
        <BetRow
          key={bet.id}
          bet={bet}
          currency={currency}
          oddsFormat={oddsFormat}
          selectable={selectable}
          selected={selectedIds?.has(bet.id)}
          onToggleSelect={() => onToggleSelect?.(bet.id)}
          onOpen={() => onOpen?.(bet)}
        />
      ))}
    </div>
  );
}

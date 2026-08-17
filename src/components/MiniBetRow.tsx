import { useI18n } from '@/i18n';
import { formatOdds } from '@/core/odds';
import { combinedOdds, isSettled, potentialReturn, settleBet } from '@/core/settlement';
import { sportIcon } from '@/core/reference';
import type { Bet, OddsFormat } from '@/core/types';

/** Compact one-line bet, used by the dashboard panels where space is tight. */
export default function MiniBetRow({
  bet,
  currency,
  oddsFormat,
  onOpen,
}: {
  bet: Bet;
  currency: string;
  oddsFormat: OddsFormat;
  onOpen?: () => void;
}) {
  const { t, formatMoney, formatDate } = useI18n();
  const settlement = settleBet(bet);
  const settled = isSettled(bet);
  const first = bet.selections[0];
  const multi = bet.selections.length > 1;

  const title = multi
    ? `${bet.selections.length}× ${t('bet.structure.accumulator')}`
    : (first?.event || first?.picks[0]?.pick || '—');

  // Open bets show what is riding on them; settled ones show the result.
  const amount = settled ? settlement.profit : potentialReturn(bet) - settlement.totalStake;
  const tone = settled
    ? settlement.profit > 0
      ? 'is-positive'
      : settlement.profit < 0
        ? 'is-negative'
        : 'is-neutral'
    : 'is-neutral';

  const kickoff = first?.eventAt;

  return (
    <button type="button" className="mini-bet" onClick={onOpen}>
      <div className="mini-bet__body">
        <div className="mini-bet__event">
          {first && !multi && `${sportIcon(first.sport)} `}
          {title}
        </div>
        <div className="mini-bet__meta">
          {!multi && first?.picks.map((p) => p.pick).filter(Boolean).join(' + ')}
          {!multi && first?.picks.some((p) => p.pick) ? ' · ' : ''}
          {formatOdds(combinedOdds(bet), oddsFormat)} · {formatMoney(settlement.totalStake, currency)}
          {!settled && kickoff ? ` · ${formatDate(kickoff, 'dateTime')}` : ''}
          {settled && bet.settledAt ? ` · ${formatDate(bet.settledAt)}` : ''}
        </div>
      </div>
      <div className="mini-bet__right">
        <div className={tone}>
          {settled
            ? formatMoney(settlement.profit, currency, { sign: true })
            : formatMoney(potentialReturn(bet), currency)}
        </div>
        <div className="mini-bet__sub">
          {settled ? bet.bookmaker : `+${formatMoney(amount, currency, { compact: true })}`}
        </div>
      </div>
    </button>
  );
}

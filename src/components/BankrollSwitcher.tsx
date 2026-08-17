import { useApp } from '@/state/AppContext';
import { useI18n } from '@/i18n';

/** Scope selector shown in every page header. */
export default function BankrollSwitcher() {
  const { t } = useI18n();
  const { bankrolls, activeBankrollId, setActiveBankrollId } = useApp();
  const visible = bankrolls.filter((b) => !b.archived || b.id === activeBankrollId);

  if (visible.length <= 1) return null;

  return (
    <select
      className="select"
      style={{ width: 'auto', minWidth: 150 }}
      value={activeBankrollId ?? ''}
      onChange={(e) => setActiveBankrollId(e.target.value || null)}
      aria-label={t('bankroll.switch')}
    >
      <option value="">{t('bankroll.allBankrolls')}</option>
      {visible.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
          {b.archived ? ` (${t('bankroll.archived')})` : ''}
        </option>
      ))}
    </select>
  );
}

import { Link } from 'react-router-dom';
import { useApp } from '@/state/AppContext';
import { useI18n, type TranslationKey } from '@/i18n';

/**
 * Small persistent sync badge.
 *
 * Only appears once sync is configured, and only says something when there is
 * something to say — a silent success stays silent after a moment.
 */
export default function SyncIndicator() {
  const { t } = useI18n();
  const { sync, settings, syncNow } = useApp();

  if (!settings.sync?.token) return null;
  if (sync.status === 'off' || sync.status === 'idle') return null;

  const dotClass =
    sync.status === 'syncing'
      ? 'sync-dot sync-dot--busy'
      : sync.status === 'error'
        ? 'sync-dot sync-dot--error'
        : 'sync-dot sync-dot--ok';

  const label =
    sync.status === 'syncing'
      ? t('sync.syncing')
      : sync.status === 'error'
        ? t(`sync.error.${sync.errorCode ?? 'http'}` as TranslationKey)
        : t('sync.done', { bets: sync.lastStats?.bets ?? 0 });

  return (
    <div className={`sync-badge${sync.status === 'error' ? ' sync-badge--error' : ''}`}>
      <span className={dotClass} />
      <span className="truncate">{label}</span>
      {sync.status === 'error' && (
        <>
          <button type="button" className="btn btn--sm" onClick={() => void syncNow()}>
            {t('sync.now')}
          </button>
          <Link to="/settings" className="btn btn--ghost btn--sm">
            {t('nav.settings')}
          </Link>
        </>
      )}
    </div>
  );
}

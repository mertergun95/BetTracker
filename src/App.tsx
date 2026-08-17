import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from '@/state/AppContext';
import { I18nProvider, useI18n } from '@/i18n';
import Logo from '@/components/Logo';
import SyncIndicator from '@/components/SyncIndicator';
import Dashboard from '@/screens/Dashboard';
import Bets from '@/screens/Bets';
import Bankrolls from '@/screens/Bankrolls';
import Analytics from '@/screens/Analytics';
import Calculators from '@/screens/Calculators';
import Settings from '@/screens/Settings';

/**
 * The router is a HashRouter on purpose: GitHub Pages serves static files with
 * no rewrite rule, and the Capacitor Android build loads from file://. Both
 * would 404 on a deep path reload with a browser router.
 */

const NAV = [
  { to: '/', icon: '📊', key: 'nav.dashboard' },
  { to: '/bets', icon: '🎯', key: 'nav.bets' },
  { to: '/analytics', icon: '📈', key: 'nav.analytics' },
  { to: '/tools', icon: '🧮', key: 'nav.calculators' },
  { to: '/bankrolls', icon: '💰', key: 'nav.bankrolls' },
  { to: '/settings', icon: '⚙️', key: 'nav.settings' },
] as const;

function Shell() {
  const { t } = useI18n();
  const { ready, settings, updateSettings } = useApp();

  if (!ready) {
    return (
      <div className="splash">
        <Logo size={44} />
        <div className="spinner" />
        <span className="small">{t('common.loading')}</span>
      </div>
    );
  }

  const pinned = settings.sidebarPinned;

  return (
    <div className="app">
      <aside className={`sidebar${pinned ? ' sidebar--pinned' : ''}`}>
        <div className="sidebar__brand">
          <Logo size={32} title={t('app.name')} />
          <span className="sidebar__label">{t('app.name')}</span>
        </div>

        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `sidebar__item${isActive ? ' is-active' : ''}`}
            title={t(item.key)}
          >
            <span className="sidebar__icon">{item.icon}</span>
            <span className="sidebar__label">{t(item.key)}</span>
          </NavLink>
        ))}

        <button
          type="button"
          className="sidebar__pin"
          onClick={() => updateSettings({ sidebarPinned: !pinned })}
          title={pinned ? t('nav.unpin') : t('nav.pin')}
        >
          <span className="sidebar__icon">{pinned ? '◀' : '▶'}</span>
          <span className="sidebar__label">{pinned ? t('nav.unpin') : t('nav.pin')}</span>
        </button>
      </aside>

      <div className={`sidebar-spacer${pinned ? ' sidebar-spacer--pinned' : ''}`} />

      <div className="main">
        <div className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/bets" element={<Bets />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/tools" element={<Calculators />} />
            <Route path="/bankrolls" element={<Bankrolls />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>

      <nav className="tabbar">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `tabbar__item${isActive ? ' is-active' : ''}`}
          >
            <span className="tabbar__icon">{item.icon}</span>
            <span>{t(item.key)}</span>
          </NavLink>
        ))}
      </nav>

      <SyncIndicator />
    </div>
  );
}

/** Bridges the persisted language setting into the i18n provider. */
function Localised() {
  const { settings } = useApp();
  return (
    <I18nProvider language={settings.language}>
      <Shell />
    </I18nProvider>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <Localised />
      </AppProvider>
    </HashRouter>
  );
}

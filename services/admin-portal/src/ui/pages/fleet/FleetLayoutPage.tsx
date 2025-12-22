import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function FleetLayoutPage() {
  const { t } = useTranslation()

  return (
    <div style={styles.wrap}>
      <div>
        <div style={styles.hTitle}>{t('fleet.layout.title')}</div>
        <div style={styles.hSub}>{t('fleet.layout.subtitle')}</div>
      </div>

      <nav style={styles.tabs}>
        <NavLink to="ships" end style={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}>
          {t('fleet.layout.tabs.ships')}
        </NavLink>
        <NavLink to="categories" style={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}>
          {t('fleet.layout.tabs.categories')}
        </NavLink>
        <NavLink to="cabins" style={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}>
          {t('fleet.layout.tabs.cabins')}
        </NavLink>
      </nav>

      <div style={styles.body}>
        <Outlet />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'grid', gap: 12 },
  body: { display: 'grid' },
  hTitle: { fontSize: 22, fontWeight: 900 },
  hSub: { color: 'var(--csp-muted, rgba(230,237,243,0.7))', fontSize: 13, marginTop: 2 },
  tabs: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    paddingBottom: 10,
  },
  tab: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-border-strong, rgba(255,255,255,0.10))',
    background: 'color-mix(in srgb, var(--csp-surface-bg, rgba(255,255,255,0.06)) 88%, transparent)',
    color: 'var(--csp-text, #e6edf3)',
    textDecoration: 'none',
    fontWeight: 800,
  },
  tabActive: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-primary-border, rgba(56,139,253,0.55))',
    background: 'var(--csp-primary-soft, rgba(56,139,253,0.22))',
    color: 'var(--csp-text, #e6edf3)',
    textDecoration: 'none',
    fontWeight: 900,
  },
}

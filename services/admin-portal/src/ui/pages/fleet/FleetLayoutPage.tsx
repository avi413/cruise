import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'

export function FleetLayoutPage() {
  return (
    <div style={styles.wrap}>
      <div>
        <div style={styles.hTitle}>Fleet</div>
        <div style={styles.hSub}>Manage ships, cabin categories, and cabins.</div>
      </div>

      <nav style={styles.tabs}>
        <NavLink to="ships" end style={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}>
          Ships
        </NavLink>
        <NavLink to="categories" style={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}>
          Cabin categories
        </NavLink>
        <NavLink to="cabins" style={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}>
          Cabins
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
  hSub: { color: 'var(--csp-muted)', fontSize: 13, marginTop: 2, lineHeight: 1.45 },
  tabs: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    borderBottom: '1px solid var(--csp-border)',
    paddingBottom: 10,
  },
  tab: {
    padding: '8px 10px',
    borderRadius: 999,
    border: '1px solid var(--csp-border)',
    background: 'var(--csp-surface-bg)',
    boxShadow: 'var(--csp-shadow-sm)',
    color: 'var(--csp-text)',
    textDecoration: 'none',
    fontWeight: 800,
  },
  tabActive: {
    padding: '8px 10px',
    borderRadius: 999,
    border: '1px solid var(--csp-primary-border)',
    background: 'var(--csp-primary-soft)',
    color: 'color-mix(in srgb, var(--csp-primary) 72%, var(--csp-text))',
    textDecoration: 'none',
    fontWeight: 900,
  },
}


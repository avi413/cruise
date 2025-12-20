import React from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { decodeJwt } from './jwt'
import { getCompany, getToken, setCompany, setToken } from './storage'

export function Shell(props: { apiBase: string }) {
  const nav = useNavigate()
  const company = getCompany()
  const token = getToken()
  const role = decodeJwt(token)?.role || 'unknown'

  function logout() {
    setToken(null)
    setCompany(null)
    nav('/company')
  }

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.brandTop}>Customer Service</div>
          <div style={styles.brandSub}>{company ? `${company.name} (${company.code})` : 'No company selected'}</div>
        </div>

        <nav style={styles.nav}>
          <NavLink to="/app/dashboard" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)}>
            Dashboard
          </NavLink>
          <NavLink to="/app/sales" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)}>
            Sales (Quote / Hold / Confirm)
          </NavLink>
          <NavLink to="/app/customers" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)}>
            Customers
          </NavLink>
          <NavLink to="/app/sailings" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)}>
            Sailings & Itineraries
          </NavLink>
          <NavLink to="/app/fleet" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)}>
            Fleet & Cabins
          </NavLink>
          {role === 'admin' ? (
            <NavLink to="/app/users" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)}>
              Users & Permissions
            </NavLink>
          ) : null}
        </nav>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Session</div>
          <div style={styles.muted}>Role: {role}</div>
          <div style={styles.muted}>
            API:{' '}
            <Link to={`${props.apiBase}/docs`} target="_blank" style={styles.inlineLink}>
              Edge docs
            </Link>
          </div>
          <button style={styles.dangerBtn} onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr',
    height: '100vh',
    background: '#0b1220',
    color: '#e6edf3',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
  },
  sidebar: {
    borderRight: '1px solid rgba(255,255,255,0.08)',
    padding: 16,
    background: 'linear-gradient(180deg, #0b1220 0%, #0b1220 30%, #0b1220 100%)',
    overflow: 'auto',
  },
  brand: { marginBottom: 14 },
  brandTop: { fontWeight: 800, fontSize: 18, letterSpacing: 0.2 },
  brandSub: { color: 'rgba(230,237,243,0.7)', fontSize: 12, marginTop: 4 },
  nav: { display: 'grid', gap: 8, marginBottom: 16 },
  navBtn: {
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.06)',
    color: '#e6edf3',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
    textDecoration: 'none',
  },
  navActive: {
    padding: '10px 12px',
    background: 'rgba(56,139,253,0.22)',
    color: '#e6edf3',
    border: '1px solid rgba(56,139,253,0.55)',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
    textDecoration: 'none',
  },
  main: { padding: 18, overflow: 'auto' },
  card: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
  },
  cardTitle: { fontWeight: 800, marginBottom: 8 },
  muted: { color: 'rgba(230,237,243,0.7)', fontSize: 12, marginBottom: 8 },
  inlineLink: { color: '#9ecbff', textDecoration: 'none' },
  dangerBtn: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(248,81,73,0.35)',
    background: 'rgba(248,81,73,0.12)',
    color: '#ffb4ae',
    cursor: 'pointer',
    fontWeight: 800,
  },
}


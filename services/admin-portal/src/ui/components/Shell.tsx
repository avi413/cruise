import React, { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { decodeJwt, permsFromClaims } from './jwt'
import { getCompany, getToken, setCompany, setToken } from './storage'
import { applyCompanyTheme, fetchCompanySettings } from './theme'

export function Shell(props: { apiBase: string }) {
  const nav = useNavigate()
  const company = getCompany()
  const token = getToken()
  const claims = decodeJwt(token)
  const role = claims?.role || 'unknown'
  const isPlatform = Boolean(claims?.platform)
  const perms = permsFromClaims(claims)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isNarrow, setIsNarrow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 980 : false))

  useEffect(() => {
    function onResize() {
      setIsNarrow(window.innerWidth < 980)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isNarrow) setDrawerOpen(false)
  }, [isNarrow])

  useEffect(() => {
    let cancelled = false
    if (!company?.id) {
      applyCompanyTheme(null)
      return
    }
    fetchCompanySettings(props.apiBase, company.id)
      .then((s) => {
        if (!cancelled) applyCompanyTheme(s)
      })
      .catch(() => {
        // Branding must never block the UI; fall back to defaults.
        if (!cancelled) applyCompanyTheme(null)
      })
    return () => {
      cancelled = true
    }
  }, [props.apiBase, company?.id])

  const canSales = useMemo(() => perms.has('sales.quote') || perms.has('sales.hold') || perms.has('sales.confirm'), [perms])
  const canCustomers = useMemo(() => perms.has('customers.read') || perms.has('customers.write'), [perms])
  const canSailings = useMemo(() => perms.has('sailings.read') || perms.has('sailings.write'), [perms])
  const canFleet = useMemo(() => perms.has('fleet.read') || perms.has('fleet.write'), [perms])
  const canPricing = useMemo(() => perms.has('rates.write'), [perms])
  const canUsers = useMemo(() => perms.has('users.manage') || role === 'admin', [perms, role])
  const canReports = useMemo(() => canSales || perms.has('inventory.read') || perms.has('inventory.write'), [canSales, perms])

  function logout() {
    setToken(null)
    setCompany(null)
    nav('/company')
  }

  function switchCompany() {
    setCompany(null)
    nav('/company')
  }

  return (
    <div style={{ ...styles.shell, gridTemplateColumns: isNarrow ? '1fr' : '320px 1fr' }}>
      {isNarrow ? (
        <header style={styles.topbar}>
          <button style={styles.menuBtn} onClick={() => setDrawerOpen(!drawerOpen)}>
            {drawerOpen ? 'Close' : 'Menu'}
          </button>
          <div style={styles.topbarBrand}>
            <div style={styles.brandTop}>
              <span style={styles.logo} aria-hidden />
              <span>Cruise Operations Portal</span>
            </div>
            <div style={styles.brandSub}>{company ? `${company.name} (${company.code})` : 'No company selected'}</div>
          </div>
          <button style={styles.topbarSignout} onClick={logout}>
            Sign out
          </button>
        </header>
      ) : null}

      <aside style={{ ...styles.sidebar, display: isNarrow ? (drawerOpen ? 'block' : 'none') : 'block' }}>
        {!isNarrow ? (
          <div style={styles.brand}>
            <div style={styles.brandTop}>
              <span style={styles.logo} aria-hidden />
              <span>Cruise Operations Portal</span>
            </div>
            <div style={styles.brandSub}>{company ? `${company.name} (${company.code})` : 'No company selected'}</div>
          </div>
        ) : null}

        <nav style={styles.nav}>
          <NavLink to="/app/dashboard" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
            Dashboard
          </NavLink>
          <NavLink to="/app/preferences" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
            My preferences
          </NavLink>
          {(canSailings || canSales) ? (
            <NavLink to="/app/cruises" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Cruises (Browse)
            </NavLink>
          ) : null}
          {canSales ? (
            <NavLink to="/app/sales" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Sales (Quote / Hold / Confirm)
            </NavLink>
          ) : null}
          {canCustomers ? (
            <NavLink to="/app/customers" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Customers
            </NavLink>
          ) : null}
          {canSailings ? (
            <NavLink to="/app/sailings" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Sailings
            </NavLink>
          ) : null}
          {canSailings ? (
            <NavLink to="/app/itineraries" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Itineraries
            </NavLink>
          ) : null}
          {canSailings ? (
            <NavLink to="/app/ports" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Ports
            </NavLink>
          ) : null}
          {canFleet ? (
            <NavLink to="/app/fleet" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Fleet & Cabins
            </NavLink>
          ) : null}
          {canFleet ? (
            <NavLink to="/app/onboard" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Onboard & ShoreX
            </NavLink>
          ) : null}
          {canPricing ? (
            <NavLink to="/app/pricing" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Pricing & Offers
            </NavLink>
          ) : null}
          {canReports ? (
            <NavLink to="/app/reports" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Reports
            </NavLink>
          ) : null}
          {(canSales || canCustomers) ? (
            <NavLink to="/app/notifications" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Agenda & Notifications
            </NavLink>
          ) : null}
          {canUsers ? (
            <NavLink to="/app/users" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Users & Groups
            </NavLink>
          ) : null}
          {canUsers ? (
            <NavLink to="/app/audit" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Audit log
            </NavLink>
          ) : null}
          {isPlatform || role === 'admin' ? (
            <NavLink to="/app/company-settings" style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)} onClick={() => setDrawerOpen(false)}>
              Branding & localization
            </NavLink>
          ) : null}
        </nav>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Session</div>
          <div style={styles.muted}>Role: {role}</div>
          <button style={styles.secondaryBtnFull} onClick={switchCompany}>
            Switch company
          </button>
          <div style={styles.muted}>
            API:{' '}
            <Link to={`${props.apiBase}/docs`} target="_blank" style={styles.inlineLink}>
              Edge docs
            </Link>
          </div>
          {!isNarrow ? (
            <button style={styles.dangerBtn} onClick={logout}>
              Sign out
            </button>
          ) : null}
        </div>
      </aside>

      {isNarrow && drawerOpen ? <div style={styles.backdrop} onClick={() => setDrawerOpen(false)} /> : null}

      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'grid',
    height: '100vh',
    background: 'var(--csp-shell-bg, #0b1220)',
    color: 'var(--csp-text, #e6edf3)',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
  },
  topbar: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    padding: 12,
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.08))',
    background: 'color-mix(in srgb, var(--csp-shell-bg-base, #0b1220) 90%, transparent)',
    backdropFilter: 'blur(8px)',
  },
  topbarBrand: { display: 'grid', gap: 2, flex: 1 },
  menuBtn: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--csp-border-strong, rgba(255,255,255,0.12))',
    background: 'var(--csp-surface-bg, rgba(255,255,255,0.06))',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 900,
  },
  topbarSignout: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(248,81,73,0.35)',
    background: 'rgba(248,81,73,0.12)',
    color: '#ffb4ae',
    cursor: 'pointer',
    fontWeight: 900,
  },
  sidebar: {
    borderRight: '1px solid var(--csp-border, rgba(255,255,255,0.08))',
    padding: 16,
    background: 'color-mix(in srgb, var(--csp-shell-bg-base, #0b1220) 92%, transparent)',
    overflow: 'auto',
    position: 'relative',
    zIndex: 30,
  },
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 25,
  },
  brand: { marginBottom: 14 },
  brandTop: { fontWeight: 800, fontSize: 18, letterSpacing: 0.2, display: 'flex', gap: 10, alignItems: 'center' },
  brandSub: { color: 'var(--csp-muted, rgba(230,237,243,0.7))', fontSize: 12, marginTop: 4 },
  logo: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundImage: 'var(--csp-logo-url)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: 'var(--csp-surface-bg, rgba(255,255,255,0.06))',
    border: '1px solid var(--csp-border-strong, rgba(255,255,255,0.12))',
    flex: '0 0 auto',
  },
  nav: { display: 'grid', gap: 8, marginBottom: 16 },
  navBtn: {
    padding: '10px 12px',
    background: 'var(--csp-surface-bg, rgba(255,255,255,0.06))',
    color: 'var(--csp-text, #e6edf3)',
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
    textDecoration: 'none',
  },
  navActive: {
    padding: '10px 12px',
    background: 'var(--csp-primary-soft, rgba(56,139,253,0.22))',
    color: 'var(--csp-text, #e6edf3)',
    border: '1px solid var(--csp-primary-border, rgba(56,139,253,0.55))',
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
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    background: 'var(--csp-surface-bg, rgba(255,255,255,0.04))',
  },
  cardTitle: { fontWeight: 800, marginBottom: 8 },
  muted: { color: 'var(--csp-muted, rgba(230,237,243,0.7))', fontSize: 12, marginBottom: 8 },
  inlineLink: { color: '#9ecbff', textDecoration: 'none' },
  secondaryBtnFull: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--csp-border-strong, rgba(255,255,255,0.12))',
    background: 'var(--csp-surface-bg, rgba(255,255,255,0.06))',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 900,
    marginBottom: 8,
  },
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


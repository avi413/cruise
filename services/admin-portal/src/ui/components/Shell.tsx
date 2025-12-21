import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { decodeJwt, permsFromClaims } from './jwt'
import { getCompany, getToken, setCompany, setToken } from './storage'
import { applyCompanyTheme, fetchCompanySettings } from './theme'

export function Shell(props: { apiBase: string }) {
  const nav = useNavigate()
  const loc = useLocation()
  const company = getCompany()
  const token = getToken()
  const claims = decodeJwt(token)
  const role = claims?.role || 'unknown'
  const isPlatform = Boolean(claims?.platform)
  const perms = permsFromClaims(claims)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isNarrow, setIsNarrow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 980 : false))
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('csp.sidebar.collapsed') === '1'
    } catch {
      return false
    }
  })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQ, setPaletteQ] = useState('')
  const paletteInputRef = useRef<HTMLInputElement | null>(null)

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
    try {
      localStorage.setItem('csp.sidebar.collapsed', collapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [collapsed])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl + K opens command palette (quick nav).
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false)
        setDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!paletteOpen) {
      setPaletteQ('')
      return
    }
    // Focus input after open.
    const t = window.setTimeout(() => paletteInputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [paletteOpen])

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

  type NavItem = { key: string; label: string; to: string; show: boolean; icon: React.ReactNode; group: 'Main' | 'Operations' | 'Administration' }

  const navItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [
      { key: 'dashboard', label: 'Dashboard', to: '/app/dashboard', show: true, icon: <Icon name="home" />, group: 'Main' },
      { key: 'preferences', label: 'My preferences', to: '/app/preferences', show: true, icon: <Icon name="user" />, group: 'Main' },

      { key: 'cruises', label: 'Cruises', to: '/app/cruises', show: canSailings || canSales, icon: <Icon name="compass" />, group: 'Operations' },
      { key: 'sales', label: 'Sales', to: '/app/sales', show: canSales, icon: <Icon name="tag" />, group: 'Operations' },
      { key: 'customers', label: 'Customers', to: '/app/customers', show: canCustomers, icon: <Icon name="users" />, group: 'Operations' },
      { key: 'sailings', label: 'Sailings', to: '/app/sailings', show: canSailings, icon: <Icon name="calendar" />, group: 'Operations' },
      { key: 'itineraries', label: 'Itineraries', to: '/app/itineraries', show: canSailings, icon: <Icon name="map" />, group: 'Operations' },
      { key: 'ports', label: 'Ports', to: '/app/ports', show: canSailings, icon: <Icon name="pin" />, group: 'Operations' },
      { key: 'fleet', label: 'Fleet & Cabins', to: '/app/fleet', show: canFleet, icon: <Icon name="ship" />, group: 'Operations' },
      { key: 'onboard', label: 'Onboard & ShoreX', to: '/app/onboard', show: canFleet, icon: <Icon name="list" />, group: 'Operations' },
      { key: 'pricing', label: 'Pricing & Offers', to: '/app/pricing', show: canPricing, icon: <Icon name="sparkles" />, group: 'Operations' },
      { key: 'reports', label: 'Reports', to: '/app/reports', show: canReports, icon: <Icon name="chart" />, group: 'Operations' },
      { key: 'notifications', label: 'Agenda & Notifications', to: '/app/notifications', show: canSales || canCustomers, icon: <Icon name="bell" />, group: 'Operations' },

      { key: 'users', label: 'Users & Groups', to: '/app/users', show: canUsers, icon: <Icon name="shield" />, group: 'Administration' },
      { key: 'audit', label: 'Audit log', to: '/app/audit', show: canUsers, icon: <Icon name="clock" />, group: 'Administration' },
      {
        key: 'company-settings',
        label: 'Branding & localization',
        to: '/app/company-settings',
        show: isPlatform || role === 'admin',
        icon: <Icon name="paint" />,
        group: 'Administration',
      },
    ]
    return items.filter((x) => x.show)
  }, [canCustomers, canFleet, canPricing, canReports, canSailings, canSales, canUsers, isPlatform, role])

  const paletteItems = useMemo(() => {
    const q = paletteQ.trim().toLowerCase()
    const base = navItems
    if (!q) return base.slice(0, 12)
    return base
      .filter((it) => it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q) || it.to.toLowerCase().includes(q))
      .slice(0, 12)
  }, [navItems, paletteQ])

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
    <div style={{ ...styles.shell, gridTemplateColumns: isNarrow ? '1fr' : collapsed ? '88px 1fr' : '272px 1fr' }}>
      <header style={{ ...styles.topbar, padding: isNarrow ? '20px 12px' : 12 }}>
        <button
          style={styles.iconBtn}
          onClick={() => (isNarrow ? setDrawerOpen(!drawerOpen) : setCollapsed(!collapsed))}
          aria-label={isNarrow ? (drawerOpen ? 'Close menu' : 'Open menu') : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isNarrow ? (drawerOpen ? 'Close menu' : 'Open menu') : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name="menu" />
        </button>

        <div style={styles.topbarBrand} onClick={() => nav('/app/dashboard')} role="button" tabIndex={0} title="Go to dashboard">
          <span style={styles.logo} aria-hidden />
          <div style={{ display: 'grid', lineHeight: 1.1 }}>
            <div style={styles.brandTitle}>{String((getComputedStyle(document.documentElement).getPropertyValue('--csp-display-name') || '').trim() || 'Cruise Operations Portal')}</div>
            <div style={styles.brandSub}>{company ? `${company.name} (${company.code})` : 'No company selected'}</div>
          </div>
        </div>

        <div style={styles.topbarSearchWrap}>
          <button style={styles.searchBtn} onClick={() => setPaletteOpen(true)} title="Search (Ctrl+K)">
            <Icon name="search" />
            <span style={{ fontWeight: 800, opacity: 0.9 }}>Search…</span>
            <span style={styles.kbd}>Ctrl K</span>
          </button>
        </div>

        <div style={styles.topbarRight}>
          <Link to="/app/notifications" style={styles.iconBtnLink} title="Notifications">
            <Icon name="bell" />
          </Link>
          <Link to={`${props.apiBase}/docs`} target="_blank" style={styles.iconBtnLink} title="API docs">
            <Icon name="book" />
          </Link>
          <button style={styles.primaryBtn} onClick={switchCompany} title="Switch company">
            Switch
          </button>
          <button style={styles.dangerBtnSmall} onClick={logout} title="Sign out">
            Sign out
          </button>
        </div>
      </header>

      <aside
        style={{
          ...styles.sidebar,
          display: isNarrow ? (drawerOpen ? 'block' : 'none') : 'block',
          width: isNarrow ? 272 : undefined,
        }}
      >
        <div style={styles.sidebarInner}>
          <div style={styles.sidebarTopRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={styles.logoSmall} aria-hidden />
              {!collapsed ? (
                <div style={{ minWidth: 0 }}>
                  <div style={styles.sidebarTitle}>Navigation</div>
                  <div style={styles.sidebarSub}>{role}</div>
                </div>
              ) : null}
            </div>
            {!isNarrow ? (
              <button style={styles.iconBtn} onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label="Toggle sidebar">
                <Icon name={collapsed ? 'chevRight' : 'chevLeft'} />
              </button>
            ) : (
              <button style={styles.iconBtn} onClick={() => setDrawerOpen(false)} title="Close" aria-label="Close menu">
                <Icon name="x" />
              </button>
            )}
          </div>

          {(['Main', 'Operations', 'Administration'] as const).map((group) => {
            const items = navItems.filter((it) => it.group === group)
            if (!items.length) return null
            return (
              <div key={group} style={{ marginTop: 14 }}>
                {!collapsed ? <div style={styles.navGroupTitle}>{group}</div> : null}
                <nav style={styles.nav}>
                  {items.map((it) => (
                    <NavLink
                      key={it.key}
                      to={it.to}
                      title={it.label}
                      style={({ isActive }) => (isActive ? styles.navActive : styles.navBtn)}
                      onClick={() => setDrawerOpen(false)}
                      end={false}
                    >
                      <span style={styles.navIcon}>{it.icon}</span>
                      {!collapsed ? <span style={styles.navLabel}>{it.label}</span> : null}
                      {!collapsed && it.to === loc.pathname ? <span style={styles.activeDot} aria-hidden /> : null}
                    </NavLink>
                  ))}
                </nav>
              </div>
            )
          })}

          {!collapsed ? (
            <div style={styles.sessionCard}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Session</div>
              <div style={styles.muted}>Role: {role}</div>
              <div style={styles.muted}>Company: {company ? `${company.code}` : '—'}</div>
            </div>
          ) : null}
        </div>
      </aside>

      {isNarrow && drawerOpen ? <div style={styles.backdrop} onClick={() => setDrawerOpen(false)} /> : null}

      {paletteOpen ? (
        <div style={styles.paletteBackdrop} onClick={() => setPaletteOpen(false)} role="presentation">
          <div style={styles.palette} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Search">
            <div style={styles.paletteTop}>
              <Icon name="search" />
              <input
                ref={paletteInputRef}
                value={paletteQ}
                onChange={(e) => setPaletteQ(e.target.value)}
                placeholder="Search pages…"
                style={styles.paletteInput}
              />
              <span style={styles.kbd}>Esc</span>
            </div>
            <div style={styles.paletteList}>
              {paletteItems.map((it) => (
                <button
                  key={it.key}
                  style={styles.paletteRow}
                  onClick={() => {
                    setPaletteOpen(false)
                    nav(it.to)
                  }}
                >
                  <span style={styles.paletteIcon}>{it.icon}</span>
                  <span style={{ display: 'grid', textAlign: 'left' }}>
                    <span style={{ fontWeight: 900 }}>{it.label}</span>
                    <span style={styles.paletteSub}>{it.group}</span>
                  </span>
                </button>
              ))}
              {!paletteItems.length ? <div style={styles.paletteEmpty}>No matches.</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    height: '100vh',
    background: 'var(--csp-shell-bg)',
    color: 'var(--csp-text)',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
  },
  topbar: {
    gridColumn: '1 / -1',
    position: 'sticky',
    top: 0,
    zIndex: 20,
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    padding: 12,
    borderBottom: '1px solid var(--csp-topbar-border, var(--csp-border))',
    background: 'var(--csp-topbar-bg, rgba(255,255,255,0.88))',
    backdropFilter: 'blur(8px)',
  },
  topbarBrand: { display: 'flex', gap: 10, alignItems: 'center', minWidth: 0, cursor: 'pointer' },
  brandTitle: { fontWeight: 950, fontSize: 14, letterSpacing: 0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  topbarSearchWrap: { flex: 1, display: 'flex', justifyContent: 'center' },
  topbarRight: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 'var(--csp-radius-sm, 10px)',
    border: '1px solid var(--csp-border)',
    background: 'var(--csp-surface-bg)',
    color: 'var(--csp-text)',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    boxShadow: 'var(--csp-shadow-sm)',
  },
  iconBtnLink: {
    width: 40,
    height: 40,
    borderRadius: 'var(--csp-radius-sm, 10px)',
    border: '1px solid var(--csp-border)',
    background: 'var(--csp-surface-bg)',
    color: 'var(--csp-text)',
    display: 'grid',
    placeItems: 'center',
    boxShadow: 'var(--csp-shadow-sm)',
    textDecoration: 'none',
  },
  searchBtn: {
    width: 'min(720px, 100%)',
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: 999,
    border: '1px solid var(--csp-border)',
    background: 'color-mix(in srgb, var(--csp-surface-bg) 80%, transparent)',
    color: 'var(--csp-text)',
    cursor: 'pointer',
    boxShadow: 'var(--csp-shadow-sm)',
  },
  sidebar: {
    borderRight: '1px solid var(--csp-border)',
    background: 'var(--csp-sidebar-bg, rgba(255,255,255,0.96))',
    overflow: 'auto',
    position: 'relative',
    zIndex: 30,
  },
  sidebarInner: { padding: 12 },
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 25,
  },
  sidebarTopRow: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  sidebarTitle: { fontWeight: 950, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  sidebarSub: { color: 'var(--csp-muted)', fontSize: 12, marginTop: 2 },
  brandSub: { color: 'var(--csp-muted)', fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  logo: {
    width: 110,
    height: 35,
    borderRadius: 8,
    backgroundImage: 'var(--csp-logo-url)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: 'var(--csp-surface-bg)',
    border: '1px solid var(--csp-border)',
    flex: '0 0 auto',
  },
  logoSmall: {
    width: 26,
    height: 26,
    borderRadius: 10,
    backgroundImage: 'var(--csp-logo-url)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: 'var(--csp-surface-bg)',
    border: '1px solid var(--csp-border)',
    flex: '0 0 auto',
  },
  navGroupTitle: { fontSize: 11, fontWeight: 950, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--csp-muted)', marginBottom: 8, paddingLeft: 8 },
  nav: { display: 'grid', gap: 6 },
  navBtn: {
    padding: '10px 10px',
    background: 'transparent',
    color: 'var(--csp-text)',
    border: '1px solid transparent',
    borderRadius: 'var(--csp-radius-sm, 10px)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    textDecoration: 'none',
    display: 'flex',
    gap: 10,
    alignItems: 'center',
  },
  navActive: {
    padding: '10px 10px',
    background: 'var(--csp-primary-soft)',
    color: 'color-mix(in srgb, var(--csp-primary) 75%, var(--csp-text))',
    border: '1px solid var(--csp-primary-border)',
    borderRadius: 'var(--csp-radius-sm, 10px)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    textDecoration: 'none',
    display: 'flex',
    gap: 10,
    alignItems: 'center',
  },
  navIcon: { width: 18, height: 18, display: 'grid', placeItems: 'center', flex: '0 0 auto' },
  navLabel: { fontWeight: 850, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  activeDot: { width: 6, height: 6, borderRadius: 999, background: 'var(--csp-primary)', marginLeft: 'auto' },
  main: { padding: 18, overflow: 'auto' },
  sessionCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 'var(--csp-radius)',
    border: '1px solid var(--csp-border)',
    background: 'var(--csp-surface-bg)',
    boxShadow: 'var(--csp-shadow-sm)',
  },
  cardTitle: { fontWeight: 800, marginBottom: 8 },
  muted: { color: 'var(--csp-muted, rgba(230,237,243,0.7))', fontSize: 12, marginBottom: 8 },
  inlineLink: { color: 'var(--csp-primary, #388bfd)', textDecoration: 'none' },
  secondaryBtnFull: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 999,
    border: '1px solid var(--csp-primary-border)',
    background: 'var(--csp-primary-soft)',
    color: 'color-mix(in srgb, var(--csp-primary) 72%, var(--csp-text))',
    cursor: 'pointer',
    fontWeight: 950,
  },
  dangerBtnSmall: {
    padding: '10px 12px',
    borderRadius: 999,
    border: '1px solid rgba(220, 38, 38, 0.35)',
    background: 'rgba(220, 38, 38, 0.10)',
    color: 'rgb(185, 28, 28)',
    cursor: 'pointer',
    fontWeight: 950,
  },
  kbd: {
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid var(--csp-border)',
    background: 'color-mix(in srgb, var(--csp-surface-2-bg) 60%, transparent)',
    color: 'var(--csp-muted)',
    fontSize: 12,
    fontWeight: 950,
    marginLeft: 10,
    whiteSpace: 'nowrap',
  },
  paletteBackdrop: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 50, display: 'grid', placeItems: 'start center', padding: 18 },
  palette: {
    width: 'min(720px, calc(100vw - 36px))',
    marginTop: 74,
    borderRadius: 16,
    border: '1px solid var(--csp-border)',
    background: 'var(--csp-surface-bg)',
    boxShadow: 'var(--csp-shadow)',
    overflow: 'hidden',
  },
  paletteTop: { display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderBottom: '1px solid var(--csp-border)' },
  paletteInput: { flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent', color: 'var(--csp-text)' },
  paletteList: { display: 'grid', padding: 8, gap: 6, maxHeight: 'min(420px, 55vh)', overflow: 'auto' },
  paletteRow: {
    width: '100%',
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    border: '1px solid var(--csp-border)',
    background: 'color-mix(in srgb, var(--csp-surface-bg) 85%, transparent)',
    cursor: 'pointer',
    color: 'var(--csp-text)',
  },
  paletteIcon: { width: 22, height: 22, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--csp-surface-2-bg)', border: '1px solid var(--csp-border)' },
  paletteSub: { color: 'var(--csp-muted)', fontSize: 12, marginTop: 2 },
  paletteEmpty: { padding: 12, color: 'var(--csp-muted)', fontSize: 13 },
}

function Icon(props: { name: 'home' | 'user' | 'compass' | 'tag' | 'users' | 'calendar' | 'map' | 'pin' | 'ship' | 'list' | 'sparkles' | 'chart' | 'bell' | 'shield' | 'clock' | 'paint' | 'menu' | 'search' | 'book' | 'chevLeft' | 'chevRight' | 'x' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' } as const
  const stroke = 'currentColor'
  const s = { stroke, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  switch (props.name) {
    case 'menu':
      return (
        <svg {...common}>
          <path {...s} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )
    case 'x':
      return (
        <svg {...common}>
          <path {...s} d="M6 6l12 12M18 6l-12 12" />
        </svg>
      )
    case 'search':
      return (
        <svg {...common}>
          <path {...s} d="M21 21l-4.35-4.35" />
          <circle {...s} cx="11" cy="11" r="7" />
        </svg>
      )
    case 'home':
      return (
        <svg {...common}>
          <path {...s} d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5Z" />
        </svg>
      )
    case 'user':
      return (
        <svg {...common}>
          <path {...s} d="M20 21a8 8 0 0 0-16 0" />
          <circle {...s} cx="12" cy="7" r="4" />
        </svg>
      )
    case 'users':
      return (
        <svg {...common}>
          <path {...s} d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle {...s} cx="9.5" cy="7" r="4" />
          <path {...s} d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path {...s} d="M16.5 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...common}>
          <path {...s} d="M8 2v4M16 2v4M3 10h18" />
          <path {...s} d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
        </svg>
      )
    case 'map':
      return (
        <svg {...common}>
          <path {...s} d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" />
          <path {...s} d="M9 3v15M15 6v15" />
        </svg>
      )
    case 'pin':
      return (
        <svg {...common}>
          <path {...s} d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 0 1 18 0Z" />
          <circle {...s} cx="12" cy="10" r="3" />
        </svg>
      )
    case 'ship':
      return (
        <svg {...common}>
          <path {...s} d="M3 20h18" />
          <path {...s} d="M5 20l1.5-6H21l-2.5 6H5Z" />
          <path {...s} d="M6.5 14 10 4h4l3.5 10" />
          <path {...s} d="M9 8h6" />
        </svg>
      )
    case 'list':
      return (
        <svg {...common}>
          <path {...s} d="M8 6h13M8 12h13M8 18h13" />
          <path {...s} d="M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      )
    case 'chart':
      return (
        <svg {...common}>
          <path {...s} d="M3 3v18h18" />
          <path {...s} d="M7 15v-6M11 15v-10M15 15v-4M19 15v-8" />
        </svg>
      )
    case 'bell':
      return (
        <svg {...common}>
          <path {...s} d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path {...s} d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )
    case 'tag':
      return (
        <svg {...common}>
          <path {...s} d="M20.59 13.41 12 22l-9-9V4h9l8.59 8.59a2 2 0 0 1 0 2.82Z" />
          <path {...s} d="M7 7h.01" />
        </svg>
      )
    case 'compass':
      return (
        <svg {...common}>
          <circle {...s} cx="12" cy="12" r="10" />
          <path {...s} d="M16 8l-2 6-6 2 2-6 6-2Z" />
        </svg>
      )
    case 'sparkles':
      return (
        <svg {...common}>
          <path {...s} d="M12 2l1.2 4.2L17.4 7.4l-4.2 1.2L12 12.8l-1.2-4.2L6.6 7.4l4.2-1.2L12 2Z" />
          <path {...s} d="M19 13l.7 2.4L22 16l-2.3.6L19 19l-.7-2.4L16 16l2.3-.6L19 13Z" />
          <path {...s} d="M4 13l.7 2.4L7 16l-2.3.6L4 19l-.7-2.4L1 16l2.3-.6L4 13Z" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...common}>
          <path {...s} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...common}>
          <circle {...s} cx="12" cy="12" r="10" />
          <path {...s} d="M12 6v6l4 2" />
        </svg>
      )
    case 'paint':
      return (
        <svg {...common}>
          <path {...s} d="M20 13a7 7 0 1 0-9 6.7" />
          <path {...s} d="M12 19l8-8 2 2-8 8H12v-2Z" />
          <path {...s} d="M7.5 11.5h.01M9.5 8.5h.01M12.5 7.5h.01" />
        </svg>
      )
    case 'book':
      return (
        <svg {...common}>
          <path {...s} d="M4 19a2 2 0 0 1 2-2h14" />
          <path {...s} d="M6 2h14v20H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
        </svg>
      )
    case 'chevLeft':
      return (
        <svg {...common}>
          <path {...s} d="M15 18l-6-6 6-6" />
        </svg>
      )
    case 'chevRight':
      return (
        <svg {...common}>
          <path {...s} d="M9 18l6-6-6-6" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <path {...s} d="M12 12h.01" />
        </svg>
      )
  }
}

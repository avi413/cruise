import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../api/client'
import { getCompany } from '../components/storage'
import { Button, ErrorBanner, Mono, PageHeader, Panel } from '../components/ui'

type MePrefs = { user_id: string; updated_at: string; preferences: any }
type Notification = { id?: string; created_at?: string; kind?: string; title?: string; message?: string; meta?: any }
type NotificationsOut = { items: Notification[] }

type Announcement = {
  id: string
  created_at: string
  created_by: string
  title: string
  message: string
  priority: string
  read_at: string | null
}
type Booking = {
  booking_id: string
  sailing_id: string
  status: string
  updated_at: string
  meta: any
}
type Sailing = {
  sailing: { id: string; departure_date: string; duration_days: number; itinerary_id: string; ship_id: string }
  ship: { name: string; code: string }
}

const ALL_WIDGETS: { key: string; title: string; description: string }[] = [
  { key: 'quick_actions', title: 'Quick actions', description: 'Fast navigation for agents (few clicks).' },
  { key: 'kpis', title: 'KPIs', description: 'At-a-glance counters (starter).' },
  { key: 'sales_report', title: 'Sales report', description: 'Last 24h holds / confirmations from events.' },
  { key: 'notifications', title: 'Agenda & notifications', description: 'Newest in-app notifications.' },
  { key: 'notes', title: 'My notes', description: 'Scratchpad saved per user.' },
  { key: 'manager_notes', title: 'Team Announcements', description: 'Important updates from management.' },
  { key: 'sales_tracking', title: 'Recent Sales', description: 'Track recent bookings and holds.' },
  { key: 'featured_cruises', title: 'Featured Sailings', description: 'Upcoming cruises to push.' },
]

function normalizeLayout(input: any): string[] {
  if (!Array.isArray(input)) return []
  const keys: string[] = []
  for (const it of input) {
    if (typeof it === 'string' && it.trim()) keys.push(it.trim())
    else if (it && typeof it === 'object' && typeof it.key === 'string' && it.key.trim()) keys.push(it.key.trim())
  }
  const uniq = Array.from(new Set(keys))
  return uniq.filter((k) => ALL_WIDGETS.some((w) => w.key === k))
}

function defaultLayout(): string[] {
  return ['quick_actions', 'kpis', 'sales_report', 'notifications', 'notes', 'manager_notes', 'sales_tracking', 'featured_cruises']
}

function moveInArray<T>(xs: T[], fromIdx: number, toIdx: number): T[] {
  const copy = xs.slice()
  const [it] = copy.splice(fromIdx, 1)
  copy.splice(toIdx, 0, it)
  return copy
}

export function DashboardPage(props: { apiBase: string }) {
  const { t } = useTranslation()
  const company = getCompany()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<any>(null)

  const [edit, setEdit] = useState(false)
  const [layout, setLayout] = useState<string[]>(defaultLayout())
  const [addKey, setAddKey] = useState<string>('quick_actions')
  const [dragKey, setDragKey] = useState<string | null>(null)

  const [notes, setNotes] = useState('')
  const [notifs, setNotifs] = useState<Notification[]>([])
  
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [cruises, setCruises] = useState<Sailing[]>([])

  const [cols, setCols] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 980 ? 1 : 2))

  useEffect(() => {
    function onResize() {
      setCols(window.innerWidth < 980 ? 1 : 2)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setErr(null)
    apiFetch<MePrefs>(props.apiBase, `/v1/staff/me/preferences`)
      .then((r) => {
        if (cancelled) return
        const p = r.preferences || {}
        setPrefs(p)
        const l = normalizeLayout(p?.dashboard?.layout)
        setLayout(l.length ? l : defaultLayout())
        setNotes(String(p?.dashboard?.notes || ''))
      })
      .catch((e: any) => {
        if (!cancelled) setErr(String(e?.detail || e?.message || e))
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [props.apiBase])

  useEffect(() => {
    let cancelled = false
    apiFetch<NotificationsOut>(props.apiBase, `/v1/notifications`)
      .then((r) => {
        if (!cancelled) setNotifs(r?.items || [])
      })
      .catch(() => {
        if (!cancelled) setNotifs([])
      })
    return () => {
      cancelled = true
    }
  }, [props.apiBase])

  const salesSnapshot = useMemo(() => {
    const now = Date.now()
    const last24h = now - 24 * 60 * 60 * 1000
    const recent = notifs.filter((n) => {
      const ts = Date.parse(String(n.created_at || ''))
      return !isNaN(ts) && ts >= last24h
    })
    const recentByKind: Record<string, number> = {}
    for (const n of recent) {
      const k = String(n.kind || '').trim()
      if (!k) continue
      recentByKind[k] = (recentByKind[k] || 0) + 1
    }
    const recentSalesEvents = recent
      .filter((n) => n?.kind === 'booking_held' || n?.kind === 'booking_confirmed')
      .slice(0, 6)
    return {
      recentCount: recent.length,
      holds24h: recentByKind.booking_held || 0,
      confirms24h: recentByKind.booking_confirmed || 0,
      recentSalesEvents,
    }
  }, [notifs])

  // Fetch new widgets data
  useEffect(() => {
    let cancelled = false
    if (!layout.includes('manager_notes')) return
    
    apiFetch<Announcement[]>(props.apiBase, `/v1/staff/announcements`)
      .then((r) => { if (!cancelled) setAnnouncements(r || []) })
      .catch(() => { if (!cancelled) setAnnouncements([]) })
      
    return () => { cancelled = true }
  }, [props.apiBase, layout])

  useEffect(() => {
    let cancelled = false
    if (!layout.includes('sales_tracking')) return
    
    // We borrow list_bookings but maybe should have a dedicated endpoint
    apiFetch<Booking[]>(props.apiBase, `/v1/bookings`)
      .then((r) => { if (!cancelled) setBookings((r || []).slice(0, 5)) })
      .catch(() => { if (!cancelled) setBookings([]) })
      
    return () => { cancelled = true }
  }, [props.apiBase, layout])
  
  useEffect(() => {
    let cancelled = false
    if (!layout.includes('featured_cruises')) return
    
    apiFetch<{ items: Sailing[] }>(props.apiBase, `/v1/cruises`)
      .then((r) => { if (!cancelled) setCruises((r?.items || []).slice(0, 5)) })
      .catch(() => { if (!cancelled) setCruises([]) })
      
    return () => { cancelled = true }
  }, [props.apiBase, layout])

  const availableToAdd = useMemo(() => {
    return ALL_WIDGETS.filter((w) => !layout.includes(w.key)).map((w) => ({
      ...w,
      title:
        w.key === 'quick_actions'
          ? t('dashboard.quick_actions')
          : w.key === 'kpis'
          ? t('dashboard.kpis')
          : w.key === 'sales_report'
          ? t('dashboard.sales_report')
          : w.key === 'notifications'
          ? t('dashboard.agenda')
          : w.key === 'notes'
          ? t('dashboard.my_notes')
          : w.title,
    }))
  }, [layout, t])

  async function saveDashboard() {
    setBusy(true)
    setErr(null)
    try {
      const payload = {
        preferences: {
          ...(prefs || {}),
          dashboard: {
            ...(prefs?.dashboard || {}),
            layout: layout.slice(),
            notes,
          },
        },
      }
      const r = await apiFetch<MePrefs>(props.apiBase, `/v1/staff/me/preferences`, { method: 'PATCH', body: payload })
      setPrefs(r.preferences || {})
      setEdit(false)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function markRead(id: string) {
    try {
        await apiFetch(props.apiBase, `/v1/staff/announcements/${id}/read`, { method: 'POST' })
        setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, read_at: new Date().toISOString() } : a))
    } catch(e) {
        console.error(e)
    }
  }

  function addWidget(k: string) {
    if (!k || layout.includes(k)) return
    setLayout([...layout, k])
  }

  function removeWidget(k: string) {
    setLayout(layout.filter((x) => x !== k))
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title={t('nav.dashboard')}
        subtitle={company ? `${t('dashboard.signed_in_for')} ${company.name} (${company.code}).` : 'No company selected.'}
        right={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setEdit(!edit)} title={t('dashboard.customize')}>
              {edit ? t('common.save') : t('dashboard.customize')}
            </Button>
            {edit ? (
              <Button variant="primary" disabled={busy} onClick={() => void saveDashboard()}>
                {busy ? t('common.save') : t('common.save')}
              </Button>
            ) : null}
          </>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      {edit ? (
        <Panel title="Add / manage widgets" subtitle="Drag and drop cards to reorder. Remove anything you don’t use.">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--csp-text, #e6edf3)' }}>
              Add widget
              <select
                value={addKey}
                onChange={(e) => setAddKey(e.target.value)}
                style={{
                  padding: '10px 10px',
                  borderRadius: 10,
                  border: '1px solid var(--csp-input-border, rgba(255,255,255,0.12))',
                  background: 'var(--csp-input-bg, rgba(0,0,0,0.25))',
                  color: 'var(--csp-text, #e6edf3)',
                  minWidth: 260,
                }}
              >
                {availableToAdd.length ? (
                  availableToAdd.map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.title}
                    </option>
                  ))
                ) : (
                  <option value="">All widgets added</option>
                )}
              </select>
            </label>
            <Button variant="primary" disabled={!availableToAdd.length || busy} onClick={() => addWidget(addKey)}>
              Add
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setLayout(defaultLayout())
              }}
            >
              Reset default
            </Button>
          </div>
        </Panel>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: cols === 1 ? '1fr' : '1fr 1fr', gap: 12, alignItems: 'start' }}>
        {layout.map((k, idx) => {
          const def = ALL_WIDGETS.find((w) => w.key === k)
          let title = def?.title || k
          if (k === 'quick_actions') title = t('dashboard.quick_actions')
          if (k === 'kpis') title = t('dashboard.kpis')
          if (k === 'sales_report') title = t('dashboard.sales_report')
          if (k === 'notifications') title = t('dashboard.agenda')
          if (k === 'notes') title = t('dashboard.my_notes')

          return (
            <section
              key={k}
              style={styles.card}
              draggable={edit}
              onDragStart={() => setDragKey(k)}
              onDragOver={(e) => {
                if (!edit) return
                e.preventDefault()
              }}
              onDrop={() => {
                if (!edit) return
                if (!dragKey || dragKey === k) return
                const from = layout.indexOf(dragKey)
                const to = layout.indexOf(k)
                if (from < 0 || to < 0) return
                setLayout(moveInArray(layout, from, to))
                setDragKey(null)
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <div style={styles.cardTitle}>
                  {edit ? <span style={{ marginRight: 8, opacity: 0.8, cursor: 'grab' }}>⋮⋮</span> : null}
                  {title}
                </div>
                {edit ? (
                  <button style={styles.removeBtn} onClick={() => removeWidget(k)} title="Remove widget">
                    Remove
                  </button>
                ) : null}
              </div>

              {k === 'quick_actions' ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <div style={styles.muted}>{t('dashboard.quick_actions_desc')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Link to="/app/sales" style={styles.pill}>
                      {t('dashboard.quote_hold_confirm')}
                    </Link>
                    <Link to="/app/customers" style={styles.pill}>
                      {t('dashboard.customer_search')}
                    </Link>
                    <Link to="/app/cruises" style={styles.pill}>
                      {t('dashboard.browse_sailings')}
                    </Link>
                  </div>
                </div>
              ) : null}

              {k === 'kpis' ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <div style={styles.muted}>{t('dashboard.kpi_desc')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={styles.kpi}>
                      <div style={styles.kpiLabel}>{t('dashboard.notifications_loaded')}</div>
                      <div style={styles.kpiValue}>{notifs.length}</div>
                    </div>
                    <div style={styles.kpi}>
                      <div style={styles.kpiLabel}>{t('dashboard.widgets')}</div>
                      <div style={styles.kpiValue}>{layout.length}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {k === 'sales_report' ? (
                <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                  <div style={styles.muted}>{t('dashboard.sales_report_desc')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div style={styles.kpi}>
                      <div style={styles.kpiLabel}>{t('dashboard.sales_report.last_24h_events')}</div>
                      <div style={styles.kpiValue}>{salesSnapshot.recentCount}</div>
                    </div>
                    <div style={styles.kpi}>
                      <div style={styles.kpiLabel}>{t('dashboard.sales_report.holds_24h')}</div>
                      <div style={styles.kpiValue}>{salesSnapshot.holds24h}</div>
                    </div>
                    <div style={styles.kpi}>
                      <div style={styles.kpiLabel}>{t('dashboard.sales_report.confirms_24h')}</div>
                      <div style={styles.kpiValue}>{salesSnapshot.confirms24h}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{t('dashboard.sales_report.recent_sales_events')}</div>
                    <Link to="/app/reports" style={{ ...styles.pill, padding: '6px 10px' }}>
                      {t('dashboard.sales_report.open_reports')}
                    </Link>
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {salesSnapshot.recentSalesEvents.map((n, i) => (
                      <div key={String(n.id || i)} style={styles.notifRow}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ fontWeight: 900 }}>{String(n.kind || 'event')}</div>
                          <div style={styles.mutedSmall}>
                            <Mono>{String(n.created_at || '')}</Mono>
                          </div>
                        </div>
                        {n.message ? <div style={{ fontSize: 13, marginTop: 4 }}>{String(n.message)}</div> : null}
                      </div>
                    ))}
                    {!salesSnapshot.recentSalesEvents.length ? (
                      <div style={styles.muted}>{t('dashboard.sales_report.empty')}</div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {k === 'notifications' ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <div style={styles.muted}>{t('dashboard.agenda_desc')}</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {notifs.slice(0, 6).map((n, i) => (
                      <div key={String(n.id || i)} style={styles.notifRow}>
                        <div style={{ fontWeight: 800 }}>{String(n.title || n.kind || 'Notification')}</div>
                        <div style={styles.mutedSmall}>
                          <Mono>{String(n.created_at || '')}</Mono> {n.message ? `· ${String(n.message)}` : ''}
                        </div>
                      </div>
                    ))}
                    {!notifs.length ? <div style={styles.muted}>{t('dashboard.no_notifications')}</div> : null}
                  </div>
                </div>
              ) : null}

              {k === 'notes' ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <div style={styles.muted}>{t('dashboard.my_notes_desc')}</div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('dashboard.my_notes') + "..."}
                    style={{
                      width: '100%',
                      minHeight: 140,
                      padding: 10,
                      borderRadius: 10,
                      border: '1px solid var(--csp-input-border, rgba(255,255,255,0.12))',
                      background: 'var(--csp-input-bg, rgba(0,0,0,0.25))',
                      color: 'var(--csp-text, #e6edf3)',
                      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                      fontSize: 12,
                    }}
                    disabled={busy && !edit}
                  />
                  {edit ? <div style={styles.mutedSmall}>Notes will be saved when you click “Save layout”.</div> : null}
                </div>
              ) : null}
              
              {k === 'manager_notes' ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <div style={styles.muted}>Latest updates from the team.</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {announcements.map((a) => (
                      <div key={a.id} style={{ ...styles.notifRow, borderLeft: !a.read_at ? '4px solid #f90' : styles.notifRow.border }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div style={{ fontWeight: 800 }}>{a.title}</div>
                            {!a.read_at && (
                                <button style={{ ...styles.pill, padding: '2px 6px', fontSize: 10 }} onClick={() => markRead(a.id)}>Mark Read</button>
                            )}
                        </div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>{a.message}</div>
                        <div style={styles.mutedSmall}>
                          <Mono>{a.created_at}</Mono> · Priority: {a.priority}
                        </div>
                      </div>
                    ))}
                    {!announcements.length ? <div style={styles.muted}>No announcements.</div> : null}
                  </div>
                </div>
              ) : null}
              
              {k === 'sales_tracking' ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <div style={styles.muted}>Your recent bookings and holds.</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {bookings.map((b) => (
                      <div key={b.booking_id} style={styles.notifRow}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                             <div style={{ fontWeight: 800 }}>{b.status.toUpperCase()}</div>
                             <div style={styles.mutedSmall}>{b.sailing_id}</div>
                        </div>
                        <div style={styles.mutedSmall}>
                          ID: <Mono>{b.booking_id}</Mono> · {b.updated_at}
                        </div>
                      </div>
                    ))}
                    {!bookings.length ? <div style={styles.muted}>No recent activity.</div> : null}
                  </div>
                </div>
              ) : null}
              
              {k === 'featured_cruises' ? (
                 <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <div style={styles.muted}>Featured upcoming sailings (check availability).</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {cruises.map((c) => (
                      <div key={c.sailing.id} style={styles.notifRow}>
                        <div style={{ fontWeight: 800 }}>{c.ship?.name} ({c.sailing.duration_days} days)</div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>Departs: {c.sailing.departure_date}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                             <span style={{...styles.pill, background: 'rgba(0,255,0,0.1)', color: '#cfc' }}>Available</span>
                             <Link to={`/app/cruises`} style={styles.pill}>Book Now</Link>
                        </div>
                      </div>
                    ))}
                    {!cruises.length ? <div style={styles.muted}>No sailings loaded.</div> : null}
                  </div>
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    borderRadius: 14,
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    background: 'var(--csp-surface-bg, rgba(255,255,255,0.04))',
    padding: 14,
    color: 'var(--csp-text, #e6edf3)',
  },
  cardTitle: { fontWeight: 900, marginBottom: 8 },
  muted: { color: 'var(--csp-muted, rgba(230,237,243,0.65))', fontSize: 12, lineHeight: 1.45 },
  mutedSmall: { color: 'color-mix(in srgb, var(--csp-muted, rgba(230,237,243,0.65)) 85%, transparent)', fontSize: 11, lineHeight: 1.35 },
  pill: {
    padding: '8px 10px',
    borderRadius: 999,
    border: '1px solid var(--csp-border-strong, rgba(255,255,255,0.12))',
    background: 'var(--csp-chip-bg, rgba(0,0,0,0.18))',
    color: 'var(--csp-text, #e6edf3)',
    textDecoration: 'none',
    fontSize: 12,
    fontWeight: 900,
  },
  removeBtn: {
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid var(--csp-border-strong, rgba(255,255,255,0.12))',
    background: 'var(--csp-surface-2-bg, rgba(0,0,0,0.18))',
    color: 'var(--csp-text, rgba(230,237,243,0.85))',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 900,
  },
  kpi: {
    borderRadius: 12,
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    background: 'var(--csp-surface-2-bg, rgba(0,0,0,0.18))',
    padding: 12,
  },
  kpiLabel: { color: 'var(--csp-muted, rgba(230,237,243,0.65))', fontSize: 12, fontWeight: 900 },
  kpiValue: { fontSize: 22, fontWeight: 900, marginTop: 6 },
  notifRow: {
    borderRadius: 12,
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    background: 'var(--csp-surface-2-bg, rgba(0,0,0,0.18))',
    padding: 10,
  },
}

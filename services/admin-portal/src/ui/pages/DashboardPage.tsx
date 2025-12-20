import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { getCompany } from '../components/storage'
import { Button, ErrorBanner, Mono, PageHeader, Panel } from '../components/ui'

type MePrefs = { user_id: string; updated_at: string; preferences: any }
type Notification = { id?: string; created_at?: string; kind?: string; title?: string; message?: string; meta?: any }
type NotificationsOut = { items: Notification[] }

const ALL_WIDGETS: { key: string; title: string; description: string }[] = [
  { key: 'quick_actions', title: 'Quick actions', description: 'Fast navigation for agents (few clicks).' },
  { key: 'kpis', title: 'KPIs', description: 'At-a-glance counters (starter).' },
  { key: 'notifications', title: 'Agenda & notifications', description: 'Newest in-app notifications.' },
  { key: 'notes', title: 'My notes', description: 'Scratchpad saved per user.' },
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
  return ['quick_actions', 'kpis', 'notifications', 'notes']
}

function moveInArray<T>(xs: T[], fromIdx: number, toIdx: number): T[] {
  const copy = xs.slice()
  const [it] = copy.splice(fromIdx, 1)
  copy.splice(toIdx, 0, it)
  return copy
}

export function DashboardPage(props: { apiBase: string }) {
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
        if (!cancelled) setNotifs((r?.items || []).slice(0, 8))
      })
      .catch(() => {
        if (!cancelled) setNotifs([])
      })
    return () => {
      cancelled = true
    }
  }, [props.apiBase])

  const availableToAdd = useMemo(() => ALL_WIDGETS.filter((w) => !layout.includes(w.key)), [layout])

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
        title="Dashboard"
        subtitle={company ? `Signed in for ${company.name} (${company.code}).` : 'No company selected.'}
        right={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setEdit(!edit)} title="Customize dashboard widgets">
              {edit ? 'Done' : 'Customize'}
            </Button>
            {edit ? (
              <Button variant="primary" disabled={busy} onClick={() => void saveDashboard()}>
                {busy ? 'Saving…' : 'Save layout'}
              </Button>
            ) : null}
          </>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      {edit ? (
        <Panel title="Add / manage widgets" subtitle="Drag and drop cards to reorder. Remove anything you don’t use.">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'rgba(230,237,243,0.85)' }}>
              Add widget
              <select
                value={addKey}
                onChange={(e) => setAddKey(e.target.value)}
                style={{
                  padding: '10px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(0,0,0,0.25)',
                  color: '#e6edf3',
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
          const title = def?.title || k
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
                  <div style={styles.muted}>Fast navigation for frequent workflows.</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Link to="/app/sales" style={styles.pill}>
                      Quote / Hold / Confirm
                    </Link>
                    <Link to="/app/customers" style={styles.pill}>
                      Customer search
                    </Link>
                    <Link to="/app/cruises" style={styles.pill}>
                      Browse sailings
                    </Link>
                  </div>
                </div>
              ) : null}

              {k === 'kpis' ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <div style={styles.muted}>Starter KPI block (extend with real-time booking/hold counts).</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={styles.kpi}>
                      <div style={styles.kpiLabel}>Notifications (loaded)</div>
                      <div style={styles.kpiValue}>{notifs.length}</div>
                    </div>
                    <div style={styles.kpi}>
                      <div style={styles.kpiLabel}>Widgets</div>
                      <div style={styles.kpiValue}>{layout.length}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {k === 'notifications' ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <div style={styles.muted}>Latest items from the in-app feed.</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {notifs.slice(0, 6).map((n, i) => (
                      <div key={String(n.id || i)} style={styles.notifRow}>
                        <div style={{ fontWeight: 800 }}>{String(n.title || n.kind || 'Notification')}</div>
                        <div style={styles.mutedSmall}>
                          <Mono>{String(n.created_at || '')}</Mono> {n.message ? `· ${String(n.message)}` : ''}
                        </div>
                      </div>
                    ))}
                    {!notifs.length ? <div style={styles.muted}>No notifications yet.</div> : null}
                  </div>
                </div>
              ) : null}

              {k === 'notes' ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <div style={styles.muted}>Saved per user (Preferences → dashboard.notes).</div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add quick notes, call-backs, reminders…"
                    style={{
                      width: '100%',
                      minHeight: 140,
                      padding: 10,
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(0,0,0,0.25)',
                      color: '#e6edf3',
                      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                      fontSize: 12,
                    }}
                    disabled={busy && !edit}
                  />
                  {edit ? <div style={styles.mutedSmall}>Notes will be saved when you click “Save layout”.</div> : null}
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
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  cardTitle: { fontWeight: 900, marginBottom: 8 },
  muted: { color: 'rgba(230,237,243,0.65)', fontSize: 12, lineHeight: 1.45 },
  mutedSmall: { color: 'rgba(230,237,243,0.58)', fontSize: 11, lineHeight: 1.35 },
  pill: {
    padding: '8px 10px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.18)',
    color: '#e6edf3',
    textDecoration: 'none',
    fontSize: 12,
    fontWeight: 900,
  },
  removeBtn: {
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.18)',
    color: 'rgba(230,237,243,0.85)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 900,
  },
  kpi: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(0,0,0,0.18)',
    padding: 12,
  },
  kpiLabel: { color: 'rgba(230,237,243,0.65)', fontSize: 12, fontWeight: 900 },
  kpiValue: { fontSize: 22, fontWeight: 900, marginTop: 6 },
  notifRow: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(0,0,0,0.18)',
    padding: 10,
  },
}


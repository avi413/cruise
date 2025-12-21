import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { getCompany } from '../components/storage'
import { Button, ErrorBanner, Input, Mono, PageHeader, Panel, Select } from '../components/ui'

type Sailing = {
  id: string
  code: string
  ship_id: string
  start_date: string
  end_date: string
  embark_port_code: string
  debark_port_code: string
  status: string
  created_at: string
  itinerary_id?: string | null
}

type PortStop = { port_code: string; port_name?: string | null; arrival: string; departure: string }
type Ship = { id: string; name: string; code: string }
type Itinerary = { id: string; code?: string | null; titles?: Record<string, string>; stops?: any[] }

type RowEdit = {
  code: string
  ship_id: string
  start_date: string
  end_date: string
  embark_port_code: string
  debark_port_code: string
  status: 'planned' | 'open' | 'closed' | 'cancelled'
}

type RowStopForm = { portCode: string; portName: string; arrival: string; departure: string }

function pickTitle(titles: Record<string, string> | undefined, preferred: string[]): string {
  const t = titles || {}
  for (const k of preferred) {
    const v = t[k]
    if (v) return v
  }
  return Object.values(t)[0] || '—'
}

function HoverRow({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styles.tr,
        background: hover ? 'var(--csp-border-strong, rgba(0,0,0,0.05))' : 'transparent',
      }}
    >
      {children}
    </tr>
  )
}

export function SailingsPage(props: { apiBase: string }) {
  const company = getCompany()

  const [items, setItems] = useState<Sailing[]>([])
  const [ships, setShips] = useState<Ship[]>([])
  const [itineraries, setItineraries] = useState<Itinerary[]>([])
  const itinerariesById = useMemo(() => {
    const map: Record<string, Itinerary> = {}
    for (const it of itineraries || []) map[String(it.id)] = it
    return map
  }, [itineraries])

  const shipsById = useMemo(() => {
    const map: Record<string, Ship> = {}
    for (const s of ships || []) map[String(s.id)] = s
    return map
  }, [ships])

  // View state: 'list', 'create', 'edit'
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [detailsById, setDetailsById] = useState<Record<string, Sailing>>({})
  const [stopsBySailingId, setStopsBySailingId] = useState<Record<string, PortStop[]>>({})
  const [editById, setEditById] = useState<Record<string, RowEdit>>({})
  const [stopFormById, setStopFormById] = useState<Record<string, RowStopForm>>({})

  // create from itinerary
  const [newFromItineraryId, setNewFromItineraryId] = useState<string>('')
  const [newFromItineraryStart, setNewFromItineraryStart] = useState<string>('')
  const [newFromItineraryCode, setNewFromItineraryCode] = useState<string>('')
  const [newFromItineraryShipId, setNewFromItineraryShipId] = useState<string>('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const listEndpoint = useMemo(() => `/v1/sailings`, [])

  async function refresh() {
    const r = await apiFetch<Sailing[]>(props.apiBase, listEndpoint, { auth: false, tenant: false })
    setItems(r || [])
  }

  useEffect(() => {
    refresh().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listEndpoint])

  useEffect(() => {
    if (!company?.id) return
    apiFetch<Ship[]>(props.apiBase, `/v1/companies/${company.id}/ships`, { auth: false, tenant: false })
      .then((r) => setShips(r || []))
      .catch(() => setShips([]))
  }, [company?.id, props.apiBase])

  useEffect(() => {
    apiFetch<Itinerary[]>(props.apiBase, `/v1/itineraries`, { auth: false, tenant: false })
      .then((r) => {
        setItineraries(r || [])
        if (!newFromItineraryId && (r || []).length) setNewFromItineraryId((r || [])[0].id)
      })
      .catch(() => setItineraries([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.apiBase])

  async function ensureRowLoaded(sailingId: string) {
    const id = String(sailingId || '')
    if (!id) return
    // Always fetch fresh data when entering edit mode
    
    try {
      const [s, stops] = await Promise.all([
        apiFetch<Sailing>(props.apiBase, `/v1/sailings/${encodeURIComponent(id)}`, { auth: false, tenant: false }),
        apiFetch<PortStop[]>(props.apiBase, `/v1/sailings/${encodeURIComponent(id)}/itinerary`, { auth: false, tenant: false }).catch(() => []),
      ])

      setDetailsById((prev) => ({ ...prev, [id]: s }))
      setStopsBySailingId((prev) => ({ ...prev, [id]: stops || [] }))
      setEditById((prev) => ({
          ...prev,
          [id]: {
            code: s?.code || '',
            ship_id: s?.ship_id || '',
            start_date: s?.start_date || '',
            end_date: s?.end_date || '',
            embark_port_code: s?.embark_port_code || '',
            debark_port_code: s?.debark_port_code || '',
            status: ((s?.status as any) || 'planned') as RowEdit['status'],
          },
      }))
      setStopFormById((prev) => (prev[id] ? prev : { ...prev, [id]: { portCode: '', portName: '', arrival: '', departure: '' } }))
    } catch (e: any) {
       setErr(String(e?.detail || e?.message || e))
    }
  }

  function startEdit(s: Sailing) {
    setEditingId(s.id)
    ensureRowLoaded(s.id)
    setView('edit')
  }

  async function createFromItinerary() {
    if (!newFromItineraryId) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/itineraries/${encodeURIComponent(newFromItineraryId)}/sailings`, {
        method: 'POST',
        body: {
          code: newFromItineraryCode,
          ship_id: newFromItineraryShipId,
          start_date: newFromItineraryStart,
        },
        auth: true,
        tenant: false,
      })
      setNewFromItineraryCode('')
      setNewFromItineraryShipId('')
      setNewFromItineraryStart('')
      await refresh()
      setView('list')
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function updateSailing() {
    if (!editingId) return
    const sid = String(editingId)
    const e = editById[sid]
    if (!e) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/sailings/${encodeURIComponent(sid)}`, {
        method: 'PATCH',
        body: {
          code: e.code || null,
          ship_id: e.ship_id || null,
          start_date: e.start_date || null,
          end_date: e.end_date || null,
          embark_port_code: e.embark_port_code || null,
          debark_port_code: e.debark_port_code || null,
          status: e.status,
        },
        auth: true,
        tenant: false,
      })
      await refresh()
      // Reload details 
      await ensureRowLoaded(sid)
      setView('list')
      setEditingId(null)
    } catch (ex: any) {
      setErr(String(ex?.detail || ex?.message || ex))
    } finally {
      setBusy(false)
    }
  }

  async function addStop(sailingId: string) {
    const sid = String(sailingId)
    const f = stopFormById[sid]
    if (!sid || !f) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/sailings/${encodeURIComponent(sid)}/port-stops`, {
        method: 'POST',
        body: { port_code: f.portCode, port_name: f.portName || null, arrival: f.arrival, departure: f.departure },
        auth: true,
        tenant: false,
      })
      setStopFormById((prev) => ({ ...prev, [sid]: { portCode: '', portName: '', arrival: '', departure: '' } }))
      const r = await apiFetch<PortStop[]>(props.apiBase, `/v1/sailings/${encodeURIComponent(sid)}/itinerary`, { auth: false, tenant: false })
      setStopsBySailingId((prev) => ({ ...prev, [sid]: r || [] }))
    } catch (ex: any) {
      setErr(String(ex?.detail || ex?.message || ex))
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((s) => {
      const ship = shipsById[String(s.ship_id)]
      const it = itinerariesById[String(s.itinerary_id || '')]
      const hay = [
        s.code,
        s.id,
        s.start_date,
        s.end_date,
        s.embark_port_code,
        s.debark_port_code,
        s.ship_id,
        ship?.name,
        ship?.code,
        s.itinerary_id,
        it?.code,
        pickTitle(it?.titles, ['en', 'ar']),
        s.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [items, itinerariesById, q, shipsById])

  function renderList() {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--csp-surface-bg)', padding: 12, borderRadius: 8, border: '1px solid var(--csp-border)' }}>
            <div style={{ flex: 1 }}>
                <Input 
                    value={q} 
                    onChange={(e) => setQ(e.target.value)} 
                    placeholder="Search sailings by code, ship, itinerary..." 
                    style={{ width: '100%', maxWidth: 400 }}
                />
            </div>
            <Button variant="primary" onClick={() => setView('create')}>New Sailing</Button>
            <Button variant="secondary" onClick={() => void refresh()}>Refresh</Button>
        </div>

        <div style={{ border: '1px solid var(--csp-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--csp-surface-bg)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr style={{ background: 'var(--csp-border-strong)', color: 'var(--csp-text)', textAlign: 'left' }}>
                        <th style={styles.th}>Sailing</th>
                        <th style={styles.th}>Dates</th>
                        <th style={styles.th}>Ports</th>
                        <th style={styles.th}>Ship</th>
                        <th style={styles.th}>Itinerary</th>
                        <th style={styles.th}>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(s => {
                        const sid = String(s.id)
                        const ship = shipsById[String(s.ship_id)]
                        const it = itinerariesById[String(s.itinerary_id || '')]
                        
                        return (
                            <HoverRow
                                key={s.id} 
                                onClick={() => startEdit(s)}
                            >
                                <td style={styles.td}>
                                    <div style={{ fontWeight: 900 }}>{s.code || '—'}</div>
                                    <div style={styles.sub}>id <Mono>{sid}</Mono></div>
                                </td>
                                <td style={styles.tdMono}>
                                    {String(s.start_date || '—')} → {String(s.end_date || '—')}
                                </td>
                                <td style={styles.tdMono}>
                                    {String(s.embark_port_code || '—')} → {String(s.debark_port_code || '—')}
                                </td>
                                <td style={styles.td}>
                                    <div style={{ fontWeight: 800 }}>{ship?.name || '—'}</div>
                                    <div style={styles.sub}><Mono>{String(ship?.code || s.ship_id || '—')}</Mono></div>
                                </td>
                                <td style={styles.td}>
                                    <div style={{ fontWeight: 800 }}>{it ? pickTitle(it.titles, ['en', 'ar']) : '—'}</div>
                                    <div style={styles.sub}>id <Mono>{String(s.itinerary_id || '—')}</Mono></div>
                                </td>
                                <td style={styles.td}>
                                    <span style={badgeStyles[s.status as keyof typeof badgeStyles] || badgeStyles.default}>{s.status}</span>
                                </td>
                            </HoverRow>
                        )
                    })}
                    {filtered.length === 0 && (
                        <tr>
                            <td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: 'var(--csp-muted)', padding: 32 }}>
                                No sailings found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    )
  }

  function renderCreate() {
    return (
        <Panel 
            title="Create Sailing" 
            subtitle="Create a new sailing from an existing itinerary."
            right={<Button variant="secondary" onClick={() => setView('list')}>Cancel</Button>}
        >
            <div style={{ maxWidth: 600, display: 'grid', gap: 20 }}>
                <Select label="Itinerary" value={newFromItineraryId} onChange={(e) => setNewFromItineraryId(e.target.value)}>
                    {itineraries.map((i) => (
                        <option key={i.id} value={i.id}>
                        {(i.code || i.id).slice(0, 16)} · {pickTitle(i.titles, ['en', 'ar'])}
                        </option>
                    ))}
                    {itineraries.length === 0 ? <option value="">(no itineraries)</option> : null}
                </Select>
                <Input label="Sailing code" value={newFromItineraryCode} onChange={(e) => setNewFromItineraryCode(e.target.value)} placeholder="S-2026-07-01-A" />
                <Select label="Ship" value={newFromItineraryShipId} onChange={(e) => setNewFromItineraryShipId(e.target.value)}>
                    <option value="">(select)</option>
                    {ships.map((s) => (
                        <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                        </option>
                    ))}
                </Select>
                <Input label="Start date" value={newFromItineraryStart} onChange={(e) => setNewFromItineraryStart(e.target.value)} type="date" />
                
                <div style={{ paddingTop: 20, borderTop: '1px solid var(--csp-border)' }}>
                    <Button
                        variant="primary"
                        disabled={busy || !newFromItineraryId || !newFromItineraryCode.trim() || !newFromItineraryShipId.trim() || !newFromItineraryStart}
                        onClick={() => void createFromItinerary()}
                    >
                        {busy ? 'Creating...' : 'Create Sailing'}
                    </Button>
                </div>
            </div>
        </Panel>
    )
  }

  function renderEdit() {
    if (!editingId) return null
    const sid = editingId
    const rowEdit = editById[sid]
    const rowDetails = detailsById[sid]
    const rowStops = stopsBySailingId[sid] || []
    const stopForm = stopFormById[sid]
    const it = itinerariesById[String(rowDetails?.itinerary_id || '')]

    return (
        <div style={{ display: 'grid', gap: 24 }}>
            <Panel 
                title={`Edit Sailing: ${rowDetails?.code || sid}`} 
                subtitle="Update sailing details."
                right={<Button variant="secondary" onClick={() => { setView('list'); setEditingId(null); }}>Back to List</Button>}
            >
                {rowEdit ? (
                <div style={{ maxWidth: 800, display: 'grid', gap: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <Input
                        label="Code"
                        value={rowEdit.code}
                        onChange={(e) => setEditById((prev) => ({ ...prev, [sid]: { ...prev[sid], code: e.target.value } }))}
                        />
                        <Select
                        label="Ship"
                        value={rowEdit.ship_id}
                        onChange={(e) => setEditById((prev) => ({ ...prev, [sid]: { ...prev[sid], ship_id: e.target.value } }))}
                        >
                        <option value="">(select)</option>
                        {ships.map((sh) => (
                            <option key={sh.id} value={sh.id}>
                            {sh.name} ({sh.code})
                            </option>
                        ))}
                        </Select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <Input
                        label="Start date"
                        type="date"
                        value={rowEdit.start_date}
                        onChange={(e) => setEditById((prev) => ({ ...prev, [sid]: { ...prev[sid], start_date: e.target.value } }))}
                        />
                        <Input
                        label="End date"
                        type="date"
                        value={rowEdit.end_date}
                        onChange={(e) => setEditById((prev) => ({ ...prev, [sid]: { ...prev[sid], end_date: e.target.value } }))}
                        />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <Input
                        label="Embark port"
                        value={rowEdit.embark_port_code}
                        onChange={(e) => setEditById((prev) => ({ ...prev, [sid]: { ...prev[sid], embark_port_code: e.target.value } }))}
                        />
                        <Input
                        label="Debark port"
                        value={rowEdit.debark_port_code}
                        onChange={(e) => setEditById((prev) => ({ ...prev, [sid]: { ...prev[sid], debark_port_code: e.target.value } }))}
                        />
                    </div>
                    <Select
                        label="Status"
                        value={rowEdit.status}
                        onChange={(e) => setEditById((prev) => ({ ...prev, [sid]: { ...prev[sid], status: e.target.value as any } }))}
                    >
                        <option value="planned">planned</option>
                        <option value="open">open</option>
                        <option value="closed">closed</option>
                        <option value="cancelled">cancelled</option>
                    </Select>

                    <div style={{ paddingTop: 20, borderTop: '1px solid var(--csp-border)', display: 'flex', justifyContent: 'flex-end' }}>
                         <Button variant="primary" disabled={busy} onClick={() => void updateSailing()}>
                            {busy ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </div>
                ) : <div style={{ padding: 20 }}>Loading details...</div>}
            </Panel>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
                <Panel title="Related: Itinerary" subtitle="The parent’s related itinerary.">
                    <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                    <div>
                        Title: <span style={{ fontWeight: 900 }}>{it ? pickTitle(it.titles, ['en', 'ar']) : '—'}</span>
                    </div>
                    <div>
                        Code: <Mono>{String(it?.code || '—')}</Mono>
                    </div>
                    <div>
                        Id: <Mono>{String(rowDetails?.itinerary_id || '—')}</Mono>
                    </div>
                    </div>
                </Panel>

                <Panel title={`Related: Port stops (${rowStops.length})`} subtitle="Stops are shown below.">
                     <div style={{ overflow: 'auto', marginBottom: 20 }}>
                        <table style={styles.table}>
                            <thead>
                            <tr>
                                <th style={styles.th}>Port</th>
                                <th style={styles.th}>Arrival</th>
                                <th style={styles.th}>Departure</th>
                            </tr>
                            </thead>
                            <tbody>
                            {rowStops.map((p, idx) => (
                                <tr key={`${p.port_code}-${idx}`}>
                                <td style={styles.td}>
                                    <Mono>{p.port_code}</Mono> {p.port_name ? <span style={styles.sub}>({p.port_name})</span> : null}
                                </td>
                                <td style={styles.tdMono}>{p.arrival}</td>
                                <td style={styles.tdMono}>{p.departure}</td>
                                </tr>
                            ))}
                            {rowStops.length === 0 ? (
                                <tr>
                                <td colSpan={3} style={{ ...styles.td, textAlign: 'center', color: 'var(--csp-muted)' }}>
                                    No port stops yet.
                                </td>
                                </tr>
                            ) : null}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ paddingTop: 16, borderTop: '1px solid var(--csp-border)' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Add port stop</div>
                        {stopForm ? (
                            <div style={{ display: 'grid', gap: 10 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Input
                                    label="Port code"
                                    value={stopForm.portCode}
                                    onChange={(e) => setStopFormById((prev) => ({ ...prev, [sid]: { ...prev[sid], portCode: e.target.value } }))}
                                    placeholder="PMI"
                                />
                                <Input
                                    label="Port name (optional)"
                                    value={stopForm.portName}
                                    onChange={(e) => setStopFormById((prev) => ({ ...prev, [sid]: { ...prev[sid], portName: e.target.value } }))}
                                    placeholder="Palma"
                                />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Input
                                    label="Arrival (ISO)"
                                    value={stopForm.arrival}
                                    onChange={(e) => setStopFormById((prev) => ({ ...prev, [sid]: { ...prev[sid], arrival: e.target.value } }))}
                                    placeholder="2026-07-02T08:00:00Z"
                                />
                                <Input
                                    label="Departure (ISO)"
                                    value={stopForm.departure}
                                    onChange={(e) => setStopFormById((prev) => ({ ...prev, [sid]: { ...prev[sid], departure: e.target.value } }))}
                                    placeholder="2026-07-02T18:00:00Z"
                                />
                                </div>
                                <Button
                                variant="primary"
                                disabled={busy || !stopForm.portCode.trim() || !stopForm.arrival.trim() || !stopForm.departure.trim()}
                                onClick={() => void addStop(sid)}
                                >
                                {busy ? 'Saving...' : 'Add stop'}
                                </Button>
                            </div>
                            ) : (
                            <div style={{ color: 'rgba(230,237,243,0.65)', fontSize: 13 }}>Loading…</div>
                        )}
                    </div>
                </Panel>
            </div>
        </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 24, paddingBottom: 48 }}>
      <PageHeader
        title="Sailings Management"
        subtitle="Manage sailings, their schedules, and port stops."
      />

      {err ? <ErrorBanner message={err} /> : null}

      {view === 'list' && renderList()}
      {view === 'create' && renderCreate()}
      {view === 'edit' && renderEdit()}
    </div>
  )
}

const styles = {
    th: {
        padding: '12px 16px',
        fontWeight: 600,
        fontSize: 12,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        borderBottom: '1px solid var(--csp-border)',
        color: 'var(--csp-muted)'
    },
    td: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--csp-border)',
        color: 'var(--csp-text)',
        verticalAlign: 'top'
    },
    tdMono: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--csp-border)',
        color: 'var(--csp-text)',
        verticalAlign: 'top',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 12
    },
    tr: {
        cursor: 'pointer',
        transition: 'background 0.15s ease'
    },
    sub: { marginTop: 4, color: 'var(--csp-muted)', fontSize: 12, lineHeight: 1.35 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
}

const badgeBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  border: '1px solid var(--csp-border, rgba(255,255,255,0.14))',
  background: 'color-mix(in srgb, var(--csp-surface-bg, rgba(255,255,255,0.05)) 82%, transparent)',
  color: 'var(--csp-text, #e6edf3)',
  textTransform: 'lowercase',
}

const badgeStyles: Record<string, React.CSSProperties> = {
  planned: { ...badgeBase },
  open: { ...badgeBase, border: '1px solid var(--csp-primary-border)', background: 'var(--csp-primary-soft)' },
  closed: { ...badgeBase, border: '1px solid rgba(63,185,80,0.55)', background: 'rgba(63,185,80,0.18)' },
  cancelled: { ...badgeBase, border: '1px solid rgba(220, 38, 38, 0.35)', background: 'rgba(220, 38, 38, 0.10)', color: 'rgb(185, 28, 28)' },
  default: badgeBase,
}

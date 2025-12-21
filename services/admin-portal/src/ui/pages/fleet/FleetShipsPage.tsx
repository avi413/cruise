import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { getCompany } from '../../components/storage'
import { Button, ErrorBanner, Input, Mono, PageHeader, Panel, Select } from '../../components/ui'

type Ship = {
  id: string
  company_id: string
  name: string
  code: string
  operator?: string | null
  decks: number
  status: 'active' | 'inactive' | 'maintenance'
  created_at: string
}

const SELECTED_SHIP_KEY = 'csp.fleet.selectedShipId'

function setSelectedShipId(shipId: string) {
  try {
    localStorage.setItem(SELECTED_SHIP_KEY, shipId)
  } catch {
    // ignore
  }
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

export function FleetShipsPage(props: { apiBase: string }) {
  const nav = useNavigate()
  const company = getCompany()
  const companyId = company?.id || ''

  const [fleet, setFleet] = useState<Ship[]>([])
  const [q, setQ] = useState('')
  
  // View state: 'list', 'create', 'edit'
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // create
  const [shipName, setShipName] = useState('')
  const [shipCode, setShipCode] = useState('')
  const [shipOperator, setShipOperator] = useState('')
  const [shipDecks, setShipDecks] = useState(0)

  // edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editOperator, setEditOperator] = useState('')
  const [editDecks, setEditDecks] = useState(0)
  const [editStatus, setEditStatus] = useState<Ship['status']>('active')
  const [editCode, setEditCode] = useState('') // Code is usually immutable but useful to see

  const fleetEndpoint = useMemo(() => (companyId ? `/v1/companies/${companyId}/ships` : null), [companyId])

  async function refreshFleet() {
    if (!fleetEndpoint) {
      setFleet([])
      return
    }
    const r = await apiFetch<Ship[]>(props.apiBase, fleetEndpoint)
    setFleet(r || [])
    
    // If we were editing and the ship is no longer there, switch to list
    if (view === 'edit' && editingId) {
      if (r && !r.find(s => s.id === editingId)) {
         setView('list')
         setEditingId(null)
      }
    }
  }

  useEffect(() => {
    refreshFleet().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetEndpoint, props.apiBase])

  // Filter fleet based on search
  const filteredFleet = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return fleet
    return fleet.filter(s => 
        s.name.toLowerCase().includes(term) || 
        s.code.toLowerCase().includes(term) ||
        (s.operator || '').toLowerCase().includes(term)
    )
  }, [fleet, q])

  async function createShip() {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch<Ship>(props.apiBase, `/v1/ships`, {
        method: 'POST',
        body: { company_id: companyId, name: shipName, code: shipCode, operator: shipOperator || null, decks: shipDecks, status: 'active' },
      })
      await refreshFleet()
      setShipName('')
      setShipCode('')
      setShipOperator('')
      setShipDecks(0)
      setView('list')
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function startEdit(s: Ship) {
    setEditingId(s.id)
    setEditName(s.name)
    setEditCode(s.code)
    setEditOperator(s.operator || '')
    setEditDecks(s.decks || 0)
    setEditStatus(s.status)
    setView('edit')
  }

  async function saveEdit() {
    if (!editingId) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/ships/${editingId}`, {
        method: 'PATCH',
        body: {
          name: editName,
          operator: editOperator || null,
          decks: editDecks,
          status: editStatus,
        },
      })
      await refreshFleet()
      setView('list')
      setEditingId(null)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteShip() {
    if (!editingId) return
    if (!confirm(`Delete ship?`)) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/ships/${editingId}`, { method: 'DELETE' })
      await refreshFleet()
      setView('list')
      setEditingId(null)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function goManageCabins() {
    if (!editingId) return
    setSelectedShipId(editingId)
    nav('/app/fleet/cabins')
  }

  if (!companyId) {
    return (
        <div style={{ padding: 24 }}>
            <ErrorBanner message="No company selected. Please select a company and sign in again." />
        </div>
    )
  }

  function renderList() {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--csp-surface-bg)', padding: 12, borderRadius: 8, border: '1px solid var(--csp-border)' }}>
            <div style={{ flex: 1 }}>
                <Input 
                    value={q} 
                    onChange={(e) => setQ(e.target.value)} 
                    placeholder="Search ships by name, code, operator..." 
                    style={{ width: '100%', maxWidth: 400 }}
                />
            </div>
            <Button variant="primary" onClick={() => setView('create')}>New Ship</Button>
            <Button variant="secondary" onClick={() => void refreshFleet()}>Refresh</Button>
        </div>

        <div style={{ border: '1px solid var(--csp-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--csp-surface-bg)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr style={{ background: 'var(--csp-border-strong)', color: 'var(--csp-text)', textAlign: 'left' }}>
                        <th style={styles.th}>Name</th>
                        <th style={styles.th}>Code</th>
                        <th style={styles.th}>Operator</th>
                        <th style={styles.th}>Decks</th>
                        <th style={styles.th}>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredFleet.map(s => (
                        <HoverRow
                            key={s.id} 
                            onClick={() => startEdit(s)}
                        >
                            <td style={styles.td}>{s.name}</td>
                            <td style={styles.td}><Mono>{s.code}</Mono></td>
                            <td style={styles.td}>{s.operator || '—'}</td>
                            <td style={styles.td}><Mono>{s.decks}</Mono></td>
                            <td style={styles.td}>{s.status}</td>
                        </HoverRow>
                    ))}
                    {filteredFleet.length === 0 && (
                        <tr>
                            <td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: 'var(--csp-muted)', padding: 32 }}>
                                No ships found.
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
            title="Create New Ship" 
            subtitle={`Add a new ship to ${company?.name || 'fleet'}.`}
            right={<Button variant="secondary" onClick={() => setView('list')}>Cancel</Button>}
        >
            <div style={{ maxWidth: 600, display: 'grid', gap: 20 }}>
                <Input label="Ship Name" value={shipName} onChange={(e) => setShipName(e.target.value)} placeholder="e.g. MV Horizon" />
                <Input label="Ship Code (Unique)" value={shipCode} onChange={(e) => setShipCode(e.target.value)} placeholder="e.g. HORIZON" />
                <Input label="Operator (Optional)" value={shipOperator} onChange={(e) => setShipOperator(e.target.value)} placeholder="e.g. Oceanic" />
                <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 13, color: 'var(--csp-text-muted)' }}>Decks</div>
                    <Input 
                        value={shipDecks} 
                        onChange={(e) => setShipDecks(Number(e.target.value))} 
                        type="number" 
                        min={0} 
                        step={1} 
                    />
                </div>

                <div style={{ paddingTop: 20, borderTop: '1px solid var(--csp-border)' }}>
                    <Button variant="primary" disabled={busy || !shipName.trim() || !shipCode.trim()} onClick={() => void createShip()}>
                        {busy ? 'Creating...' : 'Create Ship'}
                    </Button>
                </div>
            </div>
        </Panel>
    )
  }

  function renderEdit() {
    return (
        <Panel 
            title={`Edit Ship: ${editName}`} 
            subtitle="Update ship details or manage cabins."
            right={<Button variant="secondary" onClick={() => setView('list')}>Back to List</Button>}
        >
             <div style={{ maxWidth: 600, display: 'grid', gap: 20 }}>
                <Input label="Ship Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                <div style={{ opacity: 0.7 }}>
                     <Input label="Ship Code" value={editCode} disabled />
                </div>
                <Input label="Operator" value={editOperator} onChange={(e) => setEditOperator(e.target.value)} />
                
                <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 13, color: 'var(--csp-text-muted)' }}>Decks</div>
                    <Input 
                        value={editDecks} 
                        onChange={(e) => setEditDecks(Number(e.target.value))} 
                        type="number" 
                        min={0} 
                        step={1} 
                    />
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 13, color: 'var(--csp-text-muted)' }}>Status</div>
                    <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value as Ship['status'])}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="maintenance">Maintenance</option>
                    </Select>
                </div>

                <div style={{ paddingTop: 20, borderTop: '1px solid var(--csp-border)', display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                         <Button variant="danger" disabled={busy} onClick={() => void deleteShip()}>
                            Delete Ship
                        </Button>
                        <Button variant="secondary" onClick={goManageCabins}>
                            Manage Cabins
                        </Button>
                    </div>
                   
                    <Button variant="primary" disabled={busy} onClick={() => void saveEdit()}>
                        {busy ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </div>
        </Panel>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 24, paddingBottom: 48 }}>
      <PageHeader
        title="Fleet Management"
        subtitle={`Manage ships for ${company?.name || 'company'}.`}
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
        color: 'var(--csp-text)'
    },
    tr: {
        cursor: 'pointer',
        transition: 'background 0.15s ease'
    }
}

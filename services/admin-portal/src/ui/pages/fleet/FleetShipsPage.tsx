import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { getCompany } from '../../components/storage'

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

export function FleetShipsPage(props: { apiBase: string }) {
  const nav = useNavigate()
  const company = getCompany()
  const companyId = company?.id || ''

  const [fleet, setFleet] = useState<Ship[]>([])

  const [shipName, setShipName] = useState('')
  const [shipCode, setShipCode] = useState('')
  const [shipOperator, setShipOperator] = useState('')
  const [shipDecks, setShipDecks] = useState(0)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editOperator, setEditOperator] = useState('')
  const [editDecks, setEditDecks] = useState(0)
  const [editStatus, setEditStatus] = useState<Ship['status']>('active')

  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fleetEndpoint = useMemo(() => (companyId ? `/v1/companies/${companyId}/fleet` : null), [companyId])

  async function refreshFleet() {
    if (!fleetEndpoint) {
      setFleet([])
      return
    }
    const r = await apiFetch<{ items: Ship[] }>(props.apiBase, fleetEndpoint)
    setFleet(r.items)
  }

  useEffect(() => {
    refreshFleet().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetEndpoint, props.apiBase])

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
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function startEdit(s: Ship) {
    setEditingId(s.id)
    setEditName(s.name)
    setEditOperator(s.operator || '')
    setEditDecks(s.decks || 0)
    setEditStatus(s.status)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditOperator('')
    setEditDecks(0)
    setEditStatus('active')
  }

  async function saveEdit(shipId: string) {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/ships/${shipId}`, {
        method: 'PATCH',
        body: {
          name: editName,
          operator: editOperator || null,
          decks: editDecks,
          status: editStatus,
        },
      })
      await refreshFleet()
      cancelEdit()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteShip(shipId: string, shipLabel: string) {
    if (!confirm(`Delete ship "${shipLabel}"?\n\nThis will also delete its cabins and categories.`)) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/ships/${shipId}`, { method: 'DELETE' })
      await refreshFleet()
      cancelEdit()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function goManageCabins(shipId: string) {
    setSelectedShipId(shipId)
    nav('/app/fleet/cabins')
  }

  if (!companyId) {
    return <div style={styles.error}>No company selected. Please select a company and sign in again.</div>
  }

  return (
    <div style={styles.wrap}>
      {err ? <div style={styles.error}>{err}</div> : null}

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Create ship</div>
          <div style={styles.form}>
            <label style={styles.label}>
              Company
              <input style={styles.input} value={company ? `${company.name} (${company.code})` : companyId} readOnly />
            </label>
            <label style={styles.label}>
              Ship name
              <input style={styles.input} value={shipName} onChange={(e) => setShipName(e.target.value)} placeholder="MV Horizon" />
            </label>
            <label style={styles.label}>
              Ship code
              <input style={styles.input} value={shipCode} onChange={(e) => setShipCode(e.target.value)} placeholder="HORIZON" />
            </label>
            <label style={styles.label}>
              Operator (optional)
              <input style={styles.input} value={shipOperator} onChange={(e) => setShipOperator(e.target.value)} placeholder="Oceanic" />
            </label>
            <label style={styles.label}>
              Decks
              <input style={styles.input} value={shipDecks} onChange={(e) => setShipDecks(Number(e.target.value))} type="number" min={0} step={1} />
            </label>
            <button style={styles.primaryBtn} disabled={busy || !companyId || !shipName.trim() || !shipCode.trim()} onClick={() => void createShip()}>
              {busy ? 'Saving…' : 'Create ship'}
            </button>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Ships</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Code</th>
                  <th style={styles.th}>Operator</th>
                  <th style={styles.th}>Decks</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {fleet.map((s) => {
                  const isEditing = editingId === s.id
                  return (
                    <tr key={s.id}>
                      <td style={styles.td}>
                        {isEditing ? <input style={styles.inputInline} value={editName} onChange={(e) => setEditName(e.target.value)} /> : s.name}
                      </td>
                      <td style={styles.tdMono}>{s.code}</td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input style={styles.inputInline} value={editOperator} onChange={(e) => setEditOperator(e.target.value)} placeholder="(optional)" />
                        ) : (
                          s.operator || '—'
                        )}
                      </td>
                      <td style={styles.tdMono}>
                        {isEditing ? (
                          <input style={styles.inputInline} value={editDecks} onChange={(e) => setEditDecks(Number(e.target.value))} type="number" min={0} step={1} />
                        ) : (
                          s.decks
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <select style={styles.inputInline} value={editStatus} onChange={(e) => setEditStatus(e.target.value as Ship['status'])}>
                            <option value="active">active</option>
                            <option value="inactive">inactive</option>
                            <option value="maintenance">maintenance</option>
                          </select>
                        ) : (
                          s.status
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <div style={styles.actions}>
                            <button style={styles.primaryBtnSm} disabled={busy || !editName.trim()} onClick={() => void saveEdit(s.id)}>
                              Save
                            </button>
                            <button style={styles.secondaryBtnSm} disabled={busy} onClick={cancelEdit}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={styles.actions}>
                            <button style={styles.secondaryBtnSm} disabled={busy} onClick={() => startEdit(s)}>
                              Edit
                            </button>
                            <button style={styles.secondaryBtnSm} disabled={busy} onClick={() => goManageCabins(s.id)}>
                              Manage cabins
                            </button>
                            <button style={styles.dangerBtnSm} disabled={busy} onClick={() => void deleteShip(s.id, `${s.name} (${s.code})`)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {fleet.length === 0 ? (
                  <tr>
                    <td style={styles.tdMuted} colSpan={6}>
                      No ships yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'grid', gap: 12 },
  grid: { display: 'grid', gridTemplateColumns: '420px 1fr', gap: 12, alignItems: 'start' },
  panel: {
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  panelTitle: { fontWeight: 900, marginBottom: 10 },
  form: { display: 'grid', gap: 10 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'rgba(230,237,243,0.85)' },
  input: {
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.25)',
    color: '#e6edf3',
  },
  inputInline: {
    width: '100%',
    padding: '8px 8px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.25)',
    color: '#e6edf3',
  },
  primaryBtn: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(56,139,253,0.55)',
    background: 'rgba(56,139,253,0.22)',
    color: '#e6edf3',
    cursor: 'pointer',
    fontWeight: 900,
  },
  primaryBtnSm: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid rgba(56,139,253,0.55)',
    background: 'rgba(56,139,253,0.22)',
    color: '#e6edf3',
    cursor: 'pointer',
    fontWeight: 900,
  },
  secondaryBtnSm: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: '#e6edf3',
    cursor: 'pointer',
    fontWeight: 800,
  },
  dangerBtnSm: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid rgba(248,81,73,0.35)',
    background: 'rgba(248,81,73,0.12)',
    color: '#ffb4ae',
    cursor: 'pointer',
    fontWeight: 800,
  },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  error: {
    padding: 12,
    borderRadius: 12,
    background: 'rgba(248,81,73,0.12)',
    border: '1px solid rgba(248,81,73,0.35)',
    color: '#ffb4ae',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
  tableWrap: { overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.10)',
    color: 'rgba(230,237,243,0.75)',
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  td: { padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
  },
  tdMuted: { padding: '14px 8px', color: 'rgba(230,237,243,0.60)' },
}


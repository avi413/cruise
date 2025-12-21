import React, { useEffect, useMemo, useState } from 'react'
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

type CabinCategory = {
  id: string
  ship_id: string
  code: string
  name: string
  view: string
  cabin_class: string
  max_occupancy: number
  meta: any
}

const SELECTED_SHIP_KEY = 'csp.fleet.selectedShipId'

function getSelectedShipId(): string {
  try {
    return localStorage.getItem(SELECTED_SHIP_KEY) || ''
  } catch {
    return ''
  }
}

function setSelectedShipId(shipId: string) {
  try {
    localStorage.setItem(SELECTED_SHIP_KEY, shipId)
  } catch {
    // ignore
  }
}

export function FleetCabinCategoriesPage(props: { apiBase: string }) {
  const company = getCompany()
  const companyId = company?.id || ''

  const [fleet, setFleet] = useState<Ship[]>([])
  const [shipId, setShipId] = useState<string>(() => getSelectedShipId())
  const [cats, setCats] = useState<CabinCategory[]>([])

  const [catCode, setCatCode] = useState('')
  const [catName, setCatName] = useState('')
  const [catView, setCatView] = useState('inside')
  const [catClass, setCatClass] = useState('classic')
  const [catOcc, setCatOcc] = useState(2)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editView, setEditView] = useState('')
  const [editClass, setEditClass] = useState('')
  const [editOcc, setEditOcc] = useState(2)

  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fleetEndpoint = useMemo(() => (companyId ? `/v1/companies/${companyId}/ships` : null), [companyId])
  const catsEndpoint = useMemo(() => (shipId ? `/v1/ships/${shipId}/cabin-categories` : null), [shipId])

  async function refreshFleet() {
    if (!fleetEndpoint) {
      setFleet([])
      return
    }
    const r = await apiFetch<Ship[]>(props.apiBase, fleetEndpoint)
    setFleet(r)
    setShipId((prev) => {
      const next = prev && r.items.some((s) => s.id === prev) ? prev : r.items[0]?.id || ''
      setSelectedShipId(next)
      return next
    })
  }

  async function refreshCats() {
    if (!catsEndpoint) {
      setCats([])
      return
    }
    const r = await apiFetch<CabinCategory[]>(props.apiBase, catsEndpoint)
    setCats(r)
  }

  useEffect(() => {
    refreshFleet().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetEndpoint, props.apiBase])

  useEffect(() => {
    refreshCats().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catsEndpoint, props.apiBase])

  async function createCategory() {
    if (!shipId) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/ships/${shipId}/cabin-categories`, {
        method: 'POST',
        body: { code: catCode, name: catName, view: catView, cabin_class: catClass, max_occupancy: catOcc, meta: {} },
      })
      await refreshCats()
      setCatCode('')
      setCatName('')
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function startEdit(c: CabinCategory) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditView(c.view)
    setEditClass(c.cabin_class)
    setEditOcc(c.max_occupancy)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditView('')
    setEditClass('')
    setEditOcc(2)
  }

  async function saveEdit(categoryId: string) {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/cabin-categories/${categoryId}`, {
        method: 'PATCH',
        body: {
          name: editName,
          view: editView,
          cabin_class: editClass,
          max_occupancy: editOcc,
        },
      })
      await refreshCats()
      cancelEdit()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteCategory(categoryId: string, label: string) {
    if (!confirm(`Delete cabin category "${label}"?\n\nCabins using this category will be set to (none).`)) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/cabin-categories/${categoryId}`, { method: 'DELETE' })
      await refreshCats()
      cancelEdit()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  if (!companyId) {
    return <div style={styles.error}>No company selected. Please select a company and sign in again.</div>
  }

  return (
    <div style={styles.wrap}>
      {err ? <div style={styles.error}>{err}</div> : null}

      <section style={styles.panel}>
        <div style={styles.panelTitle}>Select ship</div>
        <div style={styles.form}>
          <select
            style={styles.input}
            value={shipId}
            onChange={(e) => {
              const next = e.target.value
              setShipId(next)
              setSelectedShipId(next)
              cancelEdit()
            }}
          >
            {fleet.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          <div style={styles.muted}>Ship id: {shipId || '—'}</div>
        </div>
      </section>

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Create category</div>
          <div style={styles.form}>
            <label style={styles.label}>
              Code
              <input style={styles.input} value={catCode} onChange={(e) => setCatCode(e.target.value)} placeholder="OV_FULL_DELUXE" />
            </label>
            <label style={styles.label}>
              Name
              <input style={styles.input} value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Oceanview (Full) Deluxe" />
            </label>
            <div style={styles.row2}>
              <label style={styles.label}>
                View
                <input style={styles.input} value={catView} onChange={(e) => setCatView(e.target.value)} placeholder="full_view" />
              </label>
              <label style={styles.label}>
                Class
                <input style={styles.input} value={catClass} onChange={(e) => setCatClass(e.target.value)} placeholder="deluxe" />
              </label>
            </div>
            <label style={styles.label}>
              Max occupancy
              <input style={styles.input} value={catOcc} onChange={(e) => setCatOcc(Number(e.target.value))} type="number" min={1} step={1} />
            </label>
            <button style={styles.primaryBtn} disabled={busy || !shipId || !catCode.trim() || !catName.trim()} onClick={() => void createCategory()}>
              {busy ? 'Saving…' : 'Add category'}
            </button>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Categories</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Code</th>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>View</th>
                  <th style={styles.th}>Class</th>
                  <th style={styles.th}>Occ</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => {
                  const isEditing = editingId === c.id
                  return (
                    <tr key={c.id}>
                      <td style={styles.tdMono}>{c.code}</td>
                      <td style={styles.td}>
                        {isEditing ? <input style={styles.inputInline} value={editName} onChange={(e) => setEditName(e.target.value)} /> : c.name}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? <input style={styles.inputInline} value={editView} onChange={(e) => setEditView(e.target.value)} /> : c.view}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? <input style={styles.inputInline} value={editClass} onChange={(e) => setEditClass(e.target.value)} /> : c.cabin_class}
                      </td>
                      <td style={styles.tdMono}>
                        {isEditing ? (
                          <input style={styles.inputInline} value={editOcc} onChange={(e) => setEditOcc(Number(e.target.value))} type="number" min={1} step={1} />
                        ) : (
                          c.max_occupancy
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <div style={styles.actions}>
                            <button style={styles.primaryBtnSm} disabled={busy || !editName.trim()} onClick={() => void saveEdit(c.id)}>
                              Save
                            </button>
                            <button style={styles.secondaryBtnSm} disabled={busy} onClick={cancelEdit}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={styles.actions}>
                            <button style={styles.secondaryBtnSm} disabled={busy} onClick={() => startEdit(c)}>
                              Edit
                            </button>
                            <button style={styles.dangerBtnSm} disabled={busy} onClick={() => void deleteCategory(c.id, `${c.code} · ${c.name}`)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {cats.length === 0 ? (
                  <tr>
                    <td style={styles.tdMuted} colSpan={6}>
                      No categories yet.
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
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    borderRadius: 14,
    background: 'var(--csp-surface-bg, rgba(255,255,255,0.04))',
    padding: 14,
    color: 'var(--csp-text, #e6edf3)',
  },
  panelTitle: { fontWeight: 900, marginBottom: 10 },
  form: { display: 'grid', gap: 10 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'var(--csp-text, rgba(230,237,243,0.85))' },
  input: {
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-input-border, rgba(255,255,255,0.12))',
    background: 'var(--csp-input-bg, rgba(0,0,0,0.25))',
    color: 'var(--csp-text, #e6edf3)',
  },
  inputInline: {
    width: '100%',
    padding: '8px 8px',
    borderRadius: 10,
    border: '1px solid var(--csp-input-border, rgba(255,255,255,0.12))',
    background: 'var(--csp-input-bg, rgba(0,0,0,0.25))',
    color: 'var(--csp-text, #e6edf3)',
  },
  primaryBtn: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--csp-primary-border, rgba(56,139,253,0.55))',
    background: 'var(--csp-primary-soft, rgba(56,139,253,0.22))',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 900,
  },
  primaryBtnSm: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-primary-border, rgba(56,139,253,0.55))',
    background: 'var(--csp-primary-soft, rgba(56,139,253,0.22))',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 900,
  },
  secondaryBtnSm: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-border-strong, rgba(255,255,255,0.12))',
    background: 'color-mix(in srgb, var(--csp-surface-bg, rgba(255,255,255,0.06)) 88%, transparent)',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 800,
  },
  dangerBtnSm: {
    padding: '8px 10px',
    borderRadius: 999,
    border: '1px solid rgba(220, 38, 38, 0.35)',
    background: 'rgba(220, 38, 38, 0.10)',
    color: 'rgb(185, 28, 28)',
    cursor: 'pointer',
    fontWeight: 800,
  },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  muted: { color: 'var(--csp-muted, rgba(230,237,243,0.65))', fontSize: 12 },
  error: {
    padding: 12,
    borderRadius: 12,
    background: 'rgba(220, 38, 38, 0.10)',
    border: '1px solid rgba(220, 38, 38, 0.35)',
    color: 'rgb(185, 28, 28)',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
  tableWrap: { overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    color: 'var(--csp-muted, rgba(230,237,243,0.75))',
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  td: { padding: '10px 8px', borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.06))', verticalAlign: 'top' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.06))',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
  },
  tdMuted: { padding: '14px 8px', color: 'var(--csp-muted, rgba(230,237,243,0.60))' },
}


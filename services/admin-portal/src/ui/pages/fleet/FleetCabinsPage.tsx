import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api/client'
import { getCompany } from '../../components/storage'
import * as XLSX from 'xlsx'

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

type Cabin = {
  id: string
  ship_id: string
  cabin_no: string
  deck: number
  category_id: string | null
  status: string
  accessories: string[]
  meta: any
}

type BulkCabinRow = {
  cabin_no: string
  deck?: number
  category_code?: string
  category_id?: string
  status?: string
  accessories?: string
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

export function FleetCabinsPage(props: { apiBase: string }) {
  const company = getCompany()
  const companyId = company?.id || ''

  const [fleet, setFleet] = useState<Ship[]>([])
  const [shipId, setShipId] = useState<string>(() => getSelectedShipId())
  const [cats, setCats] = useState<CabinCategory[]>([])
  const [cabins, setCabins] = useState<Cabin[]>([])

  const [cabinNo, setCabinNo] = useState('')
  const [cabinDeck, setCabinDeck] = useState(0)
  const [cabinCategoryId, setCabinCategoryId] = useState<string>('')
  const [cabinAccessories, setCabinAccessories] = useState('safety_box,iron')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDeck, setEditDeck] = useState(0)
  const [editCategoryId, setEditCategoryId] = useState<string>('')
  const [editStatus, setEditStatus] = useState('active')
  const [editAccessories, setEditAccessories] = useState('')

  const [importRows, setImportRows] = useState<BulkCabinRow[]>([])
  const [importMode, setImportMode] = useState<'skip_existing' | 'error_on_existing'>('skip_existing')
  const [importResult, setImportResult] = useState<any | null>(null)

  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const catsById = useMemo(() => {
    const m: Record<string, CabinCategory> = {}
    for (const c of cats) m[c.id] = c
    return m
  }, [cats])

  const fleetEndpoint = useMemo(() => (companyId ? `/v1/companies/${companyId}/fleet` : null), [companyId])
  const catsEndpoint = useMemo(() => (shipId ? `/v1/ships/${shipId}/cabin-categories` : null), [shipId])
  const cabinsEndpoint = useMemo(() => (shipId ? `/v1/ships/${shipId}/cabins` : null), [shipId])

  async function refreshFleet() {
    if (!fleetEndpoint) {
      setFleet([])
      return
    }
    const r = await apiFetch<{ items: Ship[] }>(props.apiBase, fleetEndpoint)
    setFleet(r.items)
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

  async function refreshCabins() {
    if (!cabinsEndpoint) {
      setCabins([])
      return
    }
    const r = await apiFetch<Cabin[]>(props.apiBase, cabinsEndpoint)
    setCabins(r)
  }

  useEffect(() => {
    refreshFleet().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetEndpoint, props.apiBase])

  useEffect(() => {
    refreshCats().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catsEndpoint, props.apiBase])

  useEffect(() => {
    refreshCabins().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinsEndpoint, props.apiBase])

  async function createCabin() {
    if (!shipId) return
    setBusy(true)
    setErr(null)
    try {
      const accessories = cabinAccessories
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      await apiFetch(props.apiBase, `/v1/ships/${shipId}/cabins`, {
        method: 'POST',
        body: { cabin_no: cabinNo, deck: cabinDeck, category_id: cabinCategoryId || null, status: 'active', accessories, meta: {} },
      })
      await refreshCabins()
      setCabinNo('')
      setCabinDeck(0)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function startEdit(c: Cabin) {
    setEditingId(c.id)
    setEditDeck(c.deck)
    setEditCategoryId(c.category_id || '')
    setEditStatus(c.status || 'active')
    setEditAccessories((c.accessories || []).join(', '))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDeck(0)
    setEditCategoryId('')
    setEditStatus('active')
    setEditAccessories('')
  }

  async function saveEdit(cabinId: string) {
    setBusy(true)
    setErr(null)
    try {
      const accessories = editAccessories
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      await apiFetch(props.apiBase, `/v1/cabins/${cabinId}`, {
        method: 'PATCH',
        body: {
          deck: editDeck,
          category_id: editCategoryId || '',
          status: editStatus,
          accessories,
        },
      })
      await refreshCabins()
      cancelEdit()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteCabin(cabinId: string, label: string) {
    if (!confirm(`Delete cabin "${label}"?`)) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/cabins/${cabinId}`, { method: 'DELETE' })
      await refreshCabins()
      cancelEdit()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function parseExcel(file: File) {
    setErr(null)
    setImportResult(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
        const rows: BulkCabinRow[] = json
          .map((r) => ({
            cabin_no: String(r.cabin_no || r.cabinNo || r['Cabin No'] || r['cabin_no'] || '').trim(),
            deck: r.deck !== undefined && r.deck !== '' ? Number(r.deck) : undefined,
            category_code: String(r.category_code || r.categoryCode || r['category_code'] || r['Category Code'] || '').trim() || undefined,
            category_id: String(r.category_id || r.categoryId || r['category_id'] || '').trim() || undefined,
            status: String(r.status || '').trim() || undefined,
            accessories: String(r.accessories || r['Accessories'] || '').trim() || undefined,
          }))
          .filter((r) => r.cabin_no)
        setImportRows(rows)
      } catch (e: any) {
        setErr(String(e?.message || e))
        setImportRows([])
      }
    }
    reader.onerror = () => setErr('Failed to read file.')
    reader.readAsArrayBuffer(file)
  }

  async function bulkImportCabins() {
    if (!shipId) return
    if (!importRows.length) return
    setBusy(true)
    setErr(null)
    setImportResult(null)
    try {
      const items = importRows.map((r) => ({
        cabin_no: r.cabin_no,
        deck: r.deck ?? 0,
        category_id: r.category_id ?? null,
        category_code: r.category_code ?? null,
        status: r.status ?? 'active',
        accessories: (r.accessories || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        meta: {},
      }))
      const res = await apiFetch(props.apiBase, `/v1/ships/${shipId}/cabins/bulk`, { method: 'POST', body: { mode: importMode, items } })
      setImportResult(res)
      await refreshCabins()
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
              setImportRows([])
              setImportResult(null)
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
          <div style={styles.panelTitle}>Create cabin</div>
          <div style={styles.form}>
            <label style={styles.label}>
              Cabin no
              <input style={styles.input} value={cabinNo} onChange={(e) => setCabinNo(e.target.value)} placeholder="1206" />
            </label>
            <div style={styles.row2}>
              <label style={styles.label}>
                Deck
                <input style={styles.input} value={cabinDeck} onChange={(e) => setCabinDeck(Number(e.target.value))} type="number" min={0} step={1} />
              </label>
              <label style={styles.label}>
                Category
                <select style={styles.input} value={cabinCategoryId} onChange={(e) => setCabinCategoryId(e.target.value)}>
                  <option value="">(none)</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label style={styles.label}>
              Accessories (comma-separated)
              <input style={styles.input} value={cabinAccessories} onChange={(e) => setCabinAccessories(e.target.value)} placeholder="safety_box,iron" />
            </label>
            <button style={styles.primaryBtn} disabled={busy || !shipId || !cabinNo.trim()} onClick={() => void createCabin()}>
              {busy ? 'Saving…' : 'Add cabin'}
            </button>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Cabins</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Cabin</th>
                  <th style={styles.th}>Deck</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Accessories</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cabins.map((c) => {
                  const isEditing = editingId === c.id
                  const cat = c.category_id ? catsById[c.category_id] : null
                  const catLabel = cat ? `${cat.code} · ${cat.name}` : '(none)'
                  return (
                    <tr key={c.id}>
                      <td style={styles.tdMono}>{c.cabin_no}</td>
                      <td style={styles.tdMono}>
                        {isEditing ? (
                          <input style={styles.inputInline} value={editDeck} onChange={(e) => setEditDeck(Number(e.target.value))} type="number" min={0} step={1} />
                        ) : (
                          c.deck
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <select style={styles.inputInline} value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)}>
                            <option value="">(none)</option>
                            {cats.map((cc) => (
                              <option key={cc.id} value={cc.id}>
                                {cc.code} · {cc.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span style={styles.mono}>{catLabel}</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <select style={styles.inputInline} value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                            <option value="active">active</option>
                            <option value="inactive">inactive</option>
                            <option value="maintenance">maintenance</option>
                          </select>
                        ) : (
                          c.status
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <input style={styles.inputInline} value={editAccessories} onChange={(e) => setEditAccessories(e.target.value)} placeholder="safety_box,iron" />
                        ) : (
                          (c.accessories || []).join(', ') || '—'
                        )}
                      </td>
                      <td style={styles.td}>
                        {isEditing ? (
                          <div style={styles.actions}>
                            <button style={styles.primaryBtnSm} disabled={busy} onClick={() => void saveEdit(c.id)}>
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
                            <button style={styles.dangerBtnSm} disabled={busy} onClick={() => void deleteCabin(c.id, c.cabin_no)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {cabins.length === 0 ? (
                  <tr>
                    <td style={styles.tdMuted} colSpan={6}>
                      No cabins yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Import cabins (Excel)</div>
          <div style={styles.muted}>
            Upload an .xlsx with columns: <span style={styles.mono}>cabin_no</span>, <span style={styles.mono}>deck</span>, optional{' '}
            <span style={styles.mono}>category_code</span> or <span style={styles.mono}>category_id</span>, optional <span style={styles.mono}>status</span>, optional{' '}
            <span style={styles.mono}>accessories</span> (comma-separated).
          </div>
          <div style={styles.form}>
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={!shipId || busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) parseExcel(f)
              }}
            />
            <label style={styles.label}>
              Import mode
              <select style={styles.input} value={importMode} onChange={(e) => setImportMode(e.target.value as any)} disabled={busy}>
                <option value="skip_existing">Skip existing cabins (recommended)</option>
                <option value="error_on_existing">Error on existing cabins</option>
              </select>
            </label>
            <button style={styles.primaryBtn} disabled={busy || !shipId || importRows.length === 0} onClick={() => void bulkImportCabins()}>
              {busy ? 'Importing…' : `Import ${importRows.length} cabins`}
            </button>
            {importResult ? (
              <div style={styles.card}>
                <div style={styles.cardTitle}>Import result</div>
                <div style={styles.muted}>
                  Created: <span style={styles.mono}>{importResult.created}</span> · Skipped: <span style={styles.mono}>{importResult.skipped}</span> · Errors:{' '}
                  <span style={styles.mono}>{(importResult.errors || []).length}</span>
                </div>
                {(importResult.errors || []).length ? (
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 12, color: 'rgba(230,237,243,0.75)' }}>
                    {JSON.stringify(importResult.errors.slice(0, 10), null, 2)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Preview (first 20)</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Cabin</th>
                  <th style={styles.th}>Deck</th>
                  <th style={styles.th}>Category code</th>
                  <th style={styles.th}>Accessories</th>
                </tr>
              </thead>
              <tbody>
                {importRows.slice(0, 20).map((r, idx) => (
                  <tr key={idx}>
                    <td style={styles.tdMono}>{r.cabin_no}</td>
                    <td style={styles.tdMono}>{r.deck ?? '—'}</td>
                    <td style={styles.tdMono}>{r.category_code || r.category_id || '—'}</td>
                    <td style={styles.td}>{r.accessories || '—'}</td>
                  </tr>
                ))}
                {importRows.length === 0 ? (
                  <tr>
                    <td style={styles.tdMuted} colSpan={4}>
                      No import file loaded.
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
    border: '1px solid var(--csp-border)',
    borderRadius: 14,
    background: 'var(--csp-surface-bg)',
    boxShadow: 'var(--csp-shadow-sm)',
    padding: 14,
  },
  panelTitle: { fontWeight: 900, marginBottom: 10 },
  form: { display: 'grid', gap: 10 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'color-mix(in srgb, var(--csp-text) 90%, transparent)' },
  input: {
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-input-border)',
    background: 'var(--csp-input-bg)',
    color: 'var(--csp-text)',
  },
  inputInline: {
    width: '100%',
    padding: '8px 8px',
    borderRadius: 10,
    border: '1px solid var(--csp-input-border)',
    background: 'var(--csp-input-bg)',
    color: 'var(--csp-text)',
  },
  primaryBtn: {
    padding: '10px 12px',
    borderRadius: 999,
    border: '1px solid var(--csp-primary-border)',
    background: 'var(--csp-primary-soft)',
    color: 'color-mix(in srgb, var(--csp-primary) 72%, var(--csp-text))',
    cursor: 'pointer',
    fontWeight: 900,
  },
  primaryBtnSm: {
    padding: '8px 10px',
    borderRadius: 999,
    border: '1px solid var(--csp-primary-border)',
    background: 'var(--csp-primary-soft)',
    color: 'color-mix(in srgb, var(--csp-primary) 72%, var(--csp-text))',
    cursor: 'pointer',
    fontWeight: 900,
  },
  secondaryBtnSm: {
    padding: '8px 10px',
    borderRadius: 999,
    border: '1px solid var(--csp-border-strong)',
    background: 'var(--csp-surface-bg)',
    boxShadow: 'var(--csp-shadow-sm)',
    color: 'var(--csp-text)',
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
  card: {
    marginTop: 6,
    padding: 12,
    borderRadius: 12,
    border: '1px solid var(--csp-border)',
    background: 'var(--csp-surface-bg)',
    boxShadow: 'var(--csp-shadow-sm)',
  },
  cardTitle: { fontWeight: 800, marginBottom: 8 },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
  muted: { color: 'var(--csp-muted)', fontSize: 12 },
  error: {
    padding: 12,
    borderRadius: 12,
    background: 'rgba(220, 38, 38, 0.10)',
    border: '1px solid rgba(220, 38, 38, 0.35)',
    color: 'rgb(185, 28, 28)',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
  tableWrap: { overflow: 'auto', marginTop: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border)',
    color: 'var(--csp-muted)',
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  td: { padding: '10px 8px', borderBottom: '1px solid var(--csp-border)', verticalAlign: 'top' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
  },
  tdMuted: { padding: '14px 8px', color: 'var(--csp-muted)' },
}


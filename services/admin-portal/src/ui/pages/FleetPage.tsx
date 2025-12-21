import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { getCompany } from '../components/storage'
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

export function FleetPage(props: { apiBase: string }) {
  const company = getCompany()
  const companyId = company?.id || ''
  const [fleet, setFleet] = useState<Ship[]>([])
  const [shipId, setShipId] = useState<string>('')
  const [cats, setCats] = useState<CabinCategory[]>([])
  const [cabins, setCabins] = useState<Cabin[]>([])

  const [shipName, setShipName] = useState('')
  const [shipCode, setShipCode] = useState('')
  const [shipOperator, setShipOperator] = useState('')
  const [shipDecks, setShipDecks] = useState(0)

  const [catCode, setCatCode] = useState('')
  const [catName, setCatName] = useState('')
  const [catView, setCatView] = useState('inside')
  const [catClass, setCatClass] = useState('classic')
  const [catOcc, setCatOcc] = useState(2)

  const [cabinNo, setCabinNo] = useState('')
  const [cabinDeck, setCabinDeck] = useState(0)
  const [cabinCategoryId, setCabinCategoryId] = useState<string>('')
  const [cabinAccessories, setCabinAccessories] = useState('safety_box,iron')

  const [importRows, setImportRows] = useState<BulkCabinRow[]>([])
  const [importMode, setImportMode] = useState<'skip_existing' | 'error_on_existing'>('skip_existing')
  const [importResult, setImportResult] = useState<any | null>(null)

  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fleetEndpoint = useMemo(() => (companyId ? `/v1/companies/${companyId}/fleet` : null), [companyId])
  const catsEndpoint = useMemo(() => (shipId ? `/v1/ships/${shipId}/cabin-categories` : null), [shipId])
  const cabinsEndpoint = useMemo(() => (shipId ? `/v1/ships/${shipId}/cabins` : null), [shipId])

  useEffect(() => {
    if (!fleetEndpoint) return
    apiFetch<{ items: Ship[] }>(props.apiBase, fleetEndpoint)
      .then((r) => {
        setFleet(r.items)
        // Keep selection stable if possible; otherwise default to first ship (or clear).
        setShipId((prev) => {
          if (prev && r.items.some((s) => s.id === prev)) return prev
          return r.items[0]?.id || ''
        })
      })
      .catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetEndpoint, props.apiBase])

  useEffect(() => {
    if (!catsEndpoint) {
      setCats([])
      return
    }
    apiFetch<CabinCategory[]>(props.apiBase, catsEndpoint).then(setCats).catch((e) => setErr(String(e?.message || e)))
  }, [catsEndpoint, props.apiBase])

  useEffect(() => {
    if (!cabinsEndpoint) {
      setCabins([])
      return
    }
    apiFetch<Cabin[]>(props.apiBase, cabinsEndpoint).then(setCabins).catch((e) => setErr(String(e?.message || e)))
  }, [cabinsEndpoint, props.apiBase])

  async function createShip() {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch<Ship>(props.apiBase, `/v1/ships`, {
        method: 'POST',
        body: { company_id: companyId, name: shipName, code: shipCode, operator: shipOperator || null, decks: shipDecks, status: 'active' },
      })
      const r = await apiFetch<{ items: Ship[] }>(props.apiBase, `/v1/companies/${companyId}/fleet`)
      setFleet(r.items)
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

  async function createCategory() {
    if (!shipId) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/ships/${shipId}/cabin-categories`, {
        method: 'POST',
        body: { code: catCode, name: catName, view: catView, cabin_class: catClass, max_occupancy: catOcc, meta: {} },
      })
      const r = await apiFetch<CabinCategory[]>(props.apiBase, `/v1/ships/${shipId}/cabin-categories`)
      setCats(r)
      setCatCode('')
      setCatName('')
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

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
      const r = await apiFetch<Cabin[]>(props.apiBase, `/v1/ships/${shipId}/cabins`)
      setCabins(r)
      setCabinNo('')
      setCabinDeck(0)
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
      const r = await apiFetch<Cabin[]>(props.apiBase, `/v1/ships/${shipId}/cabins`)
      setCabins(r)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  if (!companyId) {
    return (
      <div style={styles.wrap}>
        <div style={styles.hTitle}>Fleet & Cabins</div>
        <div style={styles.error}>No company selected. Please select a company and sign in again.</div>
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.hTitle}>Fleet & Cabins</div>
      <div style={styles.hSub}>Create ships, define cabin categories, then add cabins and per-cabin accessories.</div>

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
          <div style={styles.panelTitle}>Select ship</div>
          <div style={styles.form}>
            <select style={styles.input} value={shipId} onChange={(e) => setShipId(e.target.value)}>
              {fleet.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
            <div style={styles.muted}>Ship id: {shipId || '—'}</div>
          </div>
        </section>
      </div>

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Cabin categories</div>
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

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Code</th>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>View</th>
                  <th style={styles.th}>Class</th>
                  <th style={styles.th}>Occ</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.id}>
                    <td style={styles.tdMono}>{c.code}</td>
                    <td style={styles.td}>{c.name}</td>
                    <td style={styles.td}>{c.view}</td>
                    <td style={styles.td}>{c.cabin_class}</td>
                    <td style={styles.tdMono}>{c.max_occupancy}</td>
                  </tr>
                ))}
                {cats.length === 0 ? (
                  <tr>
                    <td style={styles.tdMuted} colSpan={5}>
                      No categories yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Cabins</div>
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

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Cabin</th>
                  <th style={styles.th}>Deck</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Accessories</th>
                </tr>
              </thead>
              <tbody>
                {cabins.map((c) => (
                  <tr key={c.id}>
                    <td style={styles.tdMono}>{c.cabin_no}</td>
                    <td style={styles.tdMono}>{c.deck}</td>
                    <td style={styles.tdMono}>{c.category_id || '—'}</td>
                    <td style={styles.td}>{(c.accessories || []).join(', ') || '—'}</td>
                  </tr>
                ))}
                {cabins.length === 0 ? (
                  <tr>
                    <td style={styles.tdMuted} colSpan={4}>
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
            <span style={styles.mono}>category_code</span> or <span style={styles.mono}>category_id</span>, optional <span style={styles.mono}>status</span>,{' '}
            optional <span style={styles.mono}>accessories</span> (comma-separated).
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
  hTitle: { fontSize: 22, fontWeight: 900 },
  hSub: { color: 'var(--csp-muted, rgba(230,237,243,0.7))', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' },
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
  primaryBtn: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--csp-primary-border, rgba(56,139,253,0.55))',
    background: 'var(--csp-primary-soft, rgba(56,139,253,0.22))',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 900,
  },
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
  tableWrap: { overflow: 'auto', marginTop: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    color: 'var(--csp-muted, rgba(230,237,243,0.75))',
    fontWeight: 900,
  },
  td: { padding: '10px 8px', borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.06))' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.06))',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
  },
  tdMuted: { padding: '14px 8px', color: 'var(--csp-muted, rgba(230,237,243,0.60))' },
}


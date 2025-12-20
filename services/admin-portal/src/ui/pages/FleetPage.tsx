import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'

type Company = { id: string; name: string; code: string; created_at: string }
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

export function FleetPage(props: { apiBase: string }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState<string>('')
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

  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const companiesEndpoint = useMemo(() => `/v1/companies`, [])
  const fleetEndpoint = useMemo(() => (companyId ? `/v1/companies/${companyId}/fleet` : null), [companyId])
  const catsEndpoint = useMemo(() => (shipId ? `/v1/ships/${shipId}/cabin-categories` : null), [shipId])
  const cabinsEndpoint = useMemo(() => (shipId ? `/v1/ships/${shipId}/cabins` : null), [shipId])

  useEffect(() => {
    apiFetch<{ items: Company[] }>(props.apiBase, companiesEndpoint, { auth: false, tenant: false })
      .then((r) => {
        setCompanies(r.items)
        if (!companyId && r.items.length) setCompanyId(r.items[0].id)
      })
      .catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companiesEndpoint, props.apiBase])

  useEffect(() => {
    if (!fleetEndpoint) return
    apiFetch<{ items: Ship[] }>(props.apiBase, fleetEndpoint, { auth: false, tenant: false })
      .then((r) => {
        setFleet(r.items)
        if (!shipId && r.items.length) setShipId(r.items[0].id)
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
        auth: true,
        tenant: false,
      })
      const r = await apiFetch<{ items: Ship[] }>(props.apiBase, `/v1/companies/${companyId}/fleet`, { auth: false, tenant: false })
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
              <select style={styles.input} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
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
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'grid', gap: 12 },
  hTitle: { fontSize: 22, fontWeight: 900 },
  hSub: { color: 'rgba(230,237,243,0.7)', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' },
  panel: {
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  panelTitle: { fontWeight: 900, marginBottom: 10 },
  form: { display: 'grid', gap: 10 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'rgba(230,237,243,0.85)' },
  input: {
    padding: '10px 10px',
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
  muted: { color: 'rgba(230,237,243,0.65)', fontSize: 12 },
  error: {
    padding: 12,
    borderRadius: 12,
    background: 'rgba(248,81,73,0.12)',
    border: '1px solid rgba(248,81,73,0.35)',
    color: '#ffb4ae',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
  tableWrap: { overflow: 'auto', marginTop: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.10)',
    color: 'rgba(230,237,243,0.75)',
    fontWeight: 900,
  },
  td: { padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
  },
  tdMuted: { padding: '14px 8px', color: 'rgba(230,237,243,0.60)' },
}


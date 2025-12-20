import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'

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
  port_stops?: any[]
}

type PortStop = { port_code: string; port_name?: string | null; arrival: string; departure: string }

export function SailingsPage(props: { apiBase: string }) {
  const [items, setItems] = useState<Sailing[]>([])
  const [sailingId, setSailingId] = useState<string>('')
  const [itinerary, setItinerary] = useState<PortStop[]>([])

  const [code, setCode] = useState('')
  const [shipId, setShipId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [embark, setEmbark] = useState('')
  const [debark, setDebark] = useState('')

  const [portCode, setPortCode] = useState('')
  const [portName, setPortName] = useState('')
  const [arrival, setArrival] = useState('')
  const [departure, setDeparture] = useState('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const listEndpoint = useMemo(() => `/v1/sailings`, [])
  const itineraryEndpoint = useMemo(() => (sailingId ? `/v1/sailings/${sailingId}/itinerary` : null), [sailingId])

  async function refresh() {
    const r = await apiFetch<Sailing[]>(props.apiBase, listEndpoint, { auth: false, tenant: false })
    setItems(r)
    if (!sailingId && r.length) setSailingId(r[0].id)
  }

  useEffect(() => {
    refresh().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listEndpoint])

  useEffect(() => {
    if (!itineraryEndpoint) {
      setItinerary([])
      return
    }
    apiFetch<PortStop[]>(props.apiBase, itineraryEndpoint, { auth: false, tenant: false })
      .then(setItinerary)
      .catch((e) => setErr(String(e?.message || e)))
  }, [itineraryEndpoint, props.apiBase])

  async function createSailing() {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/sailings`, {
        method: 'POST',
        body: {
          code,
          ship_id: shipId,
          start_date: startDate,
          end_date: endDate,
          embark_port_code: embark,
          debark_port_code: debark,
          status: 'planned',
        },
        auth: true,
        tenant: false,
      })
      setCode('')
      setShipId('')
      setStartDate('')
      setEndDate('')
      setEmbark('')
      setDebark('')
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function addStop() {
    if (!sailingId) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/sailings/${sailingId}/port-stops`, {
        method: 'POST',
        body: { port_code: portCode, port_name: portName || null, arrival, departure },
        auth: true,
        tenant: false,
      })
      setPortCode('')
      setPortName('')
      setArrival('')
      setDeparture('')
      const r = await apiFetch<PortStop[]>(props.apiBase, `/v1/sailings/${sailingId}/itinerary`, { auth: false, tenant: false })
      setItinerary(r)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.hTitle}>Sailings & Itineraries</div>
      <div style={styles.hSub}>Create sailings by date, then add port stops to build the itinerary.</div>

      {err ? <div style={styles.error}>{err}</div> : null}

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Create sailing</div>
          <div style={styles.form}>
            <label style={styles.label}>
              Sailing code
              <input style={styles.input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="S-2026-07-01-A" />
            </label>
            <label style={styles.label}>
              Ship id
              <input style={styles.input} value={shipId} onChange={(e) => setShipId(e.target.value)} placeholder="(from Fleet)" />
            </label>
            <div style={styles.row2}>
              <label style={styles.label}>
                Start date
                <input style={styles.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" />
              </label>
              <label style={styles.label}>
                End date
                <input style={styles.input} value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" />
              </label>
            </div>
            <div style={styles.row2}>
              <label style={styles.label}>
                Embark port code
                <input style={styles.input} value={embark} onChange={(e) => setEmbark(e.target.value)} placeholder="BCN" />
              </label>
              <label style={styles.label}>
                Debark port code
                <input style={styles.input} value={debark} onChange={(e) => setDebark(e.target.value)} placeholder="ROM" />
              </label>
            </div>
            <button style={styles.primaryBtn} disabled={busy || !code.trim() || !shipId.trim() || !startDate || !endDate || !embark.trim() || !debark.trim()} onClick={() => void createSailing()}>
              {busy ? 'Saving…' : 'Create sailing'}
            </button>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Select sailing</div>
          <div style={styles.form}>
            <select style={styles.input} value={sailingId} onChange={(e) => setSailingId(e.target.value)}>
              {items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.start_date} → {s.end_date}
                </option>
              ))}
            </select>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Code</th>
                    <th style={styles.th}>Ship</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id}>
                      <td style={styles.tdMono}>{s.code}</td>
                      <td style={styles.tdMono}>{s.ship_id}</td>
                      <td style={styles.td}>{s.status}</td>
                    </tr>
                  ))}
                  {items.length === 0 ? (
                    <tr>
                      <td style={styles.tdMuted} colSpan={3}>
                        No sailings yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Add port stop</div>
          <div style={styles.form}>
            <div style={styles.row2}>
              <label style={styles.label}>
                Port code
                <input style={styles.input} value={portCode} onChange={(e) => setPortCode(e.target.value)} placeholder="PMI" />
              </label>
              <label style={styles.label}>
                Port name (optional)
                <input style={styles.input} value={portName} onChange={(e) => setPortName(e.target.value)} placeholder="Palma" />
              </label>
            </div>
            <div style={styles.row2}>
              <label style={styles.label}>
                Arrival (ISO datetime)
                <input style={styles.input} value={arrival} onChange={(e) => setArrival(e.target.value)} placeholder="2026-07-02T08:00:00Z" />
              </label>
              <label style={styles.label}>
                Departure (ISO datetime)
                <input style={styles.input} value={departure} onChange={(e) => setDeparture(e.target.value)} placeholder="2026-07-02T18:00:00Z" />
              </label>
            </div>
            <button style={styles.primaryBtn} disabled={busy || !sailingId || !portCode.trim() || !arrival.trim() || !departure.trim()} onClick={() => void addStop()}>
              {busy ? 'Saving…' : 'Add stop'}
            </button>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Itinerary</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Port</th>
                  <th style={styles.th}>Arrival</th>
                  <th style={styles.th}>Departure</th>
                </tr>
              </thead>
              <tbody>
                {itinerary.map((p, idx) => (
                  <tr key={`${p.port_code}-${idx}`}>
                    <td style={styles.td}>
                      <span style={styles.mono}>{p.port_code}</span> {p.port_name ? <span style={styles.mutedInline}>({p.port_name})</span> : null}
                    </td>
                    <td style={styles.tdMono}>{p.arrival}</td>
                    <td style={styles.tdMono}>{p.departure}</td>
                  </tr>
                ))}
                {itinerary.length === 0 ? (
                  <tr>
                    <td style={styles.tdMuted} colSpan={3}>
                      No port stops yet.
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
  mono: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace' },
  mutedInline: { color: 'rgba(230,237,243,0.65)', fontSize: 12 },
}


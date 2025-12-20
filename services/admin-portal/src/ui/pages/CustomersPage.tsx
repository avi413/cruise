import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'

type Customer = {
  id: string
  created_at: string
  updated_at: string
  email: string
  first_name?: string | null
  last_name?: string | null
  loyalty_tier?: string | null
  preferences: any
}

type BookingHistory = { booking_id: string; sailing_id: string; status: string; updated_at: string; meta: any }

export function CustomersPage(props: { apiBase: string }) {
  const [customerId, setCustomerId] = useState('')
  const [cust, setCust] = useState<Customer | null>(null)
  const [history, setHistory] = useState<BookingHistory[]>([])

  const [searchQ, setSearchQ] = useState('')
  const [hits, setHits] = useState<Customer[]>([])

  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [tier, setTier] = useState('SILVER')
  const [prefs, setPrefs] = useState('{}')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const q = searchQ.trim()
    if (!q) {
      setHits([])
      return
    }
    const t = window.setTimeout(() => {
      const params = new URLSearchParams()
      params.set('q', q)
      params.set('limit', '20')
      apiFetch<Customer[]>(props.apiBase, `/v1/customers?${params.toString()}`)
        .then((r) => setHits(r || []))
        .catch(() => setHits([]))
    }, 250)
    return () => window.clearTimeout(t)
  }, [searchQ, props.apiBase])

  async function createCustomer() {
    setBusy(true)
    setErr(null)
    try {
      const r = await apiFetch<Customer>(props.apiBase, `/v1/customers`, {
        method: 'POST',
        body: { email, first_name: firstName || null, last_name: lastName || null, loyalty_tier: tier || null, preferences: {} },
      })
      setCust(r)
      setCustomerId(r.id)
      setPrefs(JSON.stringify(r.preferences || {}, null, 2))
      setEmail('')
      setFirstName('')
      setLastName('')
      setHistory([])
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function loadCustomer() {
    setBusy(true)
    setErr(null)
    try {
      const c = await apiFetch<Customer>(props.apiBase, `/v1/customers/${customerId}`)
      const h = await apiFetch<BookingHistory[]>(props.apiBase, `/v1/customers/${customerId}/bookings`)
      setCust(c)
      setPrefs(JSON.stringify(c.preferences || {}, null, 2))
      setHistory(h)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function saveCustomer() {
    if (!cust) return
    setBusy(true)
    setErr(null)
    try {
      let parsed: any = undefined
      try {
        parsed = prefs.trim() ? JSON.parse(prefs) : {}
      } catch {
        throw new Error('Preferences must be valid JSON.')
      }
      const c = await apiFetch<Customer>(props.apiBase, `/v1/customers/${cust.id}`, {
        method: 'PATCH',
        body: { first_name: cust.first_name || null, last_name: cust.last_name || null, loyalty_tier: cust.loyalty_tier || null, preferences: parsed },
      })
      setCust(c)
      setPrefs(JSON.stringify(c.preferences || {}, null, 2))
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.hTitle}>Customers</div>
      <div style={styles.hSub}>Create customers, live-search by email/name, edit profiles, and review booking history.</div>

      {err ? <div style={styles.error}>{err}</div> : null}

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Create customer</div>
          <div style={styles.form}>
            <label style={styles.label}>
              Email
              <input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="guest@example.com" />
            </label>
            <div style={styles.row2}>
              <label style={styles.label}>
                First name
                <input style={styles.input} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ava" />
              </label>
              <label style={styles.label}>
                Last name
                <input style={styles.input} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Guest" />
              </label>
            </div>
            <label style={styles.label}>
              Loyalty tier
              <input style={styles.input} value={tier} onChange={(e) => setTier(e.target.value)} placeholder="SILVER" />
            </label>
            <button style={styles.primaryBtn} disabled={busy || !email.trim()} onClick={() => void createCustomer()}>
              {busy ? 'Saving…' : 'Create customer'}
            </button>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Find customer</div>
          <div style={styles.form}>
            <label style={styles.label}>
              Live search
              <input style={styles.input} value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="guest@example.com / Ava / UUID…" />
            </label>
            {hits.length ? (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hits.slice(0, 10).map((h) => (
                      <tr
                        key={h.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setCustomerId(h.id)
                          void loadCustomer()
                        }}
                      >
                        <td style={styles.tdMono}>{h.email}</td>
                        <td style={styles.td}>{[h.first_name, h.last_name].filter(Boolean).join(' ') || '—'}</td>
                        <td style={styles.td}>{h.loyalty_tier || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <label style={styles.label}>
              Customer id
              <input style={styles.input} value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="UUID" />
            </label>
            <button style={styles.primaryBtn} disabled={busy || !customerId.trim()} onClick={() => void loadCustomer()}>
              {busy ? 'Loading…' : 'Load'}
            </button>
          </div>
        </section>
      </div>

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Customer profile</div>
          {cust ? (
            <div style={styles.kv}>
              <div style={styles.k}>
                Email <span style={styles.mono}>{cust.email}</span>
              </div>
              <div style={styles.k}>
                Name{' '}
                <span style={styles.mono}>
                  <input
                    style={{ ...styles.input, padding: '6px 8px', width: 140 }}
                    value={cust.first_name || ''}
                    onChange={(e) => setCust({ ...cust, first_name: e.target.value })}
                    placeholder="First"
                  />{' '}
                  <input
                    style={{ ...styles.input, padding: '6px 8px', width: 140 }}
                    value={cust.last_name || ''}
                    onChange={(e) => setCust({ ...cust, last_name: e.target.value })}
                    placeholder="Last"
                  />
                </span>
              </div>
              <div style={styles.k}>
                Tier{' '}
                <span style={styles.mono}>
                  <input style={{ ...styles.input, padding: '6px 8px', width: 180 }} value={cust.loyalty_tier || ''} onChange={(e) => setCust({ ...cust, loyalty_tier: e.target.value })} placeholder="SILVER" />
                </span>
              </div>
              <div style={styles.k}>
                ID <span style={styles.mono}>{cust.id}</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ ...styles.muted, marginBottom: 6 }}>Preferences (JSON)</div>
                <textarea style={{ ...styles.input, minHeight: 110, fontFamily: styles.mono.fontFamily as any }} value={prefs} onChange={(e) => setPrefs(e.target.value)} />
              </div>
              <button style={styles.primaryBtn} disabled={busy || !cust} onClick={() => void saveCustomer()}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          ) : (
            <div style={styles.muted}>No customer loaded.</div>
          )}
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Booking history</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Booking</th>
                  <th style={styles.th}>Sailing</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.booking_id}>
                    <td style={styles.tdMono}>{h.booking_id}</td>
                    <td style={styles.tdMono}>{h.sailing_id}</td>
                    <td style={styles.td}>{h.status}</td>
                    <td style={styles.tdMono}>{h.updated_at}</td>
                  </tr>
                ))}
                {history.length === 0 ? (
                  <tr>
                    <td style={styles.tdMuted} colSpan={4}>
                      No bookings found (yet).
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
  muted: { color: 'rgba(230,237,243,0.65)', fontSize: 13 },
  mono: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12 },
  kv: { display: 'grid', gap: 8, color: 'rgba(230,237,243,0.85)', fontSize: 13 },
  k: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' },
  tableWrap: { overflow: 'auto', marginTop: 6 },
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


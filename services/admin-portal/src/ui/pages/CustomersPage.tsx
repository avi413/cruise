import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'

type Customer = {
  id: string
  created_at: string
  updated_at: string
  email: string
  title?: string | null
  first_name?: string | null
  last_name?: string | null
  birth_date?: string | null
  loyalty_tier?: string | null
  phone?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
  national_id_number?: string | null
  national_id_country?: string | null
  passport_number?: string | null
  passport_country?: string | null
  passport_expiry?: string | null
  preferences: any
}

type BookingHistory = { booking_id: string; sailing_id: string; status: string; updated_at: string; meta: any }

type Passenger = {
  id: string
  customer_id: string
  created_at: string
  updated_at: string
  title?: string | null
  first_name: string
  last_name: string
  birth_date?: string | null
  gender?: string | null
  nationality?: string | null
  email?: string | null
  phone?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
  national_id_number?: string | null
  national_id_country?: string | null
  passport_number?: string | null
  passport_country?: string | null
  passport_expiry?: string | null
}

export function CustomersPage(props: { apiBase: string }) {
  const [customerId, setCustomerId] = useState('')
  const [cust, setCust] = useState<Customer | null>(null)
  const [history, setHistory] = useState<BookingHistory[]>([])
  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [pEdit, setPEdit] = useState<Passenger | null>(null)
  const [pNew, setPNew] = useState<Partial<Passenger>>({ title: 'MR', first_name: '', last_name: '' })
  const [pBusy, setPBusy] = useState(false)
  const [pErr, setPErr] = useState<string | null>(null)

  const [searchQ, setSearchQ] = useState('')
  const [hits, setHits] = useState<Customer[]>([])

  const [email, setEmail] = useState('')
  const [createTitle, setCreateTitle] = useState('MR')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [createPhone, setCreatePhone] = useState('')
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
        body: {
          email,
          title: createTitle || null,
          phone: createPhone || null,
          first_name: firstName || null,
          last_name: lastName || null,
          loyalty_tier: tier || null,
          preferences: {},
        },
      })
      setCust(r)
      setCustomerId(r.id)
      setPrefs(JSON.stringify(r.preferences || {}, null, 2))
      setEmail('')
      setCreateTitle('MR')
      setFirstName('')
      setLastName('')
      setCreatePhone('')
      setHistory([])
      setPassengers([])
      setPEdit(null)
      setPNew({ title: 'MR', first_name: '', last_name: '' })
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function loadPassengers(cid: string) {
    if (!cid) return
    setPBusy(true)
    setPErr(null)
    try {
      const r = await apiFetch<Passenger[]>(props.apiBase, `/v1/customers/${cid}/passengers`)
      setPassengers(r || [])
    } catch (e: any) {
      setPErr(String(e?.detail || e?.message || e))
      setPassengers([])
    } finally {
      setPBusy(false)
    }
  }

  async function loadCustomer(cid?: string) {
    const id = String(cid ?? customerId).trim()
    if (!id) return
    setBusy(true)
    setErr(null)
    try {
      setCustomerId(id)
      const c = await apiFetch<Customer>(props.apiBase, `/v1/customers/${id}`)
      const h = await apiFetch<BookingHistory[]>(props.apiBase, `/v1/customers/${id}/bookings`)
      setCust(c)
      setPrefs(JSON.stringify(c.preferences || {}, null, 2))
      setHistory(h)
      await loadPassengers(id)
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
        body: {
          title: cust.title || null,
          first_name: cust.first_name || null,
          last_name: cust.last_name || null,
          birth_date: cust.birth_date || null,
          loyalty_tier: cust.loyalty_tier || null,
          phone: cust.phone || null,
          address_line1: cust.address_line1 || null,
          address_line2: cust.address_line2 || null,
          city: cust.city || null,
          state: cust.state || null,
          postal_code: cust.postal_code || null,
          country: cust.country || null,
          national_id_number: cust.national_id_number || null,
          national_id_country: cust.national_id_country || null,
          passport_number: cust.passport_number || null,
          passport_country: cust.passport_country || null,
          passport_expiry: cust.passport_expiry || null,
          preferences: parsed,
        },
      })
      setCust(c)
      setPrefs(JSON.stringify(c.preferences || {}, null, 2))
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function createPassenger() {
    if (!cust) return
    const first = String(pNew.first_name || '').trim()
    const last = String(pNew.last_name || '').trim()
    if (!first || !last) {
      setPErr('Passenger first/last name are required.')
      return
    }
    setPBusy(true)
    setPErr(null)
    try {
      await apiFetch<Passenger>(props.apiBase, `/v1/customers/${cust.id}/passengers`, {
        method: 'POST',
        body: {
          title: pNew.title || null,
          first_name: first,
          last_name: last,
          birth_date: pNew.birth_date || null,
          gender: pNew.gender || null,
          nationality: pNew.nationality || null,
          email: pNew.email || null,
          phone: pNew.phone || null,
          address_line1: pNew.address_line1 || null,
          address_line2: pNew.address_line2 || null,
          city: pNew.city || null,
          state: pNew.state || null,
          postal_code: pNew.postal_code || null,
          country: pNew.country || null,
          national_id_number: pNew.national_id_number || null,
          national_id_country: pNew.national_id_country || null,
          passport_number: pNew.passport_number || null,
          passport_country: pNew.passport_country || null,
          passport_expiry: pNew.passport_expiry || null,
        },
      })
      setPNew({ title: 'MR', first_name: '', last_name: '' })
      setPEdit(null)
      await loadPassengers(cust.id)
    } catch (e: any) {
      setPErr(String(e?.detail || e?.message || e))
    } finally {
      setPBusy(false)
    }
  }

  async function savePassenger() {
    if (!pEdit) return
    setPBusy(true)
    setPErr(null)
    try {
      await apiFetch<Passenger>(props.apiBase, `/v1/passengers/${pEdit.id}`, {
        method: 'PATCH',
        body: {
          title: pEdit.title || null,
          first_name: pEdit.first_name || null,
          last_name: pEdit.last_name || null,
          birth_date: pEdit.birth_date || null,
          gender: pEdit.gender || null,
          nationality: pEdit.nationality || null,
          email: pEdit.email || null,
          phone: pEdit.phone || null,
          address_line1: pEdit.address_line1 || null,
          address_line2: pEdit.address_line2 || null,
          city: pEdit.city || null,
          state: pEdit.state || null,
          postal_code: pEdit.postal_code || null,
          country: pEdit.country || null,
          national_id_number: pEdit.national_id_number || null,
          national_id_country: pEdit.national_id_country || null,
          passport_number: pEdit.passport_number || null,
          passport_country: pEdit.passport_country || null,
          passport_expiry: pEdit.passport_expiry || null,
        },
      })
      if (cust) await loadPassengers(cust.id)
      setPEdit(null)
    } catch (e: any) {
      setPErr(String(e?.detail || e?.message || e))
    } finally {
      setPBusy(false)
    }
  }

  async function removePassenger(passengerId: string) {
    if (!cust) return
    setPBusy(true)
    setPErr(null)
    try {
      await apiFetch<{ status: string }>(props.apiBase, `/v1/passengers/${passengerId}`, { method: 'DELETE' })
      await loadPassengers(cust.id)
      if (pEdit?.id === passengerId) setPEdit(null)
    } catch (e: any) {
      setPErr(String(e?.detail || e?.message || e))
    } finally {
      setPBusy(false)
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
              Title
              <select
                style={styles.input}
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
              >
                {['MR', 'MRS', 'MS', 'MISS', 'DR'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
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
              Phone
              <input style={styles.input} value={createPhone} onChange={(e) => setCreatePhone(e.target.value)} placeholder="+1 555 123 4567" />
            </label>
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
                          void loadCustomer(h.id)
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
            <div style={styles.form}>
              <div style={styles.row2}>
                <label style={styles.label}>
                  Email (read-only)
                  <input style={styles.input} value={cust.email} readOnly />
                </label>
                <label style={styles.label}>
                  Customer id
                  <input style={styles.input} value={cust.id} readOnly />
                </label>
              </div>

              <div style={styles.row2}>
                <label style={styles.label}>
                  Title
                  <select
                    style={styles.input}
                    value={cust.title || ''}
                    onChange={(e) => setCust({ ...cust, title: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {['MR', 'MRS', 'MS', 'MISS', 'DR'].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={styles.label}>
                  Birth date
                  <input
                    type="date"
                    style={styles.input}
                    value={cust.birth_date || ''}
                    onChange={(e) => setCust({ ...cust, birth_date: e.target.value || null })}
                  />
                </label>
              </div>

              <div style={styles.row2}>
                <label style={styles.label}>
                  First name
                  <input style={styles.input} value={cust.first_name || ''} onChange={(e) => setCust({ ...cust, first_name: e.target.value })} />
                </label>
                <label style={styles.label}>
                  Last name
                  <input style={styles.input} value={cust.last_name || ''} onChange={(e) => setCust({ ...cust, last_name: e.target.value })} />
                </label>
              </div>

              <div style={styles.row2}>
                <label style={styles.label}>
                  Phone
                  <input style={styles.input} value={cust.phone || ''} onChange={(e) => setCust({ ...cust, phone: e.target.value })} placeholder="+1 555 123 4567" />
                </label>
                <label style={styles.label}>
                  Loyalty tier
                  <input style={styles.input} value={cust.loyalty_tier || ''} onChange={(e) => setCust({ ...cust, loyalty_tier: e.target.value })} placeholder="SILVER" />
                </label>
              </div>

              <div style={styles.row2}>
                <label style={styles.label}>
                  Address line 1
                  <input style={styles.input} value={cust.address_line1 || ''} onChange={(e) => setCust({ ...cust, address_line1: e.target.value })} />
                </label>
                <label style={styles.label}>
                  Address line 2
                  <input style={styles.input} value={cust.address_line2 || ''} onChange={(e) => setCust({ ...cust, address_line2: e.target.value })} />
                </label>
              </div>

              <div style={styles.row2}>
                <label style={styles.label}>
                  City
                  <input style={styles.input} value={cust.city || ''} onChange={(e) => setCust({ ...cust, city: e.target.value })} />
                </label>
                <label style={styles.label}>
                  State / Province
                  <input style={styles.input} value={cust.state || ''} onChange={(e) => setCust({ ...cust, state: e.target.value })} />
                </label>
              </div>

              <div style={styles.row2}>
                <label style={styles.label}>
                  Postal code
                  <input style={styles.input} value={cust.postal_code || ''} onChange={(e) => setCust({ ...cust, postal_code: e.target.value })} />
                </label>
                <label style={styles.label}>
                  Country
                  <input style={styles.input} value={cust.country || ''} onChange={(e) => setCust({ ...cust, country: e.target.value })} />
                </label>
              </div>

              <div style={styles.row2}>
                <label style={styles.label}>
                  National ID number
                  <input style={styles.input} value={cust.national_id_number || ''} onChange={(e) => setCust({ ...cust, national_id_number: e.target.value })} />
                </label>
                <label style={styles.label}>
                  National ID country
                  <input style={styles.input} value={cust.national_id_country || ''} onChange={(e) => setCust({ ...cust, national_id_country: e.target.value })} placeholder="e.g. EG" />
                </label>
              </div>

              <div style={styles.row2}>
                <label style={styles.label}>
                  Passport number
                  <input style={styles.input} value={cust.passport_number || ''} onChange={(e) => setCust({ ...cust, passport_number: e.target.value })} />
                </label>
                <label style={styles.label}>
                  Passport country
                  <input style={styles.input} value={cust.passport_country || ''} onChange={(e) => setCust({ ...cust, passport_country: e.target.value })} placeholder="e.g. US" />
                </label>
              </div>

              <label style={styles.label}>
                Passport expiry
                <input
                  type="date"
                  style={styles.input}
                  value={cust.passport_expiry || ''}
                  onChange={(e) => setCust({ ...cust, passport_expiry: e.target.value || null })}
                />
              </label>

              <div style={{ marginTop: 6 }}>
                <div style={{ ...styles.muted, marginBottom: 6 }}>Preferences (JSON)</div>
                <textarea style={{ ...styles.input, minHeight: 110, fontFamily: styles.mono.fontFamily as any }} value={prefs} onChange={(e) => setPrefs(e.target.value)} />
              </div>

              <button style={styles.primaryBtn} disabled={busy || !cust} onClick={() => void saveCustomer()}>
                {busy ? 'Saving…' : 'Save customer'}
              </button>
            </div>
          ) : (
            <div style={styles.muted}>No customer loaded.</div>
          )}
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Related passengers</div>
          {!cust ? <div style={styles.muted}>Load a customer to manage passengers.</div> : null}
          {pErr ? <div style={styles.error}>{pErr}</div> : null}

          {cust ? (
            <>
              <div style={{ ...styles.panel, padding: 0, border: 'none', background: 'transparent' }}>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ fontWeight: 900, marginTop: 6 }}>Add passenger</div>
                  <div style={styles.row2}>
                    <label style={styles.label}>
                      Title
                      <select style={styles.input} value={String(pNew.title || '')} onChange={(e) => setPNew({ ...pNew, title: e.target.value || null })}>
                        <option value="">—</option>
                        {['MR', 'MRS', 'MS', 'MISS', 'DR'].map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={styles.label}>
                      Birth date
                      <input type="date" style={styles.input} value={String(pNew.birth_date || '')} onChange={(e) => setPNew({ ...pNew, birth_date: e.target.value || null })} />
                    </label>
                  </div>
                  <div style={styles.row2}>
                    <label style={styles.label}>
                      First name
                      <input style={styles.input} value={String(pNew.first_name || '')} onChange={(e) => setPNew({ ...pNew, first_name: e.target.value })} />
                    </label>
                    <label style={styles.label}>
                      Last name
                      <input style={styles.input} value={String(pNew.last_name || '')} onChange={(e) => setPNew({ ...pNew, last_name: e.target.value })} />
                    </label>
                  </div>
                  <button style={styles.primaryBtn} disabled={pBusy} onClick={() => void createPassenger()}>
                    {pBusy ? 'Saving…' : 'Add passenger'}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12, fontWeight: 900 }}>Passengers</div>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Birth date</th>
                      <th style={styles.th}>Passport</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passengers.map((p) => (
                      <tr key={p.id}>
                        <td style={styles.td}>{[p.title, p.first_name, p.last_name].filter(Boolean).join(' ')}</td>
                        <td style={styles.tdMono}>{p.birth_date || '—'}</td>
                        <td style={styles.tdMono}>{p.passport_number || '—'}</td>
                        <td style={styles.td}>
                          <button style={styles.secondaryBtn} disabled={pBusy} onClick={() => setPEdit(p)}>
                            Edit
                          </button>{' '}
                          <button style={styles.dangerBtnSmall} disabled={pBusy} onClick={() => void removePassenger(p.id)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                    {passengers.length === 0 ? (
                      <tr>
                        <td style={styles.tdMuted} colSpan={4}>
                          {pBusy ? 'Loading…' : 'No passengers yet.'}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {pEdit ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Edit passenger</div>
                  <div style={styles.form}>
                    <div style={styles.row2}>
                      <label style={styles.label}>
                        Title
                        <select style={styles.input} value={pEdit.title || ''} onChange={(e) => setPEdit({ ...pEdit, title: e.target.value || null })}>
                          <option value="">—</option>
                          {['MR', 'MRS', 'MS', 'MISS', 'DR'].map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={styles.label}>
                        Birth date
                        <input type="date" style={styles.input} value={pEdit.birth_date || ''} onChange={(e) => setPEdit({ ...pEdit, birth_date: e.target.value || null })} />
                      </label>
                    </div>
                    <div style={styles.row2}>
                      <label style={styles.label}>
                        First name
                        <input style={styles.input} value={pEdit.first_name || ''} onChange={(e) => setPEdit({ ...pEdit, first_name: e.target.value })} />
                      </label>
                      <label style={styles.label}>
                        Last name
                        <input style={styles.input} value={pEdit.last_name || ''} onChange={(e) => setPEdit({ ...pEdit, last_name: e.target.value })} />
                      </label>
                    </div>
                    <div style={styles.row2}>
                      <label style={styles.label}>
                        Passport number
                        <input style={styles.input} value={pEdit.passport_number || ''} onChange={(e) => setPEdit({ ...pEdit, passport_number: e.target.value })} />
                      </label>
                      <label style={styles.label}>
                        Passport expiry
                        <input type="date" style={styles.input} value={pEdit.passport_expiry || ''} onChange={(e) => setPEdit({ ...pEdit, passport_expiry: e.target.value || null })} />
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button style={styles.primaryBtn} disabled={pBusy} onClick={() => void savePassenger()}>
                        {pBusy ? 'Saving…' : 'Save passenger'}
                      </button>
                      <button style={styles.secondaryBtn} disabled={pBusy} onClick={() => setPEdit(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </div>

      <div style={styles.grid}>
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
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Notes</div>
          <div style={styles.muted}>Passenger + customer identity fields are now stored on the profile for downstream sales/booking flows.</div>
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
  secondaryBtn: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: '#e6edf3',
    cursor: 'pointer',
    fontWeight: 900,
  },
  dangerBtnSmall: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid rgba(248,81,73,0.35)',
    background: 'rgba(248,81,73,0.12)',
    color: '#ffb4ae',
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


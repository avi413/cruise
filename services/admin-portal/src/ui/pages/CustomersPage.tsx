import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

type Booking = {
  id: string
  booking_ref: string | null
  status: string
  created_at: string
  updated_at: string
  hold_expires_at: string | null
  customer_id: string | null
  sailing_id: string
  cabin_type: string
  cabin_category_code: string | null
  cabin_id: string | null
  guests: any
  quote: {
    currency: string
    subtotal: number
    discounts: number
    taxes_fees: number
    total: number
    lines: any[]
  }
}

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
  const { t } = useTranslation()

  const formatDate = (d: string) => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleString()
    } catch {
      return d
    }
  }

  const [activeTab, setActiveTab] = useState<'details' | 'bookings' | 'related'>('details')
  const [customerId, setCustomerId] = useState('')
  const [cust, setCust] = useState<Customer | null>(null)
  const [history, setHistory] = useState<BookingHistory[]>([])
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [bookingBusy, setBookingBusy] = useState(false)
  const [passengers, setPassengers] = useState<Passenger[]>([])
  
  // Passenger editing
  const [pEdit, setPEdit] = useState<Passenger | null>(null)
  const [pNew, setPNew] = useState<Partial<Passenger>>({ title: 'MR', first_name: '', last_name: '' })
  const [pBusy, setPBusy] = useState(false)
  const [pErr, setPErr] = useState<string | null>(null)

  // Search
  const [searchQ, setSearchQ] = useState('')
  const [hits, setHits] = useState<Customer[]>([])

  // New Customer Form
  const [isCreating, setIsCreating] = useState(false)
  const [email, setEmail] = useState('')
  const [createTitle, setCreateTitle] = useState('MR')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [createPhone, setCreatePhone] = useState('')
  const [tier, setTier] = useState('SILVER')

  // Edit State
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
      params.set('limit', '10')
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
      setIsCreating(false)
      // Reset create form
      setEmail('')
      setCreateTitle('MR')
      setFirstName('')
      setLastName('')
      setCreatePhone('')
      setHistory([])
      setPassengers([])
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
      console.error(e) // Don't show critical error for related lists
      setPassengers([])
    } finally {
      setPBusy(false)
    }
  }

  async function loadBooking(bid: string) {
    if (!bid) return
    setBookingBusy(true)
    try {
      const r = await apiFetch<Booking>(props.apiBase, `/v1/bookings/${bid}`)
      setSelectedBooking(r)
    } catch (e: any) {
      alert(String(e?.detail || e?.message || e))
    } finally {
      setBookingBusy(false)
    }
  }

  async function loadCustomer(cid?: string) {
    const id = String(cid ?? customerId).trim()
    if (!id) return
    
    setBusy(true)
    setErr(null)
    setCust(null) // Clear current while loading
    
    try {
      setCustomerId(id)
      const c = await apiFetch<Customer>(props.apiBase, `/v1/customers/${id}`)
      setCust(c)
      setPrefs(JSON.stringify(c.preferences || {}, null, 2))
      
      // Load related in parallel
      const hPromise = apiFetch<BookingHistory[]>(props.apiBase, `/v1/customers/${id}/bookings`)
      const pPromise = loadPassengers(id)
      
      const [h] = await Promise.all([hPromise, pPromise])
      setHistory(h || [])
      
      setActiveTab('details')
      setIsCreating(false)
    } catch (e: any) {
      const msg = String(e?.detail || e?.message || e)
      if (msg.toLowerCase().includes('not found')) {
         setErr(t('customers.error_not_found', { id }))
      } else {
         setErr(msg)
      }
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
        throw new Error(t('customers.error_preferences'))
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

  // --- Passenger Functions (Similar to before) ---
  async function createPassenger() {
    if (!cust) return
    const first = String(pNew.first_name || '').trim()
    const last = String(pNew.last_name || '').trim()
    if (!first || !last) {
      setPErr(t('customers.error_passenger_name'))
      return
    }
    setPBusy(true)
    setPErr(null)
    try {
      await apiFetch<Passenger>(props.apiBase, `/v1/customers/${cust.id}/passengers`, {
        method: 'POST',
        body: {
          ...pNew,
          first_name: first,
          last_name: last,
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
        body: pEdit,
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
      await apiFetch(props.apiBase, `/v1/passengers/${passengerId}`, { method: 'DELETE' })
      await loadPassengers(cust.id)
      if (pEdit?.id === passengerId) setPEdit(null)
    } catch (e: any) {
      setPErr(String(e?.detail || e?.message || e))
    } finally {
      setPBusy(false)
    }
  }

  // --- UI Components ---

  const renderSidebar = () => (
    <div style={styles.sidebar}>
      <div style={styles.sidebarHeader}>
        <div style={styles.sidebarTitle}>{t('customers.title')}</div>
        <button style={styles.primaryBtn} onClick={() => { setCust(null); setIsCreating(true); }}>{t('customers.new')}</button>
      </div>

      <div style={styles.searchBox}>
        <input 
          style={styles.searchInput} 
          value={searchQ} 
          onChange={(e) => setSearchQ(e.target.value)} 
          placeholder={t('customers.search_placeholder')} 
        />
      </div>

      <div style={styles.hitList}>
        {hits.map(h => (
          <div 
            key={h.id} 
            style={{...styles.hitItem, ...(cust?.id === h.id ? styles.hitItemActive : {})}}
            onClick={() => void loadCustomer(h.id)}
          >
            <div style={styles.hitName}>{[h.first_name, h.last_name].filter(Boolean).join(' ') || h.email}</div>
            <div style={styles.hitSub}>{h.email}</div>
          </div>
        ))}
        {hits.length === 0 && searchQ && <div style={styles.muted}>{t('customers.no_results')}</div>}
      </div>
      
      <div style={styles.lookupBox}>
         <div style={styles.muted}>{t('customers.load_by_id')}</div>
         <div style={{display: 'flex', gap: 6}}>
           <input style={styles.input} value={customerId} onChange={e => setCustomerId(e.target.value)} placeholder={t('customers.uuid_placeholder')} />
           <button style={styles.secondaryBtn} onClick={() => void loadCustomer()}>{t('customers.go')}</button>
         </div>
      </div>
    </div>
  )

  const renderHeader = () => {
    if (isCreating) {
      return (
        <div style={styles.pageHeader}>
           <div style={styles.headerIcon}>+</div>
           <div>
             <div style={styles.headerBread}>{t('customers.title')}</div>
             <div style={styles.headerTitle}>{t('customers.new_customer_title')}</div>
           </div>
        </div>
      )
    }
    if (!cust) {
      return (
        <div style={styles.pageHeader}>
           <div style={styles.headerIcon}>?</div>
           <div>
             <div style={styles.headerBread}>{t('customers.title')}</div>
             <div style={styles.headerTitle}>{t('customers.select_customer')}</div>
           </div>
        </div>
      )
    }
    const name = [cust.first_name, cust.last_name].filter(Boolean).join(' ') || t('customers.unnamed')
    return (
      <div style={styles.pageHeader}>
        <div style={styles.headerIcon}>{cust.first_name?.[0] || 'C'}</div>
        <div style={{flex: 1}}>
          <div style={styles.headerBread}>{t('customers.customer_breadcrumb')}</div>
          <div style={styles.headerTitle}>{name}</div>
        </div>
        <div style={styles.headerActions}>
           <button style={styles.primaryBtn} disabled={busy} onClick={() => void saveCustomer()}>{t('customers.save')}</button>
        </div>
      </div>
    )
  }

  const renderHighlights = () => {
    if (!cust || isCreating) return null
    return (
      <div style={styles.highlights}>
        <div style={styles.highlightItem}>
          <div style={styles.highlightLabel}>{t('customers.email')}</div>
          <div style={styles.highlightValue}>{cust.email}</div>
        </div>
        <div style={styles.highlightItem}>
          <div style={styles.highlightLabel}>{t('customers.loyalty_tier')}</div>
          <div style={styles.highlightValue}>{cust.loyalty_tier || '—'}</div>
        </div>
        <div style={styles.highlightItem}>
          <div style={styles.highlightLabel}>{t('customers.phone')}</div>
          <div style={styles.highlightValue}>{cust.phone || '—'}</div>
        </div>
        <div style={styles.highlightItem}>
          <div style={styles.highlightLabel}>{t('customers.id')}</div>
          <div style={styles.highlightValueMono}>{cust.id}</div>
        </div>
      </div>
    )
  }

  const renderTabs = () => {
    if (!cust || isCreating) return null
    return (
      <div style={styles.tabs}>
        <div 
          style={{...styles.tab, ...(activeTab === 'details' ? styles.tabActive : {})}} 
          onClick={() => setActiveTab('details')}
        >
          {t('customers.details')}
        </div>
        <div 
          style={{...styles.tab, ...(activeTab === 'bookings' ? styles.tabActive : {})}} 
          onClick={() => setActiveTab('bookings')}
        >
          {t('customers.bookings')}
        </div>
        <div 
          style={{...styles.tab, ...(activeTab === 'related' ? styles.tabActive : {})}} 
          onClick={() => setActiveTab('related')}
        >
          {t('customers.related')}
        </div>
      </div>
    )
  }

  const renderDetailForm = () => {
     if (!cust) return null
     return (
       <div style={styles.detailGrid}>
         <Section title={t('customers.contact_info')}>
            <Field label={t('customers.email')} value={cust.email} readOnly />
            <Field label={t('customers.phone')} value={cust.phone || ''} onChange={v => setCust({...cust, phone: v})} />
         </Section>
         
         <Section title={t('customers.personal_info')}>
            <div style={styles.row2}>
              <Select label={t('customers.field_title')} value={cust.title || ''} options={['MR','MRS','MS','MISS','DR']} onChange={v => setCust({...cust, title: v})} />
              <Field label={t('customers.birth_date')} type="date" value={cust.birth_date || ''} onChange={v => setCust({...cust, birth_date: v})} />
            </div>
            <div style={styles.row2}>
               <Field label={t('customers.first_name')} value={cust.first_name || ''} onChange={v => setCust({...cust, first_name: v})} />
               <Field label={t('customers.last_name')} value={cust.last_name || ''} onChange={v => setCust({...cust, last_name: v})} />
            </div>
            <Field label={t('customers.loyalty_tier')} value={cust.loyalty_tier || ''} onChange={v => setCust({...cust, loyalty_tier: v})} />
         </Section>

         <Section title={t('customers.address')}>
            <Field label={t('customers.address_line1')} value={cust.address_line1 || ''} onChange={v => setCust({...cust, address_line1: v})} />
            <Field label={t('customers.address_line2')} value={cust.address_line2 || ''} onChange={v => setCust({...cust, address_line2: v})} />
            <div style={styles.row2}>
              <Field label={t('customers.city')} value={cust.city || ''} onChange={v => setCust({...cust, city: v})} />
              <Field label={t('customers.state')} value={cust.state || ''} onChange={v => setCust({...cust, state: v})} />
            </div>
            <div style={styles.row2}>
              <Field label={t('customers.postal_code')} value={cust.postal_code || ''} onChange={v => setCust({...cust, postal_code: v})} />
              <Field label={t('customers.country')} value={cust.country || ''} onChange={v => setCust({...cust, country: v})} />
            </div>
         </Section>

         <Section title={t('customers.identity')}>
            <div style={styles.row2}>
               <Field label={t('customers.national_id')} value={cust.national_id_number || ''} onChange={v => setCust({...cust, national_id_number: v})} />
               <Field label={t('customers.national_id_country')} value={cust.national_id_country || ''} onChange={v => setCust({...cust, national_id_country: v})} />
            </div>
            <div style={styles.row2}>
               <Field label={t('customers.passport_number')} value={cust.passport_number || ''} onChange={v => setCust({...cust, passport_number: v})} />
               <Field label={t('customers.passport_country')} value={cust.passport_country || ''} onChange={v => setCust({...cust, passport_country: v})} />
            </div>
            <Field label={t('customers.passport_expiry')} type="date" value={cust.passport_expiry || ''} onChange={v => setCust({...cust, passport_expiry: v})} />
         </Section>

         <Section title={t('customers.system')}>
            <Field label={t('customers.created_at')} value={cust.created_at} readOnly />
            <Field label={t('customers.updated_at')} value={cust.updated_at} readOnly />
            <label style={styles.fieldLabel}>
              {t('customers.preferences_json')}
              <textarea 
                style={styles.textarea} 
                value={prefs} 
                onChange={e => setPrefs(e.target.value)} 
              />
            </label>
         </Section>
       </div>
     )
  }

  const renderCreateForm = () => (
    <div style={styles.detailGrid}>
      <Section title={t('customers.new_customer_details')}>
         <Field label={t('customers.email')} value={email} onChange={setEmail} placeholder={t('customers.required')} />
         <div style={styles.row2}>
           <Select label={t('customers.field_title')} value={createTitle} options={['MR','MRS','MS','MISS','DR']} onChange={setCreateTitle} />
           <div />
         </div>
         <div style={styles.row2}>
           <Field label={t('customers.first_name')} value={firstName} onChange={setFirstName} />
           <Field label={t('customers.last_name')} value={lastName} onChange={setLastName} />
         </div>
         <Field label={t('customers.phone')} value={createPhone} onChange={setCreatePhone} />
         <Field label={t('customers.loyalty_tier')} value={tier} onChange={setTier} />
         
         <div style={{marginTop: 20}}>
           <button style={styles.primaryBtn} disabled={busy || !email} onClick={() => void createCustomer()}>
             {busy ? t('customers.creating') : t('customers.create_btn')}
           </button>
           <button style={{...styles.secondaryBtn, marginLeft: 10}} onClick={() => setIsCreating(false)}>{t('customers.cancel')}</button>
         </div>
      </Section>
    </div>
  )

  const renderBookingModal = () => {
    if (!selectedBooking) return null
    const b = selectedBooking
    return (
      <div style={styles.modalOverlay} onClick={() => setSelectedBooking(null)}>
        <div style={{...styles.modal, width: 800, overflowY: 'auto', maxHeight: '90vh'}} onClick={e => e.stopPropagation()}>
           <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
              <h3 style={{margin: 0}}>{t('customers.booking_details')}</h3>
              <button style={styles.secondaryBtn} onClick={() => setSelectedBooking(null)}>X</button>
           </div>
           
           <div style={{display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr'}}>
              <div style={styles.field}>
                 <div style={styles.fieldLabel}>Ref</div>
                 <div style={styles.fieldValueReadOnly}>{b.booking_ref || '—'}</div>
              </div>
              <div style={styles.field}>
                 <div style={styles.fieldLabel}>Status</div>
                 <div style={styles.fieldValueReadOnly}>{b.status}</div>
              </div>
              <div style={styles.field}>
                 <div style={styles.fieldLabel}>Created</div>
                 <div style={styles.fieldValueReadOnly}>{formatDate(b.created_at)}</div>
              </div>
              <div style={styles.field}>
                 <div style={styles.fieldLabel}>Expires</div>
                 <div style={styles.fieldValueReadOnly}>{formatDate(b.hold_expires_at || '')}</div>
              </div>
           </div>

           <div style={{marginTop: 16}}><strong>Sailing</strong></div>
           <div style={{display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr'}}>
              <div style={styles.field}>
                 <div style={styles.fieldLabel}>Sailing ID</div>
                 <div style={styles.fieldValueReadOnly}>{b.sailing_id}</div>
              </div>
              <div style={styles.field}>
                 <div style={styles.fieldLabel}>Cabin Type</div>
                 <div style={styles.fieldValueReadOnly}>{b.cabin_type}</div>
              </div>
              <div style={styles.field}>
                 <div style={styles.fieldLabel}>Cabin ID</div>
                 <div style={styles.fieldValueReadOnly}>{b.cabin_id || '—'}</div>
              </div>
              <div style={styles.field}>
                 <div style={styles.fieldLabel}>Category</div>
                 <div style={styles.fieldValueReadOnly}>{b.cabin_category_code || '—'}</div>
              </div>
           </div>

           <div style={{marginTop: 16}}><strong>Quote</strong></div>
           <div style={{display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr'}}>
              <div style={styles.field}>
                 <div style={styles.fieldLabel}>Total</div>
                 <div style={styles.fieldValueReadOnly}>{b.quote.total} {b.quote.currency}</div>
              </div>
              <div style={styles.field}>
                 <div style={styles.fieldLabel}>Subtotal</div>
                 <div style={styles.fieldValueReadOnly}>{b.quote.subtotal}</div>
              </div>
           </div>
           
           <div style={{marginTop: 16}}><strong>Guests</strong></div>
           <pre style={{background: '#f5f5f5', padding: 10, borderRadius: 4, fontSize: 12}}>{JSON.stringify(b.guests, null, 2)}</pre>
        </div>
      </div>
    )
  }

  const renderBookings = () => {
     if (!cust) return null
     return (
       <div style={{display: 'grid', gap: 20}}>
          <Section title={t('customers.booking_history')}>
             <table style={styles.table}>
               <thead>
                 <tr>
                   <th style={styles.th}>{t('customers.booking_id')}</th>
                   <th style={styles.th}>{t('customers.sailing')}</th>
                   <th style={styles.th}>{t('customers.status')}</th>
                   <th style={styles.th}>{t('customers.amount')}</th>
                   <th style={styles.th}>{t('customers.updated')}</th>
                   <th style={styles.th}>{t('customers.actions')}</th>
                 </tr>
               </thead>
               <tbody>
                 {history.map(h => (
                   <tr key={h.booking_id}>
                     <td style={styles.tdMono}>{h.booking_id}</td>
                     <td style={styles.tdMono}>{h.sailing_id}</td>
                     <td style={styles.td}>{h.status}</td>
                     <td style={styles.tdMono}>{h.meta?.total ? `${h.meta.total} ${h.meta.currency || ''}` : '—'}</td>
                     <td style={styles.td}>{formatDate(h.updated_at)}</td>
                     <td style={styles.td}>
                        <button style={styles.linkBtn} onClick={() => void loadBooking(h.booking_id)}>{bookingBusy ? '...' : t('customers.view_details')}</button>
                     </td>
                   </tr>
                 ))}
                 {!history.length && <tr><td colSpan={6} style={styles.tdMuted}>{t('customers.no_bookings')}</td></tr>}
               </tbody>
             </table>
          </Section>
          {renderBookingModal()}
       </div>
     )
  }

  const renderRelated = () => {
    if (!cust) return null
    return (
      <div style={{display: 'grid', gap: 20}}>
        <Section title={t('customers.passengers')}>
           <div style={styles.tableToolbar}>
              <button style={styles.secondaryBtn} onClick={() => setPNew({...pNew, first_name: 'New', last_name: 'Passenger'})}>{t('customers.add_passenger')}</button>
           </div>
           
           {pNew.first_name !== '' && !pEdit ? (
             <div style={styles.inlineForm}>
                <strong>{t('customers.new_passenger')}</strong>
                <div style={styles.row2}>
                  <Select label={t('customers.field_title')} value={pNew.title || ''} options={['MR','MRS','MS','MISS','DR']} onChange={v => setPNew({...pNew, title: v})} />
                  <Field label={t('customers.birth_date')} type="date" value={pNew.birth_date || ''} onChange={v => setPNew({...pNew, birth_date: v})} />
                </div>
                <div style={styles.row2}>
                   <Field label={t('customers.first_name')} value={pNew.first_name || ''} onChange={v => setPNew({...pNew, first_name: v})} />
                   <Field label={t('customers.last_name')} value={pNew.last_name || ''} onChange={v => setPNew({...pNew, last_name: v})} />
                </div>
                <div style={{display: 'flex', gap: 10, marginTop: 10}}>
                   <button style={styles.primaryBtn} onClick={() => void createPassenger()}>{t('customers.save')}</button>
                   <button style={styles.secondaryBtn} onClick={() => setPNew({title: 'MR', first_name: '', last_name: ''})}>{t('customers.cancel')}</button>
                </div>
             </div>
           ) : null}

           <table style={styles.table}>
             <thead>
               <tr>
                 <th style={styles.th}>{t('customers.table_name')}</th>
                 <th style={styles.th}>{t('customers.table_birth_date')}</th>
                 <th style={styles.th}>{t('customers.table_passport')}</th>
                 <th style={styles.th}>{t('customers.table_actions')}</th>
               </tr>
             </thead>
             <tbody>
               {passengers.map(p => (
                 <tr key={p.id}>
                   <td style={styles.td}>{[p.title, p.first_name, p.last_name].filter(Boolean).join(' ')}</td>
                   <td style={styles.tdMono}>{p.birth_date || '—'}</td>
                   <td style={styles.tdMono}>{p.passport_number || '—'}</td>
                   <td style={styles.td}>
                     <button style={styles.linkBtn} onClick={() => setPEdit(p)}>{t('customers.edit')}</button>
                     <button style={styles.linkBtnDanger} onClick={() => void removePassenger(p.id)}>{t('customers.delete')}</button>
                   </td>
                 </tr>
               ))}
               {!passengers.length && <tr><td colSpan={4} style={styles.tdMuted}>{t('customers.no_passengers')}</td></tr>}
             </tbody>
           </table>
           
           {pEdit && (
             <div style={styles.modalOverlay}>
               <div style={styles.modal}>
                 <h3>{t('customers.edit_passenger')}</h3>
                 <div style={styles.row2}>
                    <Select label={t('customers.field_title')} value={pEdit.title || ''} options={['MR','MRS','MS','MISS','DR']} onChange={v => setPEdit({...pEdit, title: v})} />
                    <Field label={t('customers.birth_date')} type="date" value={pEdit.birth_date || ''} onChange={v => setPEdit({...pEdit, birth_date: v})} />
                 </div>
                 <div style={styles.row2}>
                    <Field label={t('customers.first_name')} value={pEdit.first_name || ''} onChange={v => setPEdit({...pEdit, first_name: v})} />
                    <Field label={t('customers.last_name')} value={pEdit.last_name || ''} onChange={v => setPEdit({...pEdit, last_name: v})} />
                 </div>
                 <div style={styles.row2}>
                    <Field label={t('customers.passport_number')} value={pEdit.passport_number || ''} onChange={v => setPEdit({...pEdit, passport_number: v})} />
                    <Field label={t('customers.passport_expiry')} type="date" value={pEdit.passport_expiry || ''} onChange={v => setPEdit({...pEdit, passport_expiry: v})} />
                 </div>
                 <div style={{display: 'flex', gap: 10, marginTop: 20}}>
                    <button style={styles.primaryBtn} onClick={() => void savePassenger()}>{t('customers.save')}</button>
                    <button style={styles.secondaryBtn} onClick={() => setPEdit(null)}>{t('customers.cancel')}</button>
                 </div>
               </div>
             </div>
           )}
        </Section>
      </div>
    )
  }

  return (
    <div style={styles.layout}>
      {renderSidebar()}
      <div style={styles.main}>
        {renderHeader()}
        {err && <div style={styles.error}>{err}</div>}
        {renderHighlights()}
        {renderTabs()}
        <div style={styles.content}>
           {isCreating ? renderCreateForm() : (activeTab === 'details' ? renderDetailForm() : (activeTab === 'bookings' ? renderBookings() : renderRelated()))}
           {!cust && !isCreating && <div style={styles.emptyState}>{t('customers.empty_state')}</div>}
        </div>
      </div>
    </div>
  )
}

// Helpers
const Section = ({title, children}: {title: string, children: React.ReactNode}) => (
  <div style={styles.section}>
    <div style={styles.sectionTitle}>{title}</div>
    <div style={styles.sectionContent}>{children}</div>
  </div>
)

const Field = ({label, value, onChange, readOnly, placeholder, type = 'text'}: any) => (
  <label style={styles.field}>
    <div style={styles.fieldLabel}>{label}</div>
    {readOnly ? (
      <div style={styles.fieldValueReadOnly}>{value || '—'}</div>
    ) : (
      <input 
        style={styles.input} 
        type={type}
        value={value} 
        onChange={e => onChange(e.target.value || null)} 
        placeholder={placeholder}
      />
    )}
  </label>
)

const Select = ({label, value, options, onChange}: any) => (
  <label style={styles.field}>
    <div style={styles.fieldLabel}>{label}</div>
    <select style={styles.input} value={value} onChange={e => onChange(e.target.value || null)}>
      <option value="">—</option>
      {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
    </select>
  </label>
)

const styles: Record<string, React.CSSProperties> = {
  layout: { display: 'grid', gridTemplateColumns: '280px 1fr', height: '100vh', background: 'var(--csp-shell-bg)', overflow: 'hidden' },
  sidebar: { background: 'var(--csp-surface-bg)', borderRight: '1px solid var(--csp-border)', display: 'flex', flexDirection: 'column' },
  sidebarHeader: { padding: 16, borderBottom: '1px solid var(--csp-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sidebarTitle: { fontWeight: 700, fontSize: 16 },
  searchBox: { padding: 12 },
  searchInput: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--csp-border)', fontSize: 14 },
  hitList: { flex: 1, overflowY: 'auto' },
  hitItem: { padding: '10px 16px', borderBottom: '1px solid var(--csp-border)', cursor: 'pointer' },
  hitItemActive: { background: 'var(--csp-primary-soft)', borderLeft: '3px solid var(--csp-primary)' },
  hitName: { fontWeight: 500, fontSize: 14, color: 'var(--csp-text)' },
  hitSub: { fontSize: 12, color: 'var(--csp-muted)' },
  lookupBox: { padding: 16, borderTop: '1px solid var(--csp-border)' },
  
  main: { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  pageHeader: { background: 'var(--csp-surface-bg)', padding: '16px 24px', borderBottom: '1px solid var(--csp-border)', display: 'flex', gap: 16, alignItems: 'center' },
  headerIcon: { width: 40, height: 40, borderRadius: 4, background: '#f59e0b', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 20 },
  headerBread: { fontSize: 12, color: 'var(--csp-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  headerTitle: { fontSize: 20, fontWeight: 700, color: 'var(--csp-text)' },
  headerActions: { display: 'flex', gap: 8 },
  
  highlights: { background: 'var(--csp-surface-2-bg)', padding: '12px 24px', display: 'flex', gap: 32, borderBottom: '1px solid var(--csp-border)' },
  highlightItem: { display: 'flex', flexDirection: 'column', gap: 4 },
  highlightLabel: { fontSize: 11, fontWeight: 600, color: 'var(--csp-muted)', textTransform: 'uppercase' },
  highlightValue: { fontSize: 14, fontWeight: 500, color: 'var(--csp-text)' },
  highlightValueMono: { fontSize: 13, fontFamily: 'monospace', color: 'var(--csp-text)' },
  
  tabs: { display: 'flex', padding: '0 24px', background: 'var(--csp-surface-bg)', borderBottom: '1px solid var(--csp-border)' },
  tab: { padding: '12px 16px', fontSize: 14, fontWeight: 500, color: 'var(--csp-muted)', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabActive: { color: 'var(--csp-primary)', borderBottomColor: 'var(--csp-primary)' },
  
  content: { padding: 24, overflowY: 'auto', flex: 1 },
  detailGrid: { display: 'grid', gap: 24, maxWidth: 1000 },
  section: { background: 'var(--csp-surface-bg)', border: '1px solid var(--csp-border)', borderRadius: 8, overflow: 'hidden' },
  sectionTitle: { padding: '12px 16px', background: 'var(--csp-surface-2-bg)', borderBottom: '1px solid var(--csp-border)', fontWeight: 600, fontSize: 14 },
  sectionContent: { padding: 16, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' },
  
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: { fontSize: 12, color: 'var(--csp-muted)', fontWeight: 500 },
  fieldValueReadOnly: { padding: '8px 0', borderBottom: '1px solid var(--csp-border)', fontSize: 14 },
  input: { padding: '8px 12px', borderRadius: 4, border: '1px solid var(--csp-border-strong)', fontSize: 14 },
  textarea: { padding: '8px 12px', borderRadius: 4, border: '1px solid var(--csp-border-strong)', fontSize: 14, minHeight: 100, fontFamily: 'monospace' },
  
  primaryBtn: { padding: '8px 16px', borderRadius: 4, background: 'var(--csp-primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  secondaryBtn: { padding: '8px 16px', borderRadius: 4, background: 'white', color: 'var(--csp-text)', border: '1px solid var(--csp-border-strong)', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  linkBtn: { background: 'none', border: 'none', color: 'var(--csp-primary)', cursor: 'pointer', fontWeight: 500, padding: 4 },
  linkBtnDanger: { background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 500, padding: 4 },
  
  error: { margin: '0 24px 16px 24px', padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 13 },
  emptyState: { padding: 40, textAlign: 'center', color: 'var(--csp-muted)' },
  muted: { color: 'var(--csp-muted)', fontSize: 13 },
  
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid var(--csp-border)', color: 'var(--csp-muted)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--csp-border)' },
  tdMono: { padding: '10px 12px', borderBottom: '1px solid var(--csp-border)', fontFamily: 'monospace' },
  tdMuted: { padding: '20px', textAlign: 'center', color: 'var(--csp-muted)' },
  tableToolbar: { paddingBottom: 12, display: 'flex', justifyContent: 'flex-end' },
  
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99 },
  modal: { background: 'white', padding: 24, borderRadius: 8, width: 500, maxWidth: '90%', display: 'grid', gap: 16 },
  
  inlineForm: { background: 'var(--csp-surface-2-bg)', padding: 16, borderRadius: 8, marginBottom: 16, display: 'grid', gap: 12, border: '1px solid var(--csp-border)' }
}

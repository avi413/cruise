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
  const [activeTab, setActiveTab] = useState<'details' | 'related'>('details')
  const [customerId, setCustomerId] = useState('')
  const [cust, setCust] = useState<Customer | null>(null)
  const [history, setHistory] = useState<BookingHistory[]>([])
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
         setErr(`Customer ${id} not found.`)
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

  // --- Passenger Functions (Similar to before) ---
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
        <div style={styles.sidebarTitle}>Customers</div>
        <button style={styles.primaryBtn} onClick={() => { setCust(null); setIsCreating(true); }}>New</button>
      </div>

      <div style={styles.searchBox}>
        <input 
          style={styles.searchInput} 
          value={searchQ} 
          onChange={(e) => setSearchQ(e.target.value)} 
          placeholder="Search customers..." 
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
        {hits.length === 0 && searchQ && <div style={styles.muted}>No results found.</div>}
      </div>
      
      <div style={styles.lookupBox}>
         <div style={styles.muted}>Load by ID</div>
         <div style={{display: 'flex', gap: 6}}>
           <input style={styles.input} value={customerId} onChange={e => setCustomerId(e.target.value)} placeholder="UUID" />
           <button style={styles.secondaryBtn} onClick={() => void loadCustomer()}>Go</button>
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
             <div style={styles.headerBread}>Customers</div>
             <div style={styles.headerTitle}>New Customer</div>
           </div>
        </div>
      )
    }
    if (!cust) {
      return (
        <div style={styles.pageHeader}>
           <div style={styles.headerIcon}>?</div>
           <div>
             <div style={styles.headerBread}>Customers</div>
             <div style={styles.headerTitle}>Select a customer</div>
           </div>
        </div>
      )
    }
    const name = [cust.first_name, cust.last_name].filter(Boolean).join(' ') || 'Unnamed Customer'
    return (
      <div style={styles.pageHeader}>
        <div style={styles.headerIcon}>{cust.first_name?.[0] || 'C'}</div>
        <div style={{flex: 1}}>
          <div style={styles.headerBread}>Customer</div>
          <div style={styles.headerTitle}>{name}</div>
        </div>
        <div style={styles.headerActions}>
           <button style={styles.primaryBtn} disabled={busy} onClick={() => void saveCustomer()}>Save</button>
        </div>
      </div>
    )
  }

  const renderHighlights = () => {
    if (!cust || isCreating) return null
    return (
      <div style={styles.highlights}>
        <div style={styles.highlightItem}>
          <div style={styles.highlightLabel}>Email</div>
          <div style={styles.highlightValue}>{cust.email}</div>
        </div>
        <div style={styles.highlightItem}>
          <div style={styles.highlightLabel}>Loyalty Tier</div>
          <div style={styles.highlightValue}>{cust.loyalty_tier || '—'}</div>
        </div>
        <div style={styles.highlightItem}>
          <div style={styles.highlightLabel}>Phone</div>
          <div style={styles.highlightValue}>{cust.phone || '—'}</div>
        </div>
        <div style={styles.highlightItem}>
          <div style={styles.highlightLabel}>ID</div>
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
          Details
        </div>
        <div 
          style={{...styles.tab, ...(activeTab === 'related' ? styles.tabActive : {})}} 
          onClick={() => setActiveTab('related')}
        >
          Related
        </div>
      </div>
    )
  }

  const renderDetailForm = () => {
     if (!cust) return null
     return (
       <div style={styles.detailGrid}>
         <Section title="Contact Information">
            <Field label="Email" value={cust.email} readOnly />
            <Field label="Phone" value={cust.phone || ''} onChange={v => setCust({...cust, phone: v})} />
         </Section>
         
         <Section title="Personal Information">
            <div style={styles.row2}>
              <Select label="Title" value={cust.title || ''} options={['MR','MRS','MS','MISS','DR']} onChange={v => setCust({...cust, title: v})} />
              <Field label="Birth Date" type="date" value={cust.birth_date || ''} onChange={v => setCust({...cust, birth_date: v})} />
            </div>
            <div style={styles.row2}>
               <Field label="First Name" value={cust.first_name || ''} onChange={v => setCust({...cust, first_name: v})} />
               <Field label="Last Name" value={cust.last_name || ''} onChange={v => setCust({...cust, last_name: v})} />
            </div>
            <Field label="Loyalty Tier" value={cust.loyalty_tier || ''} onChange={v => setCust({...cust, loyalty_tier: v})} />
         </Section>

         <Section title="Address">
            <Field label="Address Line 1" value={cust.address_line1 || ''} onChange={v => setCust({...cust, address_line1: v})} />
            <Field label="Address Line 2" value={cust.address_line2 || ''} onChange={v => setCust({...cust, address_line2: v})} />
            <div style={styles.row2}>
              <Field label="City" value={cust.city || ''} onChange={v => setCust({...cust, city: v})} />
              <Field label="State/Province" value={cust.state || ''} onChange={v => setCust({...cust, state: v})} />
            </div>
            <div style={styles.row2}>
              <Field label="Postal Code" value={cust.postal_code || ''} onChange={v => setCust({...cust, postal_code: v})} />
              <Field label="Country" value={cust.country || ''} onChange={v => setCust({...cust, country: v})} />
            </div>
         </Section>

         <Section title="Identity">
            <div style={styles.row2}>
               <Field label="National ID" value={cust.national_id_number || ''} onChange={v => setCust({...cust, national_id_number: v})} />
               <Field label="National ID Country" value={cust.national_id_country || ''} onChange={v => setCust({...cust, national_id_country: v})} />
            </div>
            <div style={styles.row2}>
               <Field label="Passport Number" value={cust.passport_number || ''} onChange={v => setCust({...cust, passport_number: v})} />
               <Field label="Passport Country" value={cust.passport_country || ''} onChange={v => setCust({...cust, passport_country: v})} />
            </div>
            <Field label="Passport Expiry" type="date" value={cust.passport_expiry || ''} onChange={v => setCust({...cust, passport_expiry: v})} />
         </Section>

         <Section title="System">
            <Field label="Created At" value={cust.created_at} readOnly />
            <Field label="Updated At" value={cust.updated_at} readOnly />
            <label style={styles.fieldLabel}>
              Preferences (JSON)
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
      <Section title="New Customer Details">
         <Field label="Email" value={email} onChange={setEmail} placeholder="required" />
         <div style={styles.row2}>
           <Select label="Title" value={createTitle} options={['MR','MRS','MS','MISS','DR']} onChange={setCreateTitle} />
           <div />
         </div>
         <div style={styles.row2}>
           <Field label="First Name" value={firstName} onChange={setFirstName} />
           <Field label="Last Name" value={lastName} onChange={setLastName} />
         </div>
         <Field label="Phone" value={createPhone} onChange={setCreatePhone} />
         <Field label="Loyalty Tier" value={tier} onChange={setTier} />
         
         <div style={{marginTop: 20}}>
           <button style={styles.primaryBtn} disabled={busy || !email} onClick={() => void createCustomer()}>
             {busy ? 'Creating...' : 'Create Customer'}
           </button>
           <button style={{...styles.secondaryBtn, marginLeft: 10}} onClick={() => setIsCreating(false)}>Cancel</button>
         </div>
      </Section>
    </div>
  )

  const renderRelated = () => {
    if (!cust) return null
    return (
      <div style={{display: 'grid', gap: 20}}>
        <Section title="Passengers">
           <div style={styles.tableToolbar}>
              <button style={styles.secondaryBtn} onClick={() => setPNew({...pNew, first_name: 'New', last_name: 'Passenger'})}>+ Add Passenger</button>
           </div>
           
           {pNew.first_name !== '' && !pEdit ? (
             <div style={styles.inlineForm}>
                <strong>New Passenger</strong>
                <div style={styles.row2}>
                  <Select label="Title" value={pNew.title || ''} options={['MR','MRS','MS','MISS','DR']} onChange={v => setPNew({...pNew, title: v})} />
                  <Field label="Birth Date" type="date" value={pNew.birth_date || ''} onChange={v => setPNew({...pNew, birth_date: v})} />
                </div>
                <div style={styles.row2}>
                   <Field label="First Name" value={pNew.first_name || ''} onChange={v => setPNew({...pNew, first_name: v})} />
                   <Field label="Last Name" value={pNew.last_name || ''} onChange={v => setPNew({...pNew, last_name: v})} />
                </div>
                <div style={{display: 'flex', gap: 10, marginTop: 10}}>
                   <button style={styles.primaryBtn} onClick={() => void createPassenger()}>Save</button>
                   <button style={styles.secondaryBtn} onClick={() => setPNew({title: 'MR', first_name: '', last_name: ''})}>Cancel</button>
                </div>
             </div>
           ) : null}

           <table style={styles.table}>
             <thead>
               <tr>
                 <th style={styles.th}>Name</th>
                 <th style={styles.th}>Birth Date</th>
                 <th style={styles.th}>Passport</th>
                 <th style={styles.th}>Actions</th>
               </tr>
             </thead>
             <tbody>
               {passengers.map(p => (
                 <tr key={p.id}>
                   <td style={styles.td}>{[p.title, p.first_name, p.last_name].filter(Boolean).join(' ')}</td>
                   <td style={styles.tdMono}>{p.birth_date || '—'}</td>
                   <td style={styles.tdMono}>{p.passport_number || '—'}</td>
                   <td style={styles.td}>
                     <button style={styles.linkBtn} onClick={() => setPEdit(p)}>Edit</button>
                     <button style={styles.linkBtnDanger} onClick={() => void removePassenger(p.id)}>Del</button>
                   </td>
                 </tr>
               ))}
               {!passengers.length && <tr><td colSpan={4} style={styles.tdMuted}>No passengers.</td></tr>}
             </tbody>
           </table>
           
           {pEdit && (
             <div style={styles.modalOverlay}>
               <div style={styles.modal}>
                 <h3>Edit Passenger</h3>
                 <div style={styles.row2}>
                    <Select label="Title" value={pEdit.title || ''} options={['MR','MRS','MS','MISS','DR']} onChange={v => setPEdit({...pEdit, title: v})} />
                    <Field label="Birth Date" type="date" value={pEdit.birth_date || ''} onChange={v => setPEdit({...pEdit, birth_date: v})} />
                 </div>
                 <div style={styles.row2}>
                    <Field label="First Name" value={pEdit.first_name || ''} onChange={v => setPEdit({...pEdit, first_name: v})} />
                    <Field label="Last Name" value={pEdit.last_name || ''} onChange={v => setPEdit({...pEdit, last_name: v})} />
                 </div>
                 <div style={styles.row2}>
                    <Field label="Passport Number" value={pEdit.passport_number || ''} onChange={v => setPEdit({...pEdit, passport_number: v})} />
                    <Field label="Passport Expiry" type="date" value={pEdit.passport_expiry || ''} onChange={v => setPEdit({...pEdit, passport_expiry: v})} />
                 </div>
                 <div style={{display: 'flex', gap: 10, marginTop: 20}}>
                    <button style={styles.primaryBtn} onClick={() => void savePassenger()}>Save</button>
                    <button style={styles.secondaryBtn} onClick={() => setPEdit(null)}>Cancel</button>
                 </div>
               </div>
             </div>
           )}
        </Section>
        
        <Section title="Booking History">
           <table style={styles.table}>
             <thead>
               <tr>
                 <th style={styles.th}>Booking ID</th>
                 <th style={styles.th}>Sailing</th>
                 <th style={styles.th}>Status</th>
                 <th style={styles.th}>Updated</th>
               </tr>
             </thead>
             <tbody>
               {history.map(h => (
                 <tr key={h.booking_id}>
                   <td style={styles.tdMono}>{h.booking_id}</td>
                   <td style={styles.tdMono}>{h.sailing_id}</td>
                   <td style={styles.td}>{h.status}</td>
                   <td style={styles.tdMono}>{h.updated_at}</td>
                 </tr>
               ))}
               {!history.length && <tr><td colSpan={4} style={styles.tdMuted}>No bookings found.</td></tr>}
             </tbody>
           </table>
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
           {isCreating ? renderCreateForm() : (activeTab === 'details' ? renderDetailForm() : renderRelated())}
           {!cust && !isCreating && <div style={styles.emptyState}>Select a customer from the sidebar or create a new one.</div>}
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

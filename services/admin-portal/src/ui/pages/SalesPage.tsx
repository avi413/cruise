import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../api/client'

// --- Types ---

type QuoteOut = {
  currency: string
  subtotal: number
  discounts: number
  taxes_fees: number
  total: number
  lines: { code: string; description: string; amount: number }[]
}

type BookingOut = {
  id: string
  status: string
  created_at: string
  updated_at: string
  hold_expires_at: string | null
  customer_id: string | null
  sailing_id: string
  cabin_type: string
  cabin_id: string | null
  guests: any
  quote: QuoteOut
}

type Sailing = {
  id: string
  code: string
  ship_id: string
  start_date: string
  end_date: string
  embark_port_code: string
  debark_port_code: string
  status: string
}

type Port = {
  code: string
  names: Record<string, string>
  cities: Record<string, string>
  countries: Record<string, string>
}

type Customer = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  loyalty_tier?: string | null
  updated_at?: string
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
  cabin_no: string
  deck: number
  category_id: string | null
  status: string
}

type CruisePrice = {
  company_id: string
  sailing_id: string
  cabin_category_code: string
  price_category_code: string
  currency: string
  min_guests: number
  price_per_person: number
  updated_at: string
}

type MePrefs = { user_id: string; updated_at: string; preferences: any }

// --- Helpers ---

function formatMoney(cents: number, currency: string, locale: string): string {
  const amount = Number(cents || 0) / 100
  try {
    return new Intl.NumberFormat(locale || 'en', { style: 'currency', currency: currency || 'USD' }).format(amount)
  } catch {
    return `${currency || 'USD'} ${amount.toFixed(2)}`
  }
}

function getProp(obj: any, locale: string): string {
  if (!obj) return ''
  return obj[locale] || obj['en'] || Object.values(obj)[0] || ''
}

// --- Component ---

export function SalesPage(props: { apiBase: string }) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  // -- Global State --
  const [userLocale, setUserLocale] = useState('en')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // -- Data Cache --
  const [sailings, setSailings] = useState<Sailing[]>([])
  const [ports, setPorts] = useState<Port[]>([])
  const [cabinCats, setCabinCats] = useState<CabinCategory[]>([])
  const [cabins, setCabins] = useState<Cabin[]>([])
  const [unavailableCabins, setUnavailableCabins] = useState<string[]>([])
  const [prices, setPrices] = useState<CruisePrice[]>([])

  // -- Search State --
  const [searchDest, setSearchDest] = useState('')
  const [searchDateStart, setSearchDateStart] = useState('')
  const [searchDateEnd, setSearchDateEnd] = useState('')
  const [searchGuests, setSearchGuests] = useState(2)

  // -- Flow State --
  // step: search -> selection -> quote -> booking -> payment -> confirm
  const [step, setStep] = useState<'search' | 'selection' | 'quote' | 'booking' | 'payment' | 'confirm'>('search')
  
  const [selectedSailingId, setSelectedSailingId] = useState('')
  const [selectedDeck, setSelectedDeck] = useState<number | null>(null)
  const [selectedCabinId, setSelectedCabinId] = useState('')
  const [selectedCabinType, setSelectedCabinType] = useState<'inside' | 'oceanview' | 'balcony' | 'suite'>('inside') // Fallback if no specific cabin
  const [selectedCatCode, setSelectedCatCode] = useState('')

  const [quote, setQuote] = useState<QuoteOut | null>(null)
  
  // -- Booking State --
  const [customerId, setCustomerId] = useState('')
  const [customerQ, setCustomerQ] = useState('')
  const [customerHits, setCustomerHits] = useState<Customer[]>([])
  const [booking, setBooking] = useState<BookingOut | null>(null)
  
  // -- Guests Breakdown --
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [infants, setInfants] = useState(0)

  // -- Init --

  useEffect(() => {
    // Load Prefs
    apiFetch<MePrefs>(props.apiBase, `/v1/staff/me/preferences`)
      .then((r) => setUserLocale(String(r?.preferences?.locale || 'en')))
      .catch(() => {})

    // Load Sailings & Ports
    Promise.all([
      apiFetch<Sailing[]>(props.apiBase, `/v1/sailings`, { auth: false, tenant: false }),
      apiFetch<Port[]>(props.apiBase, `/v1/ports`)
    ]).then(([s, p]) => {
      setSailings(s || [])
      setPorts(p || [])
    }).catch(e => setErr(String(e)))
  }, [props.apiBase])

  // Deep Link Support
  useEffect(() => {
    const sid = searchParams.get('sailing_id')
    if (sid && sailings.length > 0 && !selectedSailingId) {
       const s = sailings.find(x => x.id === sid)
       if (s) selectSailing(s)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, sailings])

  // -- Filtered Results --

  const filteredSailings = useMemo(() => {
    return sailings.filter(s => {
      if (searchDest && s.embark_port_code !== searchDest) return false
      if (searchDateStart && s.start_date < searchDateStart) return false
      if (searchDateEnd && s.end_date > searchDateEnd) return false
      return true
    })
  }, [sailings, searchDest, searchDateStart, searchDateEnd])

  // -- Actions --

  async function selectSailing(s: Sailing) {
    setSelectedSailingId(s.id)
    setStep('selection')
    setBusy(true)
    try {
      // Load Ship Metadata
      const cats = await apiFetch<CabinCategory[]>(props.apiBase, `/v1/ships/${s.ship_id}/cabin-categories`)
      setCabinCats(cats || [])
      const cabs = await apiFetch<Cabin[]>(props.apiBase, `/v1/ships/${s.ship_id}/cabins`)
      setCabins(cabs || [])
      const unavail = await apiFetch<string[]>(props.apiBase, `/v1/inventory/sailings/${s.id}/unavailable-cabins`)
      setUnavailableCabins(unavail || [])
      const pr = await apiFetch<CruisePrice[]>(props.apiBase, `/v1/cruise-prices?sailing_id=${s.id}`)
      setPrices(pr || [])
    } catch (e: any) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function getQuote() {
    if (!selectedSailingId) return
    setBusy(true)
    setErr(null)
    try {
      // Prepare guests list
      const guests = []
      for(let i=0; i<adults; i++) guests.push({ paxtype: 'adult' })
      for(let i=0; i<children; i++) guests.push({ paxtype: 'child' })
      for(let i=0; i<infants; i++) guests.push({ paxtype: 'infant' })

      const q = await apiFetch<QuoteOut>(props.apiBase, `/v1/quote`, {
        method: 'POST',
        body: {
          sailing_id: selectedSailingId,
          sailing_date: null, // derived from ID
          cabin_type: selectedCabinType,
          cabin_category_code: selectedCatCode || null,
          price_type: 'regular',
          guests,
          coupon_code: null,
          loyalty_tier: null
        },
        tenant: true
      })
      setQuote(q)
      setStep('quote')
    } catch (e: any) {
      setErr(String(e?.detail || e))
    } finally {
      setBusy(false)
    }
  }

  async function createHold() {
    setBusy(true)
    setErr(null)
    try {
       const r = await apiFetch<BookingOut>(props.apiBase, `/v1/holds`, {
        method: 'POST',
        body: {
          customer_id: customerId || null,
          sailing_id: selectedSailingId,
          cabin_type: selectedCabinType,
          cabin_category_code: selectedCatCode || null,
          cabin_id: selectedCabinId || null,
          price_type: 'regular',
          guests: { adult: adults, child: children, infant: infants },
          hold_minutes: 30,
        },
      })
      setBooking(r)
      setStep('payment')
    } catch (e: any) {
      setErr(String(e?.detail || e))
    } finally {
      setBusy(false)
    }
  }

  async function processPayment() {
    if (!booking) return
    setBusy(true)
    try {
      const r = await apiFetch<BookingOut>(props.apiBase, `/v1/bookings/${booking.id}/confirm`, {
        method: 'POST',
        body: { payment_token: 'demo-pos-terminal' }
      })
      setBooking(r)
      setStep('confirm')
    } catch (e: any) {
      setErr(String(e?.detail || e))
    } finally {
      setBusy(false)
    }
  }

  // -- Customer Search --
  useEffect(() => {
    const q = customerQ.trim()
    if (!q) {
      setCustomerHits([])
      return
    }
    const t = window.setTimeout(() => {
      apiFetch<Customer[]>(props.apiBase, `/v1/customers?q=${encodeURIComponent(q)}&limit=5`)
        .then(r => setCustomerHits(r || []))
        .catch(() => setCustomerHits([]))
    }, 300)
    return () => clearTimeout(t)
  }, [customerQ, props.apiBase])


  // -- Render Helpers --

  const decks = useMemo(() => {
    const d = new Set<number>()
    cabins.forEach(c => d.add(c.deck))
    return Array.from(d).sort((a,b) => a - b)
  }, [cabins])

  const cabinsOnDeck = useMemo(() => {
    if (!selectedDeck) return []
    return cabins.filter(c => c.deck === selectedDeck).sort((a,b) => a.cabin_no.localeCompare(b.cabin_no, undefined, { numeric: true }))
  }, [cabins, selectedDeck])

  const selectedSailing = sailings.find(s => s.id === selectedSailingId)

  // -- Views --

  if (step === 'search') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.title}>{t('sales.title')}</div>
          <div style={styles.subtitle}>{t('sales.subtitle')}</div>
        </div>

        {/* Search Bar */}
        <div style={styles.searchBar}>
          <div style={styles.searchField}>
            <label style={styles.label}>{t('sales.destination')}</label>
            <select style={styles.input} value={searchDest} onChange={e => setSearchDest(e.target.value)}>
              <option value="">{t('sales.all_destinations')}</option>
              {ports.map(p => (
                <option key={p.code} value={p.code}>{getProp(p.names, userLocale)} ({p.code})</option>
              ))}
            </select>
          </div>
          <div style={styles.searchField}>
            <label style={styles.label}>{t('sales.departing_after')}</label>
            <input type="date" style={styles.input} value={searchDateStart} onChange={e => setSearchDateStart(e.target.value)} />
          </div>
          <div style={styles.searchField}>
             <label style={styles.label}>{t('sales.departing_before')}</label>
             <input type="date" style={styles.input} value={searchDateEnd} onChange={e => setSearchDateEnd(e.target.value)} />
          </div>
          <div style={styles.searchField}>
            <label style={styles.label}>{t('sales.guests')}</label>
            <input type="number" style={styles.input} min={1} value={searchGuests} onChange={e => setSearchGuests(Number(e.target.value))} />
          </div>
        </div>

        {/* Results */}
        <div style={styles.resultsGrid}>
          {filteredSailings.map(s => {
             const embark = ports.find(p => p.code === s.embark_port_code)
             const debark = ports.find(p => p.code === s.debark_port_code)
             return (
               <div key={s.id} style={styles.sailingCard} onClick={() => selectSailing(s)}>
                 <div style={styles.cardHeader}>
                   <span style={styles.mono}>{s.code}</span>
                   <span style={styles.badge}>{s.status}</span>
                 </div>
                 <div style={styles.cardBody}>
                   <div style={styles.route}>
                     {getProp(embark?.names, userLocale) || s.embark_port_code} 
                     {' → '} 
                     {getProp(debark?.names, userLocale) || s.debark_port_code}
                   </div>
                   <div style={styles.dates}>
                     {s.start_date} — {s.end_date}
                   </div>
                   <div style={styles.ship}>Ship ID: {s.ship_id}</div>
                 </div>
                 <button style={styles.selectBtn}>{t('sales.select_sailing')}</button>
               </div>
             )
          })}
          {filteredSailings.length === 0 && (
            <div style={styles.emptyState}>{t('sales.no_sailings_found')}</div>
          )}
        </div>
      </div>
    )
  }

  // --- Common Header for Steps > Search ---
  const header = (
    <div style={styles.stepHeader}>
      <button style={styles.backBtn} onClick={() => setStep('search')}>← {t('sales.back_to_search')}</button>
      <div style={styles.stepInfo}>
        <span style={styles.mono}>{selectedSailing?.code}</span>
        <span>{selectedSailing?.start_date}</span>
      </div>
    </div>
  )

  if (step === 'selection') {
    return (
      <div style={styles.container}>
        {header}
        <div style={styles.splitView}>
           {/* Filters / Config */}
           <div style={styles.panel}>
             <div style={styles.panelTitle}>{t('sales.configure_trip')}</div>
             <div style={styles.form}>
               <div style={styles.row3}>
                 <label style={styles.label}>{t('sales.adults')} <input style={styles.input} type="number" value={adults} onChange={e => setAdults(Number(e.target.value))} /></label>
                 <label style={styles.label}>{t('sales.children')} <input style={styles.input} type="number" value={children} onChange={e => setChildren(Number(e.target.value))} /></label>
                 <label style={styles.label}>{t('sales.infants')} <input style={styles.input} type="number" value={infants} onChange={e => setInfants(Number(e.target.value))} /></label>
               </div>
               
               <div style={styles.divider} />
               
               <label style={styles.label}>{t('sales.select_deck')}</label>
               <div style={styles.deckList}>
                 {decks.map(d => (
                   <button 
                    key={d} 
                    style={selectedDeck === d ? styles.deckBtnActive : styles.deckBtn}
                    onClick={() => setSelectedDeck(d)}
                   >
                     {t('sales.deck')} {d}
                   </button>
                 ))}
               </div>
             </div>
           </div>

           {/* Cabin Map / List */}
           <div style={styles.mainPanel}>
             <div style={styles.panelTitle}>
               {selectedDeck ? `${t('sales.cabins_on_deck')} ${selectedDeck}` : t('sales.select_deck_msg')}
             </div>
             
             {selectedDeck && (
               <div style={styles.cabinGrid}>
                 {cabinsOnDeck.map(c => {
                   const isTaken = unavailableCabins.includes(c.id)
                   const isSelected = selectedCabinId === c.id
                   const cat = cabinCats.find(cat => cat.id === c.category_id)
                   const price = prices.find(p => p.cabin_category_code === cat?.code && p.price_category_code === 'regular')
                   return (
                     <button
                       key={c.id}
                       disabled={isTaken}
                       style={isSelected ? styles.cabinBtnSelected : (isTaken ? styles.cabinBtnDisabled : styles.cabinBtn)}
                       onClick={() => {
                         setSelectedCabinId(c.id)
                         if (cat) {
                           setSelectedCatCode(cat.code)
                           // simplistic mapping, ideal world we map cabin_class to cabin_type enum
                           // assuming cabin_class is compatible or we fallback
                           // Here we just keep "inside" as default or try to map
                           const typeMap: any = { 'inside': 'inside', 'ocean': 'oceanview', 'balcony': 'balcony', 'suite': 'suite' }
                           setSelectedCabinType(typeMap[cat.cabin_class.toLowerCase()] || 'inside')
                         }
                       }}
                     >
                       <div style={styles.cabinNo}>{c.cabin_no}</div>
                       <div style={styles.cabinCat}>{cat?.code || '-'}</div>
                       {price && <div style={{ fontSize: 9, opacity: 0.8 }}>{formatMoney(price.price_per_person, price.currency, userLocale)}</div>}
                     </button>
                   )
                 })}
               </div>
             )}
             
             <div style={styles.actions}>
               <button 
                 style={styles.primaryBtn} 
                 disabled={!selectedCabinId}
                 onClick={() => getQuote()}
               >
                 {t('sales.view_price_quote')}
               </button>
             </div>
           </div>
        </div>
      </div>
    )
  }

  if (step === 'quote') {
    return (
      <div style={styles.container}>
        {header}
        <div style={styles.centerCard}>
          <div style={styles.panelTitle}>{t('sales.quote_summary')}</div>
          {quote && (
            <div style={styles.quoteDetails}>
               <div style={styles.bigPrice}>{formatMoney(quote.total, quote.currency, userLocale)}</div>
               <div style={styles.breakdown}>
                 {quote.lines.map(l => (
                   <div key={l.code} style={styles.lineItem}>
                     <span>{l.description}</span>
                     <span>{formatMoney(l.amount, quote.currency, userLocale)}</span>
                   </div>
                 ))}
                 <div style={styles.lineItemBold}>
                   <span>{t('sales.taxes_fees')}</span>
                   <span>{formatMoney(quote.taxes_fees, quote.currency, userLocale)}</span>
                 </div>
               </div>
               
               <div style={styles.actionsRow}>
                 <button style={styles.secondaryBtn} onClick={() => setStep('selection')}>{t('sales.change_selection')}</button>
                 <button style={styles.primaryBtn} onClick={() => setStep('booking')}>{t('sales.proceed_to_book')}</button>
               </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (step === 'booking') {
    return (
      <div style={styles.container}>
        {header}
        <div style={styles.centerCard}>
           <div style={styles.panelTitle}>{t('sales.customer_details')}</div>
           
           <div style={styles.form}>
             <label style={styles.label}>{t('sales.search_customer')}</label>
             <input 
               style={styles.input} 
               value={customerQ} 
               onChange={e => setCustomerQ(e.target.value)} 
               placeholder="Email or Name..."
             />
             
             {customerHits.length > 0 && (
               <div style={styles.hitList}>
                 {customerHits.map(c => (
                   <div 
                     key={c.id} 
                     style={customerId === c.id ? styles.hitItemActive : styles.hitItem}
                     onClick={() => {
                       setCustomerId(c.id)
                       setCustomerQ(c.email)
                       setCustomerHits([])
                     }}
                   >
                     {c.email} ({c.first_name} {c.last_name})
                   </div>
                 ))}
               </div>
             )}
             
             {customerId && <div style={styles.successMsg}>{t('sales.customer_selected')}</div>}
             
             <button style={styles.primaryBtn} disabled={!customerId || busy} onClick={() => createHold()}>
               {busy ? t('sales.working') : t('sales.create_hold')}
             </button>
           </div>
        </div>
      </div>
    )
  }

  if (step === 'payment') {
    return (
      <div style={styles.container}>
        {header}
        <div style={styles.centerCard}>
          <div style={styles.panelTitle}>{t('sales.payment')}</div>
          <div style={styles.infoBlock}>
            {t('sales.booking_held_msg')} <br/>
            <strong>{t('sales.expires_in_15_mins')}</strong>
          </div>
          
          <div style={styles.paymentForm}>
             <div style={styles.fakeCardInput}>
               •••• •••• •••• 4242
             </div>
             <div style={styles.row2}>
               <div style={styles.fakeCardInput}>12/25</div>
               <div style={styles.fakeCardInput}>123</div>
             </div>
             
             <button style={styles.payBtn} disabled={busy} onClick={() => processPayment()}>
               {busy ? t('sales.processing') : `${t('sales.pay')} ${quote ? formatMoney(quote.total, quote.currency, userLocale) : ''}`}
             </button>
             
             {err && <div style={styles.error}>{err}</div>}
          </div>
        </div>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div style={styles.container}>
        <div style={styles.successCard}>
           <div style={styles.checkIcon}>✓</div>
           <div style={styles.bigTitle}>{t('sales.booking_confirmed')}</div>
           <div style={styles.refNum}>{t('sales.ref_num')}: {booking?.id}</div>
           
           <div style={styles.actions}>
             <button style={styles.primaryBtn} onClick={() => {
               // Reset
               setStep('search')
               setBooking(null)
               setQuote(null)
               setSelectedCabinId('')
             }}>{t('sales.new_booking')}</button>
           </div>
        </div>
      </div>
    )
  }

  return null
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 20, maxWidth: 1200, margin: '0 auto', color: 'var(--csp-text)' },
  header: { marginBottom: 30 },
  title: { fontSize: 28, fontWeight: 900 },
  subtitle: { color: 'var(--csp-muted)' },
  
  searchBar: { display: 'flex', gap: 15, background: 'var(--csp-surface-bg)', border: '1px solid var(--csp-border)', padding: 20, borderRadius: 12, marginBottom: 30, flexWrap: 'wrap' },
  searchField: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 150 },
  label: { fontSize: 12, color: 'var(--csp-muted)', fontWeight: 600 },
  input: { background: 'var(--csp-input-bg)', border: '1px solid var(--csp-input-border)', color: 'var(--csp-text)', padding: 10, borderRadius: 8 },
  
  resultsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 },
  sailingCard: { background: 'var(--csp-surface-bg)', border: '1px solid var(--csp-border)', borderRadius: 12, padding: 16, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: 10 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  badge: { fontSize: 10, background: 'var(--csp-surface-2-bg)', color: 'var(--csp-primary)', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', fontWeight: 700 },
  cardBody: { fontSize: 14, color: 'var(--csp-muted)' },
  route: { fontWeight: 600, marginBottom: 4 },
  selectBtn: { marginTop: 'auto', background: 'var(--csp-primary)', color: 'white', border: 'none', padding: 8, borderRadius: 6, fontWeight: 600, cursor: 'pointer' },
  emptyState: { gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--csp-muted)' },
  
  stepHeader: { display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20, borderBottom: '1px solid var(--csp-border)', paddingBottom: 15 },
  backBtn: { background: 'none', border: 'none', color: 'var(--csp-primary)', cursor: 'pointer', fontSize: 14 },
  stepInfo: { display: 'flex', gap: 15, fontSize: 14, color: 'var(--csp-muted)' },
  
  splitView: { display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 },
  panel: { background: 'var(--csp-surface-bg)', border: '1px solid var(--csp-border)', padding: 20, borderRadius: 12 },
  mainPanel: { background: 'var(--csp-surface-bg)', border: '1px solid var(--csp-border)', padding: 20, borderRadius: 12, minHeight: 500 },
  panelTitle: { fontSize: 16, fontWeight: 700, marginBottom: 15 },
  form: { display: 'flex', flexDirection: 'column', gap: 15 },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  divider: { height: 1, background: 'var(--csp-border)', margin: '10px 0' },
  
  deckList: { display: 'flex', flexDirection: 'column', gap: 6 },
  deckBtn: { textAlign: 'left', background: 'transparent', border: '1px solid var(--csp-border)', color: 'var(--csp-muted)', padding: 10, borderRadius: 6, cursor: 'pointer' },
  deckBtnActive: { textAlign: 'left', background: 'var(--csp-primary-soft)', border: '1px solid var(--csp-primary)', color: 'var(--csp-primary)', padding: 10, borderRadius: 6, cursor: 'pointer' },
  
  cabinGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 10 },
  cabinBtn: { aspectRatio: '1', background: 'var(--csp-surface-2-bg)', border: '1px solid var(--csp-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--csp-text)' },
  cabinBtnSelected: { aspectRatio: '1', background: 'var(--csp-primary)', border: '1px solid var(--csp-primary)', borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'white' },
  cabinBtnDisabled: { aspectRatio: '1', background: 'var(--csp-surface-2-bg)', border: '1px solid var(--csp-border)', borderRadius: 8, cursor: 'not-allowed', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--csp-muted)', opacity: 0.5 },
  cabinNo: { fontSize: 12, fontWeight: 700 },
  cabinCat: { fontSize: 10, opacity: 0.7 },
  
  actions: { marginTop: 20, display: 'flex', justifyContent: 'flex-end' },
  primaryBtn: { background: 'var(--csp-primary)', color: 'white', border: 'none', padding: '12px 20px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' },
  secondaryBtn: { background: 'var(--csp-surface-2-bg)', color: 'var(--csp-text)', border: '1px solid var(--csp-border)', padding: '12px 20px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' },
  
  centerCard: { maxWidth: 600, margin: '40px auto', background: 'var(--csp-surface-bg)', padding: 30, borderRadius: 16, border: '1px solid var(--csp-border)' },
  quoteDetails: { marginTop: 20 },
  bigPrice: { fontSize: 36, fontWeight: 900, textAlign: 'center', marginBottom: 20, color: 'var(--csp-primary)' },
  breakdown: { display: 'flex', flexDirection: 'column', gap: 8, padding: 20, background: 'var(--csp-surface-2-bg)', borderRadius: 8 },
  lineItem: { display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--csp-muted)' },
  lineItemBold: { display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, marginTop: 10, borderTop: '1px solid var(--csp-border)', paddingTop: 10 },
  actionsRow: { display: 'flex', gap: 10, marginTop: 20, justifyContent: 'center' },
  
  hitList: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, maxHeight: 150, overflowY: 'auto', background: 'var(--csp-surface-2-bg)', padding: 4, borderRadius: 6, border: '1px solid var(--csp-border)' },
  hitItem: { padding: 8, cursor: 'pointer', borderRadius: 4, fontSize: 13, color: 'var(--csp-text)' },
  hitItemActive: { padding: 8, cursor: 'pointer', borderRadius: 4, fontSize: 13, background: 'var(--csp-primary-soft)', color: 'var(--csp-primary)' },
  successMsg: { color: 'var(--csp-primary)', fontSize: 13, marginTop: 5 },
  
  infoBlock: { textAlign: 'center', color: 'var(--csp-text)', marginBottom: 20, lineHeight: 1.5 },
  paymentForm: { display: 'flex', flexDirection: 'column', gap: 15 },
  fakeCardInput: { background: 'var(--csp-input-bg)', border: '1px solid var(--csp-input-border)', padding: 12, borderRadius: 6, fontFamily: 'monospace', color: 'var(--csp-text)' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 },
  payBtn: { background: 'var(--csp-primary)', color: 'white', border: 'none', padding: '15px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 16 },
  
  successCard: { textAlign: 'center', padding: 60 },
  checkIcon: { fontSize: 60, color: 'var(--csp-primary)', marginBottom: 20 },
  bigTitle: { fontSize: 32, fontWeight: 900, marginBottom: 10 },
  refNum: { fontSize: 16, opacity: 0.7, fontFamily: 'monospace' },
  mono: { fontFamily: 'monospace' },
  error: { color: '#ff7b72', marginTop: 10, fontSize: 13, textAlign: 'center' }
}

import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../api/client'

type QuoteOut = { currency: string; subtotal: number; discounts: number; taxes_fees: number; total: number; lines: { code: string; description: string; amount: number }[] }
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

type Sailing = { id: string; code: string; ship_id: string; start_date: string; end_date: string; embark_port_code: string; debark_port_code: string; status: string }
type Customer = { id: string; email: string; first_name?: string | null; last_name?: string | null; loyalty_tier?: string | null; updated_at?: string }
type CabinCategory = { id: string; ship_id: string; code: string; name: string; view: string; cabin_class: string; max_occupancy: number; meta: any }
type Cabin = { id: string; cabin_no: string; deck: number; category_id: string | null; status: string }
type CatInvRow = { sailing_id: string; category_code: string; capacity: number; held: number; confirmed: number; available: number }
type MePrefs = { user_id: string; updated_at: string; preferences: any }

function formatMoney(cents: number, currency: string, locale: string): string {
  const amount = Number(cents || 0) / 100
  try {
    return new Intl.NumberFormat(locale || 'en', { style: 'currency', currency: currency || 'USD' }).format(amount)
  } catch {
    return `${currency || 'USD'} ${amount.toFixed(2)}`
  }
}

export function SalesPage(props: { apiBase: string }) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const [sailingId, setSailingId] = useState('')
  const [sailingDate, setSailingDate] = useState('')
  const [cabinType, setCabinType] = useState<'inside' | 'oceanview' | 'balcony' | 'suite'>('inside')
  const [cabinCategoryCode, setCabinCategoryCode] = useState('')
  const [priceType, setPriceType] = useState('regular')
  const [adult, setAdult] = useState(2)
  const [child, setChild] = useState(0)
  const [infant, setInfant] = useState(0)
  const [coupon, setCoupon] = useState('')
  const [tier, setTier] = useState('')
  const [customerId, setCustomerId] = useState('')

  const [quote, setQuote] = useState<QuoteOut | null>(null)
  const [bookingId, setBookingId] = useState('')
  const [booking, setBooking] = useState<BookingOut | null>(null)

  const [invCabinType, setInvCabinType] = useState('inside')
  const [invMode, setInvMode] = useState<'cabin_type' | 'category_code'>('cabin_type')
  const [invCategoryCode, setInvCategoryCode] = useState('')
  const [invCap, setInvCap] = useState(100)
  const [inv, setInv] = useState<any[] | null>(null)
  const [catInv, setCatInv] = useState<CatInvRow[] | null>(null)

  const [rateCabinType, setRateCabinType] = useState<'inside' | 'oceanview' | 'balcony' | 'suite'>('inside')
  const [rateMultiplier, setRateMultiplier] = useState(1.0)
  const [baseAdult, setBaseAdult] = useState(100000)
  const [baseChild, setBaseChild] = useState(60000)
  const [baseInfant, setBaseInfant] = useState(10000)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [sailings, setSailings] = useState<Sailing[]>([])
  const [sailingQ, setSailingQ] = useState('')

  const [customerQ, setCustomerQ] = useState('')
  const [customerHits, setCustomerHits] = useState<Customer[]>([])

  const [cabinCats, setCabinCats] = useState<CabinCategory[]>([])
  const [cabins, setCabins] = useState<Cabin[]>([])
  const [unavailableCabins, setUnavailableCabins] = useState<string[]>([])
  const [specificCabinId, setSpecificCabinId] = useState('')

  const [userLocale, setUserLocale] = useState('en')

  useEffect(() => {
    apiFetch<MePrefs>(props.apiBase, `/v1/staff/me/preferences`)
      .then((r) => {
        const loc = String(r?.preferences?.locale || 'en')
        setUserLocale(loc)
      })
      .catch(() => {
        /* ignore */
      })
  }, [props.apiBase])

  useEffect(() => {
    const sid = searchParams.get('sailing_id')
    const bid = searchParams.get('booking_id')
    const cid = searchParams.get('customer_id')
    if (sid && !sailingId) setSailingId(sid)
    if (bid && !bookingId) setBookingId(bid)
    if (cid && !customerId) setCustomerId(cid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    // Auto-load booking when deep-linking from Notifications.
    if (!bookingId.trim()) return
    if (!searchParams.get('booking_id')) return
    if (booking) return
    loadBooking().catch(() => {
      /* ignore */
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  useEffect(() => {
    apiFetch<Sailing[]>(props.apiBase, `/v1/sailings`, { auth: false, tenant: false })
      .then((r) => setSailings(r || []))
      .catch(() => {
        /* ignore; the module still works with manual IDs */
      })
  }, [props.apiBase])

  useEffect(() => {
    // Load cabin categories for the selected sailing's ship (for picklist).
    const s = sailings.find((x) => x.id === sailingId)
    const shipId = s?.ship_id
    if (!shipId) {
      setCabinCats([])
      return
    }
    apiFetch<CabinCategory[]>(props.apiBase, `/v1/ships/${encodeURIComponent(shipId)}/cabin-categories`)
      .then((r) => setCabinCats(r || []))
      .catch(() => setCabinCats([]))
  }, [props.apiBase, sailings, sailingId])

  useEffect(() => {
    if (!sailingId.trim()) return
    loadInventory().catch(() => {
      /* ignore */
    })
    loadCabinsAndAvailability().catch(() => {
        /* ignore */
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sailingId])

  async function loadCabinsAndAvailability() {
     if (!sailingId) return
     const s = sailings.find(x => x.id === sailingId)
     if (!s?.ship_id) return
     
     // Load all cabins for ship
     apiFetch<Cabin[]>(props.apiBase, `/v1/ships/${encodeURIComponent(s.ship_id)}/cabins`)
       .then(r => setCabins(r || []))
       .catch(() => setCabins([]))

     // Load unavailable for sailing
     apiFetch<string[]>(props.apiBase, `/v1/inventory/sailings/${encodeURIComponent(sailingId)}/unavailable-cabins`)
       .then(r => setUnavailableCabins(r || []))
       .catch(() => setUnavailableCabins([]))
  }

  useEffect(() => {
    const q = customerQ.trim()
    if (!q) {
      setCustomerHits([])
      return
    }
    const t = window.setTimeout(() => {
      const params = new URLSearchParams()
      params.set('q', q)
      params.set('limit', '10')
      apiFetch<Customer[]>(props.apiBase, `/v1/customers?${params.toString()}`)
        .then((r) => setCustomerHits(r || []))
        .catch(() => setCustomerHits([]))
    }, 250)
    return () => window.clearTimeout(t)
  }, [customerQ, props.apiBase])

  const sailingOptions = useMemo(() => {
    const needle = sailingQ.trim().toLowerCase()
    if (!needle) return sailings
    return sailings.filter((s) => `${s.code} ${s.start_date} ${s.end_date} ${s.ship_id} ${s.embark_port_code} ${s.debark_port_code}`.toLowerCase().includes(needle))
  }, [sailings, sailingQ])

  function guestsList() {
    const guests: any[] = []
    for (let i = 0; i < adult; i++) guests.push({ paxtype: 'adult' })
    for (let i = 0; i < child; i++) guests.push({ paxtype: 'child' })
    for (let i = 0; i < infant; i++) guests.push({ paxtype: 'infant' })
    return guests
  }

  async function doQuote() {
    setBusy(true)
    setErr(null)
    try {
      const r = await apiFetch<QuoteOut>(props.apiBase, `/v1/quote`, {
        method: 'POST',
        body: {
          sailing_id: sailingId || null,
          sailing_date: sailingDate || null,
          cabin_type: cabinType,
          cabin_category_code: cabinCategoryCode.trim() ? cabinCategoryCode.trim().toUpperCase() : null,
          price_type: priceType.trim().toLowerCase() || 'regular',
          guests: guestsList(),
          coupon_code: coupon || null,
          loyalty_tier: tier || null,
        },
        auth: false,
        // Quote in the portal should be tenant-aware (company-specific rates)
        tenant: true,
      })
      setQuote(r)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function placeHold() {
    setBusy(true)
    setErr(null)
    try {
      const r = await apiFetch<BookingOut>(props.apiBase, `/v1/holds`, {
        method: 'POST',
        body: {
          customer_id: customerId || null,
          sailing_id: sailingId,
          sailing_date: sailingDate ? `${sailingDate}T00:00:00Z` : null,
          cabin_type: cabinType,
          cabin_category_code: cabinCategoryCode.trim() ? cabinCategoryCode.trim().toUpperCase() : null,
          cabin_id: specificCabinId || null,
          price_type: priceType.trim().toLowerCase() || 'regular',
          guests: { adult, child, infant },
          coupon_code: coupon || null,
          loyalty_tier: tier || null,
          hold_minutes: 15,
        },
      })
      setBooking(r)
      setBookingId(r.id)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!bookingId) return
    setBusy(true)
    setErr(null)
    try {
      const r = await apiFetch<BookingOut>(props.apiBase, `/v1/bookings/${bookingId}/confirm`, { method: 'POST', body: { payment_token: 'demo' } })
      setBooking(r)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function loadBooking() {
    if (!bookingId) return
    setBusy(true)
    setErr(null)
    try {
      const r = await apiFetch<BookingOut>(props.apiBase, `/v1/bookings/${bookingId}`)
      setBooking(r)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function setInventory() {
    if (!sailingId) return
    setBusy(true)
    setErr(null)
    try {
      if (invMode === 'category_code') {
        const code = (invCategoryCode || cabinCategoryCode || '').trim().toUpperCase()
        if (!code) throw new Error('Select a cabin category code to set category inventory.')
        await apiFetch(props.apiBase, `/v1/inventory/sailings/${sailingId}/categories`, { method: 'POST', body: { category_code: code, capacity: invCap } })
        const r = await apiFetch<CatInvRow[]>(props.apiBase, `/v1/inventory/sailings/${sailingId}/categories`)
        setCatInv(r)
        setInv(null)
      } else {
        await apiFetch(props.apiBase, `/v1/inventory/sailings/${sailingId}`, { method: 'POST', body: { cabin_type: invCabinType, capacity: invCap } })
        const r = await apiFetch<any[]>(props.apiBase, `/v1/inventory/sailings/${sailingId}`)
        setInv(r)
        setCatInv(null)
      }
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function loadInventory() {
    if (!sailingId) return
    setBusy(true)
    setErr(null)
    try {
      if (invMode === 'category_code' || cabinCategoryCode.trim()) {
        const r = await apiFetch<CatInvRow[]>(props.apiBase, `/v1/inventory/sailings/${sailingId}/categories`)
        setCatInv(r)
        setInv(null)
      } else {
        const r = await apiFetch<any[]>(props.apiBase, `/v1/inventory/sailings/${sailingId}`)
        setInv(r)
        setCatInv(null)
      }
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function setCabinMultiplier() {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/pricing/overrides/cabin-multipliers`, {
        method: 'POST',
        // Company-managed pricing (tenant-scoped via X-Company-Id)
        body: { cabin_type: rateCabinType, multiplier: rateMultiplier },
      })
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function setBaseFares() {
    setBusy(true)
    setErr(null)
    try {
      // Company-managed pricing (tenant-scoped via X-Company-Id)
      await apiFetch(props.apiBase, `/v1/pricing/overrides/base-fares`, { method: 'POST', body: { paxtype: 'adult', amount: baseAdult } })
      await apiFetch(props.apiBase, `/v1/pricing/overrides/base-fares`, { method: 'POST', body: { paxtype: 'child', amount: baseChild } })
      await apiFetch(props.apiBase, `/v1/pricing/overrides/base-fares`, { method: 'POST', body: { paxtype: 'infant', amount: baseInfant } })
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.hTitle}>{t('sales.title')}</div>
      <div style={styles.hSub}>{t('sales.subtitle')}</div>

      {err ? <div style={styles.error}>{err}</div> : null}

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>{t('sales.quote_panel')}</div>
          <div style={styles.form}>
            <label style={styles.label}>
              {t('sales.sailing_label')}
              <input style={styles.input} value={sailingQ} onChange={(e) => setSailingQ(e.target.value)} placeholder={t('sales.sailing_placeholder')} />
            </label>
            <label style={styles.label}>
              {t('sales.sailing_id_label')}
              <select
                style={styles.input}
                value={sailingId}
                onChange={(e) => {
                  const v = e.target.value
                  setSailingId(v)
                  const s = sailings.find((x) => x.id === v)
                  if (s && !sailingDate) setSailingDate(s.start_date)
                }}
              >
                <option value="">{t('sales.none')}</option>
                {sailingOptions.slice(0, 150).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.start_date}→{s.end_date} · {s.embark_port_code}→{s.debark_port_code}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.label}>
              {t('sales.sailing_date_label')}
              <input style={styles.input} value={sailingDate} onChange={(e) => setSailingDate(e.target.value)} type="date" />
            </label>
            <label style={styles.label}>
              {t('sales.cabin_cat_label')}
              <select style={styles.input} value={cabinCategoryCode} onChange={(e) => setCabinCategoryCode(e.target.value)}>
                <option value="">{t('sales.none')}</option>
                {cabinCats.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.label}>
              {t('sales.price_type_label')}
              <input
                style={styles.input}
                value={priceType}
                onChange={(e) => setPriceType(e.target.value)}
                placeholder={t('sales.price_type_placeholder')}
              />
            </label>
            <label style={styles.label}>
              {t('sales.cabin_type_label')}
              <select style={styles.input} value={cabinType} onChange={(e) => setCabinType(e.target.value as any)}>
                <option value="inside">{t('sales.cabin_types.inside')}</option>
                <option value="oceanview">{t('sales.cabin_types.oceanview')}</option>
                <option value="balcony">{t('sales.cabin_types.balcony')}</option>
                <option value="suite">{t('sales.cabin_types.suite')}</option>
              </select>
            </label>
            <label style={styles.label}>
              {t('sales.specific_cabin_label')}
              <select style={styles.input} value={specificCabinId} onChange={(e) => setSpecificCabinId(e.target.value)}>
                <option value="">{t('sales.tba_random')}</option>
                {cabins
                  .filter(c => {
                     // Filter by category if selected
                     if (cabinCategoryCode) {
                       const cat = cabinCats.find(cat => cat.code === cabinCategoryCode)
                       return c.category_id === cat?.id
                     }
                     return true
                  })
                  .sort((a, b) => a.cabin_no.localeCompare(b.cabin_no, undefined, { numeric: true }))
                  .map(c => {
                    const isTaken = unavailableCabins.includes(c.id)
                    return (
                      <option key={c.id} value={c.id} disabled={isTaken}>
                        {c.cabin_no} (Deck {c.deck}) {isTaken ? `— ${t('sales.taken')}` : ''}
                      </option>
                    )
                  })}
              </select>
            </label>
            <div style={styles.row3}>
              <label style={styles.label}>
                {t('sales.adults')}
                <input style={styles.input} value={adult} onChange={(e) => setAdult(Number(e.target.value))} type="number" min={1} step={1} />
              </label>
              <label style={styles.label}>
                {t('sales.children')}
                <input style={styles.input} value={child} onChange={(e) => setChild(Number(e.target.value))} type="number" min={0} step={1} />
              </label>
              <label style={styles.label}>
                {t('sales.infants')}
                <input style={styles.input} value={infant} onChange={(e) => setInfant(Number(e.target.value))} type="number" min={0} step={1} />
              </label>
            </div>
            <div style={styles.row2}>
              <label style={styles.label}>
                {t('sales.coupon_label')}
                <input style={styles.input} value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder={t('sales.coupon_placeholder')} />
              </label>
              <label style={styles.label}>
                {t('sales.loyalty_label')}
                <input style={styles.input} value={tier} onChange={(e) => setTier(e.target.value)} placeholder={t('sales.loyalty_placeholder')} />
              </label>
            </div>
            <button style={styles.primaryBtn} disabled={busy} onClick={() => void doQuote()}>
              {busy ? t('sales.working') : t('sales.get_quote')}
            </button>

            {quote ? (
              <div style={styles.card}>
                <div style={styles.cardTitle}>
                  {t('sales.total')} {formatMoney(quote.total, quote.currency, userLocale)}
                </div>
                <div style={styles.muted}>
                  {t('sales.subtotal')} {formatMoney(quote.subtotal, quote.currency, userLocale)} · {t('sales.discounts')} {formatMoney(quote.discounts, quote.currency, userLocale)} · {t('sales.taxes')} {formatMoney(quote.taxes_fees, quote.currency, userLocale)}
                </div>
                <ul style={styles.ul}>
                  {quote.lines.map((l) => (
                    <li key={l.code} style={styles.li}>
                      <span style={styles.mono}>{l.code}</span> — {l.description} ({formatMoney(l.amount, quote.currency, userLocale)})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>{t('sales.hold_confirm_panel')}</div>
          <div style={styles.form}>
            <label style={styles.label}>
              {t('sales.sailing_id')}
              <input list="sailing-ids" style={styles.input} value={sailingId} onChange={(e) => setSailingId(e.target.value)} placeholder={t('sales.pick_list_placeholder')} />
              <datalist id="sailing-ids">
                {sailings.slice(0, 200).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} {s.start_date} {s.embark_port_code}→{s.debark_port_code}
                  </option>
                ))}
              </datalist>
            </label>
            <label style={styles.label}>
              {t('sales.customer_search_label')}
              <input style={styles.input} value={customerQ} onChange={(e) => setCustomerQ(e.target.value)} placeholder={t('sales.customer_placeholder')} />
            </label>
            {customerHits.length ? (
              <div style={styles.card}>
                <div style={styles.cardTitle}>{t('sales.matches')}</div>
                <div style={styles.muted}>{t('sales.click_to_select')}</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {customerHits.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      style={{ ...styles.secondaryBtn, textAlign: 'left' as const }}
                      disabled={busy}
                      onClick={() => {
                        setCustomerId(c.id)
                        setCustomerQ(c.email)
                      }}
                    >
                      <span style={styles.mono}>{c.email}</span> — {([c.first_name, c.last_name].filter(Boolean).join(' ') || '—')} · <span style={styles.mono}>{c.id}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <label style={styles.label}>
              {t('sales.customer_id_label')}
              <input list="customer-ids" style={styles.input} value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder={t('sales.customer_id_placeholder')} />
              <datalist id="customer-ids">
                {customerHits.slice(0, 10).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.email}
                  </option>
                ))}
              </datalist>
            </label>

            <button style={styles.primaryBtn} disabled={busy || !sailingId.trim()} onClick={() => void placeHold()}>
              {busy ? t('sales.working') : t('sales.place_hold')}
            </button>

            <div style={styles.row2}>
              <button style={styles.secondaryBtn} disabled={busy || !bookingId.trim()} onClick={() => void loadBooking()}>
                {t('sales.load_booking')}
              </button>
              <button style={styles.secondaryBtn} disabled={busy || !bookingId.trim()} onClick={() => void confirm()}>
                {t('sales.confirm_booking')}
              </button>
            </div>

            <label style={styles.label}>
              {t('sales.booking_id_label')}
              <input style={styles.input} value={bookingId} onChange={(e) => setBookingId(e.target.value)} placeholder={t('sales.booking_id_placeholder')} />
            </label>

            {booking ? (
              <div style={styles.card}>
                <div style={styles.cardTitle}>
                  {t('sales.booking')} {booking.id} · {booking.status}
                </div>
                <div style={styles.muted}>
                  {t('sales.sailing')} <span style={styles.mono}>{booking.sailing_id}</span> · {t('sales.cabin')} <span style={styles.mono}>{booking.cabin_type}</span> {booking.cabin_id ? <span> · {t('sales.room')} <span style={styles.mono}>{cabins.find(c => c.id === booking.cabin_id)?.cabin_no || booking.cabin_id}</span></span> : ` ${t('sales.tba')}`}
                </div>
                <div style={styles.muted}>{t('sales.hold_expires')} {booking.hold_expires_at || '—'}</div>
                <div style={styles.muted}>
                  {t('sales.total')} {formatMoney(booking.quote.total, booking.quote.currency, userLocale)}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>{t('sales.inventory_capacity_panel')}</div>
          <div style={styles.form}>
            <label style={styles.label}>
              {t('sales.inventory_mode')}
              <select style={styles.input} value={invMode} onChange={(e) => setInvMode(e.target.value as any)}>
                <option value="cabin_type">{t('sales.mode_cabin_type')}</option>
                <option value="category_code">{t('sales.mode_cabin_cat')}</option>
              </select>
            </label>
            <div style={styles.row2}>
              {invMode === 'category_code' ? (
                <label style={styles.label}>
                  {t('sales.category_code')}
                  <select style={styles.input} value={invCategoryCode || cabinCategoryCode} onChange={(e) => setInvCategoryCode(e.target.value)}>
                    <option value="">{t('sales.select')}</option>
                    {cabinCats.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label style={styles.label}>
                  {t('sales.cabin_type_label')}
                  <select style={styles.input} value={invCabinType} onChange={(e) => setInvCabinType(e.target.value)}>
                    <option value="inside">{t('sales.cabin_types.inside')}</option>
                    <option value="oceanview">{t('sales.cabin_types.oceanview')}</option>
                    <option value="balcony">{t('sales.cabin_types.balcony')}</option>
                    <option value="suite">{t('sales.cabin_types.suite')}</option>
                  </select>
                </label>
              )}
              <label style={styles.label}>
                {t('sales.capacity')}
                <input style={styles.input} value={invCap} onChange={(e) => setInvCap(Number(e.target.value))} type="number" min={0} step={1} />
              </label>
            </div>
            <div style={styles.row2}>
              <button style={styles.primaryBtn} disabled={busy || !sailingId.trim()} onClick={() => void setInventory()}>
                {busy ? t('sales.working') : t('sales.set_capacity')}
              </button>
              <button style={styles.secondaryBtn} disabled={busy || !sailingId.trim()} onClick={() => void loadInventory()}>
                {t('sales.refresh_inventory')}
              </button>
            </div>

            {inv ? (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>{t('sales.th_cabin_type')}</th>
                      <th style={styles.th}>{t('sales.th_capacity')}</th>
                      <th style={styles.th}>{t('sales.th_held')}</th>
                      <th style={styles.th}>{t('sales.th_confirmed')}</th>
                      <th style={styles.th}>{t('sales.th_available')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.map((r) => (
                      <tr key={r.cabin_type}>
                        <td style={styles.tdMono}>{r.cabin_type}</td>
                        <td style={styles.tdMono}>{r.capacity}</td>
                        <td style={styles.tdMono}>{r.held}</td>
                        <td style={styles.tdMono}>{r.confirmed}</td>
                        <td style={styles.tdMono}>{r.available}</td>
                      </tr>
                    ))}
                    {inv.length === 0 ? (
                      <tr>
                        <td style={styles.tdMuted} colSpan={5}>
                          {t('sales.no_inv_rows')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}

            {catInv ? (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>{t('sales.th_category')}</th>
                      <th style={styles.th}>{t('sales.th_capacity')}</th>
                      <th style={styles.th}>{t('sales.th_held')}</th>
                      <th style={styles.th}>{t('sales.th_confirmed')}</th>
                      <th style={styles.th}>{t('sales.th_available')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catInv.map((r) => (
                      <tr key={r.category_code}>
                        <td style={styles.tdMono}>{r.category_code}</td>
                        <td style={styles.tdMono}>{r.capacity}</td>
                        <td style={styles.tdMono}>{r.held}</td>
                        <td style={styles.tdMono}>{r.confirmed}</td>
                        <td style={styles.tdMono}>{r.available}</td>
                      </tr>
                    ))}
                    {catInv.length === 0 ? (
                      <tr>
                        <td style={styles.tdMuted} colSpan={5}>
                          {t('sales.no_cat_inv_rows')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>{t('sales.rates_panel')}</div>
          <div style={styles.muted}>{t('sales.rates_note')}</div>
          <div style={styles.form}>
            <label style={styles.label}>
              {t('sales.cabin_type_label')}
              <select style={styles.input} value={rateCabinType} onChange={(e) => setRateCabinType(e.target.value as any)}>
                <option value="inside">{t('sales.cabin_types.inside')}</option>
                <option value="oceanview">{t('sales.cabin_types.oceanview')}</option>
                <option value="balcony">{t('sales.cabin_types.balcony')}</option>
                <option value="suite">{t('sales.cabin_types.suite')}</option>
              </select>
            </label>
            <label style={styles.label}>
              {t('sales.cabin_multiplier')}
              <input style={styles.input} value={rateMultiplier} onChange={(e) => setRateMultiplier(Number(e.target.value))} type="number" step="0.05" min="0.1" />
            </label>
            <button style={styles.primaryBtn} disabled={busy} onClick={() => void setCabinMultiplier()}>
              {busy ? t('sales.working') : t('sales.set_multiplier')}
            </button>

            <div style={styles.row3}>
              <label style={styles.label}>
                {t('sales.base_adult')}
                <input style={styles.input} value={baseAdult} onChange={(e) => setBaseAdult(Number(e.target.value))} type="number" min={0} step={1000} />
              </label>
              <label style={styles.label}>
                {t('sales.base_child')}
                <input style={styles.input} value={baseChild} onChange={(e) => setBaseChild(Number(e.target.value))} type="number" min={0} step={1000} />
              </label>
              <label style={styles.label}>
                {t('sales.base_infant')}
                <input style={styles.input} value={baseInfant} onChange={(e) => setBaseInfant(Number(e.target.value))} type="number" min={0} step={1000} />
              </label>
            </div>
            <button style={styles.primaryBtn} disabled={busy} onClick={() => void setBaseFares()}>
              {busy ? t('sales.working') : t('sales.set_base_fares')}
            </button>
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
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
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
  secondaryBtn: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--csp-border-strong, rgba(255,255,255,0.12))',
    background: 'color-mix(in srgb, var(--csp-surface-bg, rgba(255,255,255,0.06)) 88%, transparent)',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 900,
  },
  error: {
    padding: 12,
    borderRadius: 12,
    background: 'rgba(220, 38, 38, 0.10)',
    border: '1px solid rgba(220, 38, 38, 0.35)',
    color: 'rgb(185, 28, 28)',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
  card: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    background: 'var(--csp-surface-2-bg, rgba(0,0,0,0.22))',
    color: 'var(--csp-text, #e6edf3)',
  },
  cardTitle: { fontWeight: 900, marginBottom: 6 },
  muted: { color: 'var(--csp-muted, rgba(230,237,243,0.65))', fontSize: 12, lineHeight: 1.5 },
  ul: { margin: '8px 0 0 0', paddingLeft: 18, color: 'var(--csp-text, rgba(230,237,243,0.85))', fontSize: 12, lineHeight: 1.55 },
  li: { marginBottom: 4 },
  mono: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12 },
  tableWrap: { overflow: 'auto', marginTop: 10 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    color: 'var(--csp-muted, rgba(230,237,243,0.75))',
    fontWeight: 900,
  },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.06))',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
  },
  tdMuted: { padding: '14px 8px', color: 'var(--csp-muted, rgba(230,237,243,0.60))' },
}

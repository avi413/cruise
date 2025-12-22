import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../api/client'
import { getCompany } from '../components/storage'
import { fetchCompanySettings } from '../components/theme'
import { Button, ErrorBanner, Input, Mono, PageHeader, Panel, Select, TwoCol, Tabs } from '../components/ui'

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

type Capability = {
  id: string
  ship_id: string
  code: string
  name: string
  category?: string | null
  description?: string | null
  meta: any
}

type Restaurant = {
  id: string
  ship_id: string
  code: string
  name: string
  cuisine?: string | null
  deck: number
  included: boolean
  reservation_required: boolean
  description?: string | null
  capability_codes: string[]
  meta: any
}

type Shorex = {
  id: string
  ship_id: string
  code: string
  title: string
  port_code: string
  duration_minutes: number
  active: boolean
  description?: string | null
  capability_codes: string[]
  meta: any
}

type ShorexPrice = { id: string; shorex_id: string; currency: string; paxtype: string; price_cents: number }

type Port = { code: string; names: Record<string, string>; cities: Record<string, string>; countries: Record<string, string> }

function displayPort(p: Port): string {
  const en = p.names?.en || Object.values(p.names || {})[0] || ''
  const city = p.cities?.en || Object.values(p.cities || {})[0] || ''
  const country = p.countries?.en || Object.values(p.countries || {})[0] || ''
  return `${p.code} · ${en}${city ? ` · ${city}` : ''}${country ? `, ${country}` : ''}`
}

function parseCodes(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function OnboardPage(props: { apiBase: string }) {
  const { t } = useTranslation()
  const company = getCompany()
  const companyId = company?.id || ''

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  type TabKey = 'capabilities' | 'restaurants' | 'shorex' | 'pricing'
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'capabilities'
    const v = window.sessionStorage.getItem('onboard.tab')
    if (v === 'capabilities' || v === 'restaurants' || v === 'shorex' || v === 'pricing') return v
    return 'capabilities'
  })

  const [fleet, setFleet] = useState<Ship[]>([])
  const [shipId, setShipId] = useState<string>('')

  const [supportedCurrencies, setSupportedCurrencies] = useState<string[]>(['USD'])

  const [ports, setPorts] = useState<Port[]>([])

  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [shorex, setShorex] = useState<Shorex[]>([])

  // create capability
  const [capCode, setCapCode] = useState('')
  const [capName, setCapName] = useState('')
  const [capCategory, setCapCategory] = useState('')
  const [capDesc, setCapDesc] = useState('')

  // create restaurant
  const [resCode, setResCode] = useState('')
  const [resName, setResName] = useState('')
  const [resCuisine, setResCuisine] = useState('')
  const [resDeck, setResDeck] = useState(0)
  const [resIncluded, setResIncluded] = useState(true)
  const [resReservation, setResReservation] = useState(false)
  const [resCaps, setResCaps] = useState('')

  // create shorex
  const [sxCode, setSxCode] = useState('')
  const [sxTitle, setSxTitle] = useState('')
  const [sxPort, setSxPort] = useState('')
  const [sxDuration, setSxDuration] = useState(180)
  const [sxCaps, setSxCaps] = useState('')
  const [sxPriceCurrency, setSxPriceCurrency] = useState('USD')
  const [sxPricePax, setSxPricePax] = useState('adult')
  const [sxPriceCents, setSxPriceCents] = useState(0)

  // manage shorex prices
  const [priceShorexId, setPriceShorexId] = useState('')
  const [prices, setPrices] = useState<ShorexPrice[]>([])
  const [priceCurrency, setPriceCurrency] = useState('USD')
  const [pricePax, setPricePax] = useState('adult')
  const [priceCents, setPriceCents] = useState(0)

  const fleetEndpoint = useMemo(() => (companyId ? `/v1/companies/${companyId}/ships` : null), [companyId])
  const capEndpoint = useMemo(() => (shipId ? `/v1/ships/${shipId}/capabilities` : null), [shipId])
  const resEndpoint = useMemo(() => (shipId ? `/v1/ships/${shipId}/restaurants` : null), [shipId])
  const sxEndpoint = useMemo(() => (shipId ? `/v1/ships/${shipId}/shorex` : null), [shipId])

  async function refreshFleet() {
    if (!fleetEndpoint) return
    const r = await apiFetch<Ship[]>(props.apiBase, fleetEndpoint)
    setFleet(r || [])
    setShipId((prev) => {
      if (prev && (r || []).some((s) => s.id === prev)) return prev
      return r?.[0]?.id || ''
    })
  }

  async function refreshPorts() {
    const r = await apiFetch<Port[]>(props.apiBase, `/v1/ports`, { auth: false, tenant: false })
    const list = (r || []).slice().sort((a, b) => a.code.localeCompare(b.code))
    setPorts(list)
    setSxPort((prev) => prev || list[0]?.code || '')
  }

  async function refreshCompanySettings() {
    if (!companyId) return
    try {
      const s = await fetchCompanySettings(props.apiBase, companyId)
      const cur = String(s?.localization?.default_currency || 'USD')
        .trim()
        .toUpperCase() || 'USD'
      const supp = (s?.localization?.supported_currencies || [])
        .map((c) => String(c || '').trim().toUpperCase())
        .filter(Boolean)
      const list = supp.length ? Array.from(new Set(supp)) : [cur]
      setSupportedCurrencies(list)
      // Update initial currency defaults; avoid clobbering explicit user edits.
      setSxPriceCurrency((prev) => (prev === 'USD' ? cur : prev))
      setPriceCurrency((prev) => (prev === 'USD' ? cur : prev))
    } catch {
      setSupportedCurrencies(['USD'])
    }
  }

  async function refreshAll() {
    await Promise.all([refreshFleet(), refreshPorts()])
  }

  async function refreshShipData() {
    if (!capEndpoint || !resEndpoint || !sxEndpoint) {
      setCapabilities([])
      setRestaurants([])
      setShorex([])
      return
    }
    const [c, r, s] = await Promise.all([
      apiFetch<Capability[]>(props.apiBase, capEndpoint),
      apiFetch<Restaurant[]>(props.apiBase, resEndpoint),
      apiFetch<Shorex[]>(props.apiBase, sxEndpoint),
    ])
    setCapabilities(c || [])
    setRestaurants(r || [])
    setShorex(s || [])
  }

  useEffect(() => {
    Promise.all([refreshCompanySettings(), refreshAll()]).catch((e: any) => setErr(String(e?.detail || e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      window.sessionStorage.setItem('onboard.tab', tab)
    } catch {
      // ignore storage failures (e.g. private mode)
    }
  }, [tab])

  useEffect(() => {
    refreshShipData().catch((e: any) => setErr(String(e?.detail || e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capEndpoint, resEndpoint, sxEndpoint])

  useEffect(() => {
    if (!priceShorexId) {
      setPrices([])
      return
    }
    apiFetch<ShorexPrice[]>(props.apiBase, `/v1/shorex/${priceShorexId}/prices`)
      .then((r) => setPrices(r || []))
      .catch(() => setPrices([]))
  }, [props.apiBase, priceShorexId])

  async function createCapability() {
    if (!shipId) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/ships/${shipId}/capabilities`, {
        method: 'POST',
        body: { code: capCode, name: capName, category: capCategory || null, description: capDesc || null, meta: {} },
      })
      setCapCode('')
      setCapName('')
      setCapCategory('')
      setCapDesc('')
      await refreshShipData()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteCapability(id: string) {
    if (!confirm(t('onboard.capabilities.confirm_delete'))) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/capabilities/${encodeURIComponent(id)}`, { method: 'DELETE' })
      await refreshShipData()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function createRestaurant() {
    if (!shipId) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/ships/${shipId}/restaurants`, {
        method: 'POST',
        body: {
          code: resCode,
          name: resName,
          cuisine: resCuisine || null,
          deck: resDeck,
          included: resIncluded,
          reservation_required: resReservation,
          description: null,
          capability_codes: parseCodes(resCaps),
          meta: {},
        },
      })
      setResCode('')
      setResName('')
      setResCuisine('')
      setResDeck(0)
      setResIncluded(true)
      setResReservation(false)
      setResCaps('')
      await refreshShipData()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteRestaurant(id: string) {
    if (!confirm(t('onboard.restaurants.confirm_delete'))) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/restaurants/${encodeURIComponent(id)}`, { method: 'DELETE' })
      await refreshShipData()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function createShorex() {
    if (!shipId) return
    setBusy(true)
    setErr(null)
    try {
      const created = await apiFetch<Shorex>(props.apiBase, `/v1/ships/${shipId}/shorex`, {
        method: 'POST',
        body: {
          code: sxCode,
          title: sxTitle,
          port_code: sxPort,
          duration_minutes: sxDuration,
          active: true,
          description: null,
          capability_codes: parseCodes(sxCaps),
          meta: {},
        },
      })
      if (sxPriceCents > 0) {
        await apiFetch(props.apiBase, `/v1/shorex/${created.id}/prices`, {
          method: 'POST',
          body: { currency: sxPriceCurrency, paxtype: sxPricePax, price_cents: sxPriceCents },
        })
      }
      setSxCode('')
      setSxTitle('')
      setSxDuration(180)
      setSxCaps('')
      setSxPriceCents(0)
      await refreshShipData()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function toggleShorexActive(x: Shorex) {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/shorex/${encodeURIComponent(x.id)}`, { method: 'PATCH', body: { active: !x.active } })
      await refreshShipData()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteShorex(id: string) {
    if (!confirm(t('onboard.shorex.confirm_delete'))) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/shorex/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (priceShorexId === id) setPriceShorexId('')
      await refreshShipData()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function upsertPrice() {
    if (!priceShorexId) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/shorex/${encodeURIComponent(priceShorexId)}/prices`, {
        method: 'POST',
        body: { currency: priceCurrency, paxtype: pricePax, price_cents: priceCents },
      })
      const r = await apiFetch<ShorexPrice[]>(props.apiBase, `/v1/shorex/${priceShorexId}/prices`)
      setPrices(r || [])
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function deletePrice(id: string) {
    if (!confirm(t('onboard.pricing.confirm_delete'))) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/shorex-prices/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const r = await apiFetch<ShorexPrice[]>(props.apiBase, `/v1/shorex/${priceShorexId}/prices`)
      setPrices(r || [])
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  if (!companyId) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <PageHeader title={t('onboard.title')} subtitle={t('onboard.subtitle')} />
        <ErrorBanner message={t('onboard.no_company')} />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title={t('onboard.title')}
        subtitle={t('onboard.subtitle')}
        right={
          <Button variant="secondary" disabled={busy} onClick={() => void refreshAll().then(refreshShipData)}>
            {t('cruises.refresh')}
          </Button>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      <Panel title={t('onboard.select_ship_title')} subtitle={company ? `${company.name} (${company.code})` : companyId}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
          <Select value={shipId} onChange={(e) => setShipId(e.target.value)}>
            {fleet.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
            {fleet.length === 0 ? <option value="">(no ships yet)</option> : null}
          </Select>
          <div style={{ color: 'rgba(230,237,243,0.65)', fontSize: 12 }}>
            {t('onboard.ship_id')}: <Mono>{shipId || '—'}</Mono>
          </div>
        </div>
      </Panel>

      <Tabs
        idBase="onboard"
        value={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: 'capabilities', label: t('onboard.tabs.capabilities'), badge: capabilities.length },
          { key: 'restaurants', label: t('onboard.tabs.restaurants'), badge: restaurants.length },
          { key: 'shorex', label: t('onboard.tabs.shorex'), badge: shorex.length },
          { key: 'pricing', label: t('onboard.tabs.pricing') },
        ]}
      />

      {tab === 'capabilities' ? (
        <div id="onboard-panel-capabilities" role="tabpanel" aria-labelledby="onboard-tab-capabilities">
          <Panel title={t('onboard.capabilities.title')} subtitle={t('onboard.capabilities.subtitle')}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input label={t('onboard.capabilities.label_code')} value={capCode} onChange={(e) => setCapCode(e.target.value)} placeholder="wheelchair_accessible" />
                <Input label={t('onboard.capabilities.label_name')} value={capName} onChange={(e) => setCapName(e.target.value)} placeholder="Wheelchair accessible" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input label={t('onboard.capabilities.label_category')} value={capCategory} onChange={(e) => setCapCategory(e.target.value)} placeholder="accessibility" />
                <Input label={t('onboard.capabilities.label_desc')} value={capDesc} onChange={(e) => setCapDesc(e.target.value)} placeholder="Step-free access, ramps…" />
              </div>
              <Button variant="primary" disabled={busy || !shipId || !capCode.trim() || !capName.trim()} onClick={() => void createCapability()}>
                {busy ? t('onboard.capabilities.btn_saving') : t('onboard.capabilities.btn_add')}
              </Button>
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={th}>{t('onboard.capabilities.th_code')}</th>
                      <th style={th}>{t('onboard.capabilities.th_name')}</th>
                      <th style={th}>{t('onboard.capabilities.th_category')}</th>
                      <th style={th}>{t('onboard.capabilities.th_actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capabilities.map((c) => (
                      <tr key={c.id}>
                        <td style={tdMono}>{c.code}</td>
                        <td style={td}>{c.name}</td>
                        <td style={td}>{c.category || '—'}</td>
                        <td style={td}>
                          <Button variant="danger" disabled={busy} onClick={() => void deleteCapability(c.id)}>
                            {t('onboard.capabilities.btn_delete')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {capabilities.length === 0 ? (
                      <tr>
                        <td style={tdMuted} colSpan={4}>
                          {t('onboard.capabilities.empty')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === 'restaurants' ? (
        <div id="onboard-panel-restaurants" role="tabpanel" aria-labelledby="onboard-tab-restaurants">
          <Panel title={t('onboard.restaurants.title')} subtitle={t('onboard.restaurants.subtitle')}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input label={t('onboard.restaurants.label_code')} value={resCode} onChange={(e) => setResCode(e.target.value)} placeholder="main_dining" />
                <Input label={t('onboard.restaurants.label_name')} value={resName} onChange={(e) => setResName(e.target.value)} placeholder="Main Dining Room" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Input label={t('onboard.restaurants.label_cuisine')} value={resCuisine} onChange={(e) => setResCuisine(e.target.value)} placeholder="International" />
                <Input label={t('onboard.restaurants.label_deck')} value={resDeck} onChange={(e) => setResDeck(Number(e.target.value))} type="number" min={0} step={1} />
                <Input
                  label={t('onboard.restaurants.label_caps')}
                  value={resCaps}
                  onChange={(e) => setResCaps(e.target.value)}
                  placeholder="vegan_options, halal_options"
                  hint={capabilities.length ? `Available: ${capabilities.map((c) => c.code).slice(0, 6).join(', ')}${capabilities.length > 6 ? ', …' : ''}` : undefined}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Select label={t('onboard.restaurants.label_included')} value={resIncluded ? 'yes' : 'no'} onChange={(e) => setResIncluded(e.target.value === 'yes')}>
                  <option value="yes">{t('onboard.restaurants.option_included')}</option>
                  <option value="no">{t('onboard.restaurants.option_extra')}</option>
                </Select>
                <Select label={t('onboard.restaurants.label_reservation')} value={resReservation ? 'yes' : 'no'} onChange={(e) => setResReservation(e.target.value === 'yes')}>
                  <option value="no">{t('onboard.restaurants.option_no')}</option>
                  <option value="yes">{t('onboard.restaurants.option_yes')}</option>
                </Select>
              </div>
              <Button variant="primary" disabled={busy || !shipId || !resCode.trim() || !resName.trim()} onClick={() => void createRestaurant()}>
                {busy ? t('onboard.restaurants.btn_saving') : t('onboard.restaurants.btn_add')}
              </Button>

              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={th}>{t('onboard.restaurants.th_code')}</th>
                      <th style={th}>{t('onboard.restaurants.th_name')}</th>
                      <th style={th}>{t('onboard.restaurants.th_deck')}</th>
                      <th style={th}>{t('onboard.restaurants.th_included')}</th>
                      <th style={th}>{t('onboard.restaurants.th_caps')}</th>
                      <th style={th}>{t('onboard.restaurants.th_actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restaurants.map((r) => (
                      <tr key={r.id}>
                        <td style={tdMono}>{r.code}</td>
                        <td style={td}>{r.name}</td>
                        <td style={tdMono}>{r.deck}</td>
                        <td style={td}>{r.included ? 'Yes' : 'No'}</td>
                        <td style={td}>{(r.capability_codes || []).join(', ') || '—'}</td>
                        <td style={td}>
                          <Button variant="danger" disabled={busy} onClick={() => void deleteRestaurant(r.id)}>
                            {t('onboard.restaurants.btn_delete')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {restaurants.length === 0 ? (
                      <tr>
                        <td style={tdMuted} colSpan={6}>
                          {t('onboard.restaurants.empty')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === 'shorex' ? (
        <div id="onboard-panel-shorex" role="tabpanel" aria-labelledby="onboard-tab-shorex">
          <Panel title={t('onboard.shorex.title')} subtitle={t('onboard.shorex.subtitle')}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input label={t('onboard.shorex.label_code')} value={sxCode} onChange={(e) => setSxCode(e.target.value)} placeholder="snorkel_half_day" />
                <Input label={t('onboard.shorex.label_title')} value={sxTitle} onChange={(e) => setSxTitle(e.target.value)} placeholder="Half-day snorkeling" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Select label={t('onboard.shorex.label_port')} value={sxPort} onChange={(e) => setSxPort(e.target.value)}>
                  {ports.map((p) => (
                    <option key={p.code} value={p.code}>
                      {displayPort(p)}
                    </option>
                  ))}
                  {ports.length === 0 ? <option value="">(no ports yet)</option> : null}
                </Select>
                <Input label={t('onboard.shorex.label_duration')} value={sxDuration} onChange={(e) => setSxDuration(Number(e.target.value))} type="number" min={0} step={15} />
                <Input label={t('onboard.shorex.label_caps')} value={sxCaps} onChange={(e) => setSxCaps(e.target.value)} placeholder="kids_friendly, wheelchair_accessible" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 140px 1fr', gap: 10 }}>
                <Select label={t('onboard.shorex.label_currency')} value={sxPriceCurrency} onChange={(e) => setSxPriceCurrency(e.target.value)}>
                  {supportedCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <Select label={t('onboard.shorex.label_paxtype')} value={sxPricePax} onChange={(e) => setSxPricePax(e.target.value)}>
                  <option value="adult">{t('onboard.shorex.option_adult')}</option>
                  <option value="child">{t('onboard.shorex.option_child')}</option>
                  <option value="infant">{t('onboard.shorex.option_infant')}</option>
                </Select>
                <Input
                  label={t('onboard.shorex.label_starting_price')}
                  value={sxPriceCents}
                  onChange={(e) => setSxPriceCents(Number(e.target.value))}
                  type="number"
                  min={0}
                  step={100}
                />
              </div>
              <Button variant="primary" disabled={busy || !shipId || !sxCode.trim() || !sxTitle.trim() || !sxPort.trim()} onClick={() => void createShorex()}>
                {busy ? t('onboard.shorex.btn_saving') : t('onboard.shorex.btn_add')}
              </Button>

              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={th}>{t('onboard.shorex.th_port')}</th>
                      <th style={th}>{t('onboard.shorex.th_code')}</th>
                      <th style={th}>{t('onboard.shorex.th_title')}</th>
                      <th style={th}>{t('onboard.shorex.th_dur')}</th>
                      <th style={th}>{t('onboard.shorex.th_active')}</th>
                      <th style={th}>{t('onboard.shorex.th_actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shorex.map((x) => (
                      <tr key={x.id}>
                        <td style={tdMono}>{x.port_code}</td>
                        <td style={tdMono}>{x.code}</td>
                        <td style={td}>{x.title}</td>
                        <td style={tdMono}>{x.duration_minutes}m</td>
                        <td style={td}>{x.active ? 'Yes' : 'No'}</td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Button variant="secondary" disabled={busy} onClick={() => void toggleShorexActive(x)}>
                              {t('onboard.shorex.btn_toggle')}
                            </Button>
                            <Button variant="danger" disabled={busy} onClick={() => void deleteShorex(x.id)}>
                              {t('onboard.shorex.btn_delete')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {shorex.length === 0 ? (
                      <tr>
                        <td style={tdMuted} colSpan={6}>
                          {t('onboard.shorex.empty')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === 'pricing' ? (
        <div id="onboard-panel-pricing" role="tabpanel" aria-labelledby="onboard-tab-pricing">
          <Panel title={t('onboard.pricing.title')} subtitle={t('onboard.pricing.subtitle')}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Select label={t('onboard.pricing.label_excursion')} value={priceShorexId} onChange={(e) => setPriceShorexId(e.target.value)}>
                <option value="">(select)</option>
                {shorex.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.port_code} · {x.title} ({x.duration_minutes}m)
                  </option>
                ))}
              </Select>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 140px 1fr auto', gap: 10, alignItems: 'end' }}>
                <Select label={t('onboard.pricing.label_currency')} value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value)} disabled={!priceShorexId}>
                  {supportedCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <Select label={t('onboard.pricing.label_paxtype')} value={pricePax} onChange={(e) => setPricePax(e.target.value)} disabled={!priceShorexId}>
                  <option value="adult">{t('onboard.shorex.option_adult')}</option>
                  <option value="child">{t('onboard.shorex.option_child')}</option>
                  <option value="infant">{t('onboard.shorex.option_infant')}</option>
                </Select>
                <Input
                  label={t('onboard.pricing.label_price')}
                  value={priceCents}
                  onChange={(e) => setPriceCents(Number(e.target.value))}
                  type="number"
                  min={0}
                  step={100}
                  disabled={!priceShorexId}
                />
                <Button variant="primary" disabled={busy || !priceShorexId} onClick={() => void upsertPrice()}>
                  {busy ? t('onboard.pricing.btn_saving') : t('onboard.pricing.btn_upsert')}
                </Button>
              </div>

              {priceShorexId ? (
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={th}>{t('onboard.pricing.th_currency')}</th>
                        <th style={th}>{t('onboard.pricing.th_paxtype')}</th>
                        <th style={th}>{t('onboard.pricing.th_price')}</th>
                        <th style={th}>{t('onboard.pricing.th_actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prices.map((p) => (
                        <tr key={p.id}>
                          <td style={tdMono}>{p.currency}</td>
                          <td style={tdMono}>{p.paxtype}</td>
                          <td style={tdMono}>{p.price_cents}</td>
                          <td style={td}>
                            <Button variant="danger" disabled={busy} onClick={() => void deletePrice(p.id)}>
                              {t('onboard.pricing.btn_delete')}
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {prices.length === 0 ? (
                        <tr>
                          <td style={tdMuted} colSpan={4}>
                            {t('onboard.pricing.empty')}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 8px',
  borderBottom: '1px solid rgba(255,255,255,0.10)',
  color: 'rgba(230,237,243,0.75)',
  fontWeight: 900,
}
const td: React.CSSProperties = { padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }
const tdMono: React.CSSProperties = {
  padding: '10px 8px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
}
const tdMuted: React.CSSProperties = { padding: '14px 8px', color: 'rgba(230,237,243,0.60)' }


import React, { useEffect, useMemo, useState } from 'react'
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
      if (prev && (r.items || []).some((s) => s.id === prev)) return prev
      return r.items?.[0]?.id || ''
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
    if (!confirm('Delete this capability?')) return
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
    if (!confirm('Delete this restaurant?')) return
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
    if (!confirm('Delete this shore excursion (and its prices)?')) return
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
    if (!confirm('Delete this price row?')) return
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
        <PageHeader title="Onboard & ShoreX" subtitle="Manage ship restaurants, onboard capabilities, and shore excursions." />
        <ErrorBanner message="No company selected. Please select a company and sign in again." />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title="Onboard & ShoreX"
        subtitle="Manage ship restaurants, onboard capabilities, and shore excursions (port + duration + pricing)."
        right={
          <Button variant="secondary" disabled={busy} onClick={() => void refreshAll().then(refreshShipData)}>
            Refresh
          </Button>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      <Panel title="Select ship" subtitle={company ? `${company.name} (${company.code})` : companyId}>
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
            Ship id: <Mono>{shipId || '—'}</Mono>
          </div>
        </div>
      </Panel>

      <Tabs
        idBase="onboard"
        value={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: 'capabilities', label: 'Capabilities', badge: capabilities.length },
          { key: 'restaurants', label: 'Restaurants', badge: restaurants.length },
          { key: 'shorex', label: 'ShoreX', badge: shorex.length },
          { key: 'pricing', label: 'Pricing' },
        ]}
      />

      {tab === 'capabilities' ? (
        <div id="onboard-panel-capabilities" role="tabpanel" aria-labelledby="onboard-tab-capabilities">
          <Panel title="Onboard capabilities" subtitle="Examples: wheelchair_accessible, halal_options, kids_friendly, vegan_options.">
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input label="Code" value={capCode} onChange={(e) => setCapCode(e.target.value)} placeholder="wheelchair_accessible" />
                <Input label="Name" value={capName} onChange={(e) => setCapName(e.target.value)} placeholder="Wheelchair accessible" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input label="Category (optional)" value={capCategory} onChange={(e) => setCapCategory(e.target.value)} placeholder="accessibility" />
                <Input label="Description (optional)" value={capDesc} onChange={(e) => setCapDesc(e.target.value)} placeholder="Step-free access, ramps…" />
              </div>
              <Button variant="primary" disabled={busy || !shipId || !capCode.trim() || !capName.trim()} onClick={() => void createCapability()}>
                {busy ? 'Saving…' : 'Add capability'}
              </Button>
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={th}>Code</th>
                      <th style={th}>Name</th>
                      <th style={th}>Category</th>
                      <th style={th}>Actions</th>
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
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {capabilities.length === 0 ? (
                      <tr>
                        <td style={tdMuted} colSpan={4}>
                          No capabilities yet.
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
          <Panel title="Restaurants" subtitle="Create dining venues and optionally tag them with capability codes.">
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input label="Code" value={resCode} onChange={(e) => setResCode(e.target.value)} placeholder="main_dining" />
                <Input label="Name" value={resName} onChange={(e) => setResName(e.target.value)} placeholder="Main Dining Room" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Input label="Cuisine (optional)" value={resCuisine} onChange={(e) => setResCuisine(e.target.value)} placeholder="International" />
                <Input label="Deck" value={resDeck} onChange={(e) => setResDeck(Number(e.target.value))} type="number" min={0} step={1} />
                <Input
                  label="Capability codes (comma-separated)"
                  value={resCaps}
                  onChange={(e) => setResCaps(e.target.value)}
                  placeholder="vegan_options, halal_options"
                  hint={capabilities.length ? `Available: ${capabilities.map((c) => c.code).slice(0, 6).join(', ')}${capabilities.length > 6 ? ', …' : ''}` : undefined}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Select label="Included?" value={resIncluded ? 'yes' : 'no'} onChange={(e) => setResIncluded(e.target.value === 'yes')}>
                  <option value="yes">Included</option>
                  <option value="no">Extra charge</option>
                </Select>
                <Select label="Reservation required?" value={resReservation ? 'yes' : 'no'} onChange={(e) => setResReservation(e.target.value === 'yes')}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </Select>
              </div>
              <Button variant="primary" disabled={busy || !shipId || !resCode.trim() || !resName.trim()} onClick={() => void createRestaurant()}>
                {busy ? 'Saving…' : 'Add restaurant'}
              </Button>

              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={th}>Code</th>
                      <th style={th}>Name</th>
                      <th style={th}>Deck</th>
                      <th style={th}>Included</th>
                      <th style={th}>Caps</th>
                      <th style={th}>Actions</th>
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
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {restaurants.length === 0 ? (
                      <tr>
                        <td style={tdMuted} colSpan={6}>
                          No restaurants yet.
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
          <Panel title="Shore excursions (ShoreX)" subtitle="Port + duration + capability tags. Add a starting price on create (optional).">
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input label="Code" value={sxCode} onChange={(e) => setSxCode(e.target.value)} placeholder="snorkel_half_day" />
                <Input label="Title" value={sxTitle} onChange={(e) => setSxTitle(e.target.value)} placeholder="Half-day snorkeling" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Select label="Port" value={sxPort} onChange={(e) => setSxPort(e.target.value)}>
                  {ports.map((p) => (
                    <option key={p.code} value={p.code}>
                      {displayPort(p)}
                    </option>
                  ))}
                  {ports.length === 0 ? <option value="">(no ports yet)</option> : null}
                </Select>
                <Input label="Duration (minutes)" value={sxDuration} onChange={(e) => setSxDuration(Number(e.target.value))} type="number" min={0} step={15} />
                <Input label="Capability codes" value={sxCaps} onChange={(e) => setSxCaps(e.target.value)} placeholder="kids_friendly, wheelchair_accessible" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 140px 1fr', gap: 10 }}>
                <Select label="Price currency" value={sxPriceCurrency} onChange={(e) => setSxPriceCurrency(e.target.value)}>
                  {supportedCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <Select label="Paxtype" value={sxPricePax} onChange={(e) => setSxPricePax(e.target.value)}>
                  <option value="adult">adult</option>
                  <option value="child">child</option>
                  <option value="infant">infant</option>
                </Select>
                <Input
                  label="Starting price (cents, optional)"
                  value={sxPriceCents}
                  onChange={(e) => setSxPriceCents(Number(e.target.value))}
                  type="number"
                  min={0}
                  step={100}
                />
              </div>
              <Button variant="primary" disabled={busy || !shipId || !sxCode.trim() || !sxTitle.trim() || !sxPort.trim()} onClick={() => void createShorex()}>
                {busy ? 'Saving…' : 'Add shore excursion'}
              </Button>

              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={th}>Port</th>
                      <th style={th}>Code</th>
                      <th style={th}>Title</th>
                      <th style={th}>Dur</th>
                      <th style={th}>Active</th>
                      <th style={th}>Actions</th>
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
                              Toggle
                            </Button>
                            <Button variant="danger" disabled={busy} onClick={() => void deleteShorex(x.id)}>
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {shorex.length === 0 ? (
                      <tr>
                        <td style={tdMuted} colSpan={6}>
                          No shore excursions yet.
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
          <Panel title="ShoreX pricing" subtitle="Upsert per (currency, paxtype). This is where duration↔port pricing lives, since each ShoreX is tied to a port + duration.">
            <div style={{ display: 'grid', gap: 10 }}>
              <Select label="Excursion" value={priceShorexId} onChange={(e) => setPriceShorexId(e.target.value)}>
                <option value="">(select)</option>
                {shorex.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.port_code} · {x.title} ({x.duration_minutes}m)
                  </option>
                ))}
              </Select>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 140px 1fr auto', gap: 10, alignItems: 'end' }}>
                <Select label="Currency" value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value)} disabled={!priceShorexId}>
                  {supportedCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <Select label="Paxtype" value={pricePax} onChange={(e) => setPricePax(e.target.value)} disabled={!priceShorexId}>
                  <option value="adult">adult</option>
                  <option value="child">child</option>
                  <option value="infant">infant</option>
                </Select>
                <Input
                  label="Price (cents)"
                  value={priceCents}
                  onChange={(e) => setPriceCents(Number(e.target.value))}
                  type="number"
                  min={0}
                  step={100}
                  disabled={!priceShorexId}
                />
                <Button variant="primary" disabled={busy || !priceShorexId} onClick={() => void upsertPrice()}>
                  {busy ? 'Saving…' : 'Upsert'}
                </Button>
              </div>

              {priceShorexId ? (
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={th}>Currency</th>
                        <th style={th}>Paxtype</th>
                        <th style={th}>Price (cents)</th>
                        <th style={th}>Actions</th>
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
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {prices.length === 0 ? (
                        <tr>
                          <td style={tdMuted} colSpan={4}>
                            No prices yet.
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


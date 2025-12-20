import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { getCompany } from '../components/storage'
import { fetchCompanySettings } from '../components/theme'
import { Button, ErrorBanner, Input, Mono, PageHeader, Panel, Select } from '../components/ui'

type OverridesOut = {
  company_id: string
  base_by_pax: Record<string, number> | null
  cabin_multiplier: Record<string, number> | null
  demand_multiplier: number | null
  category_prices?: {
    category_code: string
    price_type?: string | null
    currency: string
    min_guests: number
    price_per_person: number
    effective_start_date?: string | null
    effective_end_date?: string | null
  }[] | null
}

export function PricingPage(props: { apiBase: string }) {
  const company = getCompany()
  const [items, setItems] = useState<OverridesOut[]>([])

  const [cabinType, setCabinType] = useState<'inside' | 'oceanview' | 'balcony' | 'suite'>('inside')
  const [multiplier, setMultiplier] = useState(1.0)

  const [adult, setAdult] = useState(100000)
  const [child, setChild] = useState(60000)
  const [infant, setInfant] = useState(10000)

  const [catCode, setCatCode] = useState('CO3')
  const [catPriceType, setCatPriceType] = useState('regular')
  const [catCurrency, setCatCurrency] = useState('USD')
  const [defaultCurrency, setDefaultCurrency] = useState('USD')
  const [catMinGuests, setCatMinGuests] = useState(2)
  // Display/edit in major currency units (e.g. 300.00 EUR), send cents to API.
  const [catPricePerPerson, setCatPricePerPerson] = useState(1200)
  const [catStartDate, setCatStartDate] = useState('')
  const [catEndDate, setCatEndDate] = useState('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const companyId = company?.id || null
  const listEndpoint = useMemo(() => `/v1/pricing/overrides`, [])

  useEffect(() => {
    let cancelled = false
    if (!companyId) return
    fetchCompanySettings(props.apiBase, companyId)
      .then((s) => {
        if (cancelled) return
        const cur = String(s?.localization?.default_currency || 'USD').trim().toUpperCase() || 'USD'
        setDefaultCurrency(cur)
        setCatCurrency((prev) => (prev === 'USD' ? cur : prev))
      })
      .catch(() => {
        if (!cancelled) setDefaultCurrency('USD')
      })
    return () => {
      cancelled = true
    }
  }, [props.apiBase, companyId])

  async function refresh() {
    setBusy(true)
    setErr(null)
    try {
      if (!companyId) {
        setItems([])
        return
      }
      const r = await apiFetch<OverridesOut[]>(props.apiBase, listEndpoint)
      const rows = (r || []).filter((x) => x.company_id === companyId)
      setItems(rows)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    refresh().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listEndpoint])

  async function setCabinMultiplier() {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/pricing/overrides/cabin-multipliers`, {
        method: 'POST',
        body: { cabin_type: cabinType, multiplier, company_id: companyId },
      })
      await refresh()
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
      await apiFetch(props.apiBase, `/v1/pricing/overrides/base-fares`, { method: 'POST', body: { paxtype: 'adult', amount: adult, company_id: companyId } })
      await apiFetch(props.apiBase, `/v1/pricing/overrides/base-fares`, { method: 'POST', body: { paxtype: 'child', amount: child, company_id: companyId } })
      await apiFetch(props.apiBase, `/v1/pricing/overrides/base-fares`, { method: 'POST', body: { paxtype: 'infant', amount: infant, company_id: companyId } })
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function clearCompanyOverrides() {
    const key = company?.id
    if (!key?.trim()) {
      setErr('Select a company first.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/pricing/overrides/${encodeURIComponent(key)}`, { method: 'DELETE' })
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function upsertCategoryPrice() {
    setBusy(true)
    setErr(null)
    try {
      const pricePerPersonCents = Math.max(0, Math.round(Number(catPricePerPerson) * 100))
      await apiFetch(props.apiBase, `/v1/pricing/category-prices`, {
        method: 'POST',
        body: {
          category_code: catCode.trim().toUpperCase(),
          price_type: catPriceType.trim().toLowerCase() || 'regular',
          currency: catCurrency.trim().toUpperCase() || 'USD',
          currency: catCurrency.trim().toUpperCase() || defaultCurrency,
          min_guests: catMinGuests,
          price_per_person: pricePerPersonCents,
          effective_start_date: catStartDate.trim() || null,
          effective_end_date: catEndDate.trim() || null,
          company_id: companyId,
        },
      })
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title="Pricing & Offers"
        subtitle="Manage company pricing (base fares, cabin multipliers, and cabin-category prices like CO3). Pricing is company-managed (tenant-scoped)."
        right={
          <>
            <Button disabled={busy} onClick={() => void refresh()}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void clearCompanyOverrides()}>
              Clear company overrides
            </Button>
          </>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      <Panel title="Company" subtitle="Pricing is stored per company (tenant). Select a company in the portal before editing pricing.">
        <div style={{ display: 'grid', gap: 6, fontSize: 13, color: 'rgba(230,237,243,0.85)' }}>
          <div>Effective company id</div>
          <div>
            <Mono>{company?.id || '(no company selected)'}</Mono>
          </div>
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        <Panel title="Cabin multipliers" subtitle="Example: suites at 1.8x, balconies at 1.3x.">
          <div style={{ display: 'grid', gap: 10 }}>
            <Select label="Cabin type" value={cabinType} onChange={(e) => setCabinType(e.target.value as any)}>
              <option value="inside">inside</option>
              <option value="oceanview">oceanview</option>
              <option value="balcony">balcony</option>
              <option value="suite">suite</option>
            </Select>
            <Input label="Multiplier" type="number" step="0.05" min="0.1" value={multiplier} onChange={(e) => setMultiplier(Number(e.target.value))} />
            <Button variant="primary" disabled={busy || !company?.id} onClick={() => void setCabinMultiplier()}>
              {busy ? 'Saving…' : 'Set multiplier'}
            </Button>
          </div>
        </Panel>

        <Panel title="Base fares" subtitle="Amounts are in cents; applied per passenger type.">
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Input label="Adult" type="number" min="0" step="1000" value={adult} onChange={(e) => setAdult(Number(e.target.value))} />
              <Input label="Child" type="number" min="0" step="1000" value={child} onChange={(e) => setChild(Number(e.target.value))} />
              <Input label="Infant" type="number" min="0" step="1000" value={infant} onChange={(e) => setInfant(Number(e.target.value))} />
            </div>
            <Button variant="primary" disabled={busy || !company?.id} onClick={() => void setBaseFares()}>
              {busy ? 'Saving…' : 'Set base fares'}
            </Button>
          </div>
        </Panel>
      </div>

      <Panel
        title="Cabin category pricing (by category + price type)"
        subtitle="Define per-person pricing for a cabin category code (e.g. CO3), with a price type/rate plan (regular, internet, etc) and minimum billable guests (e.g. 2)."
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
          <Input label="Category code" value={catCode} onChange={(e) => setCatCode(e.target.value)} />
          <Input
            label="Price type"
            value={catPriceType}
            onChange={(e) => setCatPriceType(e.target.value)}
            placeholder="regular | internet | …"
            hint="This lets you store multiple prices per category (e.g. regular vs internet)."
          />
          <Input label="Currency" value={catCurrency} onChange={(e) => setCatCurrency(e.target.value)} />
          <Input label="Min guests" type="number" min="1" step="1" value={catMinGuests} onChange={(e) => setCatMinGuests(Number(e.target.value))} />
          <Input
            label="Price / person"
            type="number"
            min="0"
            step="0.01"
            value={catPricePerPerson}
            onChange={(e) => setCatPricePerPerson(Number(e.target.value))}
            hint="Enter major units (e.g. 300.00 = €300.00). Saved as cents in API."
          />
        </div>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Input label="Cruise date start (optional)" type="date" value={catStartDate} onChange={(e) => setCatStartDate(e.target.value)} />
          <Input label="Cruise date end (optional)" type="date" value={catEndDate} onChange={(e) => setCatEndDate(e.target.value)} />
        </div>
        <div style={{ marginTop: 10 }}>
          <Button variant="primary" disabled={busy || !catCode.trim() || !catPriceType.trim() || !company?.id} onClick={() => void upsertCategoryPrice()}>
            {busy ? 'Saving…' : 'Save category price'}
          </Button>
        </div>
      </Panel>

      <Panel title="Current overrides" subtitle="This service stores overrides in-memory (demo). In production, this would be persisted + versioned.">
        <div style={{ overflow: 'auto' }}>
          <table style={tableStyles.table}>
            <thead>
              <tr>
                <th style={tableStyles.th}>Company</th>
                <th style={tableStyles.th}>Base fares</th>
                <th style={tableStyles.th}>Cabin multipliers</th>
                <th style={tableStyles.th}>Category prices</th>
                <th style={tableStyles.th}>Demand</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.company_id}>
                  <td style={tableStyles.tdMono}>{o.company_id}</td>
                  <td style={tableStyles.td}>
                    {o.base_by_pax ? (
                      <div style={tableStyles.wrap}>
                        {Object.entries(o.base_by_pax).map(([k, v]) => (
                          <div key={k}>
                            <Mono>{k}</Mono>: {(v / 100).toFixed(2)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={tableStyles.muted}>—</span>
                    )}
                  </td>
                  <td style={tableStyles.td}>
                    {o.cabin_multiplier ? (
                      <div style={tableStyles.wrap}>
                        {Object.entries(o.cabin_multiplier).map(([k, v]) => (
                          <div key={k}>
                            <Mono>{k}</Mono>: {v.toFixed(2)}x
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={tableStyles.muted}>—</span>
                    )}
                  </td>
                  <td style={tableStyles.td}>
                    {o.category_prices && o.category_prices.length ? (
                      <div style={tableStyles.wrap}>
                        {groupCategoryPrices(o.category_prices).map((g) => (
                          <div key={g.category_code} style={{ display: 'grid', gap: 6 }}>
                            <div style={{ fontWeight: 900 }}>
                              <Mono>{g.category_code}</Mono>
                            </div>
                            <div style={{ display: 'grid', gap: 4, paddingLeft: 10 }}>
                              {g.items.map((r) => (
                                <div
                                  key={`${r.category_code}-${r.price_type || 'regular'}-${r.currency}-${r.min_guests}-${r.effective_start_date || 'any'}-${r.effective_end_date || 'any'}`}
                                >
                                  <Mono>{(r.price_type || 'regular').toLowerCase()}</Mono> · {r.currency} · min {r.min_guests} · {(r.price_per_person / 100).toFixed(2)} / pax
                                  <span style={{ color: 'rgba(230,237,243,0.65)' }}>
                                    {' '}
                                    · date {r.effective_start_date || 'any'} → {r.effective_end_date || 'any'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={tableStyles.muted}>—</span>
                    )}
                  </td>
                  <td style={tableStyles.tdMono}>{o.demand_multiplier ?? '—'}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} style={tableStyles.empty}>
                    No overrides set.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function groupCategoryPrices(
  rows: NonNullable<OverridesOut['category_prices']>
): { category_code: string; items: NonNullable<OverridesOut['category_prices']> }[] {
  const by: Record<string, NonNullable<OverridesOut['category_prices']>> = {}
  for (const r of rows) {
    const k = (r.category_code || '').trim().toUpperCase()
    if (!k) continue
    if (!by[k]) by[k] = []
    by[k].push(r)
  }
  const cats = Object.keys(by).sort()
  return cats.map((category_code) => ({
    category_code,
    items: by[category_code].slice().sort((a, b) => {
      const ap = (a.price_type || 'regular').toLowerCase()
      const bp = (b.price_type || 'regular').toLowerCase()
      if (ap !== bp) return ap.localeCompare(bp)
      const ac = (a.currency || '').toUpperCase()
      const bc = (b.currency || '').toUpperCase()
      if (ac !== bc) return ac.localeCompare(bc)
      const ag = Number(a.min_guests || 0)
      const bg = Number(b.min_guests || 0)
      if (ag !== bg) return ag - bg
      const as = a.effective_start_date || ''
      const bs = b.effective_start_date || ''
      if (as !== bs) return as.localeCompare(bs)
      const ae = a.effective_end_date || ''
      const be = b.effective_end_date || ''
      return ae.localeCompare(be)
    }),
  }))
}

const tableStyles: Record<string, React.CSSProperties> = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.10)',
    color: 'rgba(230,237,243,0.75)',
    fontWeight: 900,
  },
  td: { padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    verticalAlign: 'top',
  },
  empty: { padding: '14px 8px', color: 'rgba(230,237,243,0.60)' },
  muted: { color: 'rgba(230,237,243,0.60)' },
  wrap: { display: 'grid', gap: 4 },
}


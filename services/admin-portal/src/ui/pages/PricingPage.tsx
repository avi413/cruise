import React, { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import { getCompany } from '../components/storage'
import { fetchCompanySettings } from '../components/theme'
import { Button, ErrorBanner, Input, Mono, PageHeader, Panel, Select, Tabs, TextArea, TwoCol } from '../components/ui'
import * as XLSX from 'xlsx'

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
}

type PriceCategory = {
  company_id: string
  code: string
  parent_code?: string | null
  active: boolean
  order: number
  enabled_channels: string[]
  room_selection_included: boolean
  room_category_only: boolean
  name_i18n: Record<string, string>
  description_i18n: Record<string, string>
  created_at: string
  updated_at: string
}

type CabinCategory = { id: string; ship_id: string; code: string; name: string; description: string; max_occupancy: number }

type CruisePriceCell = {
  company_id: string
  sailing_id: string
  cabin_category_code: string
  price_category_code: string
  currency: string
  min_guests: number
  price_per_person: number
  updated_at: string
}

export function PricingPage(props: { apiBase: string }) {
  const company = getCompany()
  const [items, setItems] = useState<OverridesOut[]>([])

  const [cabinType, setCabinType] = useState<'inside' | 'oceanview' | 'balcony' | 'suite'>('inside')
  const [multiplier, setMultiplier] = useState(1.0)

  const [adult, setAdult] = useState(100000)
  const [child, setChild] = useState(60000)
  const [infant, setInfant] = useState(10000)

  const [catCodesRaw, setCatCodesRaw] = useState('CO3')
  const [catPriceTypesRaw, setCatPriceTypesRaw] = useState('regular')
  const [catCurrency, setCatCurrency] = useState('USD')
  const [defaultCurrency, setDefaultCurrency] = useState('USD')
  const [catMinGuests, setCatMinGuests] = useState(2)
  // Display/edit in major currency units (e.g. 300.00 EUR), send cents to API.
  const [catPricePerPerson, setCatPricePerPerson] = useState(1200)
  const [sailings, setSailings] = useState<Sailing[]>([])
  const [selectedSailingId, setSelectedSailingId] = useState<string>('')

  const [tab, setTab] = useState<'categories' | 'cruise'>('categories')

  // Flexible pricing model state
  const [priceCats, setPriceCats] = useState<PriceCategory[]>([])
  const [newCatCode, setNewCatCode] = useState('internet')
  const [newCatParentCode, setNewCatParentCode] = useState<string>('')
  const [newCatNameJson, setNewCatNameJson] = useState('{"en":"Internet"}')
  const [newCatDescJson, setNewCatDescJson] = useState('{"en":"Online-only pricing"}')
  const [newCatChannelsRaw, setNewCatChannelsRaw] = useState('website, api, mobile_app')
  const [newCatRoomSelIncluded, setNewCatRoomSelIncluded] = useState(false)
  const [newCatRoomCatOnly, setNewCatRoomCatOnly] = useState(false)
  const [newCatActive, setNewCatActive] = useState(true)

  const [gridSailingId, setGridSailingId] = useState<string>('')
  const [gridCurrency, setGridCurrency] = useState('USD')
  const [gridMinGuests, setGridMinGuests] = useState(2)
  const [gridCabinCats, setGridCabinCats] = useState<CabinCategory[]>([])
  const [gridCells, setGridCells] = useState<Record<string, number>>({}) // key= cabin|priceCat -> cents
  const fileRef = useRef<HTMLInputElement | null>(null)

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

  useEffect(() => {
    // Keep flexible pricing grid currency aligned with company default (don't clobber user edits once changed)
    setGridCurrency((prev) => (prev === 'USD' ? defaultCurrency : prev))
  }, [defaultCurrency])

  useEffect(() => {
    let cancelled = false
    apiFetch<Sailing[]>(props.apiBase, `/v1/sailings`, { auth: false, tenant: false })
      .then((r) => {
        if (cancelled) return
        const rows = r || []
        setSailings(rows)
        if (!selectedSailingId && rows.length) setSelectedSailingId(rows[0].id)
      })
      .catch(() => {
        if (!cancelled) setSailings([])
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.apiBase])

  async function refresh() {
    setBusy(true)
    setErr(null)
    try {
      if (!companyId) {
        setItems([])
        setPriceCats([])
        return
      }
      const r = await apiFetch<OverridesOut[]>(props.apiBase, listEndpoint)
      const rows = (r || []).filter((x) => x.company_id === companyId)
      setItems(rows)

      const cats = await apiFetch<PriceCategory[]>(props.apiBase, `/v1/pricing/price-categories?active_only=false`)
      setPriceCats(cats || [])
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

  function parseCodes(raw: string): string[] {
    const tokens = String(raw || '')
      .split(/[\s,]+/g)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean)
    return Array.from(new Set(tokens))
  }

  function parsePriceTypes(raw: string): string[] {
    const tokens = String(raw || '')
      .split(/[\s,]+/g)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
    return Array.from(new Set(tokens.length ? tokens : ['regular']))
  }

  async function upsertCategoryPricesBulk() {
    setBusy(true)
    setErr(null)
    try {
      if (!companyId) {
        setErr('Select a company first.')
        return
      }
      const codes = parseCodes(catCodesRaw)
      const priceTypes = parsePriceTypes(catPriceTypesRaw)
      if (!codes.length) {
        setErr('Enter at least one category code.')
        return
      }

      const pricePerPersonCents = Math.max(0, Math.round(Number(catPricePerPerson) * 100))

      const sailing = sailings.find((s) => String(s.id) === String(selectedSailingId))
      const effStart = sailing?.start_date || null
      const effEnd = sailing?.end_date || null

      const rows = codes.flatMap((code) =>
        priceTypes.map((pt) => ({
          category_code: code,
          price_type: pt || 'regular',
          currency: (catCurrency.trim().toUpperCase() || defaultCurrency || 'USD').trim().toUpperCase(),
          min_guests: catMinGuests,
          price_per_person: pricePerPersonCents,
          // We don't ask for optional dates; we attach pricing to the selected cruise/sailing.
          effective_start_date: effStart,
          effective_end_date: effEnd,
          company_id: companyId,
        }))
      )

      await apiFetch(props.apiBase, `/v1/pricing/category-prices/bulk`, {
        method: 'POST',
        body: rows,
      })
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function parseChannels(raw: string): string[] {
    const tokens = String(raw || '')
      .split(/[\s,]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
    return Array.from(new Set(tokens))
  }

  function safeJsonObj(raw: string): Record<string, string> {
    const s = String(raw || '').trim()
    if (!s) return {}
    const v = JSON.parse(s)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Record<string, string> = {}
    for (const [k, val] of Object.entries(v)) out[String(k)] = String(val)
    return out
  }

  function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noreferrer'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  function downloadText(filename: string, text: string, mime: string) {
    downloadBlob(filename, new Blob([text], { type: mime }))
  }

  async function createPriceCategory() {
    setBusy(true)
    setErr(null)
    try {
      if (!companyId) throw new Error('Select a company first.')
      await apiFetch(props.apiBase, `/v1/pricing/price-categories`, {
        method: 'POST',
        body: {
          code: newCatCode,
          parent_code: newCatParentCode || null,
          active: newCatActive,
          enabled_channels: parseChannels(newCatChannelsRaw),
          room_selection_included: newCatRoomSelIncluded,
          room_category_only: newCatRoomCatOnly,
          name_i18n: safeJsonObj(newCatNameJson),
          description_i18n: safeJsonObj(newCatDescJson),
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

  async function patchPriceCategory(code: string, patch: Partial<PriceCategory>) {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/pricing/price-categories/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        body: {
          parent_code: patch.parent_code,
          active: patch.active,
          enabled_channels: patch.enabled_channels,
          room_selection_included: patch.room_selection_included,
          room_category_only: patch.room_category_only,
          name_i18n: patch.name_i18n,
          description_i18n: patch.description_i18n,
        },
      })
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function deletePriceCategory(code: string) {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/pricing/price-categories/${encodeURIComponent(code)}`, { method: 'DELETE' })
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function reorderCats(codes: string[]) {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/pricing/price-categories/reorder`, {
        method: 'POST',
        body: { codes },
      })
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function buildCategoryTreeOrder(): { flat: { c: PriceCategory; depth: number }[]; orderCodes: string[] } {
    const byCode: Record<string, PriceCategory> = {}
    for (const c of priceCats || []) byCode[String(c.code)] = c

    const children: Record<string, PriceCategory[]> = {}
    for (const c of priceCats || []) {
      const p = String((c.parent_code as any) || '').trim()
      if (!children[p]) children[p] = []
      children[p].push(c)
    }
    for (const k of Object.keys(children)) children[k].sort((a, b) => (a.order || 0) - (b.order || 0))

    const out: { c: PriceCategory; depth: number }[] = []
    const seen = new Set<string>()

    function walk(parent: string, depth: number) {
      for (const c of children[parent] || []) {
        if (seen.has(c.code)) continue
        seen.add(c.code)
        out.push({ c, depth })
        walk(String(c.code), depth + 1)
      }
    }

    walk('', 0)
    // Any orphans/cycles fall back to root-level rendering
    for (const c of (priceCats || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))) {
      if (seen.has(c.code)) continue
      out.push({ c, depth: 0 })
    }

    return { flat: out, orderCodes: out.map((x) => x.c.code) }
  }

  async function loadGrid() {
    setBusy(true)
    setErr(null)
    try {
      if (!companyId) throw new Error('Select a company first.')
      const sid = (gridSailingId || selectedSailingId || '').trim()
      if (!sid) throw new Error('Select a sailing first.')
      setGridSailingId(sid)

      const sailing = sailings.find((s) => String(s.id) === String(sid))
      if (!sailing?.ship_id) throw new Error('Selected sailing is missing ship_id.')

      const cabinCats = await apiFetch<CabinCategory[]>(
        props.apiBase,
        `/v1/ships/${encodeURIComponent(sailing.ship_id)}/cabin-categories`,
        { auth: true, tenant: true }
      )
      setGridCabinCats(cabinCats || [])

      const rows = await apiFetch<CruisePriceCell[]>(props.apiBase, `/v1/pricing/cruise-prices?sailing_id=${encodeURIComponent(sid)}`)
      const map: Record<string, number> = {}
      for (const r of rows || []) {
        const k = `${String(r.cabin_category_code).toUpperCase()}|${String(r.price_category_code).toLowerCase()}`
        map[k] = Number(r.price_per_person) || 0
      }
      setGridCells(map)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function saveGrid() {
    setBusy(true)
    setErr(null)
    try {
      if (!companyId) throw new Error('Select a company first.')
      const sid = (gridSailingId || '').trim()
      if (!sid) throw new Error('Select a sailing first.')

      const activeCats = (priceCats || []).filter((c) => c.active).slice().sort((a, b) => a.order - b.order)
      if (!activeCats.length) throw new Error('Create at least one active price category.')

      const payload: any[] = []
      for (const cabin of gridCabinCats) {
        const cabinCode = String(cabin.code || '').trim().toUpperCase()
        if (!cabinCode) continue
        for (const pc of activeCats) {
          const key = `${cabinCode}|${String(pc.code).toLowerCase()}`
          const cents = Number(gridCells[key] ?? 0)
          payload.push({
            sailing_id: sid,
            cabin_category_code: cabinCode,
            price_category_code: String(pc.code).toLowerCase(),
            currency: gridCurrency.trim().toUpperCase() || defaultCurrency || 'USD',
            min_guests: gridMinGuests,
            price_per_person: Math.max(0, Math.round(Number.isFinite(cents) ? cents : 0)),
            company_id: companyId,
          })
        }
      }
      await apiFetch(props.apiBase, `/v1/pricing/cruise-prices/bulk`, { method: 'POST', body: payload })
      await loadGrid()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function exportGrid(fmt: 'json' | 'csv') {
    setBusy(true)
    setErr(null)
    try {
      const sid = (gridSailingId || '').trim()
      if (!sid) throw new Error('Select a sailing first.')

      // Authenticated download (fixes "Missing bearer token")
      if (fmt === 'json') {
        const rows = await apiFetch<CruisePriceCell[]>(props.apiBase, `/v1/pricing/cruise-prices?sailing_id=${encodeURIComponent(sid)}`)
        const payload = { company_id: companyId, sailing_id: sid, items: rows || [] }
        downloadText(`cruise-prices-${sid}.json`, JSON.stringify(payload, null, 2) + '\n', 'application/json')
        return
      }

      // CSV (client-side)
      const activeCats = (priceCats || []).filter((c) => c.active).slice().sort((a, b) => a.order - b.order)
      const header = ['sailing_id', 'cabin_category_code', 'price_category_code', 'currency', 'min_guests', 'price_per_person']
      const lines: string[] = [header.join(',')]
      for (const cabin of gridCabinCats) {
        const cabinCode = String(cabin.code || '').trim().toUpperCase()
        if (!cabinCode) continue
        for (const pc of activeCats) {
          const key = `${cabinCode}|${String(pc.code).toLowerCase()}`
          const cents = Number(gridCells[key] ?? 0)
          lines.push([sid, cabinCode, String(pc.code).toLowerCase(), gridCurrency.trim().toUpperCase(), String(gridMinGuests), String(Math.max(0, Math.round(cents)))].join(','))
        }
      }
      downloadText(`cruise-prices-${sid}.csv`, lines.join('\n') + '\n', 'text/csv')
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function exportGridExcel() {
    setBusy(true)
    setErr(null)
    try {
      const sid = (gridSailingId || '').trim()
      if (!sid) throw new Error('Select a sailing first.')
      const activeCats = (priceCats || []).filter((c) => c.active).slice().sort((a, b) => a.order - b.order)
      if (!gridCabinCats.length || !activeCats.length) throw new Error('Load the table first (and ensure at least one active price category).')

      const aoa: any[][] = []
      aoa.push(['Cabin category', ...activeCats.map((c) => c.code)])
      for (const cabin of gridCabinCats) {
        const cabinCode = String(cabin.code || '').trim().toUpperCase()
        const row: any[] = [cabinCode]
        for (const pc of activeCats) {
          const k = `${cabinCode}|${String(pc.code).toLowerCase()}`
          const cents = Number(gridCells[k] ?? 0)
          row.push(Number.isFinite(cents) ? cents : 0)
        }
        aoa.push(row)
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'CruisePrices')
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      downloadBlob(`cruise-prices-${sid}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function exportCategoriesJson() {
    setBusy(true)
    setErr(null)
    try {
      const payload = { company_id: companyId, items: priceCats || [] }
      downloadText(`price-categories-${companyId || 'company'}.json`, JSON.stringify(payload, null, 2) + '\n', 'application/json')
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function exportCategoriesExcel() {
    setBusy(true)
    setErr(null)
    try {
      const rows = (priceCats || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
      const aoa: any[][] = []
      aoa.push([
        'code',
        'parent_code',
        'active',
        'order',
        'enabled_channels',
        'room_selection_included',
        'room_category_only',
        'name_i18n',
        'description_i18n',
      ])
      for (const c of rows) {
        aoa.push([
          c.code,
          c.parent_code || '',
          c.active ? 'true' : 'false',
          c.order,
          (c.enabled_channels || []).join(', '),
          c.room_selection_included ? 'true' : 'false',
          c.room_category_only ? 'true' : 'false',
          JSON.stringify(c.name_i18n || {}),
          JSON.stringify(c.description_i18n || {}),
        ])
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'PriceCategories')
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      downloadBlob(`price-categories-${companyId || 'company'}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function importGridJson(file: File) {
    setBusy(true)
    setErr(null)
    try {
      if (!companyId) throw new Error('Select a company first.')
      const sid = (gridSailingId || '').trim()
      if (!sid) throw new Error('Select a sailing first.')

      const raw = await file.text()
      const parsed = JSON.parse(raw)
      const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : null
      if (!items) throw new Error('Import JSON must be either an array of rows or an object with { items: [...] }.')

      const payload = items.map((r: any) => ({
        sailing_id: sid,
        cabin_category_code: String(r.cabin_category_code || r.category_code || '').toUpperCase(),
        price_category_code: String(r.price_category_code || r.price_type || '').toLowerCase(),
        currency: String(r.currency || gridCurrency || defaultCurrency || 'USD').toUpperCase(),
        min_guests: Number(r.min_guests || gridMinGuests || 2),
        price_per_person: Number(r.price_per_person || 0),
        company_id: companyId,
      }))
      await apiFetch(props.apiBase, `/v1/pricing/cruise-prices/bulk`, { method: 'POST', body: payload })
      await loadGrid()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title="Pricing & Offers"
        subtitle="Manage pricing. Use Overrides for legacy knobs, or Flexible model for admin-defined price categories and per-cruise price tables."
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

      <Tabs
        idBase="pricing"
        value={tab}
        onChange={(k) => setTab(k as any)}
        tabs={[
          { key: 'categories', label: 'Price Categories', badge: (priceCats || []).filter((c) => c.active).length },
          { key: 'cruise', label: 'Cruise Price Tables' },
        ]}
      />

      {tab === 'categories' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <TwoCol
            left={
              <Panel
                title="Price Categories"
                subtitle="CRM-style category management: create categories, assign optional parent (hierarchy), toggle availability flags, and export JSON/Excel."
                right={
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Button disabled={busy} onClick={() => void exportCategoriesJson()}>
                      Export JSON
                    </Button>
                    <Button disabled={busy} onClick={() => void exportCategoriesExcel()}>
                      Export Excel
                    </Button>
                  </div>
                }
              >
                <div style={{ display: 'grid', gap: 10 }}>
                  <TwoCol
                    left={<Input label="Code" value={newCatCode} onChange={(e) => setNewCatCode(e.target.value)} placeholder="internet" disabled={busy} />}
                    right={
                      <Select label="Parent (optional)" value={newCatParentCode} onChange={(e) => setNewCatParentCode(e.target.value)} disabled={busy}>
                        <option value="">(none)</option>
                        {(priceCats || [])
                          .slice()
                          .sort((a, b) => (a.order || 0) - (b.order || 0))
                          .map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code}
                            </option>
                          ))}
                      </Select>
                    }
                  />

                  <Input
                    label="Enabled channels (comma-separated)"
                    value={newCatChannelsRaw}
                    onChange={(e) => setNewCatChannelsRaw(e.target.value)}
                    placeholder="website, agent, api"
                    disabled={busy}
                  />

                  <TwoCol
                    left={<TextArea label="Name i18n (JSON)" value={newCatNameJson} onChange={(e) => setNewCatNameJson(e.target.value)} rows={3} disabled={busy} />}
                    right={
                      <TextArea
                        label="Description i18n (JSON)"
                        value={newCatDescJson}
                        onChange={(e) => setNewCatDescJson(e.target.value)}
                        rows={3}
                        disabled={busy}
                      />
                    }
                  />

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <input type="checkbox" checked={newCatActive} onChange={(e) => setNewCatActive(e.target.checked)} /> Active
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={newCatRoomSelIncluded}
                        onChange={(e) => {
                          setNewCatRoomSelIncluded(e.target.checked)
                          if (e.target.checked) setNewCatRoomCatOnly(false)
                        }}
                      />
                      Room Selection Included
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={newCatRoomCatOnly}
                        onChange={(e) => {
                          setNewCatRoomCatOnly(e.target.checked)
                          if (e.target.checked) setNewCatRoomSelIncluded(false)
                        }}
                      />
                      Room Category Only
                    </label>
                    <Button variant="primary" disabled={busy || !company?.id} onClick={() => void createPriceCategory()}>
                      Create category
                    </Button>
                  </div>
                </div>
              </Panel>
            }
            right={
              <Panel title="Existing categories" subtitle="Toggle active, edit channels/flags, and move up/down to reorder.">
                <div style={{ display: 'grid', gap: 8 }}>
                  {(() => {
                    const tree = buildCategoryTreeOrder()
                    return tree.flat.map(({ c, depth }, idx) => {
                      const arr = tree.flat.map((x) => x.c)
                      const name = c.name_i18n?.en || Object.values(c.name_i18n || {})[0] || c.code
                      const parent = String((c.parent_code as any) || '')
                      const siblings = arr.filter((x) => String((x.parent_code as any) || '') === parent)
                      const sibIdx = siblings.findIndex((x) => x.code === c.code)
                      return (
                        <div
                          key={c.code}
                          style={{
                            border: '1px solid rgba(255,255,255,0.10)',
                            borderRadius: 12,
                            padding: 10,
                            display: 'grid',
                            gap: 8,
                            background: 'rgba(0,0,0,0.12)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                            <div>
                              <div style={{ fontWeight: 900 }}>
                                <span style={{ display: 'inline-block', width: depth * 14 }} />
                                <Mono>{c.code}</Mono> · {name}{' '}
                                {!c.active ? <span style={{ color: 'rgba(230,237,243,0.65)', fontWeight: 700 }}>(inactive)</span> : null}
                              </div>
                              <div style={{ fontSize: 12, color: 'rgba(230,237,243,0.65)', marginTop: 4 }}>
                                Channels: {(c.enabled_channels || []).join(', ') || '(none)'} ·{' '}
                                {c.room_selection_included ? 'Room selection included' : c.room_category_only ? 'Room category only' : 'No room flag'}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <Button
                                disabled={busy || sibIdx <= 0}
                                onClick={() => {
                                  const sib = siblings.slice()
                                  const tmp = sib[sibIdx - 1]
                                  sib[sibIdx - 1] = sib[sibIdx]
                                  sib[sibIdx] = tmp
                                  // Build a full order list with updated sibling ordering
                                  const current = buildCategoryTreeOrder()
                                  const codes = current.orderCodes.slice()
                                  const groupCodes = sib.map((x) => x.code)
                                  // Replace occurrences of the group's codes in the codes list with the new order
                                  const out: string[] = []
                                  let gi = 0
                                  for (const code of codes) {
                                    if (groupCodes.includes(code)) {
                                      out.push(groupCodes[gi++])
                                    } else {
                                      out.push(code)
                                    }
                                  }
                                  void reorderCats(out)
                                }}
                              >
                                ↑
                              </Button>
                              <Button
                                disabled={busy || sibIdx === -1 || sibIdx >= siblings.length - 1}
                                onClick={() => {
                                  const sib = siblings.slice()
                                  const tmp = sib[sibIdx + 1]
                                  sib[sibIdx + 1] = sib[sibIdx]
                                  sib[sibIdx] = tmp
                                  const current = buildCategoryTreeOrder()
                                  const codes = current.orderCodes.slice()
                                  const groupCodes = sib.map((x) => x.code)
                                  const out: string[] = []
                                  let gi = 0
                                  for (const code of codes) {
                                    if (groupCodes.includes(code)) {
                                      out.push(groupCodes[gi++])
                                    } else {
                                      out.push(code)
                                    }
                                  }
                                  void reorderCats(out)
                                }}
                              >
                                ↓
                              </Button>
                              <Button disabled={busy} onClick={() => void patchPriceCategory(c.code, { active: !c.active })} title="Toggle active">
                                {c.active ? 'Deactivate' : 'Activate'}
                              </Button>
                              <Button variant="danger" disabled={busy} onClick={() => void deletePriceCategory(c.code)}>
                                Delete
                              </Button>
                            </div>
                          </div>

                          <TwoCol
                            left={
                              <Input
                                label="Channels (comma-separated)"
                                value={(c.enabled_channels || []).join(', ')}
                                onChange={(e) => void patchPriceCategory(c.code, { enabled_channels: parseChannels(e.target.value) })}
                                disabled={busy}
                              />
                            }
                            right={
                              <div style={{ display: 'grid', gap: 8 }}>
                                <Select
                                  label="Parent"
                                  value={(c.parent_code as any) || ''}
                                  onChange={(e) => void patchPriceCategory(c.code, { parent_code: e.target.value || null })}
                                  disabled={busy}
                                >
                                  <option value="">(none)</option>
                                  {(priceCats || [])
                                    .filter((x) => x.code !== c.code)
                                    .slice()
                                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                                    .map((p) => (
                                      <option key={p.code} value={p.code}>
                                        {p.code}
                                      </option>
                                    ))}
                                </Select>
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={!!c.room_selection_included}
                                    onChange={(e) => void patchPriceCategory(c.code, { room_selection_included: e.target.checked, room_category_only: false })}
                                    disabled={busy}
                                  />
                                  Room Selection Included
                                </label>
                                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={!!c.room_category_only}
                                    onChange={(e) => void patchPriceCategory(c.code, { room_category_only: e.target.checked, room_selection_included: false })}
                                    disabled={busy}
                                  />
                                  Room Category Only
                                </label>
                                </div>
                              </div>
                            }
                          />
                        </div>
                      )
                    })
                  })()}
                </div>
              </Panel>
            }
          />
        </div>
      ) : null}

      {tab === 'cruise' ? (
        <Panel
          title="Cruise pricing table"
          subtitle="Pick a sailing (cruise). Rows are cabin categories; columns are active price categories. Enter per-person price in cents. Export JSON/CSV/Excel uses authenticated downloads."
          right={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button disabled={busy} onClick={() => void loadGrid()}>
                Load table
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void saveGrid()}>
                Save table
              </Button>
              <Button disabled={busy} onClick={() => void exportGrid('json')}>
                Export JSON
              </Button>
              <Button disabled={busy} onClick={() => void exportGrid('csv')}>
                Export CSV
              </Button>
              <Button disabled={busy} onClick={() => void exportGridExcel()}>
                Export Excel
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importGridJson(f)
                }}
              />
            </div>
          }
        >
            <div style={{ display: 'grid', gap: 10 }}>
              <TwoCol
                left={
                  <Select label="Sailing" value={gridSailingId || selectedSailingId || ''} onChange={(e) => setGridSailingId(e.target.value)} disabled={busy}>
                    <option value="">(select)</option>
                    {sailings.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.start_date}→{s.end_date}
                      </option>
                    ))}
                  </Select>
                }
                right={
                  <TwoCol
                    left={<Input label="Currency" value={gridCurrency} onChange={(e) => setGridCurrency(e.target.value)} disabled={busy} />}
                    right={
                      <Input
                        label="Min guests"
                        value={gridMinGuests}
                        type="number"
                        min={1}
                        step={1}
                        onChange={(e) => setGridMinGuests(Number(e.target.value))}
                        disabled={busy}
                      />
                    }
                  />
                }
              />

              <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid rgba(255,255,255,0.10)' }}>Cabin category</th>
                      {priceCats
                        .filter((c) => c.active)
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((pc) => (
                          <th key={pc.code} style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                            <Mono>{pc.code}</Mono>
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gridCabinCats.map((c) => {
                      const cabinCode = String(c.code || '').toUpperCase()
                      return (
                        <tr key={c.id}>
                          <td style={{ padding: 10, borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 900 }}>
                              <Mono>{cabinCode}</Mono> · {c.name}
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(230,237,243,0.65)', marginTop: 4 }}>{c.description || ''}</div>
                          </td>
                          {priceCats
                            .filter((pc) => pc.active)
                            .slice()
                            .sort((a, b) => a.order - b.order)
                            .map((pc) => {
                              const k = `${cabinCode}|${String(pc.code).toLowerCase()}`
                              const cents = Number(gridCells[k] ?? 0)
                              return (
                                <td key={k} style={{ padding: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                  <input
                                    style={{
                                      width: 140,
                                      padding: '8px 10px',
                                      borderRadius: 10,
                                      border: '1px solid rgba(255,255,255,0.12)',
                                      background: 'rgba(0,0,0,0.25)',
                                      color: '#e6edf3',
                                    }}
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={Number.isFinite(cents) ? cents : 0}
                                    onChange={(e) => setGridCells((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
                                    disabled={busy}
                                  />
                                  <div style={{ fontSize: 11, color: 'rgba(230,237,243,0.55)', marginTop: 6 }}>cents / pax</div>
                                </td>
                              )
                            })}
                        </tr>
                      )
                    })}
                    {gridCabinCats.length === 0 ? (
                      <tr>
                        <td colSpan={1 + (priceCats || []).filter((c) => c.active).length} style={{ padding: 12, color: 'rgba(230,237,243,0.60)' }}>
                          Load a sailing to view cabin categories and pricing.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
        </Panel>
      ) : null}

      {/* Legacy overrides UI removed from tabs per requirements */}
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


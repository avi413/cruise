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

function HoverRow({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styles.tr,
        background: hover ? 'var(--csp-border-strong, rgba(0,0,0,0.05))' : 'transparent',
      }}
    >
      {children}
    </tr>
  )
}

export function PricingPage(props: { apiBase: string }) {
  const company = getCompany()
  const companyId = company?.id || null

  const [tab, setTab] = useState<'categories' | 'cruise'>('categories')
  
  // Category View State
  const [catView, setCatView] = useState<'list' | 'create' | 'edit'>('list')
  const [catQ, setCatQ] = useState('')

  // Data
  const [items, setItems] = useState<OverridesOut[]>([])
  const [priceCats, setPriceCats] = useState<PriceCategory[]>([])
  const [sailings, setSailings] = useState<Sailing[]>([])
  
  // Create/Edit Category State
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [catCode, setCatCode] = useState('')
  const [catParentCode, setCatParentCode] = useState<string>('')
  const [catName, setCatName] = useState('')
  const [catDesc, setCatDesc] = useState('')
  const [catChannels, setCatChannels] = useState('')
  const [catRoomSelIncluded, setCatRoomSelIncluded] = useState(false)
  const [catRoomCatOnly, setCatRoomCatOnly] = useState(false)
  const [catActive, setCatActive] = useState(true)

  // Cruise Grid State
  const [selectedSailingId, setSelectedSailingId] = useState<string>('')
  const [gridSailingId, setGridSailingId] = useState<string>('')
  const [gridCurrency, setGridCurrency] = useState('USD')
  const [gridMinGuests, setGridMinGuests] = useState(2)
  const [gridCabinCats, setGridCabinCats] = useState<CabinCategory[]>([])
  const [gridCells, setGridCells] = useState<Record<string, number>>({}) // key= cabin|priceCat -> cents
  const [defaultCurrency, setDefaultCurrency] = useState('USD')
  
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const listEndpoint = useMemo(() => `/v1/pricing/overrides`, [])

  useEffect(() => {
    let cancelled = false
    if (!companyId) return
    fetchCompanySettings(props.apiBase, companyId)
      .then((s) => {
        if (cancelled) return
        const cur = String(s?.localization?.default_currency || 'USD').trim().toUpperCase() || 'USD'
        setDefaultCurrency(cur)
        setGridCurrency((prev) => (prev === 'USD' ? cur : prev))
      })
      .catch(() => {
        if (!cancelled) setDefaultCurrency('USD')
      })
    return () => {
      cancelled = true
    }
  }, [props.apiBase, companyId])

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

  // --- Category Management ---

  function parseChannels(raw: string): string[] {
    return String(raw || '')
      .split(/[\s,]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
  }

  function resetCatForm() {
    setCatCode('')
    setCatParentCode('')
    setCatName('')
    setCatDesc('')
    setCatChannels('website, api, mobile_app')
    setCatRoomSelIncluded(false)
    setCatRoomCatOnly(false)
    setCatActive(true)
  }

  function startCreateCat() {
    resetCatForm()
    setCatView('create')
  }

  function startEditCat(c: PriceCategory) {
    setEditingCode(c.code)
    setCatCode(c.code)
    setCatParentCode(c.parent_code || '')
    setCatName(c.name_i18n?.en || '')
    setCatDesc(c.description_i18n?.en || '')
    setCatChannels((c.enabled_channels || []).join(', '))
    setCatRoomSelIncluded(c.room_selection_included)
    setCatRoomCatOnly(c.room_category_only)
    setCatActive(c.active)
    setCatView('edit')
  }

  async function createCategory() {
    setBusy(true)
    setErr(null)
    try {
      if (!companyId) throw new Error('Select a company first.')
      await apiFetch(props.apiBase, `/v1/pricing/price-categories`, {
        method: 'POST',
        body: {
          code: catCode,
          parent_code: catParentCode || null,
          active: catActive,
          enabled_channels: parseChannels(catChannels),
          room_selection_included: catRoomSelIncluded,
          room_category_only: catRoomCatOnly,
          name_i18n: { en: catName },
          description_i18n: { en: catDesc },
          company_id: companyId,
        },
      })
      await refresh()
      setCatView('list')
      resetCatForm()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function saveCategoryEdit() {
    if (!editingCode) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/pricing/price-categories/${encodeURIComponent(editingCode)}`, {
        method: 'PATCH',
        body: {
          parent_code: catParentCode || null,
          active: catActive,
          enabled_channels: parseChannels(catChannels),
          room_selection_included: catRoomSelIncluded,
          room_category_only: catRoomCatOnly,
          name_i18n: { en: catName },
          description_i18n: { en: catDesc },
        },
      })
      await refresh()
      setCatView('list')
      setEditingCode(null)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteCategory() {
    if (!editingCode) return
    if (!confirm(`Delete category ${editingCode}?`)) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/pricing/price-categories/${encodeURIComponent(editingCode)}`, { method: 'DELETE' })
      await refresh()
      setCatView('list')
      setEditingCode(null)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  // --- Grid Management ---

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

      if (fmt === 'json') {
        const rows = await apiFetch<CruisePriceCell[]>(props.apiBase, `/v1/pricing/cruise-prices?sailing_id=${encodeURIComponent(sid)}`)
        const payload = { company_id: companyId, sailing_id: sid, items: rows || [] }
        downloadText(`cruise-prices-${sid}.json`, JSON.stringify(payload, null, 2) + '\n', 'application/json')
        return
      }

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
    }
  }

  // --- Utils ---

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

  // --- Renderers ---

  function renderCatList() {
    const filtered = (priceCats || []).filter(c => {
        if (!catQ) return true
        const term = catQ.toLowerCase()
        return c.code.toLowerCase().includes(term) || c.name_i18n?.en?.toLowerCase()?.includes(term)
    })
    
    // Sort logic to match backend's likely sort or the tree view requirements
    // Flattening the hierarchy for the table view as per "CRM style" requests usually implying list
    // But we can sort by code
    const sorted = filtered.sort((a, b) => (a.order || 0) - (b.order || 0))

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--csp-surface-bg)', padding: 12, borderRadius: 8, border: '1px solid var(--csp-border)' }}>
                <div style={{ flex: 1 }}>
                    <Input 
                        value={catQ} 
                        onChange={(e) => setCatQ(e.target.value)} 
                        placeholder="Search categories..." 
                        style={{ width: '100%', maxWidth: 400 }}
                    />
                </div>
                <Button variant="primary" onClick={startCreateCat}>New Category</Button>
                <Button variant="secondary" onClick={() => void exportCategoriesJson()}>Export JSON</Button>
            </div>

            <div style={{ border: '1px solid var(--csp-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--csp-surface-bg)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: 'var(--csp-border-strong)', color: 'var(--csp-text)', textAlign: 'left' }}>
                            <th style={styles.th}>Code</th>
                            <th style={styles.th}>Name</th>
                            <th style={styles.th}>Parent</th>
                            <th style={styles.th}>Channels</th>
                            <th style={styles.th}>Active</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(c => (
                            <HoverRow key={c.code} onClick={() => startEditCat(c)}>
                                <td style={styles.td}><Mono>{c.code}</Mono></td>
                                <td style={styles.td}>{c.name_i18n?.en || '—'}</td>
                                <td style={styles.td}>{c.parent_code ? <Mono>{c.parent_code}</Mono> : <span style={{color:'var(--csp-muted)'}}>(none)</span>}</td>
                                <td style={styles.td}>{(c.enabled_channels || []).join(', ')}</td>
                                <td style={styles.td}>
                                    {c.active ? (
                                        <span style={{ color: 'var(--csp-green)', fontWeight: 500 }}>Active</span>
                                    ) : (
                                        <span style={{ color: 'var(--csp-muted)' }}>Inactive</span>
                                    )}
                                </td>
                            </HoverRow>
                        ))}
                         {sorted.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: 'var(--csp-muted)', padding: 32 }}>
                                    No categories found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
  }

  function renderCatForm(mode: 'create' | 'edit') {
    return (
        <Panel 
            title={mode === 'create' ? "Create Price Category" : `Edit Category: ${editingCode}`}
            subtitle="Manage pricing category details."
            right={<Button variant="secondary" onClick={() => setCatView('list')}>Cancel</Button>}
        >
            <div style={{ maxWidth: 600, display: 'grid', gap: 20 }}>
                <TwoCol 
                    left={<Input label="Code" value={catCode} onChange={(e) => setCatCode(e.target.value.replace(/\s+/g, '').toUpperCase())} placeholder="INTERNET" disabled={mode==='edit'} />}
                    right={<Input label="Name (EN)" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Internet Package" />}
                />
                
                <TwoCol 
                    left={
                        <Select label="Parent Category" value={catParentCode} onChange={(e) => setCatParentCode(e.target.value)}>
                            <option value="">(none)</option>
                            {priceCats
                                .filter(x => x.code !== catCode) // can't be parent of self
                                .sort((a, b) => (a.order || 0) - (b.order || 0))
                                .map(c => (
                                    <option key={c.code} value={c.code}>{c.code}</option>
                            ))}
                        </Select>
                    }
                    right={<Input label="Channels (comma-separated)" value={catChannels} onChange={(e) => setCatChannels(e.target.value)} />}
                />

                <TextArea 
                    label="Description (EN)" 
                    value={catDesc} 
                    onChange={(e) => setCatDesc(e.target.value)} 
                    rows={3} 
                />

                <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', color: 'var(--csp-text)' }}>
                        <input type="checkbox" checked={catActive} onChange={(e) => setCatActive(e.target.checked)} /> 
                        <span style={{fontWeight: 500}}>Active</span>
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', color: 'var(--csp-text)' }}>
                        <input
                        type="checkbox"
                        checked={catRoomSelIncluded}
                        onChange={(e) => {
                            setCatRoomSelIncluded(e.target.checked)
                            if (e.target.checked) setCatRoomCatOnly(false)
                        }}
                        />
                        Room Selection Included
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', color: 'var(--csp-text)' }}>
                        <input
                        type="checkbox"
                        checked={catRoomCatOnly}
                        onChange={(e) => {
                            setCatRoomCatOnly(e.target.checked)
                            if (e.target.checked) setCatRoomSelIncluded(false)
                        }}
                        />
                        Room Category Only
                    </label>
                </div>

                <div style={{ paddingTop: 20, borderTop: '1px solid var(--csp-border)', display: 'flex', gap: 12, justifyContent: 'space-between' }}>
                    {mode === 'edit' ? (
                        <Button variant="danger" disabled={busy} onClick={() => void deleteCategory()}>Delete</Button>
                    ) : <div />}
                    
                    <Button variant="primary" disabled={busy || !catCode} onClick={() => void (mode === 'create' ? createCategory() : saveCategoryEdit())}>
                        {busy ? 'Saving...' : (mode === 'create' ? 'Create Category' : 'Save Changes')}
                    </Button>
                </div>
            </div>
        </Panel>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 24, paddingBottom: 48 }}>
      <PageHeader
        title="Pricing & Offers"
        subtitle="Manage pricing categories and cruise price tables."
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

      <div style={{ display: 'grid', gap: 6, padding: '12px 16px', background: 'var(--csp-surface-bg)', border: '1px solid var(--csp-border)', borderRadius: 8 }}>
         <div style={{ fontSize: 13, color: 'var(--csp-muted)' }}>Effective Company</div>
         <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Mono>{company?.id || '(no company selected)'}</Mono>
            {company?.name ? <span style={{ color: 'var(--csp-text)' }}>{company.name}</span> : null}
         </div>
      </div>

      <Tabs
        idBase="pricing"
        value={tab}
        onChange={(k) => {
            setTab(k as any)
            // Reset view when switching tabs if needed, but keeping list is fine
        }}
        tabs={[
          { key: 'categories', label: 'Price Categories', badge: (priceCats || []).filter((c) => c.active).length },
          { key: 'cruise', label: 'Cruise Price Tables' },
        ]}
      />

      {tab === 'categories' && (
          <>
            {catView === 'list' && renderCatList()}
            {catView === 'create' && renderCatForm('create')}
            {catView === 'edit' && renderCatForm('edit')}
          </>
      )}

      {tab === 'cruise' && (
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
            <div style={{ display: 'grid', gap: 16 }}>
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

              <div style={{ overflowX: 'auto', border: '1px solid var(--csp-border)', borderRadius: 8, background: 'var(--csp-surface-bg)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: 'var(--csp-border-strong)', color: 'var(--csp-text)', textAlign: 'left' }}>
                      <th style={styles.th}>Cabin category</th>
                      {priceCats
                        .filter((c) => c.active)
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((pc) => (
                          <th key={pc.code} style={styles.th}>
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
                          <td style={styles.td}>
                            <div style={{ fontWeight: 600 }}>
                              <Mono>{cabinCode}</Mono> · {c.name}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--csp-muted)', marginTop: 4 }}>{c.description || ''}</div>
                          </td>
                          {priceCats
                            .filter((pc) => pc.active)
                            .slice()
                            .sort((a, b) => a.order - b.order)
                            .map((pc) => {
                              const k = `${cabinCode}|${String(pc.code).toLowerCase()}`
                              const cents = Number(gridCells[k] ?? 0)
                              return (
                                <td key={k} style={styles.td}>
                                  <input
                                    style={{
                                      width: 140,
                                      padding: '8px 10px',
                                      borderRadius: 6,
                                      border: '1px solid var(--csp-input-border)',
                                      background: 'var(--csp-input-bg)',
                                      color: 'var(--csp-text)',
                                      fontSize: 13
                                    }}
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={Number.isFinite(cents) ? cents : 0}
                                    onChange={(e) => setGridCells((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
                                    disabled={busy}
                                  />
                                  <div style={{ fontSize: 11, color: 'var(--csp-muted)', marginTop: 4 }}>cents / pax</div>
                                </td>
                              )
                            })}
                        </tr>
                      )
                    })}
                    {gridCabinCats.length === 0 ? (
                      <tr>
                        <td colSpan={1 + (priceCats || []).filter((c) => c.active).length} style={{ padding: 32, textAlign: 'center', color: 'var(--csp-muted)' }}>
                          Load a sailing to view cabin categories and pricing.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
        </Panel>
      )}
    </div>
  )
}

const styles = {
    th: {
        padding: '12px 16px',
        fontWeight: 600,
        fontSize: 12,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        borderBottom: '1px solid var(--csp-border)',
        color: 'var(--csp-muted)'
    },
    td: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--csp-border)',
        color: 'var(--csp-text)',
        verticalAlign: 'top'
    },
    tr: {
        cursor: 'pointer',
        transition: 'background 0.15s ease'
    }
}

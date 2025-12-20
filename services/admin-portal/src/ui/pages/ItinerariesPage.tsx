import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { apiFetch } from '../api/client'
import { Button, ErrorBanner, Input, Mono, PageHeader, Panel, Select, TwoCol } from '../components/ui'

type ItineraryStop = {
  day_offset: number
  kind: 'port' | 'sea'
  image_url: string
  port_code?: string | null
  port_name?: string | null
  arrival_time?: string | null
  departure_time?: string | null
  labels?: Record<string, string> | null
}

type Port = {
  code: string
  names: Record<string, string>
  cities: Record<string, string>
  countries: Record<string, string>
  created_at: string
  updated_at: string
}

type MePrefs = { user_id: string; updated_at: string; preferences: any }

type Itinerary = {
  id: string
  code?: string | null
  titles: Record<string, string>
  stops: ItineraryStop[]
  created_at: string
  updated_at: string
}

type ItineraryDates = { start_date: string; end_date: string; nights: number; days: number }

type TitleRow = { lang: string; text: string }

type ImportItinerary = { code: string; titles: Record<string, string>; stops: ItineraryStop[] }
type ImportPreview = {
  fileName: string
  itineraries: ImportItinerary[]
  warnings: string[]
  errors: string[]
}

function pickTitle(titles: Record<string, string> | undefined, preferred: string[]): string {
  const t = titles || {}
  for (const k of preferred) {
    const v = t[k]
    if (v) return v
  }
  const first = Object.values(t)[0]
  return first || '—'
}

function nextDayOffset(stops: ItineraryStop[]): number {
  if (!stops.length) return 0
  return Math.max(...stops.map((s) => s.day_offset)) + 1
}

function pickI18n(m: Record<string, string> | undefined, preferred: string[]): string {
  const mm = m || {}
  for (const k of preferred) {
    const v = mm[k]
    if (v) return v
  }
  return Object.values(mm)[0] || '—'
}

function normLang(s: unknown): string {
  return String(s || '')
    .trim()
    .toLowerCase()
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 50)
}

function buildTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  const itinerariesSheet = XLSX.utils.json_to_sheet([
    {
      code: 'GREEK-7N',
      title_he: 'איי יוון',
      title_en: 'Greek Isles',
    },
  ])

  const stopsSheet = XLSX.utils.json_to_sheet([
    {
      itinerary_code: 'GREEK-7N',
      day: 1,
      kind: 'port',
      image_url: 'https://cdn.example.com/itineraries/greek-7n/day1.jpg',
      port_code: 'ATH',
      arrival_time: '09:00',
      departure_time: '20:00',
      label_he: 'עלייה לאונייה',
      label_en: 'Embark',
    },
    {
      itinerary_code: 'GREEK-7N',
      day: 2,
      kind: 'sea',
      image_url: 'https://cdn.example.com/itineraries/greek-7n/day2.jpg',
      port_code: '',
      arrival_time: '',
      departure_time: '',
      label_he: 'יום ים',
      label_en: 'Sea day',
    },
  ])

  XLSX.utils.book_append_sheet(wb, itinerariesSheet, 'itineraries')
  XLSX.utils.book_append_sheet(wb, stopsSheet, 'stops')
  return wb
}

function downloadImportTemplate() {
  const wb = buildTemplateWorkbook()
  // xlsx will write & trigger download in browser environments
  XLSX.writeFile(wb, 'itineraries-import-template.xlsx', { compression: true })
}

function sheetToRows(ws: XLSX.WorkSheet | undefined): Record<string, any>[] {
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, any>[]
}

function asStr(x: unknown): string {
  return String(x ?? '').trim()
}

function asInt(x: unknown): number | null {
  const s = String(x ?? '').trim()
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  if (String(i) !== String(n) && !s.match(/^\d+$/)) return null
  return i
}

function buildImportPreview(fileName: string, wb: XLSX.WorkBook): ImportPreview {
  const errors: string[] = []
  const warnings: string[] = []

  const its = sheetToRows(wb.Sheets['itineraries'])
  const stops = sheetToRows(wb.Sheets['stops'])

  if (!its.length) errors.push(`Missing or empty sheet "itineraries".`)
  if (!stops.length) errors.push(`Missing or empty sheet "stops".`)

  const byCode = new Map<string, ImportItinerary>()

  for (let idx = 0; idx < its.length; idx++) {
    const r = its[idx]
    const code = asStr(r.code)
    if (!code) {
      errors.push(`itineraries row ${idx + 2}: "code" is required.`)
      continue
    }
    if (byCode.has(code)) {
      errors.push(`itineraries row ${idx + 2}: duplicate "code" (${code}).`)
      continue
    }
    const titles: Record<string, string> = {}
    const he = asStr(r.title_he)
    const en = asStr(r.title_en)
    if (he) titles.he = he
    if (en) titles.en = en
    if (!he && !en) warnings.push(`itineraries row ${idx + 2} (${code}): no title provided (title_he/title_en).`)

    byCode.set(code, { code, titles, stops: [] })
  }

  // Group stops by itinerary_code and build day offsets
  const stopsByCode = new Map<string, { rowNum: number; day: number; kind: string; r: Record<string, any> }[]>()
  for (let idx = 0; idx < stops.length; idx++) {
    const r = stops[idx]
    const rowNum = idx + 2
    const itineraryCode = asStr(r.itinerary_code)
    if (!itineraryCode) {
      errors.push(`stops row ${rowNum}: "itinerary_code" is required.`)
      continue
    }
    const day = asInt(r.day)
    if (day === null || day < 1) {
      errors.push(`stops row ${rowNum} (${itineraryCode}): "day" must be a positive integer (1..N).`)
      continue
    }
    const kind = asStr(r.kind).toLowerCase()
    if (kind !== 'port' && kind !== 'sea') {
      errors.push(`stops row ${rowNum} (${itineraryCode} day ${day}): "kind" must be "port" or "sea".`)
      continue
    }
    if (!stopsByCode.has(itineraryCode)) stopsByCode.set(itineraryCode, [])
    stopsByCode.get(itineraryCode)!.push({ rowNum, day, kind, r })
  }

  for (const [code, stopRows] of stopsByCode.entries()) {
    const it = byCode.get(code)
    if (!it) {
      errors.push(`stops: itinerary_code "${code}" does not exist in sheet "itineraries".`)
      continue
    }
    stopRows.sort((a, b) => a.day - b.day)

    // Build contiguous offsets starting at 0 based on sorted day values.
    // If days are not contiguous (1,2,4), we will re-number contiguously but warn.
    const days = stopRows.map((x) => x.day)
    for (let i = 0; i < days.length; i++) {
      if (days[i] !== i + 1) {
        warnings.push(`stops (${code}): days are not contiguous starting at 1; they will be re-numbered by row order.`)
        break
      }
    }

    const builtStops: ItineraryStop[] = []
    for (let i = 0; i < stopRows.length; i++) {
      const x = stopRows[i]
      const dayOffset = i
      const imageUrl = asStr(x.r.image_url)
      if (!imageUrl) errors.push(`stops row ${x.rowNum} (${code} day ${x.day}): "image_url" is required.`)

      if (x.kind === 'sea') {
        const labels: Record<string, string> = {}
        const lh = asStr(x.r.label_he)
        const le = asStr(x.r.label_en)
        if (lh) labels.he = lh
        if (le) labels.en = le
        builtStops.push({ day_offset: dayOffset, kind: 'sea', image_url: imageUrl, labels: Object.keys(labels).length ? labels : null })
        continue
      }

      const portCode = asStr(x.r.port_code)
      if (!portCode) errors.push(`stops row ${x.rowNum} (${code} day ${x.day}): "port_code" is required for port days.`)

      const arrival = asStr(x.r.arrival_time) || null
      const depart = asStr(x.r.departure_time) || null

      const labels: Record<string, string> = {}
      const lh = asStr(x.r.label_he)
      const le = asStr(x.r.label_en)
      if (lh) labels.he = lh
      if (le) labels.en = le

      builtStops.push({
        day_offset: dayOffset,
        kind: 'port',
        image_url: imageUrl,
        port_code: portCode,
        port_name: null,
        arrival_time: arrival,
        departure_time: depart,
        labels: Object.keys(labels).length ? labels : null,
      })
    }

    it.stops = builtStops
  }

  for (const [code, it] of byCode.entries()) {
    if (!it.stops.length) warnings.push(`itineraries (${code}): no stops found in sheet "stops".`)
  }

  const itineraries = Array.from(byCode.values()).filter((x) => x.code)
  if (!itineraries.length) errors.push('No itineraries to import.')

  return { fileName, itineraries, warnings, errors }
}

export function ItinerariesPage(props: { apiBase: string }) {
  const [items, setItems] = useState<Itinerary[]>([])
  const [ports, setPorts] = useState<Port[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [preferredLang, setPreferredLang] = useState('he')
  const preferred = useMemo(() => [preferredLang, 'he', 'en'], [preferredLang])

  const [view, setView] = useState<'list' | 'create' | 'import'>('list')
  const [q, setQ] = useState('')

  // create form
  const [code, setCode] = useState('')
  const [titles, setTitles] = useState<TitleRow[]>([
    { lang: 'he', text: '' },
    { lang: 'en', text: '' },
  ])
  const [stops, setStops] = useState<ItineraryStop[]>([
    {
      day_offset: 0,
      kind: 'port',
      image_url: '',
      port_code: '',
      port_name: '',
      arrival_time: '09:00',
      departure_time: '20:00',
      labels: { he: '', en: 'Embark' },
    },
  ])

  // compute / preview
  const [selectedId, setSelectedId] = useState<string>('')
  const [computeStartDate, setComputeStartDate] = useState<string>('')
  const [computed, setComputed] = useState<ItineraryDates | null>(null)

  const listEndpoint = useMemo(() => `/v1/itineraries`, [])

  const fileRef = useRef<HTMLInputElement | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; current?: string } | null>(null)

  const portsByCode = useMemo(() => {
    const m = new Map<string, Port>()
    for (const p of ports) m.set(String(p.code || '').trim(), p)
    return m
  }, [ports])

  const selectedItinerary = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const sorted = [...(items || [])].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    if (!needle) return sorted
    return sorted.filter((i) => {
      const codeStr = String(i.code || '').toLowerCase()
      const titleStr = Object.values(i.titles || {})
        .join(' ')
        .toLowerCase()
      const portsStr = itineraryPortsSummary(i).toLowerCase()
      return codeStr.includes(needle) || titleStr.includes(needle) || portsStr.includes(needle) || String(i.id).toLowerCase().includes(needle)
    })
  }, [items, q, portsByCode])

  async function loadPrefs() {
    try {
      const r = await apiFetch<MePrefs>(props.apiBase, `/v1/staff/me/preferences`)
      const loc = String(r?.preferences?.locale || 'he').trim() || 'he'
      setPreferredLang(loc)
    } catch {
      // prefs should never block screen
      setPreferredLang('he')
    }
  }

  async function refresh() {
    const r = await apiFetch<Itinerary[]>(props.apiBase, listEndpoint, { auth: false, tenant: false })
    setItems(r || [])
    if (!selectedId && r?.length) setSelectedId(r[0].id)
  }

  useEffect(() => {
    loadPrefs().catch(() => null)
    refresh().catch((e: any) => setErr(String(e?.detail || e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listEndpoint])

  useEffect(() => {
    apiFetch<Port[]>(props.apiBase, `/v1/ports`, { auth: false, tenant: false })
      .then((r) => setPorts(r || []))
      .catch(() => setPorts([]))
  }, [props.apiBase])

  async function createItinerary() {
    setBusy(true)
    setErr(null)
    try {
      const titlesObj: Record<string, string> = {}
      for (const row of titles) {
        const k = normLang(row.lang)
        const v = row.text.trim()
        if (k && v) titlesObj[k] = v
      }

      const payload = {
        code: code.trim() ? code.trim() : null,
        titles: titlesObj,
        stops,
      }

      await apiFetch(props.apiBase, `/v1/itineraries`, { method: 'POST', body: payload, auth: true, tenant: false })

      setCode('')
      setTitles([
        { lang: 'he', text: '' },
        { lang: 'en', text: '' },
      ])
      setStops([
        {
          day_offset: 0,
          kind: 'port',
          image_url: '',
          port_code: '',
          port_name: '',
          arrival_time: '09:00',
          departure_time: '20:00',
          labels: { he: '', en: 'Embark' },
        },
      ])
      await refresh()
      setView('list')
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function computeDates() {
    if (!selectedId || !computeStartDate) return
    setBusy(true)
    setErr(null)
    try {
      const r = await apiFetch<ItineraryDates>(props.apiBase, `/v1/itineraries/${encodeURIComponent(selectedId)}/compute?start_date=${encodeURIComponent(computeStartDate)}`, {
        auth: false,
        tenant: false,
      })
      setComputed(r)
    } catch (e: any) {
      setComputed(null)
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function setStop(idx: number, patch: Partial<ItineraryStop>) {
    setStops((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  function removeStop(idx: number) {
    setStops((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      // re-number day_offset contiguously starting at 0 (required by API)
      return next.map((s, i) => ({ ...s, day_offset: i }))
    })
  }

  function addStop(kind: 'port' | 'sea') {
    setStops((prev) => {
      const d = nextDayOffset(prev)
      if (kind === 'sea') {
        return [...prev, { day_offset: d, kind: 'sea', image_url: '', labels: { he: '', en: 'Sea day' } }]
      }
      return [
        ...prev,
        {
          day_offset: d,
          kind: 'port',
          image_url: '',
          port_code: '',
          port_name: '',
          arrival_time: '08:00',
          departure_time: '18:00',
          labels: { he: '', en: `Port day ${d + 1}` },
        },
      ]
    })
  }

  function setTitleRow(idx: number, patch: Partial<TitleRow>) {
    setTitles((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  function addTitleRow() {
    setTitles((prev) => [...prev, { lang: '', text: '' }])
  }

  function removeTitleRow(idx: number) {
    setTitles((prev) => prev.filter((_, i) => i !== idx))
  }

  function portDisplayForCode(code: string | null | undefined): string {
    const c = String(code || '').trim()
    if (!c) return '—'
    const p = portsByCode.get(c)
    if (!p) return c
    const name = pickI18n(p.names, preferred)
    const city = pickI18n(p.cities, preferred)
    const country = pickI18n(p.countries, preferred)
    return `${p.code} · ${name} · ${city}, ${country}`
  }

  function itineraryPortsSummary(i: Itinerary): string {
    const codes: string[] = []
    for (const s of i.stops || []) {
      if (s.kind !== 'port') continue
      const c = String(s.port_code || '').trim()
      if (!c) continue
      if (!codes.includes(c)) codes.push(c)
    }
    if (!codes.length) return '—'
    // keep it compact for the table
    return codes.map((c) => portsByCode.get(c)?.code || c).join(' → ')
  }

  async function onPickImportFile(f: File | null) {
    setErr(null)
    setImportPreview(null)
    setImportProgress(null)
    if (!f) return
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      setImportPreview(buildImportPreview(f.name, wb))
    } catch (e: any) {
      setErr(String(e?.message || e))
    }
  }

  async function runImport() {
    if (!importPreview) return
    if (importPreview.errors.length) return
    const its = importPreview.itineraries.filter((x) => x.stops.length)
    if (!its.length) {
      setErr('Nothing to import (no itineraries with stops).')
      return
    }
    setBusy(true)
    setErr(null)
    setImportProgress({ done: 0, total: its.length })
    try {
      for (let i = 0; i < its.length; i++) {
        const it = its[i]
        setImportProgress({ done: i, total: its.length, current: it.code })
        await apiFetch(props.apiBase, `/v1/itineraries`, {
          method: 'POST',
          body: { code: it.code, titles: it.titles, stops: it.stops },
          auth: true,
          tenant: false,
        })
      }
      setImportProgress({ done: its.length, total: its.length })
      await refresh()
      setView('list')
      setImportPreview(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title="Itineraries"
        subtitle="Manage reusable itineraries (multilingual titles + day-by-day port/sea plan). Import from Excel, create new ones, and preview/compute dates."
        right={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={segWrap}>
              <button style={view === 'list' ? segActive : segBtn} onClick={() => setView('list')} disabled={busy}>
                List
              </button>
              <button style={view === 'create' ? segActive : segBtn} onClick={() => setView('create')} disabled={busy}>
                New
              </button>
              <button style={view === 'import' ? segActive : segBtn} onClick={() => setView('import')} disabled={busy}>
                Import
              </button>
            </div>
            <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      <TwoCol
        left={
          view === 'create' ? (
            <Panel title="New itinerary" subtitle="Tip: start with titles (he/en), then add day-by-day stops.">
              <div style={{ display: 'grid', gap: 10 }}>
                <Input label="Itinerary code (optional)" value={code} onChange={(e) => setCode(e.target.value)} placeholder="GREEK-7N" />

                <Panel title="Titles" subtitle="Default languages are he + en. You can add more languages if needed.">
                  <div style={{ display: 'grid', gap: 10 }}>
                    {titles.map((t, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 8, alignItems: 'end' }}>
                        <Input label="Lang" value={t.lang} onChange={(e) => setTitleRow(idx, { lang: e.target.value })} placeholder="he" />
                        <Input label="Title" value={t.text} onChange={(e) => setTitleRow(idx, { text: e.target.value })} placeholder="איי יוון / Greek Isles" />
                        <Button variant="danger" disabled={busy || titles.length <= 1} onClick={() => removeTitleRow(idx)}>
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button variant="secondary" disabled={busy} onClick={addTitleRow}>
                      Add language
                    </Button>
                  </div>
                </Panel>

                <Panel
                  title={`Stops (${stops.length} days)`}
                  subtitle="Day offsets are saved contiguously starting at 0. Port days require port code and image URL."
                  right={
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button variant="secondary" disabled={busy} onClick={() => addStop('port')}>
                        Add port day
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => addStop('sea')}>
                        Add sea day
                      </Button>
                    </div>
                  }
                >
                  <div style={{ display: 'grid', gap: 10 }}>
                    {stops.map((s, idx) => (
                      <div key={`${s.day_offset}-${idx}`} style={{ border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 900 }}>
                            Day <Mono>{s.day_offset + 1}</Mono> · <Mono>{s.kind}</Mono>
                          </div>
                          <Button variant="danger" disabled={busy || stops.length <= 1} onClick={() => removeStop(idx)}>
                            Remove day
                          </Button>
                        </div>

                        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                          <Select
                            label="Kind"
                            value={s.kind}
                            onChange={(e) => {
                              const kind = e.target.value as 'port' | 'sea'
                              if (kind === 'sea') {
                                setStop(idx, { kind, port_code: null, port_name: null, arrival_time: null, departure_time: null })
                              } else {
                                setStop(idx, { kind, port_code: '', port_name: '', arrival_time: '08:00', departure_time: '18:00' })
                              }
                            }}
                          >
                            <option value="port">port</option>
                            <option value="sea">sea</option>
                          </Select>

                          <Input
                            label="Image URL"
                            value={s.image_url || ''}
                            onChange={(e) => setStop(idx, { image_url: e.target.value })}
                            placeholder="https://cdn.example.com/itineraries/day1.jpg"
                          />

                          {s.kind === 'port' ? (
                            <div style={{ display: 'grid', gap: 10 }}>
                              {ports.length ? (
                                <Select
                                  label="Port"
                                  value={String(s.port_code || '')}
                                  onChange={(e) => setStop(idx, { port_code: e.target.value, port_name: null })}
                                  hint="Pick a managed port code (localized name/city/country come from Ports screen)."
                                >
                                  <option value="">(select)</option>
                                  {ports.map((p) => (
                                    <option key={p.code} value={p.code}>
                                      {p.code} · {pickI18n(p.names, ['he', 'en'])} · {pickI18n(p.cities, ['he', 'en'])}, {pickI18n(p.countries, ['he', 'en'])}
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                <Input
                                  label="Port code"
                                  value={String(s.port_code || '')}
                                  onChange={(e) => setStop(idx, { port_code: e.target.value, port_name: null })}
                                  placeholder="ATH"
                                  hint="No managed ports yet. Create ports first to enable the picker."
                                />
                              )}

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Input
                                  label="Arrival time (HH:MM)"
                                  value={String(s.arrival_time || '')}
                                  onChange={(e) => setStop(idx, { arrival_time: e.target.value })}
                                  placeholder="08:00"
                                />
                                <Input
                                  label="Departure time (HH:MM)"
                                  value={String(s.departure_time || '')}
                                  onChange={(e) => setStop(idx, { departure_time: e.target.value })}
                                  placeholder="18:00"
                                />
                              </div>
                            </div>
                          ) : (
                            <div style={{ color: 'rgba(230,237,243,0.65)', fontSize: 12, lineHeight: 1.35 }}>Sea day: no port code/time fields.</div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Input
                              label="Label (he) (optional)"
                              value={String(s.labels?.he || '')}
                              onChange={(e) => setStop(idx, { labels: { ...(s.labels || {}), he: e.target.value } })}
                              placeholder={s.kind === 'sea' ? 'יום ים' : 'עלייה / ירידה'}
                            />
                            <Input
                              label="Label (en) (optional)"
                              value={String(s.labels?.en || '')}
                              onChange={(e) => setStop(idx, { labels: { ...(s.labels || {}), en: e.target.value } })}
                              placeholder={s.kind === 'sea' ? 'Sea day' : 'Embark / Debark'}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Button
                  variant="primary"
                  disabled={
                    busy ||
                    stops.length < 1 ||
                    stops.some((s) => !String(s.image_url || '').trim()) ||
                    stops.some((s) => s.kind === 'port' && !String(s.port_code || '').trim())
                  }
                  onClick={() => void createItinerary()}
                >
                  {busy ? 'Saving…' : 'Create itinerary'}
                </Button>
              </div>
            </Panel>
          ) : view === 'import' ? (
            <Panel title="Import from Excel" subtitle="Download the template, fill it out, then upload to create itineraries in bulk.">
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="secondary" disabled={busy} onClick={downloadImportTemplate}>
                    Download template
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (fileRef.current) fileRef.current.click()
                    }}
                  >
                    Choose file…
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={(e) => void onPickImportFile(e.target.files?.[0] || null)}
                  />
                </div>

                <div style={{ color: 'rgba(230,237,243,0.70)', fontSize: 12, lineHeight: 1.45 }}>
                  Sheets required: <Mono>itineraries</Mono> and <Mono>stops</Mono>. Default languages are <Mono>he</Mono> + <Mono>en</Mono>.
                </div>

                {importPreview ? (
                  <Panel
                    title={`Preview: ${importPreview.fileName}`}
                    subtitle={`${importPreview.itineraries.length} itineraries parsed · ${importPreview.errors.length} errors · ${importPreview.warnings.length} warnings`}
                    right={
                      <Button variant="primary" disabled={busy || importPreview.errors.length > 0} onClick={() => void runImport()}>
                        {busy ? 'Importing…' : 'Import'}
                      </Button>
                    }
                  >
                    <div style={{ display: 'grid', gap: 10 }}>
                      {importProgress ? (
                        <div style={{ fontSize: 13 }}>
                          Progress: <Mono>{importProgress.done}</Mono>/<Mono>{importProgress.total}</Mono>
                          {importProgress.current ? (
                            <span>
                              {' '}
                              · current: <Mono>{importProgress.current}</Mono>
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {importPreview.errors.length ? (
                        <div style={{ whiteSpace: 'pre-wrap', color: '#ffb4ae', fontSize: 12 }}>
                          {importPreview.errors.slice(0, 14).map((x) => `• ${x}`).join('\n')}
                          {importPreview.errors.length > 14 ? `\n• …and ${importPreview.errors.length - 14} more` : ''}
                        </div>
                      ) : null}

                      {importPreview.warnings.length ? (
                        <div style={{ whiteSpace: 'pre-wrap', color: 'rgba(230,237,243,0.70)', fontSize: 12 }}>
                          {importPreview.warnings.slice(0, 10).map((x) => `• ${x}`).join('\n')}
                          {importPreview.warnings.length > 10 ? `\n• …and ${importPreview.warnings.length - 10} more` : ''}
                        </div>
                      ) : null}

                      <div style={{ overflow: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th style={th}>Code</th>
                              <th style={th}>Title (he/en)</th>
                              <th style={th}>Days</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.itineraries.slice(0, 50).map((it) => (
                              <tr key={it.code}>
                                <td style={tdMono}>{it.code}</td>
                                <td style={td}>
                                  <div style={{ display: 'grid', gap: 4 }}>
                                    <div>
                                      he: <Mono>{it.titles.he || '—'}</Mono>
                                    </div>
                                    <div>
                                      en: <Mono>{it.titles.en || '—'}</Mono>
                                    </div>
                                  </div>
                                </td>
                                <td style={tdMono}>{String(it.stops.length)}</td>
                              </tr>
                            ))}
                            {importPreview.itineraries.length > 50 ? (
                              <tr>
                                <td colSpan={3} style={tdMuted}>
                                  Showing first 50.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </Panel>
                ) : (
                  <div style={{ color: 'rgba(230,237,243,0.60)' }}>Upload an Excel file to see a preview.</div>
                )}
              </div>
            </Panel>
          ) : (
            <Panel title="List" subtitle="Search and select an itinerary to see details on the right.">
              <div style={{ display: 'grid', gap: 10 }}>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code / title / ports / id…" />
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={th}>Code</th>
                        <th style={th}>Title</th>
                        <th style={th}>Days</th>
                        <th style={th}>Ports</th>
                        <th style={th}>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((i) => {
                        const active = i.id === selectedId
                        return (
                          <tr
                            key={i.id}
                            onClick={() => setSelectedId(i.id)}
                            style={{
                              cursor: 'pointer',
                              background: active ? 'rgba(56,139,253,0.10)' : undefined,
                              outline: active ? '1px solid rgba(56,139,253,0.25)' : undefined,
                            }}
                          >
                            <td style={tdMono}>{String(i.code || '—')}</td>
                            <td style={td}>{pickTitle(i.titles, preferred)}</td>
                            <td style={tdMono}>{String(i.stops?.length || 0)}</td>
                            <td style={tdMono}>{itineraryPortsSummary(i)}</td>
                            <td style={tdMono}>{String(i.updated_at || '').slice(0, 10) || '—'}</td>
                          </tr>
                        )
                      })}
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={tdMuted}>
                            No itineraries match your search.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="primary" disabled={busy} onClick={() => setView('create')}>
                    New itinerary
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => setView('import')}>
                    Import from Excel
                  </Button>
                </div>
              </div>
            </Panel>
          )
        }
        right={
          <div style={{ display: 'grid', gap: 12 }}>
            <Panel
              title={selectedItinerary ? 'Details' : 'Details'}
              subtitle={selectedItinerary ? 'Preview stops and compute end date for a given start date.' : 'Select an itinerary from the list to see details.'}
              right={
                <Select label="Display lang" value={preferredLang} onChange={(e) => setPreferredLang(e.target.value)}>
                  <option value="he">he</option>
                  <option value="en">en</option>
                  <option value="ar">ar</option>
                  <option value="fr">fr</option>
                  <option value="es">es</option>
                  <option value={preferredLang}>{preferredLang}</option>
                </Select>
              }
            >
              {selectedItinerary ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                    <div>
                      Code: <Mono>{String(selectedItinerary.code || '—')}</Mono>
                    </div>
                    <div>
                      Title: <Mono>{pickTitle(selectedItinerary.titles, preferred)}</Mono>
                    </div>
                    <div>
                      Id: <Mono>{selectedItinerary.id}</Mono>
                    </div>
                    <div>
                      Updated: <Mono>{String(selectedItinerary.updated_at || '—')}</Mono>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                    <Input label="Compute end date from start date" type="date" value={computeStartDate} onChange={(e) => setComputeStartDate(e.target.value)} />
                    <Button variant="primary" disabled={busy || !selectedId || !computeStartDate} onClick={() => void computeDates()}>
                      Compute
                    </Button>
                  </div>

                  {computed ? (
                    <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                      <div>
                        End date: <Mono>{computed.end_date}</Mono>
                      </div>
                      <div>
                        Nights: <Mono>{computed.nights}</Mono> · Days: <Mono>{computed.days}</Mono>
                      </div>
                    </div>
                  ) : null}

                  <Panel title="Stops preview" subtitle="Ports are resolved via Ports screen by port code.">
                    <div style={{ display: 'grid', gap: 8 }}>
                      {(selectedItinerary.stops || []).map((s, idx) => (
                        <div
                          key={`${selectedItinerary.id}-${s.day_offset}-${idx}`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '70px 1fr',
                            gap: 10,
                            padding: '10px 12px',
                            border: '1px solid rgba(255,255,255,0.10)',
                            borderRadius: 12,
                            background: 'rgba(255,255,255,0.03)',
                          }}
                        >
                          <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 12, color: 'rgba(230,237,243,0.75)' }}>
                            Day {s.day_offset + 1}
                          </div>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontWeight: 800 }}>
                              <Mono>{s.kind}</Mono>
                              {s.kind === 'port' ? (
                                <span style={{ marginLeft: 8 }}>{portDisplayForCode(s.port_code) || '—'}</span>
                              ) : (
                                <span style={{ marginLeft: 8, color: 'rgba(230,237,243,0.70)' }}>Sea day</span>
                              )}
                            </div>
                            {s.kind === 'port' ? (
                              <div style={{ fontSize: 12, color: 'rgba(230,237,243,0.70)' }}>
                                Arrive: <Mono>{String(s.arrival_time || '—')}</Mono> · Depart: <Mono>{String(s.departure_time || '—')}</Mono>
                              </div>
                            ) : null}
                            {s.labels ? (
                              <div style={{ fontSize: 12, color: 'rgba(230,237,243,0.70)' }}>
                                Label: <Mono>{pickI18n(s.labels || undefined, preferred)}</Mono>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      {(!selectedItinerary.stops || selectedItinerary.stops.length === 0) ? <div style={{ color: 'rgba(230,237,243,0.60)' }}>No stops.</div> : null}
                    </div>
                  </Panel>
                </div>
              ) : (
                <div style={{ color: 'rgba(230,237,243,0.60)' }}>Select an itinerary to preview stops and compute dates.</div>
              )}
            </Panel>
          </div>
        }
      />
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
const td: React.CSSProperties = { padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' }
const tdMono: React.CSSProperties = {
  padding: '10px 8px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  verticalAlign: 'top',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
}
const tdMuted: React.CSSProperties = { padding: '14px 8px', color: 'rgba(230,237,243,0.60)' }

const segWrap: React.CSSProperties = {
  display: 'inline-flex',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  overflow: 'hidden',
  background: 'rgba(0,0,0,0.18)',
}
const segBtn: React.CSSProperties = {
  padding: '10px 12px',
  background: 'transparent',
  border: '0',
  color: 'rgba(230,237,243,0.85)',
  cursor: 'pointer',
  fontWeight: 900,
}
const segActive: React.CSSProperties = {
  padding: '10px 12px',
  background: 'var(--csp-primary-soft, rgba(56,139,253,0.22))',
  border: '0',
  color: '#e6edf3',
  cursor: 'pointer',
  fontWeight: 900,
}


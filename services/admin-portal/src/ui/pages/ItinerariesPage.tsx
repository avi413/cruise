import React, { useEffect, useMemo, useState } from 'react'
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

export function ItinerariesPage(props: { apiBase: string }) {
  const [items, setItems] = useState<Itinerary[]>([])
  const [ports, setPorts] = useState<Port[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [preferredLang, setPreferredLang] = useState('en')
  const preferred = useMemo(() => [preferredLang, 'en'], [preferredLang])

  // create form
  const [code, setCode] = useState('')
  const [titles, setTitles] = useState<TitleRow[]>([
    { lang: 'en', text: '' },
    { lang: 'ar', text: '' },
  ])
  const [stops, setStops] = useState<ItineraryStop[]>([
    { day_offset: 0, kind: 'port', image_url: '', port_code: '', port_name: '', arrival_time: '09:00', departure_time: '20:00', labels: { en: 'Embark' } },
  ])

  // compute / preview
  const [selectedId, setSelectedId] = useState<string>('')
  const [computeStartDate, setComputeStartDate] = useState<string>('')
  const [computed, setComputed] = useState<ItineraryDates | null>(null)

  const listEndpoint = useMemo(() => `/v1/itineraries`, [])

  const portsByCode = useMemo(() => {
    const m = new Map<string, Port>()
    for (const p of ports) m.set(String(p.code || '').trim(), p)
    return m
  }, [ports])

  const selectedItinerary = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId])

  async function loadPrefs() {
    try {
      const r = await apiFetch<MePrefs>(props.apiBase, `/v1/staff/me/preferences`)
      const loc = String(r?.preferences?.locale || 'en').trim() || 'en'
      setPreferredLang(loc)
    } catch {
      // prefs should never block screen
      setPreferredLang('en')
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
        const k = row.lang.trim()
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
        { lang: 'en', text: '' },
        { lang: 'ar', text: '' },
      ])
      setStops([{ day_offset: 0, kind: 'port', image_url: '', port_code: '', port_name: '', arrival_time: '09:00', departure_time: '20:00', labels: { en: 'Embark' } }])
      await refresh()
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
        return [...prev, { day_offset: d, kind: 'sea', image_url: '', labels: { en: 'Sea day' } }]
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
          labels: { en: `Port day ${d + 1}` },
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

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title="Itineraries"
        subtitle="Create a reusable itinerary (multilingual title + day-by-day port/sea plan with an image per day). Then use it to generate sailings by start date."
        right={
          <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>
            Refresh
          </Button>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      <TwoCol
        left={
          <Panel title="Create itinerary" subtitle="Day offsets must be contiguous from 0. Each day needs an image URL.">
            <div style={{ display: 'grid', gap: 10 }}>
              <Input label="Itinerary code (optional)" value={code} onChange={(e) => setCode(e.target.value)} placeholder="GREEK-7N" />

              <Panel title="Titles (languages)" subtitle="Add one or more titles keyed by language code (en, ar, fr…).">
                <div style={{ display: 'grid', gap: 10 }}>
                  {titles.map((t, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 8, alignItems: 'end' }}>
                      <Input label="Lang" value={t.lang} onChange={(e) => setTitleRow(idx, { lang: e.target.value })} placeholder="en" />
                      <Input label="Title" value={t.text} onChange={(e) => setTitleRow(idx, { text: e.target.value })} placeholder="Greek Isles" />
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
                subtitle="Port days require port code. Sea days have no port fields."
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
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
                                    {p.code} · {pickI18n(p.names, ['en', 'ar'])} · {pickI18n(p.cities, ['en', 'ar'])}, {pickI18n(p.countries, ['en', 'ar'])}
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
                              <Input label="Arrival time (HH:MM)" value={String(s.arrival_time || '')} onChange={(e) => setStop(idx, { arrival_time: e.target.value })} placeholder="08:00" />
                              <Input label="Departure time (HH:MM)" value={String(s.departure_time || '')} onChange={(e) => setStop(idx, { departure_time: e.target.value })} placeholder="18:00" />
                            </div>
                          </div>
                        ) : (
                          <div style={{ color: 'rgba(230,237,243,0.65)', fontSize: 12, lineHeight: 1.35 }}>
                            Sea day: no port code/time fields.
                          </div>
                        )}

                        <Input
                          label="Label (en) (optional)"
                          value={String(s.labels?.en || '')}
                          onChange={(e) => setStop(idx, { labels: { ...(s.labels || {}), en: e.target.value } })}
                          placeholder={s.kind === 'sea' ? 'Day at sea' : 'Embark / Debark'}
                        />
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
        }
        right={
          <div style={{ display: 'grid', gap: 12 }}>
            <Panel title={`Existing itineraries (${items.length})`} subtitle="Select one to compute dates or to use when creating sailings.">
              <div style={{ display: 'grid', gap: 10 }}>
                <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {String(i.code || i.id).slice(0, 18)} · {pickTitle(i.titles, ['en', 'ar'])}
                    </option>
                  ))}
                </Select>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                  <Input label="Start date" type="date" value={computeStartDate} onChange={(e) => setComputeStartDate(e.target.value)} />
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

                <Panel
                  title="Stops preview"
                  subtitle="Ports shown here are resolved from the Ports screen by port code."
                  right={
                    <Select label="Display lang" value={preferredLang} onChange={(e) => setPreferredLang(e.target.value)}>
                      <option value="en">en</option>
                      <option value="ar">ar</option>
                      <option value="fr">fr</option>
                      <option value="es">es</option>
                      <option value={preferredLang}>{preferredLang}</option>
                    </Select>
                  }
                >
                  {selectedItinerary ? (
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
                          </div>
                        </div>
                      ))}
                      {(!selectedItinerary.stops || selectedItinerary.stops.length === 0) ? (
                        <div style={{ color: 'rgba(230,237,243,0.60)' }}>No stops.</div>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ color: 'rgba(230,237,243,0.60)' }}>Select an itinerary to preview stops.</div>
                  )}
                </Panel>

                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={th}>Code</th>
                        <th style={th}>Title</th>
                        <th style={th}>Days</th>
                        <th style={th}>Ports</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i) => (
                        <tr key={i.id}>
                          <td style={tdMono}>{String(i.code || '—')}</td>
                          <td style={td}>{pickTitle(i.titles, ['en', 'ar'])}</td>
                          <td style={tdMono}>{String(i.stops?.length || 0)}</td>
                          <td style={tdMono}>{itineraryPortsSummary(i)}</td>
                        </tr>
                      ))}
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={tdMuted}>
                            No itineraries yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
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


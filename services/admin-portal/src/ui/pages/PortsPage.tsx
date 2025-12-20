import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { Button, ErrorBanner, Input, Mono, PageHeader, Panel, Select, TwoCol } from '../components/ui'

type Port = {
  code: string
  names: Record<string, string>
  cities: Record<string, string>
  countries: Record<string, string>
  created_at: string
  updated_at: string
}

type MePrefs = { user_id: string; updated_at: string; preferences: any }

type Row = { lang: string; name: string; city: string; country: string }

function pickI18n(m: Record<string, string> | undefined, preferred: string[]): string {
  const mm = m || {}
  for (const k of preferred) {
    const v = mm[k]
    if (v) return v
  }
  return Object.values(mm)[0] || '—'
}

function rowsToMaps(rows: Row[]) {
  const names: Record<string, string> = {}
  const cities: Record<string, string> = {}
  const countries: Record<string, string> = {}
  for (const r of rows) {
    const lang = r.lang.trim()
    if (!lang) continue
    if (r.name.trim()) names[lang] = r.name.trim()
    if (r.city.trim()) cities[lang] = r.city.trim()
    if (r.country.trim()) countries[lang] = r.country.trim()
  }
  return { names, cities, countries }
}

function portToRows(p: Port): Row[] {
  const langs = new Set<string>([...Object.keys(p.names || {}), ...Object.keys(p.cities || {}), ...Object.keys(p.countries || {})])
  const sorted = Array.from(langs).sort()
  return sorted.length
    ? sorted.map((lang) => ({ lang, name: p.names?.[lang] || '', city: p.cities?.[lang] || '', country: p.countries?.[lang] || '' }))
    : [
        { lang: 'en', name: '', city: '', country: '' },
        { lang: 'he', name: '', city: '', country: '' },
      ]
}

export function PortsPage(props: { apiBase: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [preferredLang, setPreferredLang] = useState('en')
  const preferred = useMemo(() => [preferredLang, 'en', 'he'], [preferredLang])

  const [q, setQ] = useState('')
  const [ports, setPorts] = useState<Port[]>([])

  // create
  const [code, setCode] = useState('')
  const [rows, setRows] = useState<Row[]>([
    { lang: 'en', name: '', city: '', country: '' },
    { lang: 'he', name: '', city: '', country: '' },
  ])

  // edit
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [editRows, setEditRows] = useState<Row[]>([
    { lang: 'en', name: '', city: '', country: '' },
    { lang: 'he', name: '', city: '', country: '' },
  ])

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
    const qp = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
    const r = await apiFetch<Port[]>(props.apiBase, `/v1/ports${qp}`, { auth: false, tenant: false })
    setPorts(r || [])
    if (!selectedCode && r?.length) setSelectedCode(r[0].code)
  }

  useEffect(() => {
    loadPrefs().catch(() => null)
    refresh().catch((e: any) => setErr(String(e?.detail || e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    refresh().catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useEffect(() => {
    const p = ports.find((x) => x.code === selectedCode)
    if (!p) return
    setEditRows(portToRows(p))
  }, [ports, selectedCode])

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  function setEditRow(idx: number, patch: Partial<Row>) {
    setEditRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  function addRow() {
    setRows((prev) => [...prev, { lang: '', name: '', city: '', country: '' }])
  }

  function addEditRow() {
    setEditRows((prev) => [...prev, { lang: '', name: '', city: '', country: '' }])
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  function removeEditRow(idx: number) {
    setEditRows((prev) => prev.filter((_, i) => i !== idx))
  }

  async function createPort() {
    setBusy(true)
    setErr(null)
    try {
      const maps = rowsToMaps(rows)
      await apiFetch(props.apiBase, `/v1/ports`, {
        method: 'POST',
        body: { code: code.trim(), ...maps },
        auth: true,
        tenant: false,
      })
      setCode('')
      setRows([
        { lang: 'en', name: '', city: '', country: '' },
        { lang: 'he', name: '', city: '', country: '' },
      ])
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function savePort() {
    if (!selectedCode) return
    setBusy(true)
    setErr(null)
    try {
      const maps = rowsToMaps(editRows)
      await apiFetch(props.apiBase, `/v1/ports/${encodeURIComponent(selectedCode)}`, {
        method: 'PATCH',
        body: maps,
        auth: true,
        tenant: false,
      })
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function deletePort() {
    if (!selectedCode) return
    if (!confirm(`Delete port ${selectedCode}?`)) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/ports/${encodeURIComponent(selectedCode)}`, { method: 'DELETE', auth: true, tenant: false })
      setSelectedCode('')
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
        title="Ports"
        subtitle="Manage port name/city/country in multiple languages. Use port codes on itineraries; the system will show localized port fields on the itinerary outputs."
        right={
          <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>
            Refresh
          </Button>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      <TwoCol
        left={
          <Panel title="Create port" subtitle="Code is required. Names must include at least one translation (e.g. en).">
            <div style={{ display: 'grid', gap: 10 }}>
              <Input label="Port code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ATH / BCN / ROM / ..." />
              <Panel title="Translations" subtitle="Add one row per language (en, ar, fr…).">
                <div style={{ display: 'grid', gap: 10 }}>
                  {rows.map((r, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                      <Input label="Lang" value={r.lang} onChange={(e) => setRow(idx, { lang: e.target.value })} placeholder="en" />
                      <Input label="Name" value={r.name} onChange={(e) => setRow(idx, { name: e.target.value })} placeholder="Athens (Piraeus)" />
                      <Input label="City" value={r.city} onChange={(e) => setRow(idx, { city: e.target.value })} placeholder="Athens" />
                      <Input label="Country" value={r.country} onChange={(e) => setRow(idx, { country: e.target.value })} placeholder="Greece" />
                      <Button variant="danger" disabled={busy || rows.length <= 1} onClick={() => removeRow(idx)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button variant="secondary" disabled={busy} onClick={addRow}>
                    Add language
                  </Button>
                </div>
              </Panel>
              <Button variant="primary" disabled={busy || !code.trim()} onClick={() => void createPort()}>
                {busy ? 'Saving…' : 'Create port'}
              </Button>
            </div>
          </Panel>
        }
        right={
          <div style={{ display: 'grid', gap: 12 }}>
            <Panel
              title={`Existing ports (${ports.length})`}
              subtitle="Select one to edit translations."
              right={
                <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
                  <Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code / name / city / country…" />
                  <Select label="Display lang" value={preferredLang} onChange={(e) => setPreferredLang(e.target.value)}>
                    <option value="en">en</option>
                    <option value="he">he</option>
                    <option value="ar">ar</option>
                    <option value="fr">fr</option>
                    <option value="es">es</option>
                    <option value={preferredLang}>{preferredLang}</option>
                  </Select>
                </div>
              }
            >
              <div style={{ display: 'grid', gap: 10 }}>
                <Select value={selectedCode} onChange={(e) => setSelectedCode(e.target.value)}>
                  {ports.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} · {pickI18n(p.names, preferred)} · {pickI18n(p.cities, preferred)}, {pickI18n(p.countries, preferred)}
                    </option>
                  ))}
                  {ports.length === 0 ? <option value="">(no ports yet)</option> : null}
                </Select>

                {selectedCode ? (
                  <Panel
                    title={
                      <span>
                        Edit <Mono>{selectedCode}</Mono>
                      </span>
                    }
                    subtitle="Saves merge translations (does not delete existing language entries)."
                    right={
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button variant="danger" disabled={busy} onClick={() => void deletePort()}>
                          Delete
                        </Button>
                        <Button variant="primary" disabled={busy} onClick={() => void savePort()}>
                          {busy ? 'Saving…' : 'Save'}
                        </Button>
                      </div>
                    }
                  >
                    <div style={{ display: 'grid', gap: 10 }}>
                      {editRows.map((r, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                          <Input label="Lang" value={r.lang} onChange={(e) => setEditRow(idx, { lang: e.target.value })} placeholder="en" />
                          <Input label="Name" value={r.name} onChange={(e) => setEditRow(idx, { name: e.target.value })} />
                          <Input label="City" value={r.city} onChange={(e) => setEditRow(idx, { city: e.target.value })} />
                          <Input label="Country" value={r.country} onChange={(e) => setEditRow(idx, { country: e.target.value })} />
                          <Button variant="danger" disabled={busy || editRows.length <= 1} onClick={() => removeEditRow(idx)}>
                            Remove
                          </Button>
                        </div>
                      ))}
                      <Button variant="secondary" disabled={busy} onClick={addEditRow}>
                        Add language
                      </Button>
                    </div>
                  </Panel>
                ) : null}
              </div>
            </Panel>
          </div>
        }
      />
    </div>
  )
}


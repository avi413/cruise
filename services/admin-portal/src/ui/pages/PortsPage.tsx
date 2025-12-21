import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { Button, ErrorBanner, Input, Mono, PageHeader, Panel, Select } from '../components/ui'

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

export function PortsPage(props: { apiBase: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [preferredLang, setPreferredLang] = useState('en')
  const preferred = useMemo(() => [preferredLang, 'en', 'he'], [preferredLang])

  const [q, setQ] = useState('')
  const [ports, setPorts] = useState<Port[]>([])
  
  // View state: 'list', 'create', 'edit'
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list')

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
    // If we were editing and the port is no longer there, switch to list
    if (view === 'edit' && selectedCode) {
      if (r && !r.find(p => p.code === selectedCode)) {
         setView('list')
         setSelectedCode('')
      }
    }
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
      setView('list')
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
      setView('list')
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
      setView('list')
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  // --- Render Helpers ---

  function renderList() {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--csp-surface-bg)', padding: 12, borderRadius: 8, border: '1px solid var(--csp-border)' }}>
            <div style={{ flex: 1 }}>
                <Input 
                    value={q} 
                    onChange={(e) => setQ(e.target.value)} 
                    placeholder="Search ports by code, name, city..." 
                    style={{ width: '100%', maxWidth: 400 }}
                />
            </div>
            <div style={{ width: 150 }}>
                <Select value={preferredLang} onChange={(e) => setPreferredLang(e.target.value)}>
                    <option value="en">English (en)</option>
                    <option value="he">Hebrew (he)</option>
                    <option value="ar">Arabic (ar)</option>
                    <option value="fr">French (fr)</option>
                    <option value="es">Spanish (es)</option>
                </Select>
            </div>
            <Button variant="primary" onClick={() => setView('create')}>New Port</Button>
            <Button variant="secondary" onClick={() => void refresh()}>Refresh</Button>
        </div>

        <div style={{ border: '1px solid var(--csp-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--csp-surface-bg)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr style={{ background: 'var(--csp-border-strong)', color: 'var(--csp-text)', textAlign: 'left' }}>
                        <th style={styles.th}>Code</th>
                        <th style={styles.th}>Name</th>
                        <th style={styles.th}>City</th>
                        <th style={styles.th}>Country</th>
                    </tr>
                </thead>
                <tbody>
                    {ports.map(p => (
                        <HoverRow
                            key={p.code} 
                            onClick={() => {
                                setSelectedCode(p.code)
                                setView('edit')
                            }}
                        >
                            <td style={styles.td}><Mono>{p.code}</Mono></td>
                            <td style={styles.td}>{pickI18n(p.names, preferred)}</td>
                            <td style={styles.td}>{pickI18n(p.cities, preferred)}</td>
                            <td style={styles.td}>{pickI18n(p.countries, preferred)}</td>
                        </HoverRow>
                    ))}
                    {ports.length === 0 && (
                        <tr>
                            <td colSpan={4} style={{ ...styles.td, textAlign: 'center', color: 'var(--csp-muted)', padding: 32 }}>
                                No ports found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    )
  }

  function renderCreate() {
    return (
        <Panel 
            title="Create New Port" 
            subtitle="Enter port details and translations."
            right={<Button variant="secondary" onClick={() => setView('list')}>Cancel</Button>}
        >
            <div style={{ maxWidth: 800, display: 'grid', gap: 20 }}>
                <div style={{ maxWidth: 200 }}>
                    <Input label="Port Code (Unique)" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. ATH" />
                </div>
                
                <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Translations</div>
                    {rows.map((r, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                            <Input label={idx === 0 ? "Lang" : undefined} value={r.lang} onChange={(e) => setRow(idx, { lang: e.target.value })} placeholder="en" />
                            <Input label={idx === 0 ? "Name" : undefined} value={r.name} onChange={(e) => setRow(idx, { name: e.target.value })} placeholder="Name" />
                            <Input label={idx === 0 ? "City" : undefined} value={r.city} onChange={(e) => setRow(idx, { city: e.target.value })} placeholder="City" />
                            <Input label={idx === 0 ? "Country" : undefined} value={r.country} onChange={(e) => setRow(idx, { country: e.target.value })} placeholder="Country" />
                            <Button variant="danger" disabled={busy || rows.length <= 1} onClick={() => removeRow(idx)}>X</Button>
                        </div>
                    ))}
                    <div>
                        <Button variant="secondary" onClick={addRow}>+ Add Language</Button>
                    </div>
                </div>

                <div style={{ paddingTop: 20, borderTop: '1px solid var(--csp-border)' }}>
                    <Button variant="primary" disabled={busy || !code.trim()} onClick={() => void createPort()}>
                        {busy ? 'Creating...' : 'Create Port'}
                    </Button>
                </div>
            </div>
        </Panel>
    )
  }

  function renderEdit() {
    return (
        <Panel 
            title={`Edit Port: ${selectedCode}`} 
            subtitle="Update translations or delete this port."
            right={<Button variant="secondary" onClick={() => setView('list')}>Back to List</Button>}
        >
             <div style={{ maxWidth: 800, display: 'grid', gap: 20 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Translations</div>
                    {editRows.map((r, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                            <Input label={idx === 0 ? "Lang" : undefined} value={r.lang} onChange={(e) => setEditRow(idx, { lang: e.target.value })} />
                            <Input label={idx === 0 ? "Name" : undefined} value={r.name} onChange={(e) => setEditRow(idx, { name: e.target.value })} />
                            <Input label={idx === 0 ? "City" : undefined} value={r.city} onChange={(e) => setEditRow(idx, { city: e.target.value })} />
                            <Input label={idx === 0 ? "Country" : undefined} value={r.country} onChange={(e) => setEditRow(idx, { country: e.target.value })} />
                            <Button variant="danger" disabled={busy || editRows.length <= 1} onClick={() => removeEditRow(idx)}>X</Button>
                        </div>
                    ))}
                    <div>
                        <Button variant="secondary" onClick={addEditRow}>+ Add Language</Button>
                    </div>
                </div>

                <div style={{ paddingTop: 20, borderTop: '1px solid var(--csp-border)', display: 'flex', justifyContent: 'space-between' }}>
                     <Button variant="danger" disabled={busy} onClick={() => void deletePort()}>
                        Delete Port
                    </Button>
                    <Button variant="primary" disabled={busy} onClick={() => void savePort()}>
                        {busy ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </div>
        </Panel>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 24, paddingBottom: 48 }}>
      <PageHeader
        title="Ports Management"
        subtitle="Manage global port definitions, cities, and countries."
      />

      {err ? <ErrorBanner message={err} /> : null}

      {view === 'list' && renderList()}
      {view === 'create' && renderCreate()}
      {view === 'edit' && renderEdit()}
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
        color: 'var(--csp-text)'
    },
    tr: {
        cursor: 'pointer',
        transition: 'background 0.15s ease'
    }
}

import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { Button, ErrorBanner, Input, Mono, PageHeader, Panel } from '../components/ui'

type CruiseItem = { sailing: any; ship: any }

export function CruisesPage(props: { apiBase: string }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [items, setItems] = useState<CruiseItem[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const endpoint = useMemo(() => `/v1/cruises`, [])

  async function refresh() {
    setBusy(true)
    setErr(null)
    try {
      const r = await apiFetch<{ items: CruiseItem[] }>(props.apiBase, endpoint, { auth: false, tenant: false })
      setItems(r.items || [])
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    refresh().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((x) => {
      const s = x?.sailing || {}
      const ship = x?.ship || {}
      const hay = [
        s.code,
        s.id,
        s.ship_id,
        s.start_date,
        s.end_date,
        s.embark_port_code,
        s.debark_port_code,
        ship.name,
        ship.code,
        ship.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [items, q])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title="Cruises"
        subtitle="Browse available sailings with ship metadata. Use live search to quickly find by ship, date, port, or sailing code."
        right={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </Button>
          </>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      <Panel
        title="Live search"
        subtitle="Tip: paste a sailing id into Sales to place a hold. This screen helps you find it fast."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by ship name/code, sailing code, dates, ports…" />
        </div>
      </Panel>

      <Panel title={`Results (${filtered.length})`} subtitle="Click ‘Open in Sales’ to prefill the workflow with that sailing id.">
        <div style={{ overflow: 'auto' }}>
          <table style={tableStyles.table}>
            <thead>
              <tr>
                <th style={tableStyles.th}>Sailing</th>
                <th style={tableStyles.th}>Dates</th>
                <th style={tableStyles.th}>Ports</th>
                <th style={tableStyles.th}>Ship</th>
                <th style={tableStyles.th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((x) => {
                const s = x?.sailing || {}
                const ship = x?.ship || {}
                return (
                  <tr key={String(s.id || Math.random())}>
                    <td style={tableStyles.td}>
                      <div style={{ fontWeight: 900 }}>{s.code || '—'}</div>
                      <div style={tableStyles.sub}>
                        id <Mono>{String(s.id || '—')}</Mono>
                      </div>
                    </td>
                    <td style={tableStyles.tdMono}>
                      {String(s.start_date || '—')} → {String(s.end_date || '—')}
                    </td>
                    <td style={tableStyles.tdMono}>
                      {String(s.embark_port_code || '—')} → {String(s.debark_port_code || '—')}
                    </td>
                    <td style={tableStyles.td}>
                      <div style={{ fontWeight: 800 }}>{ship?.name || '—'}</div>
                      <div style={tableStyles.sub}>
                        <Mono>{String(ship?.code || ship?.id || '—')}</Mono>
                      </div>
                    </td>
                    <td style={tableStyles.td}>
                      <Button
                        variant="primary"
                        disabled={!s?.id}
                        onClick={() => nav(`/app/sales?sailing_id=${encodeURIComponent(String(s.id))}`)}
                        title="Jump to Sales and prefill sailing id"
                      >
                        Open in Sales
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={tableStyles.empty}>
                    {busy ? 'Loading…' : 'No results.'}
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
  sub: { marginTop: 4, color: 'rgba(230,237,243,0.65)', fontSize: 12, lineHeight: 1.35 },
  empty: { padding: '14px 8px', color: 'rgba(230,237,243,0.60)' },
}


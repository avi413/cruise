import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { Button, ErrorBanner, Mono, PageHeader, Panel, Select } from '../components/ui'

type NotificationItem = { time: string; kind: string; message: string; customer_id?: string | null; data?: any }
type Sailing = { id: string; code: string; start_date: string; end_date: string; ship_id: string; status: string }
type InventoryRow = { sailing_id: string; cabin_type: string; capacity: number; held: number; confirmed: number; available: number }

export function ReportsPage(props: { apiBase: string }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [sailings, setSailings] = useState<Sailing[]>([])
  const [sailingId, setSailingId] = useState('')
  const [inventory, setInventory] = useState<InventoryRow[] | null>(null)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const now = Date.now()
  const last24h = now - 24 * 60 * 60 * 1000

  const counts = useMemo(() => {
    const byKind: Record<string, number> = {}
    for (const n of notifications) byKind[n.kind] = (byKind[n.kind] || 0) + 1
    const recent = notifications.filter((n) => {
      const t = Date.parse(n.time)
      return !isNaN(t) && t >= last24h
    })
    const recentByKind: Record<string, number> = {}
    for (const n of recent) recentByKind[n.kind] = (recentByKind[n.kind] || 0) + 1
    return { byKind, recentByKind, recentCount: recent.length }
  }, [notifications, last24h])

  async function refreshAll() {
    setBusy(true)
    setErr(null)
    try {
      const [n, s] = await Promise.all([
        apiFetch<{ items: NotificationItem[] }>(props.apiBase, `/v1/notifications`),
        apiFetch<Sailing[]>(props.apiBase, `/v1/sailings`, { auth: false, tenant: false }),
      ])
      setNotifications(n.items || [])
      setSailings(s || [])
      if (!sailingId && s && s.length) setSailingId(s[0].id)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function refreshInventory() {
    if (!sailingId) return
    setBusy(true)
    setErr(null)
    try {
      const r = await apiFetch<InventoryRow[]>(props.apiBase, `/v1/inventory/sailings/${sailingId}`)
      setInventory(r || [])
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    refreshAll().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sailingId) return
    refreshInventory().catch(() => {
      /* ignore */
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sailingId])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title="Reporting & Analytics (Snapshot)"
        subtitle="This starter repo doesn’t include a dedicated analytics service yet; this page provides a high-signal operational snapshot using existing Edge endpoints (notifications + inventory + sailings)."
        right={
          <>
            <Button disabled={busy} onClick={() => void refreshAll()}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </Button>
          </>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        <Panel title="Sales activity (from events)" subtitle="Counts derived from booking.held / booking.confirmed events (in-app notifications).">
          <div style={{ display: 'grid', gap: 8, fontSize: 13, color: 'rgba(230,237,243,0.85)' }}>
            <div>
              Last 24h events: <Mono>{counts.recentCount}</Mono>
            </div>
            <div>
              Holds (24h): <Mono>{counts.recentByKind.booking_held || 0}</Mono>
            </div>
            <div>
              Confirmations (24h): <Mono>{counts.recentByKind.booking_confirmed || 0}</Mono>
            </div>
            <div style={{ marginTop: 8, color: 'rgba(230,237,243,0.65)', fontSize: 12, lineHeight: 1.4 }}>
              For agent/team performance and booking trend charts, add an analytics projection service (or data warehouse) and extend Edge with aggregated endpoints.
            </div>
          </div>
        </Panel>

        <Panel title="Inventory snapshot" subtitle="Select a sailing to see capacity vs held/confirmed by cabin type.">
          <div style={{ display: 'grid', gap: 10 }}>
            <Select label="Sailing" value={sailingId} onChange={(e) => setSailingId(e.target.value)}>
              {sailings.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.start_date}→{s.end_date} · {s.status}
                </option>
              ))}
            </Select>
            <Button disabled={busy || !sailingId} onClick={() => void refreshInventory()}>
              Refresh inventory
            </Button>
          </div>

          {inventory ? (
            <div style={{ marginTop: 12, overflow: 'auto' }}>
              <table style={tableStyles.table}>
                <thead>
                  <tr>
                    <th style={tableStyles.th}>Cabin type</th>
                    <th style={tableStyles.th}>Capacity</th>
                    <th style={tableStyles.th}>Held</th>
                    <th style={tableStyles.th}>Confirmed</th>
                    <th style={tableStyles.th}>Available</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((r) => (
                    <tr key={r.cabin_type}>
                      <td style={tableStyles.tdMono}>{r.cabin_type}</td>
                      <td style={tableStyles.tdMono}>{r.capacity}</td>
                      <td style={tableStyles.tdMono}>{r.held}</td>
                      <td style={tableStyles.tdMono}>{r.confirmed}</td>
                      <td style={tableStyles.tdMono}>{r.available}</td>
                    </tr>
                  ))}
                  {inventory.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={tableStyles.empty}>
                        No inventory rows yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel title="Recent notifications" subtitle="A quick feed of operational events (hold/confirm).">
        <div style={{ overflow: 'auto' }}>
          <table style={tableStyles.table}>
            <thead>
              <tr>
                <th style={tableStyles.th}>Time</th>
                <th style={tableStyles.th}>Kind</th>
                <th style={tableStyles.th}>Message</th>
              </tr>
            </thead>
            <tbody>
              {notifications.slice(0, 20).map((n, idx) => (
                <tr key={`${n.time}-${idx}`}>
                  <td style={tableStyles.tdMono}>{n.time}</td>
                  <td style={tableStyles.tdMono}>{n.kind}</td>
                  <td style={tableStyles.td}>{n.message}</td>
                </tr>
              ))}
              {notifications.length === 0 ? (
                <tr>
                  <td colSpan={3} style={tableStyles.empty}>
                    No notifications yet.
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
  empty: { padding: '14px 8px', color: 'rgba(230,237,243,0.60)' },
}


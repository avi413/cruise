import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { decodeJwt } from '../components/jwt'
import { getToken } from '../components/storage'
import { Button, ErrorBanner, Input, Mono, PageHeader, Panel, Select } from '../components/ui'

type NotificationItem = {
  time: string
  customer_id?: string | null
  kind: string
  message: string
  data?: any
}

type Task = { id: string; title: string; due_at: string | null; status: 'open' | 'done'; created_at: string }

function tasksKey(): string {
  const claims = decodeJwt(getToken())
  const sub = claims?.sub || 'anon'
  return `csp.tasks.${sub}`
}

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(tasksKey())
    return raw ? (JSON.parse(raw) as Task[]) : []
  } catch {
    return []
  }
}

function saveTasks(tasks: Task[]) {
  localStorage.setItem(tasksKey(), JSON.stringify(tasks))
}

export function NotificationsPage(props: { apiBase: string }) {
  const nav = useNavigate()
  const [customerId, setCustomerId] = useState('')
  const [items, setItems] = useState<NotificationItem[]>([])

  const [tasks, setTasks] = useState<Task[]>(() => loadTasks())
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const endpoint = useMemo(() => `/v1/notifications`, [])

  async function refresh() {
    setBusy(true)
    setErr(null)
    try {
      const q = customerId.trim() ? `?customer_id=${encodeURIComponent(customerId.trim())}` : ''
      const r = await apiFetch<{ items: NotificationItem[] }>(props.apiBase, `${endpoint}${q}`)
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

  useEffect(() => {
    saveTasks(tasks)
  }, [tasks])

  function addTask() {
    const title = taskTitle.trim()
    if (!title) return
    const now = new Date().toISOString()
    const due = taskDue ? new Date(`${taskDue}T00:00:00Z`).toISOString() : null
    const next: Task = { id: crypto.randomUUID(), title, due_at: due, status: 'open', created_at: now }
    setTasks([next, ...tasks])
    setTaskTitle('')
    setTaskDue('')
  }

  function setTaskStatus(id: string, status: Task['status']) {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, status } : t)))
  }

  const expiring = useMemo(() => {
    const now = Date.now()
    return items
      .filter((n) => n.kind === 'booking_held' && n.data?.hold_expires_at)
      .map((n) => {
        const exp = String(n.data?.hold_expires_at)
        const t = Date.parse(exp)
        return { n, exp, ms: isNaN(t) ? null : t - now }
      })
      .sort((a, b) => (a.ms ?? Number.MAX_SAFE_INTEGER) - (b.ms ?? Number.MAX_SAFE_INTEGER))
  }, [items])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title="Agenda & Notifications"
        subtitle="In-app notifications are derived from domain events (holds, confirmations). Tasks are personal and stored locally (demo) — swap this to a real task service when ready."
        right={
          <>
            <Button disabled={busy} onClick={() => void refresh()}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </Button>
          </>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        <Panel title="Notifications feed" subtitle="Filter by customer_id if you’re working a specific case.">
          <div style={{ display: 'grid', gap: 10 }}>
            <Input label="Customer id (optional)" value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="UUID" />
            <Button disabled={busy} onClick={() => void refresh()}>
              Apply filter
            </Button>
          </div>

          {expiring.length ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(0,0,0,0.22)' }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Expiring holds</div>
              <div style={{ color: 'rgba(230,237,243,0.65)', fontSize: 12, marginBottom: 8 }}>These are the most time-sensitive items in your queue.</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {expiring.slice(0, 5).map(({ n, exp, ms }) => (
                  <div key={`${n.kind}-${n.time}-${n.message}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <div style={{ fontWeight: 800 }}>{n.message}</div>
                      <div style={{ color: 'rgba(230,237,243,0.65)', fontSize: 12 }}>
                        Expires <Mono>{exp}</Mono> · {typeof ms === 'number' ? `${Math.max(0, Math.round(ms / 60000))}m` : '—'}
                      </div>
                    </div>
                    {n.data?.booking_id ? (
                      <Button variant="primary" onClick={() => nav(`/app/sales?booking_id=${encodeURIComponent(String(n.data.booking_id))}`)}>
                        Open booking
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 12, overflow: 'auto' }}>
            <table style={tableStyles.table}>
              <thead>
                <tr>
                  <th style={tableStyles.th}>Time</th>
                  <th style={tableStyles.th}>Kind</th>
                  <th style={tableStyles.th}>Message</th>
                </tr>
              </thead>
              <tbody>
                {items.map((n, idx) => (
                  <tr key={`${n.time}-${idx}`}>
                    <td style={tableStyles.tdMono}>{n.time}</td>
                    <td style={tableStyles.tdMono}>{n.kind}</td>
                    <td style={tableStyles.td}>{n.message}</td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={tableStyles.empty}>
                      {busy ? 'Loading…' : 'No notifications yet.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="My tasks" subtitle="Fast, call-center style: create follow-ups and mark done.">
          <div style={{ display: 'grid', gap: 10 }}>
            <Input label="Task" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Call back customer about balcony upgrade…" />
            <Input label="Due date (optional)" type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
            <Button variant="primary" disabled={!taskTitle.trim()} onClick={addTask}>
              Add task
            </Button>
          </div>

          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <Select
              label="View"
              value={'all'}
              onChange={() => {
                /* reserved */
              }}
              disabled
              hint="(Filtering is easy to add once tasks are server-backed.)"
            >
              <option value="all">All</option>
            </Select>

            <div style={{ display: 'grid', gap: 8 }}>
              {tasks.map((t) => (
                <div key={t.id} style={{ padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(0,0,0,0.22)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 900, textDecoration: t.status === 'done' ? 'line-through' : undefined }}>{t.title}</div>
                    <div style={{ color: 'rgba(230,237,243,0.65)', fontSize: 12 }}>
                      {t.due_at ? (
                        <>
                          due <Mono>{t.due_at.slice(0, 10)}</Mono>
                        </>
                      ) : (
                        <span style={{ color: 'rgba(230,237,243,0.50)' }}>no due date</span>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {t.status !== 'done' ? (
                      <Button onClick={() => setTaskStatus(t.id, 'done')} variant="primary">
                        Mark done
                      </Button>
                    ) : (
                      <Button onClick={() => setTaskStatus(t.id, 'open')}>Reopen</Button>
                    )}
                  </div>
                </div>
              ))}
              {tasks.length === 0 ? <div style={{ color: 'rgba(230,237,243,0.65)', fontSize: 13 }}>No tasks yet.</div> : null}
            </div>
          </div>
        </Panel>
      </div>
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


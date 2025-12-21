import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'

type StaffUser = { id: string; email: string; role: string; disabled: boolean; created_at: string; updated_at: string }

export function AgentsPage(props: { apiBase: string }) {
  const [items, setItems] = useState<StaffUser[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [q, setQ] = useState('')

  // Create agent
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [disabled, setDisabled] = useState(false)

  // Edit agent
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDisabled, setEditDisabled] = useState(false)
  const [editPassword, setEditPassword] = useState('')

  const endpoint = useMemo(() => `/v1/staff/users`, [])

  async function refresh() {
    setBusy(true)
    setErr(null)
    try {
      const r = await apiFetch<StaffUser[]>(props.apiBase, endpoint)
      setItems(r || [])
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

  const agents = useMemo(() => {
    const onlyAgents = (items || []).filter((u) => (u.role || '').toLowerCase() === 'agent')
    const needle = q.trim().toLowerCase()
    if (!needle) return onlyAgents
    return onlyAgents.filter((u) => (u.email || '').toLowerCase().includes(needle))
  }, [items, q])

  async function create() {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch<StaffUser>(props.apiBase, `/v1/staff/users`, { method: 'POST', body: { email, password, role: 'agent', disabled } })
      setEmail('')
      setPassword('')
      setDisabled(false)
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function beginEdit(u: StaffUser) {
    setEditingId(u.id)
    setEditDisabled(Boolean(u.disabled))
    setEditPassword('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDisabled(false)
    setEditPassword('')
  }

  async function saveEdit(u: StaffUser) {
    setBusy(true)
    setErr(null)
    try {
      const body: Record<string, unknown> = { disabled: Boolean(editDisabled) }
      if (editPassword.trim()) body.password = editPassword.trim()
      await apiFetch<StaffUser>(props.apiBase, `/v1/staff/users/${u.id}`, { method: 'PATCH', body })
      cancelEdit()
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function del(u: StaffUser) {
    const ok = window.confirm(`Delete agent "${u.email}"?\n\nThis cannot be undone.`)
    if (!ok) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/staff/users/${u.id}`, { method: 'DELETE' })
      if (editingId === u.id) cancelEdit()
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.hTitle}>Agents</div>
      <div style={styles.hSub}>Admin-only. Create, edit (disable/reset password), and delete call-center agents.</div>

      {err ? <div style={styles.error}>{err}</div> : null}

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Create agent</div>
          <div style={styles.form}>
            <label style={styles.label}>
              Email
              <input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@company.com" />
            </label>
            <label style={styles.label}>
              Password
              <input style={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="min 6 chars" />
            </label>
            <label style={styles.label}>
              Disabled
              <select style={styles.input} value={disabled ? 'yes' : 'no'} onChange={(e) => setDisabled(e.target.value === 'yes')}>
                <option value="no">no</option>
                <option value="yes">yes</option>
              </select>
            </label>
            <button style={styles.primaryBtn} disabled={busy || !email.trim() || !password.trim()} onClick={() => void create()}>
              {busy ? 'Saving…' : 'Create agent'}
            </button>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={styles.panelTitle}>Agents ({agents.length})</div>
            <button style={styles.secondaryBtn} disabled={busy} onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <label style={styles.label}>
              Search
              <input style={styles.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter by email" />
            </label>
          </div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Disabled</th>
                  <th style={styles.th}>Updated</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {agents.map((u) => {
                  const isEditing = editingId === u.id
                  return (
                    <React.Fragment key={u.id}>
                      <tr>
                        <td style={styles.tdMono}>{u.email}</td>
                        <td style={styles.td}>{u.disabled ? 'yes' : 'no'}</td>
                        <td style={styles.tdMono}>{u.updated_at}</td>
                        <td style={styles.td}>
                          {!isEditing ? (
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              <button style={styles.secondaryBtn} disabled={busy} onClick={() => beginEdit(u)}>
                                Edit
                              </button>
                              <button style={styles.dangerBtnSmall} disabled={busy} onClick={() => void del(u)}>
                                Delete
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              <button style={styles.secondaryBtn} disabled={busy} onClick={cancelEdit}>
                                Cancel
                              </button>
                              <button style={styles.primaryBtnCompact} disabled={busy} onClick={() => void saveEdit(u)}>
                                Save
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isEditing ? (
                        <tr>
                          <td style={styles.td} colSpan={4}>
                            <div style={styles.editBox}>
                              <div style={styles.editTitle}>Edit agent</div>
                              <div style={styles.editGrid}>
                                <label style={styles.label}>
                                  Disabled
                                  <select style={styles.input} value={editDisabled ? 'yes' : 'no'} onChange={(e) => setEditDisabled(e.target.value === 'yes')}>
                                    <option value="no">no</option>
                                    <option value="yes">yes</option>
                                  </select>
                                </label>
                                <label style={styles.label}>
                                  Reset password (optional)
                                  <input
                                    style={styles.input}
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    type="password"
                                    placeholder="leave blank to keep current"
                                  />
                                </label>
                              </div>
                              <div style={styles.muted}>
                                Notes: email changes are not supported yet; to remove access permanently use Delete, or Disable for a reversible lock.
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })}
                {agents.length === 0 ? (
                  <tr>
                    <td style={styles.tdMuted} colSpan={4}>
                      No agents yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'grid', gap: 12 },
  hTitle: { fontSize: 22, fontWeight: 900 },
  hSub: { color: 'var(--csp-muted, rgba(230,237,243,0.7))', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' },
  panel: {
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    borderRadius: 14,
    background: 'var(--csp-surface-bg, rgba(255,255,255,0.04))',
    padding: 14,
    color: 'var(--csp-text, #e6edf3)',
  },
  panelTitle: { fontWeight: 900 },
  form: { display: 'grid', gap: 10, marginTop: 10 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'var(--csp-text, rgba(230,237,243,0.85))' },
  input: {
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-input-border, rgba(255,255,255,0.12))',
    background: 'var(--csp-input-bg, rgba(0,0,0,0.25))',
    color: 'var(--csp-text, #e6edf3)',
  },
  muted: { color: 'var(--csp-muted, rgba(230,237,243,0.65))', fontSize: 12, lineHeight: 1.4 },
  primaryBtn: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--csp-primary-border, rgba(56,139,253,0.55))',
    background: 'var(--csp-primary-soft, rgba(56,139,253,0.22))',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 900,
  },
  primaryBtnCompact: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-primary-border, rgba(56,139,253,0.55))',
    background: 'var(--csp-primary-soft, rgba(56,139,253,0.22))',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 900,
  },
  secondaryBtn: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-border-strong, rgba(255,255,255,0.12))',
    background: 'color-mix(in srgb, var(--csp-surface-bg, rgba(255,255,255,0.06)) 88%, transparent)',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 900,
  },
  dangerBtnSmall: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid rgba(248,81,73,0.35)',
    background: 'rgba(248,81,73,0.12)',
    color: '#ffb4ae',
    cursor: 'pointer',
    fontWeight: 900,
  },
  error: {
    padding: 12,
    borderRadius: 12,
    background: 'rgba(248,81,73,0.12)',
    border: '1px solid rgba(248,81,73,0.35)',
    color: '#ffb4ae',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
  tableWrap: { overflow: 'auto', marginTop: 10 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    color: 'var(--csp-muted, rgba(230,237,243,0.75))',
    fontWeight: 900,
    verticalAlign: 'bottom',
  },
  td: { padding: '10px 8px', borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.06))', verticalAlign: 'top' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.06))',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    verticalAlign: 'top',
  },
  tdMuted: { padding: '14px 8px', color: 'rgba(230,237,243,0.60)' },
  editBox: {
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    borderRadius: 12,
    background: 'var(--csp-input-bg, rgba(0,0,0,0.18))',
    padding: 12,
    display: 'grid',
    gap: 10,
  },
  editTitle: { fontWeight: 900 },
  editGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' },
}


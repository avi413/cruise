import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'

type StaffUser = { id: string; email: string; role: string; disabled: boolean; created_at: string; updated_at: string }

export function UsersPage(props: { apiBase: string }) {
  const [items, setItems] = useState<StaffUser[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('agent')
  const [disabled, setDisabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const endpoint = useMemo(() => `/v1/staff/users`, [])

  async function refresh() {
    const r = await apiFetch<StaffUser[]>(props.apiBase, endpoint)
    setItems(r)
  }

  useEffect(() => {
    refresh().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint])

  async function create() {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/staff/users`, { method: 'POST', body: { email, password, role, disabled } })
      setEmail('')
      setPassword('')
      setRole('agent')
      setDisabled(false)
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function toggle(u: StaffUser) {
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(props.apiBase, `/v1/staff/users/${u.id}`, { method: 'PATCH', body: { disabled: !u.disabled } })
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.hTitle}>Users & Permissions</div>
      <div style={styles.hSub}>Admin-only. Create and disable portal users for this company/tenant.</div>

      {err ? <div style={styles.error}>{err}</div> : null}

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Create user</div>
          <div style={styles.form}>
            <label style={styles.label}>
              Email
              <input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@company.com" />
            </label>
            <label style={styles.label}>
              Password
              <input style={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="min 6 chars" />
            </label>
            <div style={styles.row2}>
              <label style={styles.label}>
                Role
                <select style={styles.input} value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="agent">agent</option>
                  <option value="staff">staff</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label style={styles.label}>
                Disabled
                <select style={styles.input} value={disabled ? 'yes' : 'no'} onChange={(e) => setDisabled(e.target.value === 'yes')}>
                  <option value="no">no</option>
                  <option value="yes">yes</option>
                </select>
              </label>
            </div>
            <button style={styles.primaryBtn} disabled={busy || !email.trim() || !password.trim()} onClick={() => void create()}>
              {busy ? 'Saving…' : 'Create user'}
            </button>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Users</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Disabled</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id}>
                    <td style={styles.tdMono}>{u.email}</td>
                    <td style={styles.td}>{u.role}</td>
                    <td style={styles.td}>{u.disabled ? 'yes' : 'no'}</td>
                    <td style={styles.td}>
                      <button style={styles.secondaryBtn} disabled={busy} onClick={() => void toggle(u)}>
                        {u.disabled ? 'Enable' : 'Disable'}
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td style={styles.tdMuted} colSpan={4}>
                      No users yet.
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
  hSub: { color: 'rgba(230,237,243,0.7)', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' },
  panel: {
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  panelTitle: { fontWeight: 900, marginBottom: 10 },
  form: { display: 'grid', gap: 10 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'rgba(230,237,243,0.85)' },
  input: {
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.25)',
    color: '#e6edf3',
  },
  primaryBtn: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(56,139,253,0.55)',
    background: 'rgba(56,139,253,0.22)',
    color: '#e6edf3',
    cursor: 'pointer',
    fontWeight: 900,
  },
  secondaryBtn: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: '#e6edf3',
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
  tableWrap: { overflow: 'auto', marginTop: 6 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.10)',
    color: 'rgba(230,237,243,0.75)',
    fontWeight: 900,
  },
  td: { padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
  },
  tdMuted: { padding: '14px 8px', color: 'rgba(230,237,243,0.60)' },
}


import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'

type StaffUser = { id: string; email: string; role: string; disabled: boolean; created_at: string; updated_at: string }
type StaffGroup = { id: string; code: string; name: string; description?: string | null; permissions: string[]; created_at: string; updated_at: string }
type GroupMember = { user_id: string; group_id: string }

const ALL_PERMS = [
  'sales.quote',
  'sales.hold',
  'sales.confirm',
  'customers.read',
  'customers.write',
  'sailings.read',
  'sailings.write',
  'fleet.read',
  'fleet.write',
  'inventory.read',
  'inventory.write',
  'rates.write',
  'users.manage',
] as const

export function UsersPage(props: { apiBase: string }) {
  const [items, setItems] = useState<StaffUser[]>([])
  const [groups, setGroups] = useState<StaffGroup[]>([])
  const [members, setMembers] = useState<Record<string, Set<string>>>({})
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('agent')
  const [disabled, setDisabled] = useState(false)
  const [newUserGroups, setNewUserGroups] = useState<Record<string, boolean>>({})

  const [gCode, setGCode] = useState('sales_agents')
  const [gName, setGName] = useState('Sales Agents')
  const [gDesc, setGDesc] = useState('Call center sales agents')
  const [gPerms, setGPerms] = useState<Record<string, boolean>>(() => {
    const d: Record<string, boolean> = {}
    for (const p of ALL_PERMS) d[p] = false
    for (const p of ['sales.quote', 'sales.hold', 'sales.confirm', 'customers.read', 'customers.write', 'sailings.read', 'fleet.read', 'inventory.read']) d[p] = true
    return d
  })

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const endpoint = useMemo(() => `/v1/staff/users`, [])
  const groupsEndpoint = useMemo(() => `/v1/staff/groups`, [])

  async function refresh() {
    const r = await apiFetch<StaffUser[]>(props.apiBase, endpoint)
    setItems(r)

    const gs = await apiFetch<StaffGroup[]>(props.apiBase, groupsEndpoint)
    setGroups(gs)

    const memMap: Record<string, Set<string>> = {}
    await Promise.all(
      gs.map(async (g) => {
        const m = await apiFetch<GroupMember[]>(props.apiBase, `/v1/staff/groups/${g.id}/members`)
        memMap[g.id] = new Set(m.map((x) => x.user_id))
      }),
    )
    setMembers(memMap)
  }

  useEffect(() => {
    refresh().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint])

  async function create() {
    setBusy(true)
    setErr(null)
    try {
      const u = await apiFetch<StaffUser>(props.apiBase, `/v1/staff/users`, { method: 'POST', body: { email, password, role, disabled } })
      const selectedGroupIds = Object.entries(newUserGroups)
        .filter(([, v]) => v)
        .map(([k]) => k)
      for (const gid of selectedGroupIds) {
        await apiFetch(props.apiBase, `/v1/staff/groups/${gid}/members`, { method: 'POST', body: { user_id: u.id } })
      }
      setEmail('')
      setPassword('')
      setRole('agent')
      setDisabled(false)
      setNewUserGroups({})
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

  async function createGroup() {
    setBusy(true)
    setErr(null)
    try {
      const permissions = Object.entries(gPerms)
        .filter(([, v]) => v)
        .map(([k]) => k)
      await apiFetch(props.apiBase, `/v1/staff/groups`, { method: 'POST', body: { code: gCode, name: gName, description: gDesc || null, permissions } })
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function setMember(groupId: string, userId: string, add: boolean) {
    setBusy(true)
    setErr(null)
    try {
      if (add) await apiFetch(props.apiBase, `/v1/staff/groups/${groupId}/members`, { method: 'POST', body: { user_id: userId } })
      else await apiFetch(props.apiBase, `/v1/staff/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
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
      <div style={styles.hSub}>
        Admin-only. Manage users, groups, and permissions. Tip: tenant admins now automatically get full access even without group membership (avoids setup lockouts).
      </div>

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
            <div style={styles.muted}>Optional: assign groups now (recommended for agents/staff).</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {groups.map((g) => (
                <label key={g.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: 'color-mix(in srgb, var(--csp-text) 90%, transparent)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(newUserGroups[g.id])}
                    disabled={busy}
                    onChange={(e) => setNewUserGroups({ ...newUserGroups, [g.id]: e.target.checked })}
                  />
                  <span>
                    {g.name} <span style={styles.muted}>({g.code})</span>
                  </span>
                </label>
              ))}
              {groups.length === 0 ? <div style={styles.muted}>No groups yet — create one below.</div> : null}
            </div>
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

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Create group</div>
          <div style={styles.form}>
            <label style={styles.label}>
              Code
              <input style={styles.input} value={gCode} onChange={(e) => setGCode(e.target.value)} placeholder="sales_agents" />
            </label>
            <label style={styles.label}>
              Name
              <input style={styles.input} value={gName} onChange={(e) => setGName(e.target.value)} placeholder="Sales Agents" />
            </label>
            <label style={styles.label}>
              Description
              <input style={styles.input} value={gDesc} onChange={(e) => setGDesc(e.target.value)} placeholder="Call center sales agents" />
            </label>
            <div style={styles.muted}>Permissions</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {ALL_PERMS.map((p) => (
                <label key={p} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: 'color-mix(in srgb, var(--csp-text) 90%, transparent)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(gPerms[p])}
                    disabled={busy}
                    onChange={(e) => setGPerms({ ...gPerms, [p]: e.target.checked })}
                  />
                  <span style={styles.mono}>{p}</span>
                </label>
              ))}
            </div>
            <button style={styles.primaryBtn} disabled={busy || !gCode.trim() || !gName.trim()} onClick={() => void createGroup()}>
              {busy ? 'Saving…' : 'Create group'}
            </button>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Group assignments</div>
          <div style={styles.muted}>Tick users into groups. Changes apply on next login.</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>User</th>
                  {groups.map((g) => (
                    <th key={g.id} style={styles.th}>
                      {g.name}
                      <div style={styles.thSub}>{g.code}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id}>
                    <td style={styles.tdMono}>{u.email}</td>
                    {groups.map((g) => {
                      const set = members[g.id] || new Set<string>()
                      const checked = set.has(u.id)
                      return (
                        <td key={`${u.id}-${g.id}`} style={styles.td}>
                          <input type="checkbox" checked={checked} disabled={busy} onChange={(e) => void setMember(g.id, u.id, e.target.checked)} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td style={styles.tdMuted} colSpan={Math.max(1, groups.length + 1)}>
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
  hSub: { color: 'var(--csp-muted)', fontSize: 13, lineHeight: 1.45 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' },
  panel: {
    border: '1px solid var(--csp-border)',
    borderRadius: 14,
    background: 'var(--csp-surface-bg)',
    boxShadow: 'var(--csp-shadow-sm)',
    padding: 14,
  },
  panelTitle: { fontWeight: 900, marginBottom: 10 },
  form: { display: 'grid', gap: 10 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'color-mix(in srgb, var(--csp-text) 90%, transparent)' },
  input: {
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-input-border)',
    background: 'var(--csp-input-bg)',
    color: 'var(--csp-text)',
  },
  muted: { color: 'var(--csp-muted)', fontSize: 12, lineHeight: 1.4 },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
  primaryBtn: {
    padding: '10px 12px',
    borderRadius: 999,
    border: '1px solid var(--csp-primary-border)',
    background: 'var(--csp-primary-soft)',
    color: 'color-mix(in srgb, var(--csp-primary) 72%, var(--csp-text))',
    cursor: 'pointer',
    fontWeight: 900,
  },
  secondaryBtn: {
    padding: '8px 10px',
    borderRadius: 999,
    border: '1px solid var(--csp-border-strong)',
    background: 'var(--csp-surface-bg)',
    boxShadow: 'var(--csp-shadow-sm)',
    color: 'var(--csp-text)',
    cursor: 'pointer',
    fontWeight: 900,
  },
  error: {
    padding: 12,
    borderRadius: 12,
    background: 'rgba(220, 38, 38, 0.10)',
    border: '1px solid rgba(220, 38, 38, 0.35)',
    color: 'rgb(185, 28, 28)',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
  tableWrap: { overflow: 'auto', marginTop: 6 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border)',
    color: 'var(--csp-muted)',
    fontWeight: 900,
    verticalAlign: 'bottom',
  },
  thSub: { marginTop: 4, color: 'var(--csp-muted)', fontSize: 11, fontWeight: 700 },
  td: { padding: '10px 8px', borderBottom: '1px solid var(--csp-border)' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
  },
  tdMuted: { padding: '14px 8px', color: 'var(--csp-muted)' },
}


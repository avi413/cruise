import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [items, setItems] = useState<StaffUser[]>([])
  const [groups, setGroups] = useState<StaffGroup[]>([])
  const [members, setMembers] = useState<Record<string, Set<string>>>({})
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('agent')
  const [disabled, setDisabled] = useState(false)
  const [newUserGroups, setNewUserGroups] = useState<Record<string, boolean>>({})

  // Edit user (role/disabled/reset password)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState('agent')
  const [editDisabled, setEditDisabled] = useState(false)
  const [editPassword, setEditPassword] = useState('')

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

  function beginEdit(u: StaffUser) {
    setEditingId(u.id)
    setEditRole((u.role || 'agent').toLowerCase())
    setEditDisabled(Boolean(u.disabled))
    setEditPassword('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditRole('agent')
    setEditDisabled(false)
    setEditPassword('')
  }

  async function saveEdit(u: StaffUser) {
    setBusy(true)
    setErr(null)
    try {
      const body: Record<string, unknown> = { role: editRole, disabled: Boolean(editDisabled) }
      if (editPassword.trim()) body.password = editPassword.trim()
      await apiFetch(props.apiBase, `/v1/staff/users/${u.id}`, { method: 'PATCH', body })
      cancelEdit()
      await refresh()
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function del(u: StaffUser) {
    const ok = window.confirm(t('users.users_list.confirm_delete', { email: u.email }))
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
      <div style={styles.hTitle}>{t('users.title')}</div>
      <div style={styles.hSub}>
        {t('users.subtitle')}
      </div>

      {err ? <div style={styles.error}>{err}</div> : null}

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>{t('users.create_user.title')}</div>
          <div style={styles.form}>
            <label style={styles.label}>
              {t('users.create_user.label_email')}
              <input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@company.com" />
            </label>
            <label style={styles.label}>
              {t('users.create_user.label_password')}
              <input style={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="min 6 chars" />
            </label>
            <div style={styles.row2}>
              <label style={styles.label}>
                {t('users.create_user.label_role')}
                <select style={styles.input} value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="agent">agent</option>
                  <option value="staff">staff</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label style={styles.label}>
                {t('users.create_user.label_disabled')}
                <select style={styles.input} value={disabled ? 'yes' : 'no'} onChange={(e) => setDisabled(e.target.value === 'yes')}>
                  <option value="no">no</option>
                  <option value="yes">yes</option>
                </select>
              </label>
            </div>
            <button style={styles.primaryBtn} disabled={busy || !email.trim() || !password.trim()} onClick={() => void create()}>
              {busy ? t('users.create_user.btn_saving') : t('users.create_user.btn_create')}
            </button>
            <div style={styles.muted}>{t('users.create_user.note_groups')}</div>
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
              {groups.length === 0 ? <div style={styles.muted}>{t('users.create_user.no_groups')}</div> : null}
            </div>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>{t('users.users_list.title')}</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>{t('users.users_list.th_email')}</th>
                  <th style={styles.th}>{t('users.users_list.th_role')}</th>
                  <th style={styles.th}>{t('users.users_list.th_disabled')}</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => {
                  const isEditing = editingId === u.id
                  return (
                    <React.Fragment key={u.id}>
                      <tr>
                        <td style={styles.tdMono}>{u.email}</td>
                        <td style={styles.td}>{u.role}</td>
                        <td style={styles.td}>{u.disabled ? 'yes' : 'no'}</td>
                        <td style={styles.td}>
                          {!isEditing ? (
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              <button style={styles.secondaryBtn} disabled={busy} onClick={() => beginEdit(u)}>
                                {t('users.users_list.btn_edit')}
                              </button>
                              <button style={styles.secondaryBtn} disabled={busy} onClick={() => void toggle(u)}>
                                {u.disabled ? t('users.users_list.btn_enable') : t('users.users_list.btn_disable')}
                              </button>
                              <button style={styles.dangerBtnSmall} disabled={busy} onClick={() => void del(u)}>
                                {t('users.users_list.btn_delete')}
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              <button style={styles.secondaryBtn} disabled={busy} onClick={cancelEdit}>
                                {t('users.users_list.btn_cancel')}
                              </button>
                              <button style={styles.primaryBtnCompact} disabled={busy} onClick={() => void saveEdit(u)}>
                                {t('users.users_list.btn_save')}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isEditing ? (
                        <tr>
                          <td style={styles.td} colSpan={4}>
                            <div style={styles.editBox}>
                              <div style={styles.editTitle}>{t('users.users_list.edit_title')}</div>
                              <div style={styles.editGrid}>
                                <label style={styles.label}>
                                  {t('users.create_user.label_role')}
                                  <select style={styles.input} value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                                    <option value="agent">agent</option>
                                    <option value="staff">staff</option>
                                    <option value="admin">admin</option>
                                  </select>
                                </label>
                                <label style={styles.label}>
                                  {t('users.create_user.label_disabled')}
                                  <select style={styles.input} value={editDisabled ? 'yes' : 'no'} onChange={(e) => setEditDisabled(e.target.value === 'yes')}>
                                    <option value="no">no</option>
                                    <option value="yes">yes</option>
                                  </select>
                                </label>
                                <label style={styles.label}>
                                  {t('users.users_list.label_reset_pw')}
                                  <input
                                    style={styles.input}
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    type="password"
                                    placeholder="leave blank to keep current"
                                  />
                                </label>
                              </div>
                              <div style={styles.muted}>{t('users.users_list.note_edit')}</div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })}
                {items.length === 0 ? (
                  <tr>
                    <td style={styles.tdMuted} colSpan={4}>
                      {t('users.users_list.empty')}
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
          <div style={styles.panelTitle}>{t('users.create_group.title')}</div>
          <div style={styles.form}>
            <label style={styles.label}>
              {t('users.create_group.label_code')}
              <input style={styles.input} value={gCode} onChange={(e) => setGCode(e.target.value)} placeholder="sales_agents" />
            </label>
            <label style={styles.label}>
              {t('users.create_group.label_name')}
              <input style={styles.input} value={gName} onChange={(e) => setGName(e.target.value)} placeholder="Sales Agents" />
            </label>
            <label style={styles.label}>
              {t('users.create_group.label_desc')}
              <input style={styles.input} value={gDesc} onChange={(e) => setGDesc(e.target.value)} placeholder="Call center sales agents" />
            </label>
            <div style={styles.muted}>{t('users.create_group.label_perms')}</div>
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
              {busy ? t('users.create_group.btn_saving') : t('users.create_group.btn_create')}
            </button>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>{t('users.group_assignments.title')}</div>
          <div style={styles.muted}>{t('users.group_assignments.subtitle')}</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>{t('users.group_assignments.th_user')}</th>
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
                      {t('users.group_assignments.empty')}
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
  panelTitle: { fontWeight: 900, marginBottom: 10 },
  form: { display: 'grid', gap: 10 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'var(--csp-text, rgba(230,237,243,0.85))' },
  input: {
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-input-border, rgba(255,255,255,0.12))',
    background: 'var(--csp-input-bg, rgba(0,0,0,0.25))',
    color: 'var(--csp-text, #e6edf3)',
  },
  muted: { color: 'var(--csp-muted, rgba(230,237,243,0.65))', fontSize: 12, lineHeight: 1.4 },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
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
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    color: 'var(--csp-muted, rgba(230,237,243,0.75))',
    fontWeight: 900,
    verticalAlign: 'bottom',
  },
  thSub: { marginTop: 4, color: 'color-mix(in srgb, var(--csp-muted, rgba(230,237,243,0.55)) 85%, transparent)', fontSize: 11, fontWeight: 700 },
  td: { padding: '10px 8px', borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.06))' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.06))',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
  },
  tdMuted: { padding: '14px 8px', color: 'var(--csp-muted)' },
}


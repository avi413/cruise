import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { getCompany, setToken } from '../components/storage'

export function LoginPage(props: { apiBase: string }) {
  const nav = useNavigate()
  const loc = useLocation() as any
  const company = getCompany()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!company?.id) {
      nav('/company')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const r = await apiFetch<{ access_token: string }>(props.apiBase, '/v1/staff/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
        tenant: true,
      })
      setToken(r.access_token)
      nav(loc?.state?.from || '/app/dashboard')
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.title}>Sign in</div>
        <div style={styles.sub}>{company ? `${company.name} (${company.code})` : 'Select a company first'}</div>

        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.form}>
          <label style={styles.label}>
            Email
            <input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@company.com" />
          </label>
          <label style={styles.label}>
            Password
            <input style={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
          </label>
          <button style={styles.primaryBtn} disabled={busy || !email.trim() || !password.trim()} onClick={() => void submit()}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div style={styles.help}>
            If this tenant has no users yet, bootstrap by calling <code>/v1/staff/users</code> once (role: admin) then sign in.
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0b1220',
    color: '#e6edf3',
    display: 'grid',
    placeItems: 'center',
    padding: 18,
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
  },
  card: {
    width: 'min(520px, 100%)',
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    padding: 18,
  },
  title: { fontSize: 22, fontWeight: 900 },
  sub: { marginTop: 6, color: 'rgba(230,237,243,0.72)', fontSize: 13 },
  form: { marginTop: 14, display: 'grid', gap: 10 },
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
  error: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: 'rgba(248,81,73,0.12)',
    border: '1px solid rgba(248,81,73,0.35)',
    color: '#ffb4ae',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
  help: { marginTop: 6, color: 'rgba(230,237,243,0.62)', fontSize: 12, lineHeight: 1.4 },
}


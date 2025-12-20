import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { getCompany, setToken } from '../components/storage'
import { applyCompanyTheme, fetchCompanySettings } from '../components/theme'

export function LoginPage(props: { apiBase: string }) {
  const nav = useNavigate()
  const loc = useLocation() as any
  const company = getCompany()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [platformMode, setPlatformMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (platformMode || !company?.id) {
      applyCompanyTheme(null)
      return
    }
    fetchCompanySettings(props.apiBase, company.id)
      .then((s) => {
        if (!cancelled) applyCompanyTheme(s)
      })
      .catch(() => {
        if (!cancelled) applyCompanyTheme(null)
      })
    return () => {
      cancelled = true
    }
  }, [props.apiBase, company?.id, platformMode])

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      if (!platformMode && !company?.id) {
        nav('/company')
        return
      }

      const r = await apiFetch<{ access_token: string }>(props.apiBase, platformMode ? '/v1/platform/login' : '/v1/staff/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
        tenant: platformMode ? false : true,
      })
      setToken(r.access_token)
      if (platformMode) nav('/company')
      else nav(loc?.state?.from || '/app/dashboard')
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.title}>
          <span style={styles.logo} aria-hidden />
          <span>Sign in</span>
        </div>
        <div style={styles.sub}>
          {platformMode ? 'Platform admin (all companies)' : company ? `${company.name} (${company.code})` : 'Select a company first'}
        </div>

        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.form}>
          <label style={styles.label}>
            Mode
            <select style={styles.input} value={platformMode ? 'platform' : 'tenant'} onChange={(e) => setPlatformMode(e.target.value === 'platform')}>
              <option value="tenant">Company staff login</option>
              <option value="platform">Platform admin (all companies)</option>
            </select>
          </label>
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
            {platformMode ? (
              <>
                Default platform admin is configured via <code>PLATFORM_ADMIN_EMAIL</code> / <code>PLATFORM_ADMIN_PASSWORD</code> in <code>customer-service</code>.
              </>
            ) : (
              <>
                If this tenant has no users yet, bootstrap by calling <code>/v1/staff/users</code> once (role: admin) then sign in.
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--csp-shell-bg, #0b1220)',
    color: 'var(--csp-text, #e6edf3)',
    display: 'grid',
    placeItems: 'center',
    padding: 18,
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
  },
  card: {
    width: 'min(520px, 100%)',
    borderRadius: 16,
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    background: 'var(--csp-surface-bg, rgba(255,255,255,0.04))',
    padding: 18,
  },
  title: { fontSize: 22, fontWeight: 900, display: 'flex', gap: 10, alignItems: 'center' },
  sub: { marginTop: 6, color: 'var(--csp-muted, rgba(230,237,243,0.72))', fontSize: 13 },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundImage: 'var(--csp-logo-url)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: 'var(--csp-surface-bg, rgba(255,255,255,0.06))',
    border: '1px solid var(--csp-border-strong, rgba(255,255,255,0.12))',
    flex: '0 0 auto',
  },
  form: { marginTop: 14, display: 'grid', gap: 10 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'var(--csp-text, rgba(230,237,243,0.85))' },
  input: {
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-input-border, rgba(255,255,255,0.12))',
    background: 'var(--csp-input-bg, rgba(0,0,0,0.25))',
    color: 'var(--csp-text, #e6edf3)',
  },
  primaryBtn: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--csp-primary-border, rgba(56,139,253,0.55))',
    background: 'var(--csp-primary-soft, rgba(56,139,253,0.22))',
    color: 'var(--csp-text, #e6edf3)',
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
  help: { marginTop: 6, color: 'var(--csp-muted, rgba(230,237,243,0.62))', fontSize: 12, lineHeight: 1.4 },
}


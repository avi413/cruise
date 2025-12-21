import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { fetchCompanySettings } from '../components/theme'
import { getCompany } from '../components/storage'

type MePrefs = { user_id: string; updated_at: string; preferences: any }

function safeJsonParse(s: string): any {
  try {
    return s.trim() ? JSON.parse(s) : {}
  } catch {
    throw new Error('Must be valid JSON.')
  }
}

export function PreferencesPage(props: { apiBase: string }) {
  const company = getCompany()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<any>(null)

  const [locale, setLocale] = useState('en')
  const [dashboardLayoutJson, setDashboardLayoutJson] = useState('[]')
  const [companyCurrency, setCompanyCurrency] = useState('USD')

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setErr(null)
    apiFetch<MePrefs>(props.apiBase, `/v1/staff/me/preferences`)
      .then((r) => {
        if (cancelled) return
        setPrefs(r.preferences || {})
        setLocale(String(r.preferences?.locale || 'en'))
        setDashboardLayoutJson(JSON.stringify(r.preferences?.dashboard?.layout || [], null, 2))
      })
      .catch((e: any) => {
        if (!cancelled) setErr(String(e?.detail || e?.message || e))
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [props.apiBase])

  useEffect(() => {
    let cancelled = false
    if (!company?.id) return
    fetchCompanySettings(props.apiBase, company.id)
      .then((s) => {
        if (cancelled) return
        const cur = String(s?.localization?.default_currency || 'USD').trim().toUpperCase() || 'USD'
        setCompanyCurrency(cur)
      })
      .catch(() => {
        // Best-effort; fall back to USD.
        if (!cancelled) setCompanyCurrency('USD')
      })
    return () => {
      cancelled = true
    }
  }, [props.apiBase, company?.id])

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      const layout = safeJsonParse(dashboardLayoutJson)
      const basePrefs = { ...(prefs || {}) }
      delete (basePrefs as any).currency // currency is company-wide
      const payload = {
        preferences: {
          ...basePrefs,
          locale: locale.trim() || 'en',
          dashboard: { ...(prefs?.dashboard || {}), layout },
        },
      }
      const r = await apiFetch<MePrefs>(props.apiBase, `/v1/staff/me/preferences`, { method: 'PATCH', body: payload })
      setPrefs(r.preferences || {})
    } catch (e: any) {
      setErr(String(e?.message || e?.detail || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.hTitle}>My preferences</div>
      <div style={styles.hSub}>Language and workspace layout (saved per user). Currency is managed in company settings.</div>

      {err ? <div style={styles.error}>{err}</div> : null}

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Locale</div>
          <div style={styles.form}>
            <label style={styles.label}>
              Locale
              <input style={styles.input} value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en / es / fr / ar / ..." />
            </label>
            <div style={styles.muted}>
              Currency: <span style={{ fontFamily: styles.mono.fontFamily as any }}>{companyCurrency}</span> (set in <span style={{ fontFamily: styles.mono.fontFamily as any }}>Branding &amp; localization</span>)
            </div>
            <button style={styles.primaryBtn} disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <div style={styles.muted}>
              Note: this is the persistence layer. Next, the UI will use locale for formatting, and workspace layout for reduced-click workflows.
            </div>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>Dashboard layout (JSON)</div>
          <div style={styles.muted}>Temporary editor until drag-and-drop widgets are wired in.</div>
          <div style={styles.form}>
            <textarea style={{ ...styles.input, minHeight: 260, fontFamily: styles.mono.fontFamily as any }} value={dashboardLayoutJson} onChange={(e) => setDashboardLayoutJson(e.target.value)} />
            <button style={styles.primaryBtn} disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save layout'}
            </button>
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
    border: '1px solid rgba(56,139,253,0.55)',
    background: 'rgba(56,139,253,0.22)',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 900,
  },
  muted: { color: 'var(--csp-muted, rgba(230,237,243,0.65))', fontSize: 12, lineHeight: 1.4 },
  mono: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12 },
  error: {
    padding: 12,
    borderRadius: 12,
    background: 'rgba(220, 38, 38, 0.10)',
    border: '1px solid rgba(220, 38, 38, 0.35)',
    color: 'rgb(185, 28, 28)',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
}


import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'

type MePrefs = { user_id: string; updated_at: string; preferences: any }

function safeJsonParse(s: string): any {
  try {
    return s.trim() ? JSON.parse(s) : {}
  } catch {
    throw new Error('Must be valid JSON.')
  }
}

export function PreferencesPage(props: { apiBase: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<any>(null)

  const [locale, setLocale] = useState('en')
  const [currency, setCurrency] = useState('USD')
  const [dashboardLayoutJson, setDashboardLayoutJson] = useState('[]')

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setErr(null)
    apiFetch<MePrefs>(props.apiBase, `/v1/staff/me/preferences`)
      .then((r) => {
        if (cancelled) return
        setPrefs(r.preferences || {})
        setLocale(String(r.preferences?.locale || 'en'))
        setCurrency(String(r.preferences?.currency || 'USD'))
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

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      const layout = safeJsonParse(dashboardLayoutJson)
      const payload = {
        preferences: {
          ...(prefs || {}),
          locale: locale.trim() || 'en',
          currency: currency.trim().toUpperCase() || 'USD',
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
      <div style={styles.hSub}>Language, currency, and workspace layout (saved per user).</div>

      {err ? <div style={styles.error}>{err}</div> : null}

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Locale & currency</div>
          <div style={styles.form}>
            <label style={styles.label}>
              Locale
              <input style={styles.input} value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en / es / fr / ar / ..." />
            </label>
            <label style={styles.label}>
              Currency
              <input style={styles.input} value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD / EUR / GBP / ..." />
            </label>
            <button style={styles.primaryBtn} disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <div style={styles.muted}>
              Note: this is the persistence layer. Next, the UI will use these values for formatting, default search filters, and reduced-click booking flows.
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
  muted: { color: 'rgba(230,237,243,0.65)', fontSize: 12, lineHeight: 1.4 },
  mono: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12 },
  error: {
    padding: 12,
    borderRadius: 12,
    background: 'rgba(248,81,73,0.12)',
    border: '1px solid rgba(248,81,73,0.35)',
    color: '#ffb4ae',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
}


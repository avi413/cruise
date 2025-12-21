import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t, i18n } = useTranslation()
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
        const l = String(r.preferences?.locale || 'en')
        setLocale(l)
        i18n.changeLanguage(l) // Sync i18n with saved preference
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
  }, [props.apiBase, i18n])

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
      // Also update i18n immediately if successful
      i18n.changeLanguage(locale)
    } catch (e: any) {
      setErr(String(e?.message || e?.detail || e))
    } finally {
      setBusy(false)
    }
  }

  const changeLocale = (newLocale: string) => {
    setLocale(newLocale)
    i18n.changeLanguage(newLocale)
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.hTitle}>{t('preferences.title')}</div>
      <div style={styles.hSub}>{t('preferences.subtitle')}</div>

      {err ? <div style={styles.error}>{err}</div> : null}

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>{t('preferences.locale_title')}</div>
          <div style={styles.form}>
            <label style={styles.label}>
              {t('preferences.locale_label')}
              <select style={styles.input} value={locale} onChange={(e) => changeLocale(e.target.value)}>
                <option value="en">English</option>
                <option value="he">Hebrew (עברית)</option>
              </select>
            </label>
            <div style={styles.muted}>
              {t('preferences.currency_label')}: <span style={{ fontFamily: styles.mono.fontFamily as any }}>{companyCurrency}</span> (set in <span style={{ fontFamily: styles.mono.fontFamily as any }}>Branding &amp; localization</span>)
            </div>
            <button style={styles.primaryBtn} disabled={busy} onClick={() => void save()}>
              {busy ? t('preferences.saving') : t('preferences.save')}
            </button>
            <div style={styles.muted}>
              {t('preferences.note')}
            </div>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelTitle}>{t('preferences.layout_title')}</div>
          <div style={styles.muted}>{t('preferences.layout_subtitle')}</div>
          <div style={styles.form}>
            <textarea style={{ ...styles.input, minHeight: 260, fontFamily: styles.mono.fontFamily as any }} value={dashboardLayoutJson} onChange={(e) => setDashboardLayoutJson(e.target.value)} />
            <button style={styles.primaryBtn} disabled={busy} onClick={() => void save()}>
              {busy ? t('preferences.saving') : t('preferences.save_layout')}
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

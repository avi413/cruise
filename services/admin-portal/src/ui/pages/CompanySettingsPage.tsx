import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { decodeJwt } from '../components/jwt'
import { getCompany, getToken } from '../components/storage'
import { applyCompanyTheme, CompanySettings } from '../components/theme'
import { Button, ErrorBanner, Input, PageHeader, Panel, Select, TwoCol } from '../components/ui'

type PatchPayload = {
  branding?: Record<string, unknown>
  localization?: Record<string, unknown>
}

function splitList(s: string): string[] {
  const out: string[] = []
  for (const part of (s || '').split(',')) {
    const v = part.trim()
    if (v) out.push(v)
  }
  return Array.from(new Set(out))
}

function joinList(xs: string[] | null | undefined): string {
  return (xs || []).join(', ')
}

export function CompanySettingsPage(props: { apiBase: string }) {
  const company = getCompany()
  const claims = useMemo(() => decodeJwt(getToken()), [])
  const canEdit = Boolean(claims?.platform) || claims?.role === 'admin' || claims?.role === 'staff'

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [settings, setSettings] = useState<CompanySettings | null>(null)

  // Editable fields
  const [displayName, setDisplayName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#388bfd')
  const [secondaryColor, setSecondaryColor] = useState('#9ecbff')
  const [backgroundUrl, setBackgroundUrl] = useState('')
  const [emailFromName, setEmailFromName] = useState('')
  const [emailFromAddress, setEmailFromAddress] = useState('')

  const [defaultLocale, setDefaultLocale] = useState('en')
  const [supportedLocales, setSupportedLocales] = useState('en')
  const [defaultCurrency, setDefaultCurrency] = useState('USD')
  const [supportedCurrencies, setSupportedCurrencies] = useState('USD')

  useEffect(() => {
    let cancelled = false
    if (!company?.id) {
      setErr('No company selected.')
      return
    }
    setBusy(true)
    setErr(null)
    apiFetch<CompanySettings>(props.apiBase, `/v1/companies/${encodeURIComponent(company.id)}/settings`, { auth: false, tenant: false })
      .then((r) => {
        if (cancelled) return
        setSettings(r)
        const b = r.branding || {}
        const l = r.localization || {}
        setDisplayName(String(b.display_name || company.name || ''))
        setLogoUrl(String(b.logo_url || ''))
        setPrimaryColor(String(b.primary_color || '#388bfd'))
        setSecondaryColor(String(b.secondary_color || '#9ecbff'))
        setBackgroundUrl(String(b.background_url || ''))
        setEmailFromName(String(b.email_from_name || company.name || ''))
        setEmailFromAddress(String(b.email_from_address || ''))
        setDefaultLocale(String(l.default_locale || 'en'))
        setSupportedLocales(joinList(l.supported_locales))
        setDefaultCurrency(String(l.default_currency || 'USD'))
        setSupportedCurrencies(joinList(l.supported_currencies))
        applyCompanyTheme(r)
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
  }, [props.apiBase, company?.id, company?.name])

  async function save() {
    if (!company?.id) return
    if (!canEdit) {
      setErr('You do not have permission to edit branding/localization settings.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const payload: PatchPayload = {
        branding: {
          display_name: displayName.trim() || null,
          logo_url: logoUrl.trim() || null,
          primary_color: primaryColor.trim() || null,
          secondary_color: secondaryColor.trim() || null,
          background_url: backgroundUrl.trim() || null,
          email_from_name: emailFromName.trim() || null,
          email_from_address: emailFromAddress.trim() || null,
        },
        localization: {
          default_locale: defaultLocale.trim() || 'en',
          supported_locales: splitList(supportedLocales),
          default_currency: (defaultCurrency.trim() || 'USD').toUpperCase(),
          supported_currencies: splitList(supportedCurrencies).map((c) => c.toUpperCase()),
        },
      }

      const r = await apiFetch<CompanySettings>(props.apiBase, `/v1/companies/${encodeURIComponent(company.id)}/settings`, {
        method: 'PATCH',
        body: payload,
        auth: true,
        tenant: false,
      })
      setSettings(r)
      applyCompanyTheme(r)
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title="Branding & localization"
        subtitle="White-label settings for this company: logo, theme colors, background image, and supported locales/currencies (no code changes required)."
        right={
          <Button variant="primary" disabled={busy || !canEdit || !company?.id} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      <TwoCol
        left={
          <Panel title="Branding" subtitle="These values are used by the portal UI and (next) email templates.">
            <div style={{ display: 'grid', gap: 10 }}>
              <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Oceanic Cruises" />
              <Input label="Logo URL" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" />
              <Input label="Background image URL" value={backgroundUrl} onChange={(e) => setBackgroundUrl(e.target.value)} placeholder="https://…/bg.jpg" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
                <Input label="Primary color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#388bfd" />
                <Input label="Secondary color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} placeholder="#9ecbff" />
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 18, height: 18, borderRadius: 6, background: primaryColor, border: '1px solid rgba(255,255,255,0.18)' }} />
                <div style={{ width: 18, height: 18, borderRadius: 6, background: secondaryColor, border: '1px solid rgba(255,255,255,0.18)' }} />
                <div style={{ color: 'rgba(230,237,243,0.65)', fontSize: 12 }}>Preview swatches</div>
              </div>
              <Input label="Email from name" value={emailFromName} onChange={(e) => setEmailFromName(e.target.value)} placeholder="Oceanic Cruises" />
              <Input label="Email from address" value={emailFromAddress} onChange={(e) => setEmailFromAddress(e.target.value)} placeholder="reservations@oceanic.example" />
            </div>
          </Panel>
        }
        right={
          <Panel title="Localization" subtitle="Supported languages & currencies for multi-market operations.">
            <div style={{ display: 'grid', gap: 10 }}>
              <Input
                label="Supported locales (comma-separated)"
                value={supportedLocales}
                onChange={(e) => setSupportedLocales(e.target.value)}
                placeholder="en, es, fr, ar"
                hint="This enables multi-language content editing and UI language switching."
              />
              <Input label="Default locale" value={defaultLocale} onChange={(e) => setDefaultLocale(e.target.value)} placeholder="en" />
              <Input
                label="Supported currencies (comma-separated)"
                value={supportedCurrencies}
                onChange={(e) => setSupportedCurrencies(e.target.value)}
                placeholder="USD, EUR, GBP"
                hint="Used for quotes/booking and for formatting."
              />
              <Input label="Default currency" value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} placeholder="USD" />

              <Select
                label="Quick switch: preview primary color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                disabled={!settings}
              >
                <option value={primaryColor}>{primaryColor || '(current)'}</option>
                <option value="#388bfd">#388bfd (default blue)</option>
                <option value="#2ea043">#2ea043 (green)</option>
                <option value="#a371f7">#a371f7 (purple)</option>
                <option value="#ff7b72">#ff7b72 (coral)</option>
              </Select>

              <div style={{ color: 'rgba(230,237,243,0.65)', fontSize: 12, lineHeight: 1.45 }}>
                Saved settings are stored per company and are applied instantly in the UI. Next step is to use these values for localized master data (ports/cabins/tours/etc.)
                and outbound email templates.
              </div>
            </div>
          </Panel>
        }
      />
    </div>
  )
}


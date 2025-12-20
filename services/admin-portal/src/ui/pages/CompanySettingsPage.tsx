import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import { decodeJwt } from '../components/jwt'
import { getCompany, getToken } from '../components/storage'
import { applyCompanyTheme, applyPortalTheme, CompanySettings, DEFAULT_PORTAL_THEMES, PortalTheme, PortalThemeTokens } from '../components/theme'
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

function normalizeHex(value: string): string | null {
  const s = (value || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const full = s
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')
    return `#${full}`.toLowerCase()
  }
  return null
}

function parseRgba(value: string): { r: number; g: number; b: number; a: number } | null {
  const s = (value || '').trim()
  const m = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01](?:\.\d+)?)\s*\)$/.exec(s)
  if (!m) return null
  const r = Number(m[1])
  const g = Number(m[2])
  const b = Number(m[3])
  const a = Number(m[4])
  if (![r, g, b, a].every((x) => Number.isFinite(x))) return null
  if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255 || a < 0 || a > 1) return null
  return { r, g, b, a }
}

function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (n: number) => n.toString(16).padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

function pickerValueFromColorString(value: string): string {
  const hex = normalizeHex(value)
  if (hex) return hex
  const rgba = parseRgba(value)
  if (rgba) return rgbToHex(rgba.r, rgba.g, rgba.b)
  return '#000000'
}

function applyPickerToColorString(prevValue: string, pickedHex: string): string {
  const hex = normalizeHex(pickedHex) || '#000000'
  const rgba = parseRgba(prevValue)
  if (!rgba) return hex
  // Preserve alpha if the token was rgba().
  const picked = normalizeHex(hex) || hex
  const rgb = normalizeHex(picked)
  if (!rgb) return hex
  const r = Number.parseInt(rgb.slice(1, 3), 16)
  const g = Number.parseInt(rgb.slice(3, 5), 16)
  const b = Number.parseInt(rgb.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${rgba.a})`
}

function newThemeId(): string {
  return `t_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

function normalizeCustomThemes(raw: any): Array<{ id: string; name: string; tokens: PortalThemeTokens }> {
  const base = DEFAULT_PORTAL_THEMES[0].tokens
  const out: Array<{ id: string; name: string; tokens: PortalThemeTokens }> = []
  for (const t of Array.isArray(raw) ? raw : []) {
    const id = String(t?.id || '').trim()
    const name = String(t?.name || '').trim()
    const tokens = (t?.tokens || {}) as Record<string, string | null | undefined>
    if (!id || !name) continue
    out.push({
      id,
      name,
      tokens: {
        shell_bg_base: String(tokens.shell_bg_base || base.shell_bg_base),
        surface_bg: String(tokens.surface_bg || base.surface_bg),
        surface_2_bg: String(tokens.surface_2_bg || base.surface_2_bg),
        border: String(tokens.border || base.border),
        border_strong: String(tokens.border_strong || base.border_strong),
        text: String(tokens.text || base.text),
        muted: String(tokens.muted || base.muted),
        input_bg: String(tokens.input_bg || base.input_bg),
        input_border: String(tokens.input_border || base.input_border),
        chip_bg: String(tokens.chip_bg || base.chip_bg),
      },
    })
  }
  return out
}

function ThemeColorField(props: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--csp-text, rgba(230,237,243,0.85))' }}>
      {props.label}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="color"
          value={pickerValueFromColorString(props.value)}
          onChange={(e) => props.onChange(applyPickerToColorString(props.value, e.target.value))}
          style={{ width: 42, height: 34, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer' }}
          aria-label={`${props.label} picker`}
        />
        <input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder="#RRGGBB or rgba(r,g,b,a)"
          style={{
            flex: 1,
            padding: '10px 10px',
            borderRadius: 10,
            border: '1px solid var(--csp-input-border, rgba(255,255,255,0.12))',
            background: 'var(--csp-input-bg, rgba(0,0,0,0.25))',
            color: 'var(--csp-text, #e6edf3)',
          }}
        />
        <div
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: 6,
            background: props.value,
            border: '1px solid var(--csp-border-strong, rgba(255,255,255,0.18))',
          }}
        />
      </div>
      {props.hint ? <div style={{ color: 'var(--csp-muted, rgba(230,237,243,0.65))', fontSize: 11, lineHeight: 1.35 }}>{props.hint}</div> : null}
    </label>
  )
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

  // Portal UI themes (company-scoped)
  const [uiThemeActiveId, setUiThemeActiveId] = useState<string>('dark')
  const [uiThemes, setUiThemes] = useState<Array<{ id: string; name: string; tokens: PortalThemeTokens }>>([])
  const [newThemeNameText, setNewThemeNameText] = useState('')

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

        setUiThemeActiveId(String((b as any).ui_theme_active_id || 'dark'))
        setUiThemes(normalizeCustomThemes((b as any).ui_themes))
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
          ui_theme_active_id: uiThemeActiveId,
          ui_themes: uiThemes.map((t) => ({ id: t.id, name: t.name, tokens: t.tokens })),
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

  const allThemes: PortalTheme[] = useMemo(() => {
    return [
      ...DEFAULT_PORTAL_THEMES,
      ...uiThemes.map((t) => ({ id: t.id, name: t.name, builtIn: false, tokens: t.tokens })),
    ]
  }, [uiThemes])

  const selectedTheme: PortalTheme = useMemo(() => {
    return allThemes.find((t) => t.id === uiThemeActiveId) || DEFAULT_PORTAL_THEMES[0]
  }, [allThemes, uiThemeActiveId])

  const selectedCustom = useMemo(() => uiThemes.find((t) => t.id === uiThemeActiveId) || null, [uiThemes, uiThemeActiveId])

  function setSelectedTheme(id: string) {
    setUiThemeActiveId(id)
    const t = allThemes.find((x) => x.id === id) || DEFAULT_PORTAL_THEMES[0]
    applyPortalTheme(t)
  }

  function updateSelectedCustom(patch: Partial<{ name: string; tokens: Partial<PortalThemeTokens> }>) {
    if (!selectedCustom) return
    setUiThemes((prev) =>
      prev.map((t) => {
        if (t.id !== selectedCustom.id) return t
        const next = {
          ...t,
          name: patch.name !== undefined ? patch.name : t.name,
          tokens: patch.tokens ? { ...t.tokens, ...patch.tokens } : t.tokens,
        }
        applyPortalTheme({ id: next.id, name: next.name, builtIn: false, tokens: next.tokens })
        return next
      }),
    )
  }

  function createThemeFromSelected() {
    const name = newThemeNameText.trim()
    if (!name) return
    const id = newThemeId()
    const tokens = selectedTheme.tokens
    const next = { id, name, tokens: { ...tokens } }
    setUiThemes((prev) => [...prev, next])
    setUiThemeActiveId(id)
    setNewThemeNameText('')
    applyPortalTheme({ id, name, builtIn: false, tokens: next.tokens })
  }

  function deleteSelectedTheme() {
    if (!selectedCustom) return
    setUiThemes((prev) => prev.filter((t) => t.id !== selectedCustom.id))
    setUiThemeActiveId('dark')
    applyPortalTheme(DEFAULT_PORTAL_THEMES[0])
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
                <ThemeColorField label="Primary color" value={primaryColor} onChange={setPrimaryColor} hint="Used for primary buttons and active nav states." />
                <ThemeColorField label="Secondary color" value={secondaryColor} onChange={setSecondaryColor} hint="Used for accents and links (where applicable)." />
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

      <Panel
        title="Portal theme (UI)"
        subtitle="Create named themes (Light/Dark + custom) and control portal colors. Background image (above) will override the shell background color when set."
        right={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="secondary" disabled={!selectedCustom || busy || !canEdit} onClick={() => deleteSelectedTheme()} title="Delete custom theme">
              Delete theme
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
            <Select label="Active theme" value={uiThemeActiveId} onChange={(e) => setSelectedTheme(e.target.value)} disabled={!canEdit}>
              {allThemes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.builtIn ? ' (default)' : ''}
                </option>
              ))}
            </Select>

            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--csp-text, rgba(230,237,243,0.85))' }}>
              Create a new theme (copy current)
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  value={newThemeNameText}
                  onChange={(e) => setNewThemeNameText(e.target.value)}
                  placeholder="e.g. Oceanic Dark / Light / High Contrast"
                  style={{
                    flex: 1,
                    padding: '10px 10px',
                    borderRadius: 10,
                    border: '1px solid var(--csp-input-border, rgba(255,255,255,0.12))',
                    background: 'var(--csp-input-bg, rgba(0,0,0,0.25))',
                    color: 'var(--csp-text, #e6edf3)',
                  }}
                />
                <Button variant="primary" disabled={!canEdit || busy || !newThemeNameText.trim()} onClick={() => createThemeFromSelected()}>
                  Create
                </Button>
              </div>
              <div style={{ color: 'var(--csp-muted, rgba(230,237,243,0.65))', fontSize: 11, lineHeight: 1.35 }}>
                Built-in themes are read-only; create a copy to customize.
              </div>
            </label>
          </div>

          {selectedCustom ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
                <Input label="Theme name" value={selectedCustom.name} onChange={(e) => updateSelectedCustom({ name: e.target.value })} />
                <div style={{ color: 'var(--csp-muted, rgba(230,237,243,0.65))', fontSize: 12, lineHeight: 1.45, paddingTop: 28 }}>
                  Tip: use “Save” in the page header to persist this theme for the company.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
                <ThemeColorField label="Shell background" value={selectedCustom.tokens.shell_bg_base} onChange={(v) => updateSelectedCustom({ tokens: { shell_bg_base: v } })} />
                <ThemeColorField label="Text" value={selectedCustom.tokens.text} onChange={(v) => updateSelectedCustom({ tokens: { text: v } })} />

                <ThemeColorField label="Muted text" value={selectedCustom.tokens.muted} onChange={(v) => updateSelectedCustom({ tokens: { muted: v } })} hint="Used for subtitles and hints." />
                <ThemeColorField label="Border (subtle)" value={selectedCustom.tokens.border} onChange={(v) => updateSelectedCustom({ tokens: { border: v } })} />

                <ThemeColorField label="Border (strong)" value={selectedCustom.tokens.border_strong} onChange={(v) => updateSelectedCustom({ tokens: { border_strong: v } })} />
                <ThemeColorField label="Surface" value={selectedCustom.tokens.surface_bg} onChange={(v) => updateSelectedCustom({ tokens: { surface_bg: v } })} hint="Panels/cards background." />

                <ThemeColorField label="Surface 2" value={selectedCustom.tokens.surface_2_bg} onChange={(v) => updateSelectedCustom({ tokens: { surface_2_bg: v } })} hint="Chips/inner cards background." />
                <ThemeColorField label="Input background" value={selectedCustom.tokens.input_bg} onChange={(v) => updateSelectedCustom({ tokens: { input_bg: v } })} />

                <ThemeColorField label="Input border" value={selectedCustom.tokens.input_border} onChange={(v) => updateSelectedCustom({ tokens: { input_border: v } })} />
                <ThemeColorField label="Chip background" value={selectedCustom.tokens.chip_bg} onChange={(v) => updateSelectedCustom({ tokens: { chip_bg: v } })} />
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--csp-muted, rgba(230,237,243,0.65))', fontSize: 12, lineHeight: 1.45 }}>
              Built-in themes can’t be edited directly. Create a new theme above to customize all portal colors.
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}


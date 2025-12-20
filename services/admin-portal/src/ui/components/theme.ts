import { apiFetch } from '../api/client'

export type CompanyBranding = {
  display_name?: string | null
  logo_url?: string | null
  primary_color?: string | null
  secondary_color?: string | null
  background_url?: string | null
  email_from_name?: string | null
  email_from_address?: string | null
  email_templates?: Record<string, unknown>
}

export type CompanyLocalization = {
  default_locale?: string | null
  supported_locales?: string[] | null
  default_currency?: string | null
  supported_currencies?: string[] | null
}

export type CompanySettings = {
  company_id: string
  created_at: string
  updated_at: string
  branding: CompanyBranding
  localization: CompanyLocalization
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const s = (hex || '').trim().replace(/^#/, '')
  if (![3, 6].includes(s.length)) return null
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  const n = Number.parseInt(full, 16)
  if (!Number.isFinite(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgba(hex: string, a: number): string | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const alpha = clamp(a, 0, 1)
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

export function resetThemeToDefaults() {
  const root = document.documentElement
  root.style.removeProperty('--csp-primary')
  root.style.removeProperty('--csp-secondary')
  root.style.removeProperty('--csp-primary-soft')
  root.style.removeProperty('--csp-primary-border')
  root.style.removeProperty('--csp-secondary-soft')
  root.style.removeProperty('--csp-secondary-border')
  root.style.removeProperty('--csp-shell-bg')
  root.style.removeProperty('--csp-logo-url')
  root.style.removeProperty('--csp-display-name')
}

export function applyCompanyTheme(settings: CompanySettings | null | undefined) {
  if (typeof document === 'undefined') return
  if (!settings) {
    resetThemeToDefaults()
    return
  }

  const branding = settings.branding || {}
  const root = document.documentElement

  const primary = String(branding.primary_color || '#388bfd')
  const secondary = String(branding.secondary_color || '#9ecbff')
  root.style.setProperty('--csp-primary', primary)
  root.style.setProperty('--csp-secondary', secondary)

  root.style.setProperty('--csp-primary-soft', rgba(primary, 0.22) || 'rgba(56,139,253,0.22)')
  root.style.setProperty('--csp-primary-border', rgba(primary, 0.55) || 'rgba(56,139,253,0.55)')
  root.style.setProperty('--csp-secondary-soft', rgba(secondary, 0.18) || 'rgba(158,203,255,0.18)')
  root.style.setProperty('--csp-secondary-border', rgba(secondary, 0.42) || 'rgba(158,203,255,0.42)')

  const bgUrl = (branding.background_url || '').trim()
  if (bgUrl) {
    // Use a dark overlay so the portal remains readable regardless of image.
    root.style.setProperty(
      '--csp-shell-bg',
      `linear-gradient(180deg, rgba(11,18,32,0.92) 0%, rgba(11,18,32,0.92) 100%), url("${bgUrl}") center/cover fixed`,
    )
  } else {
    root.style.setProperty('--csp-shell-bg', '#0b1220')
  }

  const logoUrl = (branding.logo_url || '').trim()
  if (logoUrl) root.style.setProperty('--csp-logo-url', `url("${logoUrl}")`)
  else root.style.removeProperty('--csp-logo-url')

  const displayName = (branding.display_name || '').trim()
  if (displayName) root.style.setProperty('--csp-display-name', displayName)
  else root.style.removeProperty('--csp-display-name')
}

export async function fetchCompanySettings(apiBase: string, companyId: string): Promise<CompanySettings> {
  return await apiFetch<CompanySettings>(apiBase, `/v1/companies/${encodeURIComponent(companyId)}/settings`, {
    auth: false,
    tenant: false,
  })
}


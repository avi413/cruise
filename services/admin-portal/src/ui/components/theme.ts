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
  // UI theme builder (stored per company).
  ui_theme_active_id?: string | null
  ui_themes?: Array<{
    id?: string | null
    name?: string | null
    tokens?: Record<string, string | null | undefined>
  }>
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

// Helper to mix a color with white (tint) or black (shade)
// weight: 0-1. 0 = original color, 1 = target color (white/black)
function mix(colorHex: string, targetHex: string, weight: number): string {
  const c = hexToRgb(colorHex)
  const t = hexToRgb(targetHex)
  if (!c || !t) return colorHex
  
  const w = clamp(weight, 0, 1)
  const r = Math.round(c.r * (1 - w) + t.r * w)
  const g = Math.round(c.g * (1 - w) + t.g * w)
  const b = Math.round(c.b * (1 - w) + t.b * w)
  
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
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
  // Portal UI theme tokens (optional).
  root.style.removeProperty('--csp-shell-bg-base')
  root.style.removeProperty('--csp-surface-bg')
  root.style.removeProperty('--csp-surface-2-bg')
  root.style.removeProperty('--csp-border')
  root.style.removeProperty('--csp-border-strong')
  root.style.removeProperty('--csp-text')
  root.style.removeProperty('--csp-muted')
  root.style.removeProperty('--csp-input-bg')
  root.style.removeProperty('--csp-input-border')
  root.style.removeProperty('--csp-chip-bg')
  root.style.removeProperty('--csp-radius-sm')
  root.style.removeProperty('--csp-radius-md')
}

export type PortalThemeTokens = {
  shell_bg_base: string
  surface_bg: string
  surface_2_bg: string
  border: string
  border_strong: string
  text: string
  muted: string
  input_bg: string
  input_border: string
  chip_bg: string
  radius_sm: string
  radius_md: string
}

export type PortalTheme = { id: string; name: string; builtIn: boolean; tokens: PortalThemeTokens }

export const DEFAULT_PORTAL_THEMES: PortalTheme[] = [
  {
    id: 'dark',
    name: 'Dark',
    builtIn: true,
    tokens: {
      shell_bg_base: '#0f172a', // Slate 900
      surface_bg: '#1e293b',    // Slate 800
      surface_2_bg: '#334155',  // Slate 700
      border: '#334155',        // Slate 700
      border_strong: '#475569', // Slate 600
      text: '#f8fafc',          // Slate 50
      muted: '#94a3b8',         // Slate 400
      input_bg: '#1e293b',      // Slate 800
      input_border: '#475569',  // Slate 600
      chip_bg: '#334155',       // Slate 700
      radius_sm: '6px',
      radius_md: '8px',
    },
  },
  {
    id: 'light',
    name: 'Light',
    builtIn: true,
    tokens: {
      // Plusadmin style: Clean white/gray with blue accents
      shell_bg_base: '#f3f4f6', // Gray 100
      surface_bg: '#ffffff',
      surface_2_bg: '#f8fafc',  // Slate 50
      border: '#e2e8f0',        // Slate 200
      border_strong: '#cbd5e1', // Slate 300
      text: '#1e293b',          // Slate 800
      muted: '#64748b',         // Slate 500
      input_bg: '#ffffff',
      input_border: '#e2e8f0',  // Slate 200
      chip_bg: '#f1f5f9',       // Slate 100
      radius_sm: '6px',
      radius_md: '8px',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    builtIn: true,
    tokens: {
      shell_bg_base: '#f0f9ff', // Sky 50
      surface_bg: '#ffffff',
      surface_2_bg: '#e0f2fe',  // Sky 100
      border: '#bae6fd',        // Sky 200
      border_strong: '#7dd3fc', // Sky 300
      text: '#0c4a6e',          // Sky 900
      muted: '#0369a1',         // Sky 700
      input_bg: '#ffffff',
      input_border: '#bae6fd',
      chip_bg: '#e0f2fe',
      radius_sm: '6px',
      radius_md: '8px',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    builtIn: true,
    tokens: {
      shell_bg_base: '#f0fdf4', // Green 50
      surface_bg: '#ffffff',
      surface_2_bg: '#dcfce7',  // Green 100
      border: '#bbf7d0',        // Green 200
      border_strong: '#86efac', // Green 300
      text: '#14532d',          // Green 900
      muted: '#15803d',         // Green 700
      input_bg: '#ffffff',
      input_border: '#bbf7d0',
      chip_bg: '#dcfce7',
      radius_sm: '6px',
      radius_md: '8px',
    },
  },
]

export function generateThemeFromPalette(name: string, primary: string): PortalTheme {
  // Generate a light theme based on the primary color
  const p = primary || '#2563eb'
  
  // Background: very light tint of primary (95% white)
  const shellBg = mix(p, '#ffffff', 0.96)
  
  // Text: very dark shade of primary (80% black)
  const text = mix(p, '#000000', 0.85)
  
  // Muted: medium shade (40% black)
  const muted = mix(p, '#000000', 0.4)
  
  // Border: light shade (20% black)
  const border = rgba(text, 0.15) || 'rgba(0,0,0,0.15)'
  const borderStrong = rgba(text, 0.25) || 'rgba(0,0,0,0.25)'
  
  return {
    id: `gen_${Math.random().toString(36).slice(2)}`,
    name: name || 'Custom Theme',
    builtIn: false,
    tokens: {
      shell_bg_base: shellBg,
      surface_bg: '#ffffff',
      surface_2_bg: rgba(p, 0.08) || 'rgba(0,0,0,0.05)',
      border: border,
      border_strong: borderStrong,
      text: text,
      muted: rgba(text, 0.65) || 'rgba(0,0,0,0.65)',
      input_bg: '#ffffff',
      input_border: borderStrong,
      chip_bg: rgba(p, 0.12) || 'rgba(0,0,0,0.1)',
      radius_sm: '6px',
      radius_md: '8px',
    }
  }
}

function normalizeThemeId(s: unknown): string {
  const v = String(s || '').trim()
  return v || 'light'
}

export function resolvePortalTheme(settings: CompanySettings | null | undefined): PortalTheme {
  const activeId = normalizeThemeId(settings?.branding?.ui_theme_active_id || 'light')
  const custom = (settings?.branding?.ui_themes || [])
    .map((t) => {
      const id = String(t?.id || '').trim()
      const name = String(t?.name || '').trim()
      const tokens = (t?.tokens || {}) as Record<string, string | null | undefined>
      if (!id || !name) return null
      // Merge tokens over the dark defaults to stay resilient to missing fields.
      const base = DEFAULT_PORTAL_THEMES[0].tokens
      const merged: PortalThemeTokens = {
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
        radius_sm: String(tokens.radius_sm || base.radius_sm),
        radius_md: String(tokens.radius_md || base.radius_md),
      }
      return { id, name, builtIn: false, tokens: merged } as PortalTheme
    })
    .filter(Boolean) as PortalTheme[]

  const all = [...DEFAULT_PORTAL_THEMES, ...custom]
  return all.find((t) => t.id === activeId) || DEFAULT_PORTAL_THEMES[0]
}

export function applyPortalTheme(theme: PortalTheme | PortalThemeTokens | null | undefined) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (!theme) return
  const tokens: PortalThemeTokens = (theme as any).tokens ? (theme as any).tokens : (theme as any)
  root.style.setProperty('--csp-shell-bg-base', tokens.shell_bg_base)
  root.style.setProperty('--csp-surface-bg', tokens.surface_bg)
  root.style.setProperty('--csp-surface-2-bg', tokens.surface_2_bg)
  root.style.setProperty('--csp-border', tokens.border)
  root.style.setProperty('--csp-border-strong', tokens.border_strong)
  root.style.setProperty('--csp-text', tokens.text)
  root.style.setProperty('--csp-muted', tokens.muted)
  root.style.setProperty('--csp-input-bg', tokens.input_bg)
  root.style.setProperty('--csp-input-border', tokens.input_border)
  root.style.setProperty('--csp-chip-bg', tokens.chip_bg)
  root.style.setProperty('--csp-radius-sm', tokens.radius_sm)
  root.style.setProperty('--csp-radius-md', tokens.radius_md)
}

export function applyCompanyTheme(settings: CompanySettings | null | undefined) {
  if (typeof document === 'undefined') return

  // Apply portal (shell/UI) theme first; branding can override parts (logo/bg/primary).
  applyPortalTheme(resolvePortalTheme(settings))

  const root = document.documentElement

  if (!settings) {
    root.style.removeProperty('--csp-primary')
    root.style.removeProperty('--csp-secondary')
    root.style.removeProperty('--csp-primary-soft')
    root.style.removeProperty('--csp-primary-border')
    root.style.removeProperty('--csp-secondary-soft')
    root.style.removeProperty('--csp-secondary-border')
    root.style.removeProperty('--csp-logo-url')
    root.style.removeProperty('--csp-display-name')
    
    // Fallback to the portal theme's base background.
    root.style.setProperty('--csp-shell-bg', 'var(--csp-shell-bg-base, #f3f4f6)')
    return
  }

  const branding = settings.branding || {}

  const primary = String(branding.primary_color || '#2563eb')
  const secondary = String(branding.secondary_color || '#60a5fa')
  root.style.setProperty('--csp-primary', primary)
  root.style.setProperty('--csp-secondary', secondary)

  root.style.setProperty('--csp-primary-soft', rgba(primary, 0.22) || 'rgba(37, 99, 235, 0.22)')
  root.style.setProperty('--csp-primary-border', rgba(primary, 0.55) || 'rgba(37, 99, 235, 0.55)')
  root.style.setProperty('--csp-secondary-soft', rgba(secondary, 0.18) || 'rgba(96, 165, 250, 0.18)')
  root.style.setProperty('--csp-secondary-border', rgba(secondary, 0.42) || 'rgba(96, 165, 250, 0.42)')

  const bgUrl = (branding.background_url || '').trim()
  if (bgUrl) {
    // Keep an overlay so the portal remains readable regardless of image.
    root.style.setProperty(
      '--csp-shell-bg',
      `linear-gradient(180deg, color-mix(in srgb, var(--csp-shell-bg-base, #f3f4f6) 92%, transparent) 0%, color-mix(in srgb, var(--csp-shell-bg-base, #f3f4f6) 92%, transparent) 100%), url("${bgUrl}") center/cover fixed`,
    )
  } else {
    // Fallback to the portal theme's base background.
    root.style.setProperty('--csp-shell-bg', 'var(--csp-shell-bg-base, #f3f4f6)')
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

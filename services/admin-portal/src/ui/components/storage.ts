const COMPANY_KEY = 'csp.company'
const TOKEN_KEY = 'csp.token'

export type StoredCompany = { id: string; name: string; code: string }

export function getCompany(): StoredCompany | null {
  try {
    const raw = localStorage.getItem(COMPANY_KEY)
    return raw ? (JSON.parse(raw) as StoredCompany) : null
  } catch {
    return null
  }
}

export function setCompany(c: StoredCompany | null) {
  if (!c) localStorage.removeItem(COMPANY_KEY)
  else localStorage.setItem(COMPANY_KEY, JSON.stringify(c))
}

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY)
  else localStorage.setItem(TOKEN_KEY, token)
}


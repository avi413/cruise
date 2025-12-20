export type JwtClaims = { sub?: string; role?: string; exp?: number; iat?: number } & Record<string, unknown>

function b64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const s = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  // atob isn't always present in older environments, but browsers have it.
  return atob(s)
}

export function decodeJwt(token: string): JwtClaims | null {
  const t = token.trim().replace(/^Bearer\s+/i, '')
  const parts = t.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(b64UrlDecode(parts[1])) as JwtClaims
  } catch {
    return null
  }
}

export function isExpired(claims: JwtClaims | null): boolean {
  const exp = claims?.exp
  if (!exp) return false
  const now = Math.floor(Date.now() / 1000)
  return now >= exp
}


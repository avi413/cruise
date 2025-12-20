// Legacy file kept for backwards compatibility. New code uses `src/ui/api/client.ts`.
export {}

export type Company = {
  id: string
  name: string
  code: string
  tenant_db: string
  created_at: string
}

export type Ship = {
  id: string
  company_id: string
  name: string
  code: string
  operator?: string | null
  decks: number
  status: 'active' | 'inactive' | 'maintenance'
  created_at: string
}

export async function apiGet<T>(url: string, token: string): Promise<T> {
  const r = await fetch(url, {
    headers: token.trim() ? { Authorization: `Bearer ${token.trim()}` } : undefined,
  })
  if (!r.ok) throw new Error(await r.text())
  return (await r.json()) as T
}

export async function apiPost<T>(url: string, token: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(await r.text())
  return (await r.json()) as T
}

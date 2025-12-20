import { getCompany, getToken } from '../components/storage'

export class ApiError extends Error {
  status: number
  detail: string
  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

async function parseError(r: Response): Promise<string> {
  const txt = await r.text()
  try {
    const j = JSON.parse(txt) as any
    if (typeof j?.detail === 'string') return j.detail
    if (typeof j?.detail === 'object') return JSON.stringify(j.detail)
  } catch {
    // ignore
  }
  return txt || `HTTP ${r.status}`
}

export async function apiFetch<T>(apiBase: string, path: string, opts?: { method?: string; body?: unknown; auth?: boolean; tenant?: boolean }) {
  const method = opts?.method || 'GET'
  const headers: Record<string, string> = {}
  if (opts?.body !== undefined) headers['content-type'] = 'application/json'

  if (opts?.tenant !== false) {
    const c = getCompany()
    if (c?.id) headers['X-Company-Id'] = c.id
  }
  if (opts?.auth !== false) {
    const t = getToken().trim()
    if (t) headers.Authorization = `Bearer ${t.replace(/^Bearer\s+/i, '')}`
  }

  const url = `${apiBase}${path}`
  const r = await fetch(url, { method, headers, body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined })
  if (!r.ok) throw new ApiError(r.status, await parseError(r))
  if (r.status === 204) return undefined as T
  return (await r.json()) as T
}


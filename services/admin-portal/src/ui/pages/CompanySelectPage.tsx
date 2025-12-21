import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { decodeJwt } from '../components/jwt'
import { getToken, setCompany, setToken, StoredCompany } from '../components/storage'
import { applyCompanyTheme, fetchCompanySettings } from '../components/theme'

type Company = { id: string; name: string; code: string; created_at: string; tenant_db?: string }

export function CompanySelectPage(props: { apiBase: string }) {
  const nav = useNavigate()
  const [items, setItems] = useState<Company[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [creating, setCreating] = useState(false)

  const endpoint = useMemo(() => `/v1/companies`, [])

  useEffect(() => {
    // This page is the entry point; ensure we start from a neutral theme.
    applyCompanyTheme(null)
    let cancelled = false
    setBusy(true)
    setErr(null)
    apiFetch<{ items: Company[] }>(props.apiBase, endpoint, { auth: false, tenant: false })
      .then((r) => {
        if (!cancelled) setItems(r.items)
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e?.message || e))
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [endpoint, props.apiBase])

  function choose(c: Company) {
    const stored: StoredCompany = { id: c.id, name: c.name, code: c.code }
    setCompany(stored)
    // Apply tenant branding immediately; don't block navigation if it fails.
    fetchCompanySettings(props.apiBase, c.id)
      .then((s) => applyCompanyTheme(s))
      .catch(() => applyCompanyTheme(null))
    const claims = decodeJwt(getToken())
    const isPlatform = Boolean(claims?.platform)
    if (!isPlatform) {
      setToken(null)
      nav('/login')
      return
    }
    nav('/app/dashboard')
  }

  async function createCompany() {
    setCreating(true)
    setErr(null)
    try {
      const r = await apiFetch<Company>(props.apiBase, `/v1/companies`, {
        method: 'POST',
        body: { name, code },
        auth: true,
        tenant: false,
      })
      setName('')
      setCode('')
      setItems([r, ...items])
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.title}>Select a company</div>
        <div style={styles.sub}>Choose the cruise line / company you’re working for, then sign in.</div>

        {err ? <div style={styles.error}>{err}</div> : null}
        {busy ? <div style={styles.muted}>Loading…</div> : null}

        <div style={styles.createBox}>
          <div style={styles.createTitle}>Create company (platform admin)</div>
          <div style={styles.createSub}>Sign in as platform admin first, then create a new tenant/company here.</div>
          <div style={styles.createGrid}>
            <label style={styles.label}>
              Name
              <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Oceanic Cruises" />
            </label>
            <label style={styles.label}>
              Code
              <input style={styles.input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="OCEANIC" />
            </label>
          </div>
          <button style={styles.primaryBtn} disabled={creating || !name.trim() || !code.trim()} onClick={() => void createCompany()}>
            {creating ? 'Creating…' : 'Create company'}
          </button>
        </div>

        <div style={styles.list}>
          {items.map((c) => (
            <button key={c.id} style={styles.rowBtn} onClick={() => choose(c)}>
              <div style={styles.rowTitle}>{c.name}</div>
              <div style={styles.rowSub}>
                {c.code} · {c.id}
              </div>
            </button>
          ))}
          {!busy && items.length === 0 ? <div style={styles.muted}>No companies yet. Create one via API first.</div> : null}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--csp-shell-bg, #0b1220)',
    color: 'var(--csp-text, #e6edf3)',
    display: 'grid',
    placeItems: 'center',
    padding: 18,
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
  },
  card: {
    width: 'min(820px, 100%)',
    borderRadius: 16,
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    background: 'var(--csp-surface-bg, rgba(255,255,255,0.04))',
    padding: 18,
  },
  title: { fontSize: 22, fontWeight: 900 },
  sub: { marginTop: 6, color: 'var(--csp-muted, rgba(230,237,243,0.72))', fontSize: 13 },
  createBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    background: 'var(--csp-surface-2-bg, rgba(0,0,0,0.18))',
  },
  createTitle: { fontWeight: 900 },
  createSub: { marginTop: 6, color: 'var(--csp-muted, rgba(230,237,243,0.65))', fontSize: 12, lineHeight: 1.4 },
  createGrid: { marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'var(--csp-text, rgba(230,237,243,0.85))' },
  input: {
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-input-border, rgba(255,255,255,0.12))',
    background: 'var(--csp-input-bg, rgba(0,0,0,0.25))',
    color: 'var(--csp-text, #e6edf3)',
  },
  primaryBtn: {
    marginTop: 10,
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--csp-primary-border, rgba(56,139,253,0.55))',
    background: 'var(--csp-primary-soft, rgba(56,139,253,0.22))',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 900,
  },
  list: { marginTop: 14, display: 'grid', gap: 10 },
  rowBtn: {
    padding: 14,
    borderRadius: 14,
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    background: 'var(--csp-surface-2-bg, rgba(0,0,0,0.20))',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  rowTitle: { fontWeight: 900 },
  rowSub: { marginTop: 4, color: 'var(--csp-muted, rgba(230,237,243,0.68))', fontSize: 12, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' },
  muted: { color: 'var(--csp-muted, rgba(230,237,243,0.72))', fontSize: 13, marginTop: 12 },
  error: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: 'rgba(248,81,73,0.12)',
    border: '1px solid rgba(248,81,73,0.35)',
    color: '#ffb4ae',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
}


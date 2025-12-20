import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { setCompany, setToken, StoredCompany } from '../components/storage'

type Company = { id: string; name: string; code: string; created_at: string; tenant_db?: string }

export function CompanySelectPage(props: { apiBase: string }) {
  const nav = useNavigate()
  const [items, setItems] = useState<Company[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const endpoint = useMemo(() => `/v1/companies`, [])

  useEffect(() => {
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
    setToken(null)
    nav('/login')
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.title}>Select a company</div>
        <div style={styles.sub}>Choose the cruise line / company you’re working for, then sign in.</div>

        {err ? <div style={styles.error}>{err}</div> : null}
        {busy ? <div style={styles.muted}>Loading…</div> : null}

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
    background: '#0b1220',
    color: '#e6edf3',
    display: 'grid',
    placeItems: 'center',
    padding: 18,
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
  },
  card: {
    width: 'min(820px, 100%)',
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    padding: 18,
  },
  title: { fontSize: 22, fontWeight: 900 },
  sub: { marginTop: 6, color: 'rgba(230,237,243,0.72)', fontSize: 13 },
  list: { marginTop: 14, display: 'grid', gap: 10 },
  rowBtn: {
    padding: 14,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(0,0,0,0.20)',
    color: '#e6edf3',
    cursor: 'pointer',
    textAlign: 'left',
  },
  rowTitle: { fontWeight: 900 },
  rowSub: { marginTop: 4, color: 'rgba(230,237,243,0.68)', fontSize: 12, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' },
  muted: { color: 'rgba(230,237,243,0.72)', fontSize: 13, marginTop: 12 },
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


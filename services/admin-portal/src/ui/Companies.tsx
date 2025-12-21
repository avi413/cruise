import React, { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost, Company } from './api'

export function Companies(props: { apiBase: string; token: string }) {
  const { apiBase, token } = props

  const [items, setItems] = useState<Company[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const endpoint = useMemo(() => `${apiBase}/v1/companies`, [apiBase])

  async function refresh() {
    setError(null)
    const res = await apiGet<{ items: Company[] }>(endpoint, token)
    setItems(res.items)
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      await apiPost(endpoint, token, { name, code })
      setName('')
      setCode('')
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.grid}>
      <section style={styles.panel}>
        <div style={styles.panelTitle}>Create company</div>
        <div style={styles.form}>
          <label style={styles.label}>
            Name
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Oceanic Cruises" />
          </label>
          <label style={styles.label}>
            Code
            <input style={styles.input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="OCEANIC" />
          </label>
          <button style={styles.primaryBtn} disabled={busy || !name.trim() || !code.trim()} onClick={() => void create()}>
            {busy ? 'Creating…' : 'Create'}
          </button>
          {error ? <div style={styles.error}>{error}</div> : null}
          <div style={styles.help}>Requires a token with role <b>staff</b> or <b>admin</b>.</div>
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.panelTitle}>Companies</div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Code</th>
                <th style={styles.th}>Tenant DB</th>
                <th style={styles.th}>ID</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td style={styles.td}>{c.name}</td>
                  <td style={styles.tdMono}>{c.code}</td>
                  <td style={styles.tdMono}>{c.tenant_db}</td>
                  <td style={styles.tdMono}>{c.id}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td style={styles.tdMuted} colSpan={4}>
                    No companies yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: '420px 1fr',
    gap: 14,
    alignItems: 'start',
  },
  panel: {
    border: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    borderRadius: 14,
    background: 'var(--csp-surface-bg, rgba(255,255,255,0.04))',
    padding: 14,
    color: 'var(--csp-text, #e6edf3)',
  },
  panelTitle: { fontWeight: 800, marginBottom: 10 },
  form: { display: 'grid', gap: 10 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'var(--csp-text, rgba(230,237,243,0.85))' },
  input: {
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-input-border, rgba(255,255,255,0.12))',
    background: 'var(--csp-input-bg, rgba(0,0,0,0.25))',
    color: 'var(--csp-text, #e6edf3)',
  },
  primaryBtn: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--csp-primary-border, rgba(56,139,253,0.55))',
    background: 'var(--csp-primary-soft, rgba(56,139,253,0.22))',
    color: 'var(--csp-text, #e6edf3)',
    cursor: 'pointer',
    fontWeight: 700,
  },
  error: {
    padding: 10,
    borderRadius: 10,
    background: 'rgba(220, 38, 38, 0.10)',
    border: '1px solid rgba(220, 38, 38, 0.35)',
    color: 'rgb(185, 28, 28)',
    fontSize: 12,
    whiteSpace: 'pre-wrap',
  },
  help: { fontSize: 12, color: 'var(--csp-muted, rgba(230,237,243,0.65))' },
  tableWrap: { overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.10))',
    color: 'var(--csp-muted, rgba(230,237,243,0.75))',
    fontWeight: 700,
  },
  td: { padding: '10px 8px', borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.06))' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border, rgba(255,255,255,0.06))',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
  },
  tdMuted: { padding: '14px 8px', color: 'var(--csp-muted, rgba(230,237,243,0.60))' },
}

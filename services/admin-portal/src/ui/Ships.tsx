import React, { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost, Company, Ship } from './api'

export function Ships(props: { apiBase: string; token: string }) {
  const { apiBase, token } = props

  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState<string>('')
  const [fleet, setFleet] = useState<Ship[]>([])

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [operator, setOperator] = useState('')
  const [decks, setDecks] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const companiesEndpoint = useMemo(() => `${apiBase}/v1/companies`, [apiBase])
  const fleetEndpoint = useMemo(
    () => (companyId ? `${apiBase}/v1/companies/${companyId}/fleet` : null),
    [apiBase, companyId],
  )

  async function refreshCompanies() {
    const res = await apiGet<{ items: Company[] }>(companiesEndpoint, token)
    setCompanies(res.items)
    if (!companyId && res.items.length) setCompanyId(res.items[0].id)
  }

  async function refreshFleet() {
    if (!fleetEndpoint) {
      setFleet([])
      return
    }
    const res = await apiGet<{ items: Ship[] }>(fleetEndpoint, token)
    setFleet(res.items)
  }

  useEffect(() => {
    refreshCompanies().catch((e) => setError(String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companiesEndpoint])

  useEffect(() => {
    refreshFleet().catch((e) => setError(String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetEndpoint])

  async function createShip() {
    if (!companyId) return

    setBusy(true)
    setError(null)
    try {
      await apiPost(`${apiBase}/v1/ships`, token, {
        company_id: companyId,
        name,
        code,
        operator: operator || null,
        decks,
        status: 'active',
      })
      setName('')
      setCode('')
      setOperator('')
      setDecks(0)
      await refreshFleet()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.grid}>
      <section style={styles.panel}>
        <div style={styles.panelTitle}>Create ship</div>
        <div style={styles.form}>
          <label style={styles.label}>
            Company
            <select style={styles.input} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code}) — {c.tenant_db}
                </option>
              ))}
            </select>
          </label>
          <label style={styles.label}>
            Ship name
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="MV Horizon" />
          </label>
          <label style={styles.label}>
            Ship code
            <input style={styles.input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="HORIZON" />
          </label>
          <label style={styles.label}>
            Operator (optional)
            <input style={styles.input} value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Oceanic" />
          </label>
          <label style={styles.label}>
            Decks
            <input
              style={styles.input}
              value={decks}
              onChange={(e) => setDecks(Number(e.target.value))}
              type="number"
              min={0}
              step={1}
            />
          </label>
          <button style={styles.primaryBtn} disabled={busy || !companyId || !name.trim() || !code.trim()} onClick={() => void createShip()}>
            {busy ? 'Creating…' : 'Create ship'}
          </button>
          {error ? <div style={styles.error}>{error}</div> : null}
          <div style={styles.help}>Requires a token with role <b>staff</b> or <b>admin</b>.</div>
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.panelTitle}>Fleet</div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Code</th>
                <th style={styles.th}>Operator</th>
                <th style={styles.th}>Decks</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {fleet.map((s) => (
                <tr key={s.id}>
                  <td style={styles.td}>{s.name}</td>
                  <td style={styles.tdMono}>{s.code}</td>
                  <td style={styles.td}>{s.operator || '—'}</td>
                  <td style={styles.tdMono}>{s.decks}</td>
                  <td style={styles.td}>{s.status}</td>
                </tr>
              ))}
              {fleet.length === 0 ? (
                <tr>
                  <td style={styles.tdMuted} colSpan={5}>
                    No ships found for this company.
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
    border: '1px solid var(--csp-border)',
    borderRadius: 14,
    background: 'var(--csp-surface-bg)',
    boxShadow: 'var(--csp-shadow-sm)',
    padding: 14,
  },
  panelTitle: { fontWeight: 800, marginBottom: 10 },
  form: { display: 'grid', gap: 10 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'color-mix(in srgb, var(--csp-text) 90%, transparent)' },
  input: {
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid var(--csp-input-border)',
    background: 'var(--csp-input-bg)',
    color: 'var(--csp-text)',
  },
  primaryBtn: {
    padding: '10px 12px',
    borderRadius: 999,
    border: '1px solid var(--csp-primary-border)',
    background: 'var(--csp-primary-soft)',
    color: 'color-mix(in srgb, var(--csp-primary) 72%, var(--csp-text))',
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
  help: { fontSize: 12, color: 'var(--csp-muted)' },
  tableWrap: { overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border)',
    color: 'var(--csp-muted)',
    fontWeight: 700,
  },
  td: { padding: '10px 8px', borderBottom: '1px solid var(--csp-border)' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid var(--csp-border)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
  },
  tdMuted: { padding: '14px 8px', color: 'var(--csp-muted)' },
}

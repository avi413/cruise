import React, { useMemo, useState } from 'react'
import { Companies } from './Companies'
import { Ships } from './Ships'

type Page = 'companies' | 'ships'

function envEdgeUrl(): string {
  // Vite compile-time env
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (import.meta as any).env?.VITE_EDGE_API_URL as string | undefined
  return v?.trim() || 'http://localhost:8000'
}

export function App() {
  const [page, setPage] = useState<Page>('companies')
  const [token, setToken] = useState<string>('')

  const apiBase = useMemo(() => envEdgeUrl(), [])

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>Cruise Admin</div>
        <nav style={styles.nav}>
          <button style={page === 'companies' ? styles.navActive : styles.navBtn} onClick={() => setPage('companies')}>
            Companies
          </button>
          <button style={page === 'ships' ? styles.navActive : styles.navBtn} onClick={() => setPage('ships')}>
            Fleet (Ships)
          </button>
        </nav>
        <div style={styles.card}>
          <div style={styles.cardTitle}>API</div>
          <div style={styles.muted}>Edge API</div>
          <div style={styles.mono}>{apiBase}</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Auth</div>
          <div style={styles.muted}>Paste a Bearer token (role: staff/admin)</div>
          <textarea
            style={styles.textarea}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token…"
          />
        </div>
      </aside>

      <main style={styles.main}>
        <header style={styles.header}>
          <div>
            <div style={styles.hTitle}>{page === 'companies' ? 'Companies' : 'Fleet (Ships)'}</div>
            <div style={styles.hSub}>Manage cruise companies and their ships</div>
          </div>
          <div style={styles.headerRight}>
            <a href={`${apiBase}/docs`} target="_blank" rel="noreferrer" style={styles.link}>
              Edge API docs
            </a>
          </div>
        </header>

        {page === 'companies' ? <Companies apiBase={apiBase} token={token} /> : <Ships apiBase={apiBase} token={token} />}
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr',
    height: '100vh',
    background: '#0b1220',
    color: '#e6edf3',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
  },
  sidebar: {
    borderRight: '1px solid rgba(255,255,255,0.08)',
    padding: 16,
    background: 'linear-gradient(180deg, #0b1220 0%, #0b1220 30%, #0b1220 100%)',
  },
  brand: {
    fontWeight: 700,
    fontSize: 18,
    letterSpacing: 0.2,
    marginBottom: 16,
  },
  nav: { display: 'grid', gap: 8, marginBottom: 16 },
  navBtn: {
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.06)',
    color: '#e6edf3',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
  },
  navActive: {
    padding: '10px 12px',
    background: 'rgba(56,139,253,0.22)',
    color: '#e6edf3',
    border: '1px solid rgba(56,139,253,0.55)',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
  },
  card: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
  },
  cardTitle: { fontWeight: 700, marginBottom: 8 },
  muted: { color: 'rgba(230,237,243,0.7)', fontSize: 12, marginBottom: 8 },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 12 },
  textarea: {
    width: '100%',
    minHeight: 90,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.25)',
    color: '#e6edf3',
    padding: 10,
    resize: 'vertical',
  },
  main: { padding: 18, overflow: 'auto' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  hTitle: { fontSize: 20, fontWeight: 800 },
  hSub: { color: 'rgba(230,237,243,0.7)', fontSize: 13, marginTop: 4 },
  headerRight: { display: 'flex', gap: 10, alignItems: 'center' },
  link: {
    color: '#9ecbff',
    textDecoration: 'none',
    border: '1px solid rgba(158,203,255,0.35)',
    padding: '8px 10px',
    borderRadius: 10,
    background: 'rgba(158,203,255,0.08)',
  },
}

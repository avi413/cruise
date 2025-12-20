import React from 'react'

export function PageHeader(props: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={styles.header}>
      <div>
        <div style={styles.hTitle}>{props.title}</div>
        {props.subtitle ? <div style={styles.hSub}>{props.subtitle}</div> : null}
      </div>
      {props.right ? <div style={styles.headerRight}>{props.right}</div> : null}
    </div>
  )
}

export function Panel(props: { title?: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section style={styles.panel}>
      {props.title || props.subtitle || props.right ? (
        <div style={styles.panelHead}>
          <div>
            {props.title ? <div style={styles.panelTitle}>{props.title}</div> : null}
            {props.subtitle ? <div style={styles.panelSub}>{props.subtitle}</div> : null}
          </div>
          {props.right ? <div>{props.right}</div> : null}
        </div>
      ) : null}
      {props.children}
    </section>
  )
}

export function Button(props: { variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; onClick?: () => void; children: React.ReactNode; title?: string }) {
  const base = styles.btnBase
  const v = props.variant || 'secondary'
  const style = v === 'primary' ? styles.btnPrimary : v === 'danger' ? styles.btnDanger : styles.btnSecondary
  return (
    <button title={props.title} style={{ ...base, ...style, opacity: props.disabled ? 0.55 : 1 }} disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  const input = <input {...props} style={{ ...styles.input, ...(props.style || {}) }} />
  if (!props.label) return input
  return (
    <label style={styles.label}>
      {props.label}
      {input}
      {props.hint ? <div style={styles.hint}>{props.hint}</div> : null}
    </label>
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string }) {
  const sel = <select {...props} style={{ ...styles.input, ...(props.style || {}) }} />
  if (!props.label) return sel
  return (
    <label style={styles.label}>
      {props.label}
      {sel}
      {props.hint ? <div style={styles.hint}>{props.hint}</div> : null}
    </label>
  )
}

export function ErrorBanner(props: { message: string }) {
  return <div style={styles.error}>{props.message}</div>
}

export function Kv(props: { items: { k: string; v: React.ReactNode }[] }) {
  return (
    <div style={styles.kv}>
      {props.items.map((x) => (
        <div key={x.k} style={styles.kvRow}>
          <div style={styles.kvKey}>{x.k}</div>
          <div style={styles.kvVal}>{x.v}</div>
        </div>
      ))}
    </div>
  )
}

export function Mono(props: { children: React.ReactNode }) {
  return <span style={styles.mono}>{props.children}</span>
}

export function TwoCol(props: { left: React.ReactNode; right: React.ReactNode }) {
  return <div style={styles.grid2}>{props.left}{props.right}</div>
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  headerRight: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  hTitle: { fontSize: 22, fontWeight: 900 },
  hSub: { color: 'rgba(230,237,243,0.7)', fontSize: 13, marginTop: 4, maxWidth: 880, lineHeight: 1.4 },
  panel: {
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  panelHead: { display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
  panelTitle: { fontWeight: 900 },
  panelSub: { color: 'rgba(230,237,243,0.65)', fontSize: 12, marginTop: 4, lineHeight: 1.35 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'rgba(230,237,243,0.85)' },
  hint: { color: 'rgba(230,237,243,0.55)', fontSize: 11, lineHeight: 1.35 },
  input: {
    padding: '10px 10px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.25)',
    color: '#e6edf3',
  },
  btnBase: {
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 900,
    border: '1px solid rgba(255,255,255,0.12)',
  },
  btnPrimary: { background: 'rgba(56,139,253,0.22)', border: '1px solid rgba(56,139,253,0.55)', color: '#e6edf3' },
  btnSecondary: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6edf3' },
  btnDanger: { background: 'rgba(248,81,73,0.12)', border: '1px solid rgba(248,81,73,0.35)', color: '#ffb4ae' },
  error: {
    padding: 12,
    borderRadius: 12,
    background: 'rgba(248,81,73,0.12)',
    border: '1px solid rgba(248,81,73,0.35)',
    color: '#ffb4ae',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 12 },
  kv: { display: 'grid', gap: 8 },
  kvRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' },
  kvKey: { color: 'rgba(230,237,243,0.72)', fontSize: 12 },
  kvVal: { color: 'rgba(230,237,243,0.9)' },
}


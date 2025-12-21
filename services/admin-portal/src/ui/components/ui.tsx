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

export type TabItem = { key: string; label: string; badge?: React.ReactNode; disabled?: boolean }

export function Tabs(props: { idBase: string; tabs: TabItem[]; value: string; onChange: (key: string) => void }) {
  function nextEnabled(fromIdx: number, dir: 1 | -1): number {
    const n = props.tabs.length
    for (let step = 1; step <= n; step++) {
      const i = (fromIdx + dir * step + n) % n
      if (!props.tabs[i]?.disabled) return i
    }
    return fromIdx
  }

  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    if (props.tabs.length === 0) return
    const k = e.key
    if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'Home' && k !== 'End') return
    e.preventDefault()

    const targetIdx =
      k === 'Home'
        ? nextEnabled(-1, 1)
        : k === 'End'
          ? nextEnabled(0, -1)
          : k === 'ArrowRight'
            ? nextEnabled(idx, 1)
            : nextEnabled(idx, -1)

    const target = props.tabs[targetIdx]
    if (!target || target.disabled) return
    props.onChange(target.key)

    const el = document.getElementById(`${props.idBase}-tab-${target.key}`)
    if (el instanceof HTMLElement) el.focus()
  }

  return (
    <div role="tablist" aria-label="Sections" style={styles.tabList}>
      {props.tabs.map((t, idx) => {
        const selected = t.key === props.value
        return (
          <button
            key={t.key}
            id={`${props.idBase}-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${props.idBase}-panel-${t.key}`}
            tabIndex={selected ? 0 : -1}
            disabled={t.disabled}
            onClick={() => (t.disabled ? null : props.onChange(t.key))}
            onKeyDown={(e) => onKeyDown(e, idx)}
            style={{ ...styles.tabBtn, ...(selected ? styles.tabBtnActive : null), opacity: t.disabled ? 0.5 : 1 }}
          >
            <span>{t.label}</span>
            {t.badge !== undefined ? <span style={styles.tabBadge}>{t.badge}</span> : null}
          </button>
        )
      })}
    </div>
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

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  const ta = <textarea {...props} style={{ ...styles.input, ...(props.style || {}) }} />
  if (!props.label) return ta
  return (
    <label style={styles.label}>
      {props.label}
      {ta}
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
  hTitle: { fontSize: 22, fontWeight: 950, color: 'var(--csp-text)' },
  hSub: { color: 'var(--csp-muted)', fontSize: 13, marginTop: 4, maxWidth: 880, lineHeight: 1.45 },
  panel: {
    border: '1px solid var(--csp-border)',
    borderRadius: 'var(--csp-radius, 14px)',
    background: 'var(--csp-surface-bg)',
    boxShadow: 'var(--csp-shadow-sm, none)',
    padding: 14,
    color: 'var(--csp-text)',
  },
  panelHead: { display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
  panelTitle: { fontWeight: 950 },
  panelSub: { color: 'var(--csp-muted)', fontSize: 12, marginTop: 4, lineHeight: 1.35 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' },
  label: { display: 'grid', gap: 6, fontSize: 13, color: 'color-mix(in srgb, var(--csp-text) 90%, transparent)' },
  hint: { color: 'color-mix(in srgb, var(--csp-muted) 92%, transparent)', fontSize: 11, lineHeight: 1.35 },
  input: {
    padding: '10px 10px',
    borderRadius: 'var(--csp-radius-sm, 10px)',
    border: '1px solid var(--csp-input-border)',
    background: 'var(--csp-input-bg)',
    color: 'var(--csp-text)',
  },
  btnBase: {
    padding: '10px 12px',
    borderRadius: 999,
    cursor: 'pointer',
    fontWeight: 950,
    border: '1px solid var(--csp-border-strong)',
  },
  btnPrimary: {
    background: 'var(--csp-primary-soft)',
    border: '1px solid var(--csp-primary-border)',
    color: 'color-mix(in srgb, var(--csp-primary) 72%, var(--csp-text))',
  },
  btnSecondary: {
    background: 'color-mix(in srgb, var(--csp-surface-bg) 84%, transparent)',
    border: '1px solid var(--csp-border-strong)',
    color: 'var(--csp-text)',
  },
  btnDanger: { background: 'rgba(220, 38, 38, 0.10)', border: '1px solid rgba(220, 38, 38, 0.35)', color: 'rgb(185, 28, 28)' },
  tabList: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
    padding: 2,
  },
  tabBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 999,
    cursor: 'pointer',
    fontWeight: 950,
    border: '1px solid var(--csp-border)',
    background: 'var(--csp-surface-bg)',
    boxShadow: 'var(--csp-shadow-sm, none)',
    color: 'var(--csp-text)',
    whiteSpace: 'nowrap',
  },
  tabBtnActive: {
    background: 'var(--csp-primary-soft)',
    border: '1px solid var(--csp-primary-border)',
  },
  tabBadge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 950,
    border: '1px solid var(--csp-border)',
    background: 'var(--csp-surface-2-bg)',
    color: 'var(--csp-text)',
  },
  error: {
    padding: 12,
    borderRadius: 12,
    background: 'rgba(220, 38, 38, 0.10)',
    border: '1px solid rgba(220, 38, 38, 0.35)',
    color: 'rgb(185, 28, 28)',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 12 },
  kv: { display: 'grid', gap: 8 },
  kvRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' },
  kvKey: { color: 'var(--csp-muted)', fontSize: 12 },
  kvVal: { color: 'var(--csp-text)' },
}


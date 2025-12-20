import React from 'react'
import { decodeJwt, permsFromClaims } from './jwt'
import { getToken } from './storage'

export function RequirePerm(props: { anyOf: string[]; children: React.ReactNode }) {
  const claims = decodeJwt(getToken())
  const perms = permsFromClaims(claims)
  const ok = props.anyOf.length === 0 || props.anyOf.some((p) => perms.has(p))
  if (ok) return <>{props.children}</>
  return (
    <div style={styles.wrap}>
      <div style={styles.title}>Access denied</div>
      <div style={styles.sub}>You don’t have permission to view this module.</div>
      <div style={styles.mono}>Required: {props.anyOf.join(', ')}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  title: { fontSize: 18, fontWeight: 900 },
  sub: { marginTop: 6, color: 'rgba(230,237,243,0.70)', fontSize: 13 },
  mono: { marginTop: 10, color: 'rgba(230,237,243,0.65)', fontSize: 12, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' },
}


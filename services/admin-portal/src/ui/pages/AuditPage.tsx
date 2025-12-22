import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../api/client'
import { Button, ErrorBanner, Input, Mono, PageHeader, Panel } from '../components/ui'

type AuditLog = {
  id: string
  occurred_at: string
  actor_user_id: string | null
  actor_role: string | null
  action: string
  entity_type: string
  entity_id: string | null
  meta: any
}

export function AuditPage(props: { apiBase: string }) {
  const { t } = useTranslation()
  const [limit, setLimit] = useState(200)
  const [actorUserId, setActorUserId] = useState('')
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')

  const [items, setItems] = useState<AuditLog[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const endpoint = useMemo(() => `/v1/staff/audit`, [])

  async function refresh() {
    setBusy(true)
    setErr(null)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(Math.max(1, Math.min(500, Number(limit) || 200))))
      if (actorUserId.trim()) params.set('actor_user_id', actorUserId.trim())
      if (action.trim()) params.set('action', action.trim())
      if (entityType.trim()) params.set('entity_type', entityType.trim())
      if (entityId.trim()) params.set('entity_id', entityId.trim())
      const r = await apiFetch<AuditLog[]>(props.apiBase, `${endpoint}?${params.toString()}`)
      setItems(r || [])
    } catch (e: any) {
      setErr(String(e?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    refresh().catch((e) => setErr(String(e?.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PageHeader
        title={t('audit.title')}
        subtitle={t('audit.subtitle')}
        right={
          <Button disabled={busy} onClick={() => void refresh()}>
            {busy ? t('audit.btn_refreshing') : t('audit.btn_refresh')}
          </Button>
        }
      />

      {err ? <ErrorBanner message={err} /> : null}

      <Panel title={t('audit.filters.title')} subtitle={t('audit.filters.subtitle')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Input label={t('audit.filters.label_actor')} value={actorUserId} onChange={(e) => setActorUserId(e.target.value)} placeholder="JWT sub / staff_user.id" />
          <Input label={t('audit.filters.label_action')} value={action} onChange={(e) => setAction(e.target.value)} placeholder="customer.patch" />
          <Input label={t('audit.filters.label_entity_type')} value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="customer" />
          <Input label={t('audit.filters.label_entity_id')} value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="UUID" />
          <Input label={t('audit.filters.label_limit')} type="number" min="1" max="500" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
            <Button variant="primary" disabled={busy} onClick={() => void refresh()}>
              {t('audit.filters.btn_apply')}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title={t('audit.events.title', { count: items.length })} subtitle={t('audit.events.subtitle')}>
        <div style={{ overflow: 'auto' }}>
          <table style={tableStyles.table}>
            <thead>
              <tr>
                <th style={tableStyles.th}>{t('audit.events.th_time')}</th>
                <th style={tableStyles.th}>{t('audit.events.th_actor')}</th>
                <th style={tableStyles.th}>{t('audit.events.th_action')}</th>
                <th style={tableStyles.th}>{t('audit.events.th_entity')}</th>
                <th style={tableStyles.th}>{t('audit.events.th_meta')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td style={tableStyles.tdMono}>{a.occurred_at}</td>
                  <td style={tableStyles.td}>
                    <div>
                      <Mono>{a.actor_user_id || '—'}</Mono>
                    </div>
                    <div style={tableStyles.sub}>{t('audit.events.role')} {a.actor_role || '—'}</div>
                  </td>
                  <td style={tableStyles.tdMono}>{a.action}</td>
                  <td style={tableStyles.td}>
                    <div style={{ fontWeight: 800 }}>{a.entity_type}</div>
                    <div style={tableStyles.sub}>
                      {t('audit.events.id')} <Mono>{a.entity_id || '—'}</Mono>
                    </div>
                  </td>
                  <td style={tableStyles.tdMono}>{truncate(JSON.stringify(a.meta || {}), 420)}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} style={tableStyles.empty}>
                    {t('audit.events.empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}

const tableStyles: Record<string, React.CSSProperties> = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.10)',
    color: 'rgba(230,237,243,0.75)',
    fontWeight: 900,
  },
  td: { padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' },
  tdMono: {
    padding: '10px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    verticalAlign: 'top',
  },
  sub: { marginTop: 4, color: 'rgba(230,237,243,0.65)', fontSize: 12, lineHeight: 1.35 },
  empty: { padding: '14px 8px', color: 'rgba(230,237,243,0.60)' },
}


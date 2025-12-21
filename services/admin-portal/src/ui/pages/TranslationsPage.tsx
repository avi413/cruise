import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useTranslation } from 'react-i18next'

export function TranslationsPage(props: { apiBase: string }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({ lang: 'en', namespace: 'translation', key: '', value: '' })

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<any[]>(props.apiBase, '/v1/translations')
      setItems(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [props.apiBase])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiFetch(props.apiBase, '/v1/translations', { method: 'POST', body: form })
      setForm({ lang: 'en', namespace: 'translation', key: '', value: '' })
      load()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const remove = async (id: string) => {
    if (!confirm(t('translations_page.confirm_delete'))) return
    try {
      await apiFetch(props.apiBase, `/v1/translations/${id}`, { method: 'DELETE' })
      load()
    } catch (e: any) {
      alert(e.message)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>{t('translations_page.title')}</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
        <form onSubmit={submit} style={{ display: 'grid', gap: 10, alignSelf: 'start', padding: 20, background: 'var(--csp-surface-bg)', borderRadius: 10, border: '1px solid var(--csp-border)' }}>
          <h3>{t('translations_page.add_edit_title')}</h3>
          <div>
            <label>{t('translations_page.language')}</label>
            <select value={form.lang} onChange={e => setForm({...form, lang: e.target.value})} style={styles.input}>
                <option value="en">English (en)</option>
                <option value="he">Hebrew (he)</option>
            </select>
          </div>
          <div>
            <label>{t('translations_page.namespace')}</label>
            <input value={form.namespace} onChange={e => setForm({...form, namespace: e.target.value})} style={styles.input} />
          </div>
          <div>
            <label>{t('translations_page.key')}</label>
            <input value={form.key} onChange={e => setForm({...form, key: e.target.value})} style={styles.input} />
          </div>
          <div>
            <label>{t('translations_page.value')}</label>
            <textarea value={form.value} onChange={e => setForm({...form, value: e.target.value})} style={{...styles.input, height: 100}} />
          </div>
          <button type="submit" style={styles.btn}>{t('translations_page.save')}</button>
        </form>

        <div style={{ background: 'var(--csp-surface-bg)', borderRadius: 10, border: '1px solid var(--csp-border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--csp-surface-2-bg)', borderBottom: '1px solid var(--csp-border)' }}>
                    <tr>
                        <th style={styles.th}>{t('translations_page.table_lang')}</th>
                        <th style={styles.th}>{t('translations_page.table_namespace')}</th>
                        <th style={styles.th}>{t('translations_page.table_key')}</th>
                        <th style={styles.th}>{t('translations_page.table_value')}</th>
                        <th style={styles.th}>{t('translations_page.actions')}</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(it => (
                        <tr key={it.id} style={{ borderBottom: '1px solid var(--csp-border)' }}>
                            <td style={styles.td}>{it.lang}</td>
                            <td style={styles.td}>{it.namespace}</td>
                            <td style={styles.td}>{it.key}</td>
                            <td style={styles.td}>{it.value}</td>
                            <td style={styles.td}>
                                <button type="button" onClick={() => setForm({ lang: it.lang, namespace: it.namespace, key: it.key, value: it.value })} style={styles.linkBtn}>{t('translations_page.edit')}</button>
                                <span style={{ margin: '0 5px', color: '#ccc' }}>|</span>
                                <button type="button" onClick={() => remove(it.id)} style={{ ...styles.linkBtn, color: 'red' }}>{t('translations_page.delete')}</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {items.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>{t('translations_page.no_translations')}</div>}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
    input: { display: 'block', width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--csp-border)', background: 'transparent', color: 'var(--csp-text)' },
    btn: { padding: '10px', borderRadius: 6, border: 'none', background: 'var(--csp-primary)', color: 'white', fontWeight: 'bold', cursor: 'pointer' },
    th: { padding: 10, textAlign: 'left', fontSize: 13, fontWeight: 700, color: 'var(--csp-muted)' },
    td: { padding: 10, fontSize: 14 },
    linkBtn: { background: 'none', border: 'none', color: 'var(--csp-primary)', cursor: 'pointer', fontWeight: 600, padding: 0 }
}

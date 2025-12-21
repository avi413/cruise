import React from 'react'
import { useTranslation } from 'react-i18next'

export function LanguageSwitcher(props: { style?: React.CSSProperties }) {
  const { i18n } = useTranslation()

  const current = i18n.language || 'en'

  const toggle = () => {
    const next = current === 'en' ? 'he' : 'en'
    i18n.changeLanguage(next)
    // Also set dir for Hebrew
    document.documentElement.dir = next === 'he' ? 'rtl' : 'ltr'
    document.documentElement.lang = next
  }

  return (
    <button onClick={toggle} style={{ ...styles.btn, ...props.style }} title="Switch Language">
      {current.toUpperCase()}
    </button>
  )
}

const styles = {
  btn: {
    padding: '6px 10px',
    borderRadius: 'var(--csp-radius-sm, 10px)',
    border: '1px solid var(--csp-border)',
    background: 'var(--csp-surface-bg)',
    color: 'var(--csp-text)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    display: 'grid',
    placeItems: 'center',
    boxShadow: 'var(--csp-shadow-sm)',
  },
}

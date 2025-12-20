import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { decodeJwt, isExpired } from './jwt'
import { getCompany, getToken, setToken } from './storage'

export function RequireAuth(props: { apiBase: string; children: React.ReactNode }) {
  const loc = useLocation()
  const company = getCompany()
  const token = getToken()
  const claims = decodeJwt(token)
  const ok = Boolean(company?.id) && Boolean(token) && !isExpired(claims)

  if (!company?.id) return <Navigate to="/company" replace />
  if (!token || !ok) {
    if (token && isExpired(claims)) setToken(null)
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  }
  return <>{props.children}</>
}


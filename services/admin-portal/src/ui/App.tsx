import React, { useMemo } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { RequireAuth } from './components/auth'
import { decodeJwt, isExpired } from './components/jwt'
import { getCompany, getToken } from './components/storage'
import { CompanySelectPage } from './pages/CompanySelectPage'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { CruisesPage } from './pages/CruisesPage'
import { FleetPage } from './pages/FleetPage'
import { SailingsPage } from './pages/SailingsPage'
import { CustomersPage } from './pages/CustomersPage'
import { SalesPage } from './pages/SalesPage'
import { PricingPage } from './pages/PricingPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { AuditPage } from './pages/AuditPage'
import { ReportsPage } from './pages/ReportsPage'
import { UsersPage } from './pages/UsersPage'
import { PreferencesPage } from './pages/PreferencesPage'
import { RequirePerm } from './components/RequirePerm'

function envEdgeUrl(): string {
  // Vite compile-time env
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (import.meta as any).env?.VITE_EDGE_API_URL as string | undefined
  return v?.trim() || 'http://localhost:8000'
}

export function App() {
  const apiBase = useMemo(() => envEdgeUrl(), [])
  const initial = useMemo(() => {
    const company = getCompany()
    const token = getToken()
    const claims = decodeJwt(token)
    const okToken = Boolean(token) && !isExpired(claims)
    if (company?.id && okToken) return '/app/dashboard'
    return '/login'
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={initial} replace />} />
        <Route path="/company" element={<CompanySelectPage apiBase={apiBase} />} />
        <Route path="/login" element={<LoginPage apiBase={apiBase} />} />

        <Route
          path="/app"
          element={
            <RequireAuth apiBase={apiBase}>
              <Shell apiBase={apiBase} />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage apiBase={apiBase} />} />
          <Route
            path="cruises"
            element={
              <RequirePerm anyOf={['sailings.read', 'sales.quote', 'sales.hold', 'sales.confirm']}>
                <CruisesPage apiBase={apiBase} />
              </RequirePerm>
            }
          />
          <Route path="fleet" element={<FleetPage apiBase={apiBase} />} />
          <Route path="sailings" element={<SailingsPage apiBase={apiBase} />} />
          <Route path="customers" element={<CustomersPage apiBase={apiBase} />} />
          <Route path="sales" element={<SalesPage apiBase={apiBase} />} />
          <Route
            path="reports"
            element={
              <RequirePerm anyOf={['sales.hold', 'sales.confirm', 'inventory.read', 'inventory.write']}>
                <ReportsPage apiBase={apiBase} />
              </RequirePerm>
            }
          />
          <Route
            path="pricing"
            element={
              <RequirePerm anyOf={['rates.write']}>
                <PricingPage apiBase={apiBase} />
              </RequirePerm>
            }
          />
          <Route
            path="notifications"
            element={
              <RequirePerm anyOf={['sales.hold', 'sales.confirm', 'customers.read']}>
                <NotificationsPage apiBase={apiBase} />
              </RequirePerm>
            }
          />
          <Route
            path="audit"
            element={
              <RequirePerm anyOf={['users.manage']}>
                <AuditPage apiBase={apiBase} />
              </RequirePerm>
            }
          />
          <Route
            path="users"
            element={
              <RequirePerm anyOf={['users.manage']}>
                <UsersPage apiBase={apiBase} />
              </RequirePerm>
            }
          />
          <Route path="preferences" element={<PreferencesPage apiBase={apiBase} />} />
        </Route>

        <Route path="*" element={<Navigate to="/company" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

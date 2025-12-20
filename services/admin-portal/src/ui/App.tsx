import React, { useMemo } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { RequireAuth } from './components/auth'
import { CompanySelectPage } from './pages/CompanySelectPage'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { FleetPage } from './pages/FleetPage'
import { SailingsPage } from './pages/SailingsPage'
import { CustomersPage } from './pages/CustomersPage'
import { SalesPage } from './pages/SalesPage'
import { UsersPage } from './pages/UsersPage'

function envEdgeUrl(): string {
  // Vite compile-time env
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (import.meta as any).env?.VITE_EDGE_API_URL as string | undefined
  return v?.trim() || 'http://localhost:8000'
}

export function App() {
  const apiBase = useMemo(() => envEdgeUrl(), [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/company" replace />} />
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
          <Route path="fleet" element={<FleetPage apiBase={apiBase} />} />
          <Route path="sailings" element={<SailingsPage apiBase={apiBase} />} />
          <Route path="customers" element={<CustomersPage apiBase={apiBase} />} />
          <Route path="sales" element={<SalesPage apiBase={apiBase} />} />
          <Route path="users" element={<UsersPage apiBase={apiBase} />} />
        </Route>

        <Route path="*" element={<Navigate to="/company" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

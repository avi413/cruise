import React from 'react'
import { getCompany } from '../components/storage'

export function DashboardPage(_props: { apiBase: string }) {
  const company = getCompany()
  return (
    <div style={styles.wrap}>
      <div style={styles.hTitle}>Dashboard</div>
      <div style={styles.hSub}>
        {company ? `Signed in for ${company.name} (${company.code}).` : 'No company selected.'}
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Daily workflow</div>
          <ul style={styles.ul}>
            <li>Search customer → view profile & booking history</li>
            <li>Create quote → place hold → confirm booking</li>
            <li>Manage sailings & itinerary port stops</li>
            <li>Manage ship cabin categories, cabins, accessories</li>
          </ul>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>What’s implemented in this repo (now)</div>
          <ul style={styles.ul}>
            <li>Tenant login + staff users (admin can manage users)</li>
            <li>Ships + cabin categories + cabins + per-cabin accessories</li>
            <li>Sailings + itinerary port stops (cruise-service)</li>
            <li>Sales: quote/hold/confirm + inventory capacity per sailing/cabin_type</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'grid', gap: 12 },
  hTitle: { fontSize: 22, fontWeight: 900 },
  hSub: { color: 'rgba(230,237,243,0.7)', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' },
  card: {
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  cardTitle: { fontWeight: 900, marginBottom: 8 },
  ul: { margin: 0, paddingLeft: 18, color: 'rgba(230,237,243,0.85)', lineHeight: 1.55, fontSize: 13 },
}


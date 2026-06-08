type Props = {
  label: string
  value: string
  sub?: string
  color?: 'default' | 'success' | 'danger' | 'warning'
}

const colorMap = {
  default: 'var(--cream)',
  success: 'var(--admin-success)',
  danger:  'var(--admin-danger)',
  warning: 'var(--admin-warning)',
}

export default function MetricCard({ label, value, sub, color = 'default' }: Props) {
  return (
    <div style={{
      background: 'var(--admin-card-bg)',
      border: '1px solid var(--admin-border)',
      borderRadius: '8px',
      padding: '20px 24px',
    }}>
      <p style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.12em', marginBottom: '12px' }}>
        {label}
      </p>
      <p style={{ fontSize: '26px', fontWeight: 300, color: colorMap[color], letterSpacing: '0.04em' }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '6px' }}>{sub}</p>
      )}
    </div>
  )
}

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
    <div
      className="admin-metric-card"
      style={{
        background: 'var(--admin-card-bg)',
        border: '1px solid var(--admin-border)',
        borderRadius: '10px',
        padding: '22px 24px',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      <p style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.12em', marginBottom: '14px' }}>
        {label}
      </p>
      <p style={{
        fontSize: '28px',
        fontWeight: 300,
        color: colorMap[color],
        letterSpacing: '0.02em',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
      }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '8px' }}>{sub}</p>
      )}
    </div>
  )
}

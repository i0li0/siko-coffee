type Item = {
  label: string
  current: number
  goal: number
  unit: string
  alert?: string
}

function Bar({ current, goal }: { current: number; goal: number }) {
  const pct = Math.min(100, Math.round((current / goal) * 100))
  const color = pct >= 100 ? 'var(--admin-success)' : pct >= 60 ? 'var(--admin-warning)' : 'var(--admin-accent)'
  return (
    <div style={{ background: 'rgba(240,235,224,0.06)', borderRadius: '3px', height: '6px', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.4s' }} />
    </div>
  )
}

export default function GoalProgress({ items }: { items: Item[] }) {
  return (
    <div style={{
      background: 'var(--admin-card-bg)',
      border: '1px solid var(--admin-border)',
      borderRadius: '8px',
      padding: '20px 24px',
    }}>
      <p style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.12em', marginBottom: '20px' }}>
        年間目標進捗
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {items.map(item => {
          const pct = Math.min(100, Math.round((item.current / item.goal) * 100))
          return (
            <div key={item.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--cream)' }}>{item.label}</span>
                <span style={{ fontSize: '12px', color: 'var(--dim)' }}>
                  {item.current.toLocaleString()}{item.unit} / {item.goal.toLocaleString()}{item.unit}
                  <span style={{ marginLeft: '8px', color: 'var(--admin-accent)' }}>{pct}%</span>
                </span>
              </div>
              <Bar current={item.current} goal={item.goal} />
              {item.alert && (
                <p style={{ fontSize: '11px', color: 'var(--admin-warning)', marginTop: '6px' }}>
                  {item.alert}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

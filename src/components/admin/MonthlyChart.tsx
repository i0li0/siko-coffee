'use client'

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

type Props = {
  labels: string[]   // ['1月','2月', ...]
  profits: number[]  // 損益（円）
}

export default function MonthlyChart({ labels, profits }: Props) {
  const data = {
    labels,
    datasets: [
      {
        label: '月次損益',
        data: profits,
        borderColor: 'var(--admin-accent)',
        backgroundColor: 'rgba(184,190,200,0.08)',
        pointBackgroundColor: profits.map(v => v >= 0 ? '#6aaa3a' : '#e05555'),
        pointRadius: 4,
        borderWidth: 1.5,
        tension: 0.3,
        fill: true,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { raw: unknown }) => `¥${Number(ctx.raw).toLocaleString()}`,
        },
        backgroundColor: '#0d0d14',
        borderColor: 'rgba(240,235,224,0.08)',
        borderWidth: 1,
        titleColor: 'rgba(240,235,224,0.45)',
        bodyColor: '#E8E0D0',
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(240,235,224,0.05)' },
        ticks: { color: 'rgba(240,235,224,0.45)', font: { size: 11 } },
      },
      y: {
        grid: { color: 'rgba(240,235,224,0.05)' },
        ticks: {
          color: 'rgba(240,235,224,0.45)',
          font: { size: 11 },
          callback: (v: unknown) => `¥${Number(v).toLocaleString()}`,
        },
      },
    },
  }

  return (
    <div style={{
      background: 'var(--admin-card-bg)',
      border: '1px solid var(--admin-border)',
      borderRadius: '10px',
      padding: '20px 24px',
    }}>
      <p style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.12em', marginBottom: '16px' }}>
        月次損益推移
      </p>
      <div style={{ height: '200px' }}>
        <Line data={data} options={options as Parameters<typeof Line>[0]['options']} />
      </div>
    </div>
  )
}

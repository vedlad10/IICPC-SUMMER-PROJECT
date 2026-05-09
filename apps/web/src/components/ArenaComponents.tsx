import React from 'react'
import { motion } from 'framer-motion'

interface SparklineProps {
  data: number[]
  color?: string
  width?: number
  height?: number
}

export function Sparkline({ data, color = 'var(--accent)', width = 120, height = 40 }: SparklineProps) {
  if (!data || data.length < 2) return null
  
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((val - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`grad-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M ${points.split(' ')[0]} L ${points} L ${width},${height} L 0,${height} Z`}
        fill={`url(#grad-${color})`}
        opacity="0.3"
      />
      <motion.polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: 'easeInOut' }}
      />
    </svg>
  )
}

export function TerminalFeed() {
  const [logs, setLogs] = React.useState<string[]>([
    `[${new Date().toLocaleTimeString()}] CLUSTER_UPLINK_STABLE`,
    `[${new Date().toLocaleTimeString()}] INGESTING TELEMETRY FLOW...`,
  ])

  React.useEffect(() => {
    const events = [
      'deploying benchmark...',
      'consensus stable',
      'latency spike detected',
      'run complete',
      'recalculating standings',
      'isolated sandbox initialized',
      'memory pinning successful'
    ]
    
    const interval = setInterval(() => {
      const event = events[Math.floor(Math.random() * events.length)]
      const timestamp = new Date().toLocaleTimeString()
      setLogs(prev => [...prev.slice(-15), `[${timestamp}] ${event.toUpperCase()}`])
    }, 4000)
    
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="terminal-feed mono" style={{
      fontSize: '0.65rem',
      color: 'var(--text-dim)',
      height: '100%',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      padding: '1rem',
      background: 'rgba(0,0,0,0.4)',
      borderLeft: '1px solid var(--border)',
      gap: '4px'
    }}>
      {logs.map((log, i) => (
        <div key={i} style={{ opacity: (i + 1) / logs.length }}>{log}</div>
      ))}
      <div style={{ color: 'var(--accent)', marginTop: '4px' }}>_</div>
    </div>
  )
}

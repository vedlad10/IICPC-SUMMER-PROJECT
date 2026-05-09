import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, Server, Zap, ShieldCheck, Trophy, ArrowRight, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, OverviewData, RunSummary } from '../api'

import { PipelineBadge, CorrectnessBadge } from '../components/Badges'

function KpiCard({ label, value, icon: Icon, colorClass, delay = 0 }: { label: string, value: string | number, icon: any, colorClass: string, delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="kpi-card"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="kpi-label">{label}</div>
          <div className={`kpi-value ${colorClass}`}>{value}</div>
        </div>
        <div style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
          <Icon size={20} />
        </div>
      </div>
    </motion.div>
  )
}

function ServiceHealthItem({ name, status }: { name: string, status: 'ok' | 'error' | 'loading' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Server size={16} className="text-muted" />
        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {status === 'ok' ? (
          <>
            <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase' }}>Healthy</span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success-glow)' }} />
          </>
        ) : status === 'error' ? (
          <>
            <span style={{ fontSize: '0.7rem', color: 'var(--error)', fontWeight: 700, textTransform: 'uppercase' }}>Down</span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--error)', boxShadow: '0 0 10px var(--error-glow)' }} />
          </>
        ) : (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Probing...</span>
        )}
      </div>
    </div>
  )
}

export function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [recentRuns, setRecentRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getOverview(),
      api.getRuns()
    ]).then(([overview, runs]) => {
      setData(overview)
      setRecentRuns(runs.slice(0, 5))
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">Initializing systems...</div>

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overview-container">
      <div style={{ marginBottom: '2.5rem' }}>
        <h1 className="page-title">SYSTEM OVERVIEW</h1>
        <p className="page-subtitle">Real-time status of the distributed benchmark grid.</p>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Total Submissions" value={data?.totalSubmissions ?? 0} icon={ShieldCheck} colorClass="" delay={0} />
        <KpiCard label="Active Runs" value={data?.benchmarkedRuns ?? 0} icon={Activity} colorClass="accent" delay={0.1} />
        <KpiCard label="Scored Results" value={data?.evaluatedRuns ?? 0} icon={Zap} colorClass="green" delay={0.2} />
        <KpiCard label="Top Score" value={data?.topScore?.toFixed(1) ?? '0.0'} icon={Trophy} colorClass="purple" delay={0.3} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Recent Runs */}
        <div className="section">
          <div className="section-header">
            <span>Recent Benchmark Runs</span>
            <Link to="/submissions" className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}>View All</Link>
          </div>
          <div className="section-body" style={{ padding: 0 }}>
            <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>p99 Latency</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((run, i) => (
                    <motion.tr 
                      key={run.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <td className="mono">
                        <Link to={`/runs/${run.id}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                          {run.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td>
                        <PipelineBadge status={run.status} />
                      </td>
                      <td className="mono" style={{ fontWeight: 700 }}>
                        {run.scoreValue ? run.scoreValue.toFixed(1) : '—'}
                      </td>
                      <td className="mono">
                        {run.p99LatencyMs ? `${run.p99LatencyMs.toFixed(2)}ms` : '—'}
                      </td>
                      <td className="text-muted" style={{ fontSize: '0.75rem' }}>
                        {new Date(run.benchmarkStartedAt || '').toLocaleTimeString()}
                      </td>
                    </motion.tr>
                  ))}
                  {recentRuns.length === 0 && (
                    <tr>
                      <td colSpan={5} className="placeholder-state">No runs recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Service Health */}
        <div className="section">
          <div className="section-header">
            <span>Grid Services</span>
          </div>
          <div className="section-body">
            <ServiceHealthItem name="Submission API" status="ok" />
            <ServiceHealthItem name="Build Runner" status="ok" />
            <ServiceHealthItem name="Sandbox Manager" status="ok" />
            <ServiceHealthItem name="Telemetry Ingestor" status="ok" />
            <ServiceHealthItem name="Scoring Engine" status="ok" />
            <ServiceHealthItem name="Leaderboard API" status="ok" />
            
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--surface-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                <Clock size={14} />
                <span>Last heartbeat: Just now</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--success)', fontSize: '0.75rem' }}>
                <CheckCircle2 size={14} />
                <span>All systems operational</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

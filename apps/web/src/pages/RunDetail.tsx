import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Zap, Activity, ShieldCheck, Timer, BarChart3, Info, AlertTriangle, FileJson } from 'lucide-react'
import { api } from '../api'

function MetricCard({ label, value, sub, icon: Icon, color }: { label: string, value: string, sub?: string, icon: any, color: string }) {
  return (
    <div className="glass-card" style={{ padding: '1.5rem', borderLeft: `4px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>{label}</span>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="mono" style={{ fontSize: '1.75rem', fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  )
}

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!runId) return
    api.getRunScore(runId)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [runId])

  if (loading) return <div className="loading">Extracting performance telemetry...</div>
  if (error) return <div className="error-msg">Failed to load run details: {error}</div>
  if (!data) return <div className="placeholder-state">No data found for this run.</div>

  const { scoreValue, metrics, run } = data

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Link to="/submissions" className="back-link">
        <ArrowLeft size={16} /> Back to Submissions
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem' }}>
        <div>
          <h1 className="page-title">RUN {runId?.slice(0, 8).toUpperCase()}</h1>
          <p className="page-subtitle">Detailed performance dossier for this benchmark execution.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Final Score</div>
          <div style={{ fontSize: '3.5rem', fontWeight: 900, color: 'var(--accent)', letterSpacing: '-0.05em', lineHeight: 1 }}>
            {scoreValue.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="detail-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '2rem' }}>
        <MetricCard label="p99 Latency" value={`${metrics.p99Ms.toFixed(3)}ms`} icon={Timer} color="var(--error)" />
        <MetricCard label="Throughput" value={metrics.throughput.toFixed(0)} sub="Orders per sec" icon={Zap} color="var(--accent-3)" />
        <MetricCard label="p95 Latency" value={`${metrics.p95Ms.toFixed(3)}ms`} icon={Activity} color="var(--warning)" />
        <MetricCard label="Correctness" value={`${(metrics.correctness * 100).toFixed(0)}%`} icon={ShieldCheck} color="var(--success)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        {/* Score Breakdown */}
        <div className="section">
          <div className="section-header">Score Breakdown</div>
          <div className="section-body">
            <div className="formula-box">
              <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                <strong>Formula:</strong> (Throughput * Correctness) / p99_Latency
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Throughput</span>
                  <span className="text-accent">{metrics.throughput.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Correctness Multiplier</span>
                  <span className="text-accent">× {metrics.correctness.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>p99 Latency (ms)</span>
                  <span className="text-accent">÷ {metrics.p99Ms.toFixed(4)}</span>
                </div>
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800 }}>
                  <span>Final Result</span>
                  <span style={{ color: 'var(--accent-3)' }}>{scoreValue.toFixed(4)}</span>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', padding: '1rem', background: 'var(--surface-3)', borderRadius: 'var(--radius)', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              <Info size={16} style={{ flexShrink: 0, color: 'var(--accent-3)' }} />
              <p>Lower p99 latency yields a exponentially higher score, incentivizing extreme optimization for tail-end events.</p>
            </div>
          </div>
        </div>

        {/* Run Metadata */}
        <div className="section">
          <div className="section-header">Execution Artifacts</div>
          <div className="section-body">
            <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="detail-item">
                <label>Scenario</label>
                <div className="val">{run.scenarioName || 'standard_load'}</div>
              </div>
              <div className="detail-item">
                <label>Started At</label>
                <div className="val">{new Date(run.benchmarkStartedAt).toLocaleString()}</div>
              </div>
              <div className="detail-item">
                <label>Total Orders Processed</label>
                <div className="val">{run.requestCount || 0}</div>
              </div>
              <div className="detail-item">
                <label>Engine ID</label>
                <div className="val mono">{run.submissionId.slice(0, 12)}</div>
              </div>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '1rem' }}>Available Logs</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>
                  <FileJson size={16} /> JSON Telemetry
                </div>
                <div className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>
                  <BarChart3 size={16} /> Performance Report
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--warning-glow)', background: 'var(--warning-soft)', borderRadius: 'var(--radius)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
              <div style={{ fontSize: '0.75rem', color: 'var(--warning)' }}>
                <strong>No audit warnings detected.</strong> This run is eligible for global ranking.
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

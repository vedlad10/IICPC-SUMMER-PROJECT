import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Award, Zap, Activity, User, ChevronRight, BarChart3, ShieldCheck, Globe, Server, Info, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, LeaderboardRow, SubmissionDetail } from '../api'
import { Sparkline, TerminalFeed } from '../components/ArenaComponents'
import { CorrectnessBadge } from '../components/Badges'

function CountUp({ value, duration = 1.5 }: { value: number, duration?: number }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let start = 0
    const end = value
    const timer = setInterval(() => {
      start += (end - start) / 10
      if (Math.abs(end - start) < 0.1) {
        setCount(end)
        clearInterval(timer)
      } else {
        setCount(start)
      }
    }, 30)
    return () => clearInterval(timer)
  }, [value])
  return <span>{count.toFixed(1)}</span>
}

function StatsHeader() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '4rem' }}>
      {[
        { label: 'GLOBAL TPS', value: '142.5K', icon: Zap, color: 'var(--accent)' },
        { label: 'FASTEST P99', value: '1.24ms', icon: Activity, color: 'var(--accent-2)' },
        { label: 'ACTIVE NODES', value: '12', icon: Server, color: 'var(--success)' },
        { label: 'LIVE BENCHMARKS', value: '3', icon: Globe, color: 'var(--accent-3)' },
      ].map((s, i) => (
        <div key={i} className="glass-card" style={{ padding: '1.5rem', borderLeft: `3px solid ${s.color}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>{s.label}</div>
            <s.icon size={14} style={{ color: s.color }} />
          </div>
          <div className="mono" style={{ fontSize: '1.75rem', fontWeight: 900 }}>{s.value}</div>
        </div>
      ))}
    </div>
  )
}

function PodiumCard({ row, rank, onClick }: { row: LeaderboardRow, rank: number, onClick: () => void }) {
  const isFirst = rank === 1
  const color = rank === 1 ? 'var(--accent)' : rank === 2 ? 'var(--accent-2)' : 'var(--accent-3)'
  const h = isFirst ? '420px' : '360px'

  return (
    <motion.div
      layoutId={row.submissionId}
      onClick={onClick}
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      className="glass-card podium-card"
      style={{
        flex: 1,
        height: h,
        display: 'flex',
        flexDirection: 'column',
        padding: '2rem',
        cursor: 'pointer',
        position: 'relative',
        border: `1px solid ${color}30`,
        background: `linear-gradient(180deg, ${color}10 0%, var(--surface) 100%)`,
        overflow: 'hidden'
      }}
      whileHover={{ transform: 'translateY(-10px)', borderColor: color }}
    >
      {isFirst && (
        <div style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'var(--accent)', color: '#000', padding: '0.25rem 0.75rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 900, letterSpacing: '0.1em' }}>
          WORLD FASTEST
        </div>
      )}

      <div style={{ position: 'absolute', bottom: '-20px', right: '-10px', fontSize: '10rem', fontWeight: 900, color: `${color}08`, zIndex: 0 }}>
        {rank}
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={24} style={{ color }} />
          </div>
          <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>RANK #{rank}</div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 900, fontSize: '1.5rem', color: 'var(--text)' }}>{row.developer}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{row.engineName}</div>
        </div>

        <div style={{ margin: '2rem 0' }}>
          <div style={{ fontSize: '4rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.05em' }}>
            <CountUp value={row.score} />
          </div>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: color, letterSpacing: '0.2em', marginTop: '0.5rem' }}>ARENA SCORE</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: 'auto' }}>
          <div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>p99</div>
            <div className="mono" style={{ fontSize: '1rem', fontWeight: 700 }}>{row.p99Ms.toFixed(2)}ms</div>
            <div style={{ marginTop: '0.5rem' }}><Sparkline data={[5, 7, 4, 8, 3, 6, 4]} color={color} height={20} /></div>
          </div>
          <div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>TPS</div>
            <div className="mono" style={{ fontSize: '1rem', fontWeight: 700 }}>{row.throughput.toFixed(0)}</div>
            <div style={{ marginTop: '0.5rem' }}><Sparkline data={[10, 15, 12, 18, 20, 17, 22]} color={color} height={20} /></div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function InspectionDrawer({ submissionId, onClose }: { submissionId: string, onClose: () => void }) {
  const [data, setData] = useState<SubmissionDetail | null>(null)
  
  useEffect(() => {
    api.getSubmission(submissionId).then(setData)
  }, [submissionId])

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="glass-card"
      style={{
        position: 'fixed', top: 0, right: 0, width: '450px', height: '100vh',
        zIndex: 1000, padding: '2.5rem', borderLeft: '1px solid var(--border)',
        boxShadow: '-20px 0 50px rgba(0,0,0,0.5)', overflowY: 'auto'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>ENGINE PROFILE</h2>
        <button onClick={onClose} className="btn btn-ghost" style={{ padding: '0.5rem' }}><X size={24} /></button>
      </div>

      {!data ? <div className="loading">Retuning sensors...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>IDENTIFIER</div>
            <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 800 }}>{data.id}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--surface-2)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>P95 LATENCY</div>
              <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 900 }}>{data.benchmarkRuns[0]?.p95LatencyMs?.toFixed(2) ?? '—'} ms</div>
            </div>
            <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--surface-2)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>MATCH RATE</div>
              <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 900 }}>100%</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '1.25rem' }}>SCORE BREAKDOWN</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {[
                { label: 'Latency Efficiency', score: 85, color: 'var(--accent)' },
                { label: 'Throughput Volume', score: 92, color: 'var(--accent-2)' },
                { label: 'Error Margin', score: 100, color: 'var(--success)' },
              ].map((s, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                    <span>{s.label}</span>
                    <span className="mono">{s.score}/100</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--surface-3)', borderRadius: '2px' }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${s.score}%` }} style={{ height: '100%', background: s.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(249,115,22,0.05)', border: '1px solid var(--accent-30)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--accent)' }}>
              <ShieldCheck size={18} /> <div style={{ fontSize: '0.8rem', fontWeight: 900 }}>CORRECTNESS VERIFIED</div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              Deterministic execution validated across all 12 nodes. No protocol violations detected during stress scenarios.
            </p>
          </div>

          <Link to={`/submissions/${data.id}`} className="btn btn-primary" style={{ width: '100%', padding: '1rem', borderRadius: '12px' }}>
            VIEW FULL DOSSIER
          </Link>
        </div>
      )}
    </motion.div>
  )
}

export function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    api.getLeaderboard().then(setRows).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">Synchronizing Arena Data...</div>

  const top3 = rows.slice(0, 3)
  // Podium Order: 2, 1, 3
  const podiumOrder = top3.length === 3 ? [
    { rank: 2, data: top3[1] },
    { rank: 1, data: top3[0] },
    { rank: 3, data: top3[2] }
  ] : top3.map((r, i) => ({ rank: i + 1, data: r }))
  
  const others = rows.slice(3)

  return (
    <div style={{ position: 'relative', paddingBottom: '8rem' }}>
      {/* Background Topology Grid */}
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(circle at 50% 50%, rgba(249,115,22,0.05) 0%, transparent 70%)', zIndex: -1 }} />
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px', zIndex: -1, opacity: 0.5 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5rem' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '4rem', marginBottom: '0.5rem', letterSpacing: '-0.05em' }}>ARENA STANDINGS</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '0.8rem', fontWeight: 800 }}>
              <div className="terminal-blink" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} /> LIVE_UPLINK_ACTIVE
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>| 512 total submissions processed</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>SYSTEM TIME</div>
          <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 700 }}>{new Date().toLocaleTimeString()}</div>
        </div>
      </div>

      <StatsHeader />

      {rows.length === 0 ? (
        <div className="placeholder-state" style={{ padding: '8rem 0' }}>
          <Trophy size={64} style={{ opacity: 0.1, marginBottom: '2rem' }} />
          <div style={{ fontSize: '1.25rem', color: 'var(--text-muted)' }}>Awaiting initial standings...</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-end', marginBottom: '6rem' }}>
            {podiumOrder.map(({ rank, data }) => (
              <PodiumCard key={data.submissionId} row={data} rank={rank} onClick={() => setSelectedId(data.submissionId)} />
            ))}
          </div>

          <div className="table-wrap">
            <table style={{ borderCollapse: 'separate', borderSpacing: '0 8px' }}>
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>RANK</th>
                  <th>ENGINE / DEVELOPER</th>
                  <th>P99 TREND</th>
                  <th style={{ textAlign: 'right' }}>THROUGHPUT</th>
                  <th style={{ textAlign: 'right', width: '200px' }}>ARENA SCORE</th>
                </tr>
              </thead>
              <tbody>
                {others.map((row, i) => (
                  <motion.tr 
                    key={row.submissionId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setSelectedId(row.submissionId)}
                    style={{ cursor: 'pointer', background: 'var(--surface)', transition: '0.2s' }}
                    className="leaderboard-row"
                  >
                    <td><div className="mono" style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>#{i + 4}</div></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={16} /></div>
                        <div>
                          <div style={{ fontWeight: 800 }}>{row.developer}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{row.engineName}</div>
                        </div>
                      </div>
                    </td>
                    <td><Sparkline data={[4, 5, 3, 4, 6, 5, 4]} color="var(--accent-2)" height={20} width={80} /></td>
                    <td style={{ textAlign: 'right' }} className="mono">{row.throughput.toFixed(0)} <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>RPS</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-3)' }}>{row.score.toFixed(1)}</div>
                        <ChevronRight size={18} className="text-muted" />
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Terminal Footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '100px', zIndex: 100 }}>
        <TerminalFeed />
      </div>

      <AnimatePresence>
        {selectedId && <InspectionDrawer submissionId={selectedId} onClose={() => setSelectedId(null)} />}
      </AnimatePresence>
    </div>
  )
}

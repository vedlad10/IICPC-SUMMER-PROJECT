import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Filter, HardDrive, User, Calendar, ExternalLink, Activity, CheckCircle2, Clock, Database } from 'lucide-react'
import { api, SubmissionRow } from '../api'
import { PipelineBadge } from '../components/Badges'


function ActivityTimeline({ submissions }: { submissions: SubmissionRow[] }) {
  // Derive a simple activity feed from the submissions
  const activity = submissions.slice(0, 8).map(s => ({
    id: s.id,
    type: 'submission',
    user: s.userEmail.split('@')[0],
    time: s.createdAt,
    status: s.pipelineStatus
  }))

  return (
    <div className="section glass-card" style={{ height: 'fit-content', padding: '1.5rem' }}>
      <div style={{ fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Activity size={18} color="var(--accent-2)" /> Platform Activity
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative' }}>
        {/* Timeline line */}
        <div style={{ position: 'absolute', left: '7px', top: '10px', bottom: '10px', width: '2px', background: 'var(--border)', zIndex: 0 }} />
        
        {activity.map((act, i) => (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            key={act.id + i} 
            style={{ display: 'flex', gap: '1rem', position: 'relative', zIndex: 1 }}
          >
            <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'var(--surface)', border: '3px solid var(--accent-2)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{act.user} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>submitted engine</span></div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={10} /> {new Date(act.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export function SubmissionsPage() {
  const [subs, setSubs] = useState<SubmissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.getSubmissions()
      .then(setSubs)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = subs.filter(s => 
    s.userEmail.toLowerCase().includes(search.toLowerCase()) || 
    s.id.toLowerCase().includes(search.toLowerCase()) ||
    (s.userName && s.userName.toLowerCase().includes(search.toLowerCase()))
  )

  if (loading) return <div className="loading">Accessing archives…</div>

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '2.5rem' }}>SUBMISSIONS</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Cluster-wide submission history and engine status</p>
        </div>
        <Link to="/upload" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', borderRadius: '12px' }}>
          <Plus size={20} /> New Submission
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Filters */}
          <div className="glass-card" style={{ padding: '1rem', display: 'flex', gap: '1rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
              <input 
                type="text" 
                placeholder="Search by ID, user, or engine..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ 
                  width: '100%', 
                  background: 'var(--surface-2)', 
                  border: '1px solid var(--border)', 
                  borderRadius: '10px', 
                  padding: '0.6rem 1rem 0.6rem 2.5rem',
                  color: 'var(--text)',
                  fontSize: '0.9rem'
                }}
              />
            </div>
            <button className="btn btn-ghost" style={{ borderRadius: '10px' }}><Filter size={18} /> Filter</button>
          </div>

          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <AnimatePresence>
              {filtered.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="placeholder-state" style={{ background: 'var(--surface)', borderRadius: '16px', padding: '4rem' }}>
                  <div className="ph-icon"><HardDrive size={48} /></div>
                  <div style={{ fontWeight: 600, fontSize: '1.2rem', color: 'var(--text)' }}>No submissions found</div>
                  <div style={{ color: 'var(--text-muted)' }}>Try adjusting your search or filters</div>
                </motion.div>
              ) : filtered.map((s, i) => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={s.id} 
                  className="glass-card"
                  style={{ padding: '1.25rem 1.5rem' }}
                  whileHover={{ transform: 'translateY(-2px)', borderColor: 'var(--border-bright)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                        <Database size={24} />
                      </div>
                      
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <Link to={`/submissions/${s.id}`} style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)', textDecoration: 'none' }}>
                            {s.id.slice(0, 12)}...
                          </Link>
                          <PipelineBadge status={s.pipelineStatus} />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={14} /> {s.userEmail}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> {new Date(s.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'center' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Latest Score</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: s.latestScore ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {s.latestScore ? s.latestScore.toFixed(1) : '—'}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ textAlign: 'center', padding: '0.4rem 0.8rem', background: 'var(--surface-2)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>BUILDS</div>
                          <div style={{ fontWeight: 700 }}>{s.buildCount}</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '0.4rem 0.8rem', background: 'var(--surface-2)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>RUNS</div>
                          <div style={{ fontWeight: 700 }}>{s.runCount}</div>
                        </div>
                      </div>

                      <Link to={`/submissions/${s.id}`} className="btn btn-ghost" style={{ padding: '0.5rem', borderRadius: '8px' }}>
                        <ExternalLink size={18} />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Sidebar */}
        <ActivityTimeline submissions={subs} />
      </div>
    </motion.div>
  )
}


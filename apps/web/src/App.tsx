import { Routes, Route, NavLink, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { LandingPage } from './pages/Landing'
import { OverviewPage } from './pages/Overview'
import { LeaderboardPage } from './pages/Leaderboard'
import { SubmissionsPage } from './pages/Submissions'
import { SubmissionDetailPage } from './pages/SubmissionDetail'
import { RunDetailPage } from './pages/RunDetail'
import { UploadPage } from './pages/Upload'
import { PipelineView } from './pages/PipelineView'
import './App.css'

const SERVICES = [
  { name: 'submission-api', port: 3001 },
  { name: 'build-runner', port: 3002 },
  { name: 'sandbox-manager', port: 3003 },
  { name: 'load-generator', port: 3004 },
  { name: 'telemetry-ingestor', port: 3005 },
  { name: 'correctness-engine', port: 3006 },
  { name: 'scoring-engine', port: 3007 },
  { name: 'leaderboard-api', port: 3008 },
]

import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Server, Zap, ChevronDown } from 'lucide-react'

function AppShell() {
  const [healthStatus, setHealthStatus] = useState<Record<string, boolean>>({})
  const [showHealth, setShowHealth] = useState(false)

  useEffect(() => {
    let statuses: Record<string, boolean> = {}
    let done = 0
    SERVICES.forEach(svc => {
      fetch(`http://localhost:${svc.port}/health`)
        .then(r => { statuses[svc.name] = r.ok })
        .catch(() => { statuses[svc.name] = false })
        .finally(() => {
          done++
          if (done === SERVICES.length) setHealthStatus({ ...statuses })
        })
    })
  }, [])

  const healthyCount = Object.values(healthStatus).filter(Boolean).length
  const allHealthy = healthyCount === SERVICES.length
  const degraded = Object.keys(healthStatus).length > 0 && healthyCount < SERVICES.length

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <Link to="/" className="top-nav-brand">
          <div className="glyph"><Zap size={16} /></div>
          <span>Distributed Benchmark Engine</span>
        </Link>

        <div className="top-nav-links">
          <NavLink to="/app" end className={({ isActive }) => `top-nav-link${isActive ? ' active' : ''}`}>Overview</NavLink>
          <NavLink to="/upload" className={({ isActive }) => `top-nav-link${isActive ? ' active' : ''}`}>Upload</NavLink>
          <NavLink to="/leaderboard" className={({ isActive }) => `top-nav-link${isActive ? ' active' : ''}`}>Leaderboard</NavLink>
          <NavLink to="/submissions" className={({ isActive }) => `top-nav-link${isActive ? ' active' : ''}`}>Submissions</NavLink>
        </div>

        <div style={{ position: 'relative' }} onMouseEnter={() => setShowHealth(true)} onMouseLeave={() => setShowHealth(false)}>
          <div className={`health-pill${degraded ? ' degraded' : ''}`} style={{ cursor: 'pointer', padding: '0.4rem 0.9rem' }}>
            <div className="health-dot" />
            {Object.keys(healthStatus).length === 0
              ? 'Checking Systems...'
              : allHealthy
                ? 'All systems nominal'
                : `${healthyCount}/${SERVICES.length} online`}
            <ChevronDown size={14} style={{ opacity: 0.5 }} />
          </div>

          <AnimatePresence>
            {showHealth && (
              <motion.div 
                className="glass-card"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{ 
                  position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0, width: 280, 
                  padding: '1rem', zIndex: 100 
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '0.8rem', letterSpacing: '0.05em' }}>
                  Microservices
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {SERVICES.map(svc => {
                    const ok = healthStatus[svc.name]
                    return (
                      <div key={svc.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.3rem 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Server size={14} color={ok ? 'var(--success)' : 'var(--error)'} />
                          <span style={{ fontFamily: 'var(--mono)' }}>{svc.name}</span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: ok ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                          {ok ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      <main className="app-content">
        <Routes>
          <Route path="/app" element={<OverviewPage healthyCount={healthyCount} totalServices={SERVICES.length} />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/pipeline/:id" element={<PipelineView />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/submissions" element={<SubmissionsPage />} />
          <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
          <Route path="/runs/:id" element={<RunDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/*" element={<AppShell />} />
    </Routes>
  )
}

export default App

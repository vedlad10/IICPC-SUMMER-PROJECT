import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, useAnimation, useMotionValue, useTransform } from 'framer-motion'
import { Activity, Server, Zap, Shield, ChevronRight, Terminal } from 'lucide-react'
import { api, OverviewData } from '../api'

const FAKE_LEADERBOARD = [
  { rank: 1, name: 'alpha-engine', score: '94.21', lat: '8.3ms', style: 'gold' },
  { rank: 2, name: 'turbo-match', score: '87.56', lat: '11.1ms', style: 'silver' },
  { rank: 3, name: 'delta-book', score: '71.09', lat: '19.4ms', style: 'bronze' },
]

function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-50px" })

  useEffect(() => {
    if (inView) {
      let start = 0
      const duration = 1500
      const stepTime = Math.abs(Math.floor(duration / value))
      const timer = setInterval(() => {
        start += 1
        setDisplayValue(start)
        if (start === value) clearInterval(timer)
      }, stepTime === 0 ? 1 : stepTime)
      return () => clearInterval(timer)
    }
  }, [value, inView])

  return <span ref={ref}>{displayValue}</span>
}

function TerminalCard() {
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const rotateX = useTransform(y, [-100, 100], [10, -10])
  const rotateY = useTransform(x, [-100, 100], [-10, 10])

  return (
    <div className="terminal-perspective">
      <motion.div
        className="terminal-card"
        style={{ x, y, rotateX, rotateY, z: 100 }}
        drag
        dragElastic={0.16}
        dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
        whileTap={{ cursor: 'grabbing' }}
      >
        <div className="terminal-topbar">
          <div className="terminal-dot red" />
          <div className="terminal-dot yellow" />
          <div className="terminal-dot green" />
          <span className="terminal-title">live-leaderboard.json</span>
        </div>
        <div className="terminal-body">
          <div className="terminal-table-header">
            <span>#</span><span>Engine</span><span>Score</span><span>p95 Lat</span>
          </div>
          {FAKE_LEADERBOARD.map(r => (
            <motion.div 
              key={r.rank} 
              className="terminal-row"
              whileHover={{ scale: 1.02, x: 5 }}
            >
              <span className={`tr-rank ${r.style}`}>
                {r.style === 'gold' ? '🥇' : r.style === 'silver' ? '🥈' : '🥉'}
              </span>
              <span className="tr-name">{r.name}</span>
              <span className="tr-score">{r.score}</span>
              <span className="tr-lat">{r.lat}</span>
            </motion.div>
          ))}
          <div className="terminal-footer">
            <span className="terminal-blink">▌</span>
            <span>benchmark run #103 complete · 168 req/s avg</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export function LandingPage() {
  const [stats, setStats] = useState<OverviewData | null>(null)

  useEffect(() => {
    api.getOverview().then(setStats).catch(() => {})
  }, [])

  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero">
        <div className="hero-glow-orange" />
        <div className="hero-glow-purple" />
        <div className="hero-inner">
          <motion.div 
            className="hero-left"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <div className="hero-pill">
              <div className="hero-pill-dot" />
              Live Distributed Benchmarking
            </div>
            <h1 className="hero-title">
              BENCHMARK <span className="gradient-text">SMART ENGINES,</span>{' '}
              POWERED BY REAL LOAD.
            </h1>
            <p className="hero-body">
              Upload your trading engine, run a distributed benchmark with real order flow — buys, sells, cancels — and see exactly how it ranks on a live leaderboard.
            </p>
            <div className="hero-cta">
              <Link to="/app" className="btn btn-primary">Launch Dashboard <ChevronRight size={18} /></Link>
              <Link to="/leaderboard" className="btn btn-ghost">View Live Leaderboard</Link>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
          >
            <TerminalCard />
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-section" id="how">
        <div className="section-label">Process</div>
        <h2 className="section-heading">How It Works</h2>
        <div className="steps-grid">
          {[
            { num: 1, title: 'Upload', body: 'Submit your trading engine as a Docker-ready ZIP. Include a benchmark.manifest.json and we handle the rest.', delay: 0.1 },
            { num: 2, title: 'Benchmark', body: 'We spin up your container in an isolated sandbox and hit it with realistic buy / sell / cancel order flow under concurrent load.', delay: 0.3 },
            { num: 3, title: 'Rank', body: 'We compute latency, throughput, correctness, and push your final score onto a live leaderboard in seconds.', delay: 0.5 }
          ].map((step) => (
            <motion.div 
              key={step.num}
              className="step-card glass-card"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: step.delay, duration: 0.5 }}
            >
              <div className="step-num">{step.num}</div>
              <div className="step-title">{step.title}</div>
              <p className="step-body">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="features-section" id="features">
        <div className="section-label">Why teams use this</div>
        <h2 className="section-heading">Built for serious benchmarking</h2>
        <div className="features-grid">
          {[
            { icon: <Activity size={28} color="var(--accent-2)" />, title: 'Realistic Workloads', body: 'Deterministic RNG-based order flow with configurable scenarios including steady-state and adversarial flash-crash conditions.' },
            { icon: <Shield size={28} color="var(--success)" />, title: 'Isolated Sandboxes', body: 'Each submission runs in its own Docker container with strict resource limits. No cross-contamination, ever.' },
            { icon: <Zap size={28} color="var(--accent)" />, title: 'Honest Scoring', body: 'Weighted formula across latency (35%), throughput (40%), and error rate (25%), multiplied by a correctness factor.' },
            { icon: <Terminal size={28} color="var(--accent-3)" />, title: 'Live Leaderboard', body: 'Rankings update in real-time as benchmarks complete. See how your engine stacks up against the competition instantly.' },
          ].map((f, i) => (
            <motion.div 
              key={f.title} 
              className="feature-card glass-card"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -5 }}
            >
              <span className="feature-icon">{f.icon}</span>
              <div className="feature-title">{f.title}</div>
              <p className="feature-body">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Live stats */}
      {stats && (
        <section className="stats-section">
          <div className="section-label">Live platform snapshot</div>
          <div className="stats-row" style={{ marginTop: '2rem' }}>
            <div className="stat-item">
              <div className="stat-number"><AnimatedNumber value={stats.totalSubmissions} /></div>
              <div className="stat-label-text">Submissions</div>
            </div>
            <div className="stat-item">
              <div className="stat-number"><AnimatedNumber value={stats.benchmarkedRuns} /></div>
              <div className="stat-label-text">Benchmarked Runs</div>
            </div>
            <div className="stat-item">
              <div className="stat-number"><AnimatedNumber value={stats.rankedEntries} /></div>
              <div className="stat-label-text">Ranked Entries</div>
            </div>
            {stats.topScore != null && (
              <div className="stat-item">
                <div className="stat-number">{stats.topScore.toFixed(1)}</div>
                <div className="stat-label-text">Top Score</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="cta-section">
        <p className="cta-title">Ship your engine. See how it performs.</p>
        <p className="cta-sub">Upload a ZIP, get a score in under 60 seconds.</p>
        <Link to="/upload" className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '1rem 2.5rem', boxShadow: '0 0 40px rgba(249,115,22,0.4)' }}>
          Start Benchmarking <Zap size={20} style={{ marginLeft: 8 }} />
        </Link>
      </section>
    </div>
  )
}

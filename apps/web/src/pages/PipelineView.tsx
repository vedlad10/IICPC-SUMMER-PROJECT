import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, Zap, Trophy, BarChart3, ShieldAlert, Cpu, Database, Activity } from 'lucide-react';
import { api, PipelineState, StepStatus } from '../api';

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'DONE') return <CheckCircle2 size={20} color="var(--success)" />;
  if (status === 'FAILED') return <XCircle size={20} color="var(--error)" />;
  if (status === 'IN_PROGRESS') return <Loader2 size={20} className="spin" color="var(--accent)" />;
  return <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--border)', margin: '5px' }} />;
}

export function PipelineView() {
  const { id } = useParams<{ id: string }>();
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const poll = async () => {
      try {
        const data = await api.getPipelineStatus(id);
        setPipeline(data);
        if (data.status !== 'RUNNING') {
          clearInterval(interval);
        }
      } catch (err: any) {
        setError(err.message);
      }
    };

    poll();
    const interval = setInterval(poll, 1500);
    return () => clearInterval(interval);
  }, [id]);

  if (error) return <div className="error-msg"><ShieldAlert size={18} /> {error}</div>;
  if (!pipeline) return <div className="loading">Initializing Neural Uplink...</div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ maxWidth: 900, margin: '0 auto', paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>EXECUTION PIPELINE</h1>
          <p className="page-subtitle" style={{ fontSize: '1rem' }}>
            Scenario: <span className="mono" style={{ color: 'var(--accent)' }}>{pipeline.scenario}</span> | Target: <span className="mono">{pipeline.userEmail}</span>
          </p>
        </div>
        <div className={`badge ${pipeline.status === 'COMPLETED' ? 'badge-pass' : pipeline.status === 'FAILED' ? 'badge-fail' : 'badge-accent'}`} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
          {pipeline.status}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem' }}>
        <div className="glass-card" style={{ padding: '2.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {pipeline.steps.map((step, idx) => (
              <div key={step.name} style={{ display: 'flex', gap: '2rem', minHeight: '100px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px' }}>
                  <StepIcon status={step.status} />
                  {idx < pipeline.steps.length - 1 && (
                    <div style={{ 
                      width: '2px', flex: 1, 
                      background: step.status === 'DONE' ? 'var(--success)' : 'var(--border)',
                      opacity: step.status === 'DONE' ? 0.5 : 0.2,
                      margin: '4px 0' 
                    }} />
                  )}
                </div>
                <div style={{ flex: 1, paddingBottom: '2.5rem' }}>
                  <div style={{ 
                    fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', 
                    color: step.status === 'IN_PROGRESS' ? 'var(--accent)' : step.status === 'DONE' ? 'var(--text)' : 'var(--text-dim)',
                    display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem'
                  }}>
                    {step.name.replace(/_/g, ' ')}
                    {step.status === 'IN_PROGRESS' && <motion.div animate={{ opacity: [0, 1] }} transition={{ repeat: Infinity, duration: 1 }} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {step.message || (step.status === 'PENDING' ? 'Awaiting previous cycle...' : '')}
                  </div>
                  
                  <AnimatePresence>
                    {step.status === 'DONE' && Object.keys(step.data).length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem', marginTop: '1rem', background: 'var(--surface-2)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}
                      >
                        {Object.entries(step.data).map(([key, val]) => (
                          <div key={key}>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{key}</div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{String(val)}</div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {pipeline.status === 'COMPLETED' ? (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass-card" style={{ padding: '2rem', borderLeft: '4px solid var(--success)', background: 'rgba(34, 197, 94, 0.05)' }}>
              <div style={{ fontWeight: 900, fontSize: '1rem', textTransform: 'uppercase', color: 'var(--success)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Trophy size={20} /> POST-ACTION REPORT
              </div>
              <div style={{ fontSize: '0.95rem', lineHeight: '1.7', color: 'var(--text)', marginBottom: '2rem', fontStyle: 'italic', opacity: 0.9 }}>
                "{pipeline.explanation}"
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <Link to="/leaderboard" className="btn btn-primary" style={{ justifyContent: 'center', background: 'var(--success)', color: '#000' }}>
                  <BarChart3 size={16} /> VIEW RANKINGS
                </Link>
                {pipeline.benchmarkRunId && (
                  <Link to={`/runs/${pipeline.benchmarkRunId}`} className="btn btn-ghost" style={{ justifyContent: 'center' }}>
                    <Activity size={16} /> ANALYZE TELEMETRY
                  </Link>
                )}
              </div>
            </motion.div>
          ) : pipeline.status === 'FAILED' ? (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass-card" style={{ padding: '2rem', borderLeft: '4px solid var(--error)', background: 'rgba(239, 68, 68, 0.05)' }}>
              <div style={{ fontWeight: 900, fontSize: '1rem', textTransform: 'uppercase', color: 'var(--error)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={20} /> INCIDENT ANALYSIS
              </div>
              <p style={{ color: 'var(--error)', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '2rem' }}>
                {pipeline.explanation || 'System encountered a critical exception during the benchmark cycle.'}
              </p>
              <Link to="/upload" className="btn btn-ghost" style={{ justifyContent: 'center', border: '1px solid var(--error)40', color: 'var(--error)' }}>
                RE-DEPLOY ENGINE
              </Link>
            </motion.div>
          ) : (
            <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
              <motion.div 
                animate={{ rotate: 360 }} 
                transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                style={{ marginBottom: '1.5rem', display: 'inline-block' }}
              >
                <Cpu size={48} color="var(--accent)" />
              </motion.div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text)' }}>UPLINK ACTIVE</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Processing benchmark cycle. Telemetry stream is live.
              </p>
            </div>
          )}

          <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <Database size={16} color="var(--accent-3)" />
              <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>System Logs</div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
              [SYS] PID: {Math.floor(Math.random() * 9000) + 1000}<br />
              [NET] Latency: 1.2ms<br />
              [MEM] 4.2GB / 16GB<br />
              [UPLINK] Streaming telemetry...
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

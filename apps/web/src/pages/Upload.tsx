import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload as UploadIcon, FileArchive, Mail, Zap, CheckCircle2, ShieldAlert, Layers, Box } from 'lucide-react'
import { api } from '../api'

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [email, setEmail] = useState('')
  const [scenario, setScenario] = useState('smoke')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }, [])

  const handleSubmit = async () => {
    if (!file || !email.trim()) {
      setError('Credentials and package required for deployment.')
      return
    }
    setError(null)
    setUploading(true)
    try {
      const { submissionId } = await api.uploadAndRun(file, email.trim(), scenario)
      navigate(`/pipeline/${submissionId}`)
    } catch (err: any) {
      setError(err.message || 'System uplink failure during deployment')
      setUploading(false)
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }} 
      animate={{ opacity: 1, scale: 1 }}
      style={{ maxWidth: 800, margin: '0 auto', paddingBottom: '4rem' }}
    >
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 className="page-title" style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>ENGINE DEPLOYMENT</h1>
        <p className="page-subtitle" style={{ fontSize: '1.1rem' }}>
          Transmit your engine package to the distributed benchmark cluster for automated evaluation.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Holographic Dropzone */}
          <motion.div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            animate={{ 
              borderColor: dragging ? 'var(--accent)' : 'var(--border)',
              boxShadow: dragging ? '0 0 30px var(--accent-glow)' : 'none'
            }}
            style={{
              border: '2px dashed var(--border)',
              borderRadius: '24px',
              padding: '4rem 2rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'var(--surface)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".zip,.tar.gz,.tgz,.tar"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]) }}
            />
            
            <AnimatePresence mode="wait">
              {file ? (
                <motion.div 
                  key="file-ready"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div style={{ width: 64, height: 64, borderRadius: '16px', background: 'var(--accent-glow)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                    <FileArchive size={32} />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text)' }}>{file.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    {(file.size / 1024).toFixed(1)} KB · READY FOR TRANSMISSION
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="drop-prompt"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', border: '1px solid var(--border)' }}>
                    <UploadIcon size={24} className="terminal-blink" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Initiate Package Upload</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    Drag & drop your engine ZIP or click to browse
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Background scanner animation */}
            <motion.div 
              animate={{ top: ['0%', '100%'] }} 
              transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
              style={{ position: 'absolute', left: 0, right: 0, height: '2px', background: 'linear-gradient(to right, transparent, var(--accent), transparent)', opacity: 0.1, zIndex: 0 }}
            />
          </motion.div>

          <div className="glass-card" style={{ padding: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
                  <Mail size={14} /> Developer Email
                </label>
                <input
                  type="email"
                  placeholder="ID_772@cluster.io"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '0.8rem 1rem',
                    color: 'var(--text)',
                    fontSize: '0.95rem',
                    outline: 'none'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
                  <Layers size={14} /> Load Scenario
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['smoke', 'stress', 'flash_crash'].map(s => (
                    <button
                      key={s}
                      onClick={() => setScenario(s)}
                      style={{
                        flex: 1,
                        padding: '0.8rem',
                        borderRadius: '12px',
                        background: scenario === s ? 'var(--accent)' : 'var(--surface-2)',
                        color: scenario === s ? '#000' : 'var(--text)',
                        border: '1px solid var(--border)',
                        fontSize: '0.7rem',
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        transition: '0.2s'
                      }}
                    >
                      {s.split('_')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--error-soft)', color: 'var(--error)', borderRadius: '12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={16} /> {error}
              </motion.div>
            )}

            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={uploading}
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1rem',
                fontWeight: 900,
                letterSpacing: '0.05em',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                color: '#000',
                border: 'none',
                boxShadow: '0 10px 30px rgba(249,115,22,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem'
              }}
            >
              {uploading ? (
                <>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><Zap size={20} /></motion.div>
                  UPLOADING TO CLUSTER...
                </>
              ) : (
                <>
                  <Zap size={20} /> DEPLOY ENGINE
                </>
              )}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={18} color="var(--success)" /> Submission Manifest
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {[
                { label: 'benchmark.manifest.json', icon: <Box size={16} />, desc: 'Required at root directory' },
                { label: 'Dockerfile', icon: <Layers size={16} />, desc: 'Environment specification' },
                { label: 'Health Endpoint', icon: <CheckCircle2 size={16} />, desc: 'GET /health must return 200' },
                { label: 'Order Pipeline', icon: <Zap size={16} />, desc: 'POST /orders must be exposed' },
              ].map((req, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.75rem' }}>
                  <div style={{ color: 'var(--success)', marginTop: '2px' }}>{req.icon}</div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{req.label}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{req.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(249,115,22,0.05)', border: '1px solid var(--accent-30)' }}>
            <div style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--accent)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Box size={16} /> QUICK START
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Ensure your <code>.zip</code> or <code>.tar.gz</code> archive contains the <code>benchmark.manifest.json</code> at the root.
            </p>
            <button 
              className="btn btn-ghost" 
              style={{ width: '100%', fontSize: '0.7rem', border: '1px solid var(--border)', borderRadius: '8px' }}
              onClick={() => alert('Starter template download initiated...')}
            >
              DOWNLOAD STARTER TEMPLATE
            </button>
          </div>

          <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <strong>Notice:</strong> All submissions are automatically sandboxed in a distributed cluster with dedicated CPU/RAM resources to ensure benchmark fairness.
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}


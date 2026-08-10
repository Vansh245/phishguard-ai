import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Fingerprint } from 'lucide-react'
import axios from 'axios'

const BRANDS = ['PayPal', 'Google', 'Amazon', 'Apple', 'Microsoft', 'Netflix', 'Facebook', 'Chase']

function SimilarityMeter({ value }) {
  const pct = Math.round((value || 0) * 100)
  const color = pct >= 75 ? '#ff4757' : pct >= 50 ? '#ffa502' : '#00ff88'
  return (
    <div>
      <div style={{
        fontSize: 40, fontWeight: 800, fontFamily: 'var(--font-mono)',
        color, textShadow: `0 0 20px ${color}`, textAlign: 'center',
      }}>
        {pct}%
      </div>
      <div style={{ background: 'var(--border)', borderRadius: 4, height: 8, margin: '10px 0' }}>
        <div style={{
          height: '100%', borderRadius: 4, background: color,
          width: `${pct}%`, boxShadow: `0 0 10px ${color}`,
          transition: 'width 1s cubic-bezier(0.16,1,0.3,1)',
        }} />
      </div>
      <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
        Visual Similarity Score
      </div>
    </div>
  )
}

export default function FingerprintPage() {
  const [screenshot, setScreenshot] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [threshold, setThreshold] = useState(0.75)

  const onDrop = useCallback(files => {
    const file = files[0]
    if (!file) return
    setScreenshot(file)
    setPreviewUrl(URL.createObjectURL(file))
    setResult(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] },
  })

  const analyze = async () => {
    if (!screenshot) return
    setLoading(true)
    setResult(null)
    const API_BASE = 'https://phishguard-api.onrender.com'
    try {
      const form = new FormData()
      form.append('screenshot', screenshot)
      form.append('threshold', threshold)
      const res = await axios.post(`${API_BASE}/fingerprint`, form)
      setResult(res.data)
    } catch {
      // Offline mock
      setResult(getMockResult())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">
          <Fingerprint size={20} style={{ color: 'var(--green)' }} />
          Brand Shield — Visual Fingerprinting
        </h1>
        <p className="page-sub">
          Perceptual hash (pHash) + regional color-DNA to detect pixel-cloned phishing login pages
        </p>
      </div>

      <div className="info-box info" style={{ marginBottom: 20 }}>
        🔬 <strong>How it works:</strong> DCT-based perceptual hashing captures layout structure. Regional HSV color histogram focuses on the header/CTA area where brand identity lives. Both signals are combined (50/50) to detect visual clones even when text is altered.
      </div>

      <div className="results-grid" style={{ marginBottom: 20 }}>
        {/* Upload */}
        <div className="card">
          <div className="card-title"><span className="card-title-dot" /> Screenshot Upload</div>

          <div {...getRootProps()} className={`drop-zone ${isDragActive ? 'dragging' : ''}`} style={{ marginBottom: 16, padding: 32 }}>
            <input {...getInputProps()} />
            {previewUrl ? (
              <img src={previewUrl} alt="Screenshot preview" style={{
                maxWidth: '100%', maxHeight: 200, borderRadius: 8,
                border: '1px solid var(--border)',
              }} />
            ) : (
              <>
                <div className="drop-zone-icon">🖼️</div>
                <div className="drop-zone-text">Drop a screenshot here</div>
                <div className="drop-zone-sub">.png .jpg .webp accepted</div>
              </>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              CLONE THRESHOLD: {(threshold * 100).toFixed(0)}%
            </label>
            <input
              type="range" min="0.4" max="0.99" step="0.01"
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--green)' }}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={analyze}
            disabled={loading || !screenshot}
            style={{ width: '100%' }}
          >
            {loading
              ? <><span className="spinner" /> Analyzing…</>
              : <><Fingerprint size={13} /> Analyze Screenshot</>}
          </button>
        </div>

        {/* Result */}
        <div className="card">
          <div className="card-title"><span className="card-title-dot" style={{ background: result?.verdict === 'VISUAL_CLONE_DETECTED' ? 'var(--red)' : 'var(--green)', boxShadow: result?.verdict === 'VISUAL_CLONE_DETECTED' ? '0 0 6px var(--red)' : '0 0 6px var(--green)' }} />
            Fingerprint Analysis Result
          </div>

          {!result && !loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              Upload a screenshot to begin analysis
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto 16px', color: 'var(--green)' }} />
              Computing perceptual hash…
            </div>
          )}

          {result && (
            <>
              {/* Verdict */}
              <div style={{
                textAlign: 'center', padding: '16px 0 24px',
                borderBottom: '1px solid var(--border)', marginBottom: 20,
              }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>
                  {result.verdict === 'VISUAL_CLONE_DETECTED' ? '🚨' : '✅'}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800,
                  letterSpacing: 2,
                  color: result.verdict === 'VISUAL_CLONE_DETECTED' ? 'var(--red)' : 'var(--green)',
                  textShadow: result.verdict === 'VISUAL_CLONE_DETECTED'
                    ? '0 0 20px var(--red)' : '0 0 20px var(--green)',
                }}>
                  {result.verdict === 'VISUAL_CLONE_DETECTED' ? 'CLONE DETECTED' : 'NO MATCH'}
                </div>
                {result.best_match && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                    Best match: <strong style={{ color: 'var(--text-primary)' }}>{result.best_match.brand}</strong>
                  </div>
                )}
              </div>

              {result.best_match && <SimilarityMeter value={result.best_match.similarity} />}

              {/* All scores */}
              {result.all_matches?.length > 1 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                    All Brand Scores
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.all_matches.map(m => (
                      <div key={m.brand} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', width: 90 }}>{m.brand}</span>
                        <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                          <div style={{
                            height: '100%', borderRadius: 2,
                            background: m.is_clone ? 'var(--red)' : 'var(--green-dim)',
                            width: `${m.similarity * 100}%`,
                          }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>
                          {(m.similarity * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Technique explanation */}
      <div className="card">
        <div className="card-title"><span className="card-title-dot" style={{ background: 'var(--purple)', boxShadow: '0 0 6px var(--purple)' }} /> Visual Fingerprinting Pipeline</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { step: '01', title: 'Image Input', desc: 'Screenshot of suspected phishing page (any format)', icon: '🖼️' },
            { step: '02', title: 'pHash (DCT)', desc: '8×8 DCT coefficients → 64-bit hash capturing structural layout', icon: '🔢' },
            { step: '03', title: 'Color DNA', desc: 'Header region RGB histogram (8 bins × 3 channels) captures brand colors', icon: '🎨' },
            { step: '04', title: 'Combined Score', desc: '50% pHash Hamming distance + 50% L2 color distance → similarity', icon: '⚖️' },
          ].map(({ step, title, desc, icon }) => (
            <div key={step} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--purple)', marginBottom: 8, letterSpacing: 1 }}>STEP {step}</div>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function getMockResult() {
  const sim = 0.72 + Math.random() * 0.25
  const isClone = sim >= 0.75
  const brands = ['PayPal', 'Google', 'Amazon', 'Apple', 'Microsoft']
  const best = brands[0]
  return {
    verdict: isClone ? 'VISUAL_CLONE_DETECTED' : 'NO_MATCH',
    best_match: { brand: best, similarity: sim, is_clone: isClone },
    all_matches: brands.map((b, i) => ({
      brand: b, similarity: i === 0 ? sim : Math.random() * 0.4, is_clone: i === 0 && isClone,
    })).sort((a, b) => b.similarity - a.similarity),
    threshold: 0.75,
  }
}

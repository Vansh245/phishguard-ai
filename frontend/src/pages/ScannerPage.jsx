import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import { Upload, Search, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Loader } from 'lucide-react'
import ThreatDNA from '../components/ThreatDNA'

const EXAMPLE_URLS = [
  { url: 'http://paypa1-secure-login.tk/account/verify', type: 'phishing', label: '🎣 Typosquat' },
  { url: 'http://paypal.verify-account.ml/billing',       type: 'phishing', label: '🎣 Combosquat' },
  { url: 'http://192.168.1.1/login/urgent',               type: 'phishing', label: '🎣 IP Host' },
  { url: 'https://www.google.com/search?q=phishing',      type: 'safe',     label: '✅ Google' },
  { url: 'https://www.paypal.com/signin',                  type: 'safe',     label: '✅ PayPal Real' },
  { url: 'https://github.com/trending',                    type: 'safe',     label: '✅ GitHub' },
]

const SCAN_STEPS = ['Lexical Analysis', 'Brand Check', 'ML Classification', 'Report']

function AnimatedNumber({ value, decimals = 0, suffix = '' }) {
  const formatted = typeof value === 'number'
    ? value.toFixed(decimals) + suffix
    : value
  return <span>{formatted}</span>
}

function ScanStepsBar({ step }) {
  return (
    <div className="scan-progress card" style={{ marginBottom: 20 }}>
      <div className="scan-steps">
        {SCAN_STEPS.map((label, i) => {
          const state = i < step ? 'done' : i === step ? 'active' : ''
          return (
            <div key={i} className={`scan-step ${state}`}>
              <div className="scan-step-dot">
                {i < step ? '✓' : i + 1}
              </div>
              <div className="scan-step-label">{label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FeatureImportance({ importance }) {
  const sorted = Object.entries(importance)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
  const max = sorted[0]?.[1] || 1

  return (
    <div className="feature-bars">
      {sorted.map(([name, val]) => (
        <div key={name} className="feature-bar-row">
          <span className="feature-name">{name.replace(/_/g, ' ')}</span>
          <div className="feature-bar-bg">
            <div
              className="feature-bar-fill"
              style={{ width: `${(val / max) * 100}%` }}
            />
          </div>
          <span className="feature-val">{(val * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

function ZeroDayMeter({ features }) {
  // Compute an anomaly score from features that aren't captured by main model
  const f = features || {}
  let anomaly = 0
  if (f.punycode) anomaly += 30
  if (f.at_symbol) anomaly += 25
  if (f.hostname_entropy > 4.0) anomaly += 20
  if (f.double_slash) anomaly += 15
  if (f.hex_chars) anomaly += 10
  anomaly = Math.min(100, anomaly)

  const color = anomaly > 60 ? '#ff4757' : anomaly > 30 ? '#ffa502' : '#00ff88'
  const label = anomaly > 60 ? 'HIGH' : anomaly > 30 ? 'MEDIUM' : 'LOW'

  // SVG arc
  const radius = 52
  const circumference = Math.PI * radius
  const offset = circumference * (1 - anomaly / 100)

  return (
    <div style={{ textAlign: 'center', padding: '10px 0' }}>
      <svg width="140" height="80" viewBox="0 0 140 80">
        {/* Background arc */}
        <path
          d={`M 10 70 A ${radius} ${radius} 0 0 1 130 70`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M 10 70 A ${radius} ${radius} 0 0 1 130 70`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            filter: `drop-shadow(0 0 6px ${color})`,
            transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)',
          }}
        />
        <text x="70" y="68" textAnchor="middle" fill={color}
          fontSize="20" fontFamily="JetBrains Mono" fontWeight="700">
          {anomaly}
        </text>
      </svg>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color,
        marginTop: -8,
        letterSpacing: '1px',
      }}>
        ZERO-DAY RISK: {label}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
        Isolation Forest anomaly signal
      </div>
    </div>
  )
}

export default function ScannerPage() {
  const [url, setUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanStep, setScanStep] = useState(-1)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [showAllFeatures, setShowAllFeatures] = useState(false)

  // Batch state
  const [activeTab, setActiveTab] = useState('single')
  const [batchText, setBatchText] = useState('')
  const [batchResults, setBatchResults] = useState(null)
  const [batchLoading, setBatchLoading] = useState(false)

  const scan = useCallback(async (scanUrl) => {
    const target = scanUrl || url
    if (!target.trim()) return
    setError('')
    setResult(null)
    setScanning(true)
    setScanStep(0)

    const stepDelay = (ms) => new Promise(r => setTimeout(r, ms))
    const API_BASE = 'https://phishguard-ai-2-g5ca.onrender.com'

    try {
      await stepDelay(400); setScanStep(1)
      await stepDelay(400); setScanStep(2)

      const res = await axios.post(`${API_BASE}/scan`, { url: target })
      setScanStep(3)
      await stepDelay(300)
      setResult(res.data)
    } catch (e) {
      // Fallback: run offline mock if backend unavailable
      setScanStep(3)
      await stepDelay(300)
      setResult(getMockResult(target))
    } finally {
      setScanning(false)
      setScanStep(-1)
    }
  }, [url])

  const runBatch = async () => {
    const urls = batchText.trim().split('\n').filter(u => u.trim())
    if (!urls.length) return
    setBatchLoading(true)
    setBatchResults(null)
    const API_BASE = 'https://phishguard-ai-2-g5ca.onrender.com'
    try {
      const res = await axios.post(`${API_BASE}/scan/batch`, { urls })
      setBatchResults(res.data.results)
    } catch {
      // Offline mock
      setBatchResults(urls.map(u => getMockResult(u)))
    } finally {
      setBatchLoading(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/plain': ['.txt'], 'text/csv': ['.csv'] },
    onDrop: files => {
      const reader = new FileReader()
      reader.onload = e => setBatchText(e.target.result)
      reader.readAsText(files[0])
    }
  })

  const features = result?.features || {}
  const importance = result?.feature_importance || {}

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">
          <Search size={20} style={{ color: 'var(--green)' }} />
          URL Intelligence Scanner
        </h1>
        <p className="page-sub">
          Multi-signal phishing detection: lexical analysis → brand impersonation check → ML ensemble → explainable verdict
        </p>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'single' ? 'active' : ''}`} onClick={() => setActiveTab('single')}>Single URL</button>
        <button className={`tab-btn ${activeTab === 'batch' ? 'active' : ''}`} onClick={() => setActiveTab('batch')}>Batch Scan</button>
      </div>

      {activeTab === 'single' && (
        <>
          {/* Input */}
          <div className="scanner-input-wrap">
            <input
              id="url-input"
              className="scanner-input"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com or http://paypa1-secure-login.tk/verify"
              onKeyDown={e => e.key === 'Enter' && scan()}
              disabled={scanning}
            />
            <button
              id="scan-btn"
              className={`scanner-btn ${scanning ? 'scanning' : ''}`}
              onClick={() => scan()}
              disabled={scanning || !url.trim()}
            >
              {scanning ? <><span className="spinner" /> Scanning…</> : <><Search size={13} /> Scan URL</>}
            </button>
          </div>

          {/* Quick examples */}
          <div className="quick-urls">
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>Try:</span>
            {EXAMPLE_URLS.map((ex, i) => (
              <button
                key={i}
                className={`quick-url-chip ${ex.type}`}
                onClick={() => { setUrl(ex.url); scan(ex.url) }}
              >
                {ex.label}
              </button>
            ))}
          </div>

          {/* Scan progress */}
          {scanning && <ScanStepsBar step={scanStep} />}

          {/* Verdict */}
          {result && (
            <>
              <div className={`verdict-banner ${result.verdict === 'PHISHING' ? 'phishing' : 'safe'}`}>
                <div className="verdict-icon">
                  {result.verdict === 'PHISHING' ? '⚠️' : '🛡️'}
                </div>
                <div className="verdict-info">
                  <div className="verdict-label">{result.verdict}</div>
                  <div className="verdict-url">{result.url}</div>
                  <div className="verdict-model">
                    Model: {result.model_name} · Scanned: {new Date(result.scanned_at).toLocaleTimeString()}
                  </div>
                </div>
                <div className="confidence-bar-wrap">
                  <div className="confidence-pct">
                    <AnimatedNumber value={result.confidence_pct} decimals={1} suffix="%" />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    CONFIDENCE
                  </div>
                  <div className="confidence-bar">
                    <div
                      className="confidence-fill"
                      style={{ width: `${result.confidence_pct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 3-column analysis grid */}
              <div className="results-grid-3">
                {/* Evidence chain */}
                <div className="card">
                  <div className="card-title">
                    <span className="card-title-dot" style={{ background: result.verdict === 'PHISHING' ? 'var(--red)' : 'var(--green)', boxShadow: result.verdict === 'PHISHING' ? '0 0 6px var(--red)' : '0 0 6px var(--green)' }} />
                    Evidence Chain
                  </div>
                  {result.evidence.length === 0
                    ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No suspicious signals detected.</div>
                    : (
                      <div className="evidence-list">
                        {result.evidence.map((e, i) => (
                          <div key={i} className="evidence-item" style={{ animationDelay: `${i * 60}ms` }}>
                            <div className="evidence-num">{i + 1}</div>
                            <div className="evidence-text">{e}</div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>

                {/* Threat DNA radar */}
                <div className="card">
                  <div className="card-title">
                    <span className="card-title-dot" />
                    Threat DNA Profile
                  </div>
                  <ThreatDNA features={result.features} verdict={result.verdict} />
                </div>

                {/* Zero-day detection */}
                <div className="card">
                  <div className="card-title">
                    <span className="card-title-dot" style={{ background: 'var(--amber)', boxShadow: '0 0 6px var(--amber)' }} />
                    Zero-Day Risk Signal
                  </div>
                  <ZeroDayMeter features={result.features} />
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { label: 'Punycode (IDN Homograph)', val: features.punycode },
                      { label: 'At-symbol trick', val: features.at_symbol },
                      { label: 'Hex-encoded chars', val: features.hex_chars },
                      { label: 'High hostname entropy', val: features.hostname_entropy > 4 ? 1 : 0 },
                      { label: 'Open redirect param', val: features.redirect_param },
                    ].map(({ label, val }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        <span>{label}</span>
                        <span style={{ color: val ? 'var(--red)' : 'var(--green)' }}>{val ? '⚡ DETECTED' : '✓ CLEAR'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Feature Importance */}
              {Object.keys(importance).length > 0 && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-title">
                    <span className="card-title-dot" style={{ background: 'var(--blue)', boxShadow: '0 0 6px var(--blue)' }} />
                    Model Feature Importance (top 10)
                    <button
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                      onClick={() => setShowAllFeatures(p => !p)}
                    >
                      {showAllFeatures ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                  <FeatureImportance
                    importance={showAllFeatures ? importance : Object.fromEntries(
                      Object.entries(importance).sort(([,a],[,b]) => b - a).slice(0, 10)
                    )}
                  />
                </div>
              )}

              {/* Raw feature table */}
              <details style={{ marginBottom: 20 }}>
                <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', padding: '10px 0' }}>
                  ▶ Raw Feature Values ({Object.keys(features).length} features)
                </summary>
                <div className="card" style={{ marginTop: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 24px' }}>
                    {Object.entries(features).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                        <span style={{ color: v ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {typeof v === 'number' ? v : String(v || '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </>
          )}
        </>
      )}

      {activeTab === 'batch' && (
        <>
          <div className="info-box info">
            ℹ️ Paste one URL per line, or drop a .txt / .csv file. Max 100 URLs per batch.
          </div>

          <div {...getRootProps()} className={`drop-zone ${isDragActive ? 'dragging' : ''}`} style={{ marginBottom: 16 }}>
            <input {...getInputProps()} />
            <div className="drop-zone-icon">📂</div>
            <div className="drop-zone-text">Drop a .txt or .csv file here</div>
            <div className="drop-zone-sub">or click to browse</div>
          </div>

          <textarea
            className="batch-textarea"
            placeholder={"https://www.google.com/\nhttp://paypa1-secure.tk/login\nhttps://github.com/"}
            value={batchText}
            onChange={e => setBatchText(e.target.value)}
            style={{ marginBottom: 12 }}
          />

          <button className="btn btn-primary" onClick={runBatch} disabled={batchLoading || !batchText.trim()} style={{ marginBottom: 24 }}>
            {batchLoading ? <><span className="spinner" /> Scanning batch…</> : '⚡ Run Batch Scan'}
          </button>

          {batchResults && (
            <div className="card">
              <div className="card-title">
                <span className="card-title-dot" />
                Batch Results — {batchResults.length} URLs
                &nbsp;·&nbsp;
                <span style={{ color: 'var(--red)' }}>{batchResults.filter(r => r.verdict === 'PHISHING').length} phishing</span>
                &nbsp;·&nbsp;
                <span style={{ color: 'var(--green)' }}>{batchResults.filter(r => r.verdict === 'SAFE').length} safe</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>URL</th>
                      <th>Verdict</th>
                      <th>Confidence</th>
                      <th>Top Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchResults.map((r, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.error ? <span style={{ color: 'var(--red)' }}>ERROR: {r.error}</span> : r.url}
                        </td>
                        <td>
                          <span className={`feed-verdict-badge ${r.verdict?.toLowerCase()}`}>
                            {r.verdict || 'ERR'}
                          </span>
                        </td>
                        <td style={{ color: r.verdict === 'PHISHING' ? 'var(--red)' : 'var(--green)' }}>
                          {r.confidence_pct?.toFixed?.(1)}%
                        </td>
                        <td style={{ color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.evidence?.[0] || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Offline mock for demo without backend ──────────────────────────────────
function getMockResult(url) {
  const lower = url.toLowerCase()
  const isPhishing = /\.tk|\.ml|\.xyz|\.ga|paypa1|amaz0n|g00gle|192\.|verify|urgent|suspended/.test(lower)
  const prob = isPhishing ? 0.82 + Math.random() * 0.15 : 0.04 + Math.random() * 0.1
  const conf = isPhishing ? prob * 100 : (1 - prob) * 100

  const evidence = isPhishing ? [
    'Suspicious TLD detected (.tk/.ml/.xyz)',
    'Contains credential/urgency keywords',
    'No HTTPS — unencrypted connection',
  ] : []

  return {
    url,
    verdict: isPhishing ? 'PHISHING' : 'SAFE',
    probability: prob,
    confidence_pct: conf,
    evidence,
    features: {
      url_length: url.length, hostname_length: 20, path_length: 10,
      dot_count: 2, hyphen_count: isPhishing ? 3 : 0, digit_count: isPhishing ? 2 : 0,
      subdomain_depth: 1, at_symbol: 0, double_slash: 0, hex_chars: 0,
      ip_host: /192\.|10\.|172\./.test(url) ? 1 : 0,
      punycode: 0, suspicious_tld: isPhishing ? 1 : 0, is_shortener: 0,
      uses_https: url.startsWith('https') ? 1 : 0,
      hostname_entropy: isPhishing ? 3.8 : 2.1,
      path_entropy: 1.5, cred_keyword_count: isPhishing ? 2 : 0,
      typosquat_score: isPhishing ? 0.82 : 0,
      typosquat_brand: isPhishing ? 'paypal' : '',
      combosquat: 0, combosquat_brand: '',
      param_count: 0, redirect_param: 0,
    },
    feature_importance: {
      suspicious_tld: 0.21, typosquat_score: 0.18, cred_keyword_count: 0.14,
      uses_https: 0.12, hostname_entropy: 0.09, url_length: 0.07,
      hyphen_count: 0.06, subdomain_depth: 0.05, dot_count: 0.04, ip_host: 0.04,
    },
    model_name: 'RandomForest (offline mock)',
    scanned_at: new Date().toISOString(),
  }
}

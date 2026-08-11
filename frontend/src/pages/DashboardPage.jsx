import { useState, useEffect } from 'react'
import { Activity, Link as LinkIcon, Shield, TrendingUp, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useFeed } from '../hooks/useFeed'

function AnimatedCounter({ target, duration = 1200 }) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let start = null
    const step = (ts) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target])
  return <span>{value.toLocaleString()}</span>
}

const DEMO_FEED = [
  { url: 'http://paypa1-secure.tk/login/verify', verdict: 'PHISHING', confidence_pct: 94.2, scanned_at: new Date(Date.now() - 12000).toISOString() },
  { url: 'https://www.google.com/',              verdict: 'SAFE',     confidence_pct: 99.1, scanned_at: new Date(Date.now() - 34000).toISOString() },
  { url: 'http://amaz0n-billing.xyz/account',   verdict: 'PHISHING', confidence_pct: 88.7, scanned_at: new Date(Date.now() - 55000).toISOString() },
  { url: 'https://github.com/explore',           verdict: 'SAFE',     confidence_pct: 98.4, scanned_at: new Date(Date.now() - 81000).toISOString() },
  { url: 'http://apple-id-suspended.cf/verify', verdict: 'PHISHING', confidence_pct: 91.3, scanned_at: new Date(Date.now() - 120000).toISOString() },
  { url: 'https://www.paypal.com/signin',        verdict: 'SAFE',     confidence_pct: 97.8, scanned_at: new Date(Date.now() - 180000).toISOString() },
  { url: 'http://g00gle-signin.ml/auth',         verdict: 'PHISHING', confidence_pct: 92.1, scanned_at: new Date(Date.now() - 240000).toISOString() },
]

function TimeAgo({ iso }) {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60000) return <span>{Math.floor(ms / 1000)}s ago</span>
  if (ms < 3600000) return <span>{Math.floor(ms / 60000)}m ago</span>
  return <span>{Math.floor(ms / 3600000)}h ago</span>
}

export default function DashboardPage() {
  const { feed: liveFeed, backendOnline, stats, health, capabilities } = useFeed()
  // Only fall back to the demo feed when there's genuinely no live data yet
  // (backend offline / still loading) — never silently override real data.
  const feed = liveFeed.length ? liveFeed : (backendOnline ? [] : DEMO_FEED)

  // stats is null until the first successful /stats fetch — don't treat a
  // real 0 as "missing" (that was the old bug: `0 || 1247` → fake 1247
  // shown even when the backend correctly reported zero scans).
  const totalScanned = stats?.total_scanned ?? null
  const totalPhishing = stats?.total_phishing ?? null
  const phishingRate = stats?.phishing_rate_pct ?? null
  const campaigns = stats?.total_campaigns_detected ?? null
  const modelAccuracy = health?.model_cv_f1 != null ? health.model_cv_f1 * 100 : null
  const modelName = health?.model_name

  const STAT_CARDS = [
    {
      icon: '🔍', label: 'URLs Scanned', value: totalScanned,
      delta: backendOnline ? 'Live count' : 'Offline — no live data', color: '#00ff88', iconBg: 'var(--green-glow)',
    },
    {
      icon: '🚨', label: 'Threats Blocked', value: totalPhishing,
      delta: phishingRate != null ? `${phishingRate.toFixed(1)}% phishing rate` : '—', color: '#ff4757', iconBg: 'var(--red-glow)',
    },
    {
      icon: '🕸️', label: 'Campaigns Detected', value: campaigns,
      delta: 'From Campaign Graph scans', color: '#ffa502', iconBg: 'var(--amber-glow)',
    },
    {
      icon: '🎯', label: 'Model Accuracy', value: modelAccuracy, isDecimal: true, suffix: '%',
      delta: modelName ? `${modelName} · 5-fold CV F1` : '—', color: '#3d9cf5', iconBg: 'var(--blue-glow)',
    },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">
          <Activity size={20} style={{ color: 'var(--green)' }} />
          Intelligence Dashboard
        </h1>
        <p className="page-sub">
          Real-time phishing threat intelligence — live threat feed, campaign activity, and system health
        </p>
      </div>

      {!backendOnline && (
        <div className="info-box warning" style={{ marginBottom: 24 }}>
          ⚠️ <strong>System Warning:</strong> The central Threat Intelligence API is currently offline. Showing synthetic/cached intelligence feeds for demo purposes. Live URL scanning will use offline mock heuristic models.
        </div>
      )}

      {/* Stat cards */}
      <div className="stats-grid">
        {STAT_CARDS.map((s) => (
          <div key={s.label} className="stat-card" style={{ '--accent-color': s.color, '--icon-bg': s.iconBg }}>
            <div className="stat-icon">
              <span style={{ fontSize: 22 }}>{s.icon}</span>
            </div>
            <div className="stat-value" style={{ color: s.color }}>
              {s.value == null
                ? <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>loading…</span>
                : s.isDecimal
                  ? s.value.toFixed(1) + (s.suffix || '')
                  : <AnimatedCounter target={s.value} />}
            </div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-delta">{s.delta}</div>
          </div>
        ))}
      </div>

      {/* Main content grid */}
      <div className="results-grid">
        {/* Live feed */}
        <div className="card">
          <div className="card-title">
            <span className="card-title-dot" />
            Live Scan Feed
            <span style={{ marginLeft: 'auto', fontSize: 10, color: backendOnline ? 'var(--green)' : 'var(--amber)', fontFamily: 'var(--font-mono)', animation: 'pulse-dot 2s infinite' }}>
              ● {backendOnline ? 'LIVE' : 'DEMO MODE (API OFFLINE)'}
            </span>
          </div>
          <div className="feed-list">
            {feed.map((item, i) => (
              <div key={i} className="feed-item">
                <span className={`feed-verdict-badge ${item.verdict?.toLowerCase()}`}>
                  {item.verdict}
                </span>
                <span className="feed-url">{item.url}</span>
                <span className="feed-conf" style={{ color: item.verdict === 'PHISHING' ? 'var(--red)' : 'var(--green)' }}>
                  {typeof item.confidence_pct === 'number' ? item.confidence_pct.toFixed(1) : item.confidence_pct}%
                </span>
                <span className="feed-time">
                  <TimeAgo iso={item.scanned_at} />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* System capabilities — real measured detection rates, not
            hardcoded marketing numbers. Evaluated once at server startup
            against a held-out synthetic test set (see /capabilities). */}
        <div className="card">
          <div className="card-title">
            <span className="card-title-dot" style={{ background: 'var(--blue)', boxShadow: '0 0 6px var(--blue)' }} />
            Detection Capabilities
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              MEASURED · SYNTHETIC TEST SET
            </span>
          </div>
          {!capabilities ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '20px 0' }}>
              {backendOnline ? 'Computing real detection rates…' : 'Backend offline — capability metrics unavailable.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Typosquatting Detection', pct: capabilities.typosquatting?.recall_pct, desc: `Edit-distance on hostname tokens · ${capabilities.typosquatting?.false_positive_pct}% false-positive rate`, color: 'var(--green)' },
                { label: 'Combosquatting Detection', pct: capabilities.combosquatting?.recall_pct, desc: `Brand-in-subdomain keyword trap · ${capabilities.combosquatting?.false_positive_pct}% false-positive rate`, color: 'var(--green)' },
                { label: 'IP-as-Host Detection', pct: capabilities.ip_as_host?.recall_pct, desc: 'Raw IP regex match', color: 'var(--green)' },
                { label: 'Suspicious TLD Detection', pct: capabilities.suspicious_tld?.recall_pct, desc: 'Abuse-prone TLD list (.tk/.ml/.xyz…)', color: 'var(--amber)' },
                { label: 'Visual Clone Detection', pct: capabilities.visual_clone?.recall_pct, desc: `pHash + color signature · ${capabilities.visual_clone?.false_positive_pct}% false-positive rate on unrelated pages`, color: 'var(--purple)' },
                { label: 'Campaign Graph Clustering', pct: capabilities.campaign_clustering?.purity_pct, desc: 'Cluster purity on synthetic campaign families', color: 'var(--blue)' },
                { label: 'Zero-Day / Novel Obfuscation', pct: capabilities.zero_day_obfuscation?.recall_pct, desc: `Patterns unseen in training · ${capabilities.zero_day_obfuscation?.false_positive_pct}% false-positive rate`, color: 'var(--red)' },
              ].map(({ label, pct, desc, color }) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{label}</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color }}>{pct != null ? `${pct}%` : '—'}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 2 }}>
                    <div style={{ height: '100%', borderRadius: 2, background: color, width: `${pct || 0}%`, boxShadow: `0 0 6px ${color}44`, transition: 'width 1s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{desc}</div>
                </div>
              ))}
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                Measured against synthetic rule-generated test URLs, not real-world phishing traffic. Reflects whether each detector does what it's designed to do.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feature highlights */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 24 }}>
        {[
          {
            icon: '🌲',
            title: 'ML Ensemble',
            sub: 'RandomForest + HistGradientBoosting',
            desc: 'Both models compete on 5-fold CV F1. Winner serves production inference.',
            color: 'var(--green)',
            path: '/scanner',
          },
          {
            icon: '🕸️',
            title: 'Campaign Clustering',
            sub: 'Graph community detection',
            desc: 'Louvain algorithm groups coordinated phishing domains into attack campaigns.',
            color: 'var(--blue)',
            path: '/campaigns',
          },
          {
            icon: '👁️',
            title: 'Visual Clone Detector',
            sub: 'pHash + Color DNA',
            desc: 'Detects pixel-cloned login pages impersonating PayPal, Google, Apple and 8 more brands.',
            color: 'var(--purple)',
            path: '/fingerprint',
          },
          {
            icon: '🔤',
            title: '22-Feature Lexical Analysis',
            sub: 'Zero network required',
            desc: 'From URL string alone: edit-distance typosquats, brand tokens, Shannon entropy, suspicious TLDs.',
            color: 'var(--green)',
            path: '/scanner',
          },
          {
            icon: '🚨',
            title: 'Zero-Day Detection',
            sub: 'Novel obfuscation signals',
            desc: 'Catches IDN homographs, @-symbol tricks, hex-encoded chars — not in training data.',
            color: 'var(--red)',
            path: '/scanner',
          },
          {
            icon: '🤖',
            title: 'AI Chatbot Assistant',
            sub: 'Email & Document scan',
            desc: "Pasted text, email body, and document scanning to find threats and map fake sites to real ones.",
            color: 'var(--amber)',
            path: '/assistant',
          },
        ].map(({ icon, title, sub, desc, color, path }) => (
          <Link
            key={title}
            to={path}
            className="card"
            style={{
              borderTop: `2px solid ${color}44`,
              textDecoration: 'none',
              display: 'block',
              transition: 'transform 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 2 }}>{title}</div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sub}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

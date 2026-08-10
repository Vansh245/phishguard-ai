import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { Shield, Search, Network, Fingerprint, Cpu, Activity, Zap } from 'lucide-react'
import DashboardPage from './pages/DashboardPage'
import ScannerPage from './pages/ScannerPage'
import CampaignPage from './pages/CampaignPage'
import FingerprintPage from './pages/FingerprintPage'
import TechStackPage from './pages/TechStackPage'
import { useFeed } from './hooks/useFeed'

const NAV = [
  { path: '/',           icon: Activity,     label: 'Dashboard',         section: 'INTELLIGENCE' },
  { path: '/scanner',    icon: Search,       label: 'URL Scanner',       section: null },
  { path: '/campaigns',  icon: Network,      label: 'Campaign Graph',    section: null },
  { path: '/fingerprint',icon: Fingerprint,  label: 'Brand Shield',      section: 'ANALYSIS' },
  { path: '/tech',       icon: Cpu,          label: 'Tech Stack',        section: null },
]

function MatrixRain() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const cols = Math.floor(canvas.width / 20)
    const drops = Array(cols).fill(1)
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ'

    const draw = () => {
      ctx.fillStyle = 'rgba(8,8,16,0.05)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#00ff88'
      ctx.font = '14px JetBrains Mono'
      drops.forEach((y, i) => {
        const char = chars[Math.floor(Math.random() * chars.length)]
        ctx.fillText(char, i * 20, y * 20)
        if (y * 20 > canvas.height && Math.random() > 0.975) drops[i] = 0
        drops[i]++
      })
    }

    const id = setInterval(draw, 60)
    return () => { clearInterval(id); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={canvasRef} id="matrix-canvas" />
}

function Ticker({ feed }) {
  const items = feed.length
    ? [...feed, ...feed]
    : [
        { url: 'http://paypa1-secure.tk/login', verdict: 'PHISHING', confidence_pct: 94 },
        { url: 'https://www.google.com/',        verdict: 'SAFE',     confidence_pct: 99 },
        { url: 'http://amaz0n-billing.xyz/auth', verdict: 'PHISHING', confidence_pct: 87 },
        { url: 'https://github.com/explore',     verdict: 'SAFE',     confidence_pct: 98 },
        { url: 'http://apple-id-verify.ml/login',verdict: 'PHISHING', confidence_pct: 91 },
      ]

  const doubled = [...items, ...items]

  return (
    <div className="ticker-wrap">
      <div className="ticker-inner">
        {doubled.map((item, i) => (
          <span key={i} className={`ticker-item ${item.verdict === 'PHISHING' ? 'phishing' : 'safe'}`}>
            <span className="ticker-dot" />
            {item.url.length > 50 ? item.url.slice(0, 50) + '…' : item.url}
            &nbsp;→ {item.verdict} ({item.confidence_pct?.toFixed?.(0) ?? item.confidence_pct}%)
          </span>
        ))}
      </div>
    </div>
  )
}

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="topbar-time">
      {time.toLocaleTimeString('en-US', { hour12: false })} UTC
    </span>
  )
}

export default function App() {
  const location = useLocation()
  const { feed, backendOnline } = useFeed()

  return (
    <>
      <MatrixRain />
      <div className="scanline-overlay" />
      <div className="app-layout">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">🛡️</div>
            <div className="sidebar-logo-text">
              <div className="sidebar-logo-name">PhishGuard AI</div>
              <div className="sidebar-logo-sub">Threat Intelligence</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            {NAV.map((item, i) => {
              const Icon = item.icon
              const isFirst = i === 0 || item.section !== null
              const prevSection = i > 0 ? NAV[i - 1].section : null
              const showLabel = item.section && item.section !== prevSection

              return (
                <div key={item.path}>
                  {showLabel && (
                    <div className="nav-section-label">{item.section}</div>
                  )}
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                  >
                    <Icon className="nav-icon" size={18} />
                    {item.label}
                  </NavLink>
                </div>
              )
            })}
          </nav>

          <div className="sidebar-status">
            <div className="status-indicator">
              <div className={`status-dot ${backendOnline ? '' : 'offline'}`} />
              <span>{backendOnline ? 'API Connected' : 'API Offline'}</span>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="main-content">
          <header className="topbar">
            <span className="ticker-label">
              <Zap size={12} /> LIVE THREATS
            </span>
            <Ticker feed={feed} />
            <div className="topbar-actions">
              <Clock />
            </div>
          </header>

          <main>
            <Routes>
              <Route path="/"            element={<DashboardPage />} />
              <Route path="/scanner"     element={<ScannerPage />} />
              <Route path="/campaigns"   element={<CampaignPage />} />
              <Route path="/fingerprint" element={<FingerprintPage />} />
              <Route path="/tech"        element={<TechStackPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </>
  )
}

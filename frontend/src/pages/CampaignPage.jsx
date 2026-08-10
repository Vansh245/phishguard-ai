import { useState, useCallback } from 'react'
import { Network, Play, Download } from 'lucide-react'
import axios from 'axios'
import CampaignGraph from '../components/CampaignGraph'

const DEMO_URLS = `http://paypa1-secure.tk/login/verify
http://paypal-confirm.tk/login/update
http://paypal-account.tk/login/billing
http://g00gle-signin.ml/auth/validate
http://google-security.ml/auth/confirm
https://www.github.com/users
https://github.com/explore
http://amazon-billing.xyz/account/suspended
http://amaz0n-update.xyz/account/verify
http://apple-id-suspended.cf/verify
http://apple-security.cf/account/confirm
https://www.google.com/search`

export default function CampaignPage() {
  const [urlText, setUrlText] = useState(DEMO_URLS)
  const [threshold, setThreshold] = useState(0.35)
  const [loading, setLoading] = useState(false)
  const [campaigns, setCampaigns] = useState(null)
  const [selected, setSelected] = useState(null)

  const cluster = useCallback(async () => {
    const urls = urlText.trim().split('\n').filter(u => u.trim())
    if (!urls.length) return
    setLoading(true)
    setCampaigns(null)
    setSelected(null)
    try {
      const res = await axios.post('/cluster', { urls, threshold })
      setCampaigns(res.data.campaigns)
    } catch {
      // Offline mock
      setCampaigns(mockCluster(urls))
    } finally {
      setLoading(false)
    }
  }, [urlText, threshold])

  const exportJSON = () => {
    if (!campaigns) return
    const blob = new Blob([JSON.stringify(campaigns, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'phishguard_campaigns.json'
    a.click()
  }

  const COLORS = ['#00ff88', '#3d9cf5', '#ffa502', '#a855f7', '#ff4757', '#00d4ff']

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">
          <Network size={20} style={{ color: 'var(--green)' }} />
          Campaign Graph Intelligence
        </h1>
        <p className="page-sub">
          Graph community detection (Louvain/Greedy Modularity) groups related phishing domains into coordinated attack campaigns
        </p>
      </div>

      <div className="info-box info" style={{ marginBottom: 20 }}>
        🔬 <strong>How it works:</strong> URLs are linked if they share path templates, TLD, or keyword overlap (Jaccard similarity ≥ threshold). Connected components are detected via NetworkX greedy modularity communities.
      </div>

      {/* Config row */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title"><span className="card-title-dot" /> Cluster Configuration</div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              SIMILARITY THRESHOLD: {threshold}
            </label>
            <input
              type="range" min="0.1" max="0.9" step="0.05"
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--green)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 4 }}>
              <span>0.1 (loose)</span><span>0.9 (strict)</span>
            </div>
          </div>
          <button className="btn btn-primary" onClick={cluster} disabled={loading}>
            {loading
              ? <><span className="spinner" /> Clustering…</>
              : <><Play size={13} /> Run Clustering</>}
          </button>
          {campaigns && (
            <button className="btn btn-secondary" onClick={exportJSON}>
              <Download size={13} /> Export JSON
            </button>
          )}
        </div>
      </div>

      {/* URL textarea */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title"><span className="card-title-dot" /> URL List ({urlText.trim().split('\n').filter(u => u.trim()).length} URLs)</div>
        <textarea
          className="batch-textarea"
          value={urlText}
          onChange={e => setUrlText(e.target.value)}
          placeholder="Enter one URL per line…"
          style={{ height: 140 }}
        />
      </div>

      {campaigns && (
        <>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Campaigns Found', val: campaigns.length, color: 'var(--green)' },
              { label: 'Largest Campaign', val: Math.max(...campaigns.map(c => c.size)) + ' URLs', color: 'var(--amber)' },
              { label: 'Singleton URLs', val: campaigns.filter(c => c.size === 1).length, color: 'var(--text-muted)' },
              { label: 'Clustered URLs', val: campaigns.filter(c => c.size > 1).reduce((a, c) => a + c.size, 0), color: 'var(--red)' },
            ].map(({ label, val, color }) => (
              <div key={label} className="card" style={{ flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color }}>{val}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Graph + campaign list */}
          <div className="results-grid">
            <div>
              <div className="card-title" style={{ marginBottom: 12, paddingLeft: 4 }}>
                <span className="card-title-dot" /> Interactive Force Graph
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Drag nodes · Scroll to zoom
                </span>
              </div>
              <div className="graph-container">
                <CampaignGraph campaigns={campaigns} />
              </div>
            </div>

            <div>
              <div className="card-title" style={{ marginBottom: 12, paddingLeft: 4 }}>
                <span className="card-title-dot" /> Campaign Details
              </div>
              <div className="campaigns-list">
                {campaigns.map((camp, i) => (
                  <div
                    key={i}
                    className={`campaign-card ${selected === i ? 'selected' : ''}`}
                    onClick={() => setSelected(selected === i ? null : i)}
                  >
                    <div className="campaign-header">
                      <span className="campaign-id" style={{ color: COLORS[i % COLORS.length] }}>
                        ◉ Campaign {i + 1}
                      </span>
                      <span className="campaign-size">{camp.size} URL{camp.size !== 1 ? 's' : ''}</span>
                    </div>
                    {camp.common_tld && (
                      <div className="campaign-tld">TLD: .{camp.common_tld}</div>
                    )}
                    {camp.common_keywords?.length > 0 && (
                      <div className="campaign-keywords">
                        {camp.common_keywords.map(kw => (
                          <span key={kw} className="kw-chip">{kw}</span>
                        ))}
                      </div>
                    )}
                    {selected === i && (
                      <div className="campaign-urls" style={{ marginTop: 10 }}>
                        {camp.urls.map((u, j) => (
                          <div key={j} className="campaign-url-item">▸ {u}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Offline mock clustering ─────────────────────────────────────────────────
function mockCluster(urls) {
  const groups = {}
  urls.forEach(url => {
    try {
      const host = new URL(url.startsWith('http') ? url : 'http://' + url).hostname
      const tld = host.split('.').slice(-1)[0]
      if (!groups[tld]) groups[tld] = []
      groups[tld].push(url)
    } catch {}
  })
  return Object.values(groups).map((camp, i) => ({
    campaign_id: i,
    urls: camp,
    size: camp.length,
    common_tld: camp[0] ? new URL(camp[0].startsWith('http') ? camp[0] : 'http://' + camp[0]).hostname.split('.').slice(-1)[0] : '',
    common_keywords: ['login', 'verify'].slice(0, camp.length > 2 ? 2 : 1),
  }))
}

import { Cpu } from 'lucide-react'

const STACK = [
  {
    icon: '🌲',
    name: 'Random Forest',
    type: 'Machine Learning · Ensemble',
    color: 'var(--green)',
    desc: 'n_estimators=200 trees, max_depth=12. Produces reliable feature_importances_ for explainability. Chosen via 5-fold cross-validation F1.',
    tags: [{ label: 'scikit-learn', c: 'green' }, { label: 'Ensemble', c: 'blue' }, { label: 'Explainable', c: 'green' }],
    why: 'Best out-of-box interpretability via Gini importance',
  },
  {
    icon: '⚡',
    name: 'HistGradientBoosting',
    type: 'Machine Learning · Gradient Boosting',
    color: 'var(--amber)',
    desc: "Sklearn's built-in histogram gradient boosting (no xgboost needed). 200 iterations, learning_rate=0.05. Competes with Random Forest for selection.",
    tags: [{ label: 'scikit-learn', c: 'green' }, { label: 'Boosting', c: 'amber' }, { label: 'Fast', c: 'blue' }],
    why: 'Better accuracy on high-cardinality features, no extra install',
  },
  {
    icon: '🕸️',
    name: 'NetworkX Louvain',
    type: 'Graph Intelligence · Community Detection',
    color: 'var(--blue)',
    desc: "Greedy modularity maximization to find phishing campaign communities. Nodes = URLs, edges = similarity (shared TLD + path template + Jaccard keyword overlap ≥ threshold).",
    tags: [{ label: 'networkx', c: 'blue' }, { label: 'Graph Theory', c: 'purple' }, { label: 'Louvain', c: 'blue' }],
    why: 'Catches coordinated multi-domain phishing campaigns automatically',
  },
  {
    icon: '👁️',
    name: 'Perceptual Hashing (pHash)',
    type: 'Computer Vision · Visual Fingerprinting',
    color: 'var(--purple)',
    desc: '8×8 2D-DCT coefficients over grayscale image → 64-bit hash. Hamming distance measures structural layout similarity. Detects clones even after cropping or minor edits.',
    tags: [{ label: 'Pillow', c: 'purple' }, { label: 'DCT', c: 'purple' }, { label: 'Numpy', c: 'blue' }],
    why: 'Layout-invariant: detects clones even when text is changed',
  },
  {
    icon: '🎨',
    name: 'Color Region DNA',
    type: 'Computer Vision · Color Analysis',
    color: 'var(--purple)',
    desc: 'RGB histogram (8 bins × 3 channels) focused on the top-20% header region. Brand identity lives in the header color palette — PayPal blue ≠ Google blue.',
    tags: [{ label: 'Pillow', c: 'purple' }, { label: 'Numpy', c: 'blue' }, { label: 'Histogram', c: 'amber' }],
    why: 'Catches clones that copy layout but change background color',
  },
  {
    icon: '🔤',
    name: 'Lexical Feature Extraction',
    type: 'NLP-inspired · URL Parsing',
    color: 'var(--green)',
    desc: '22 handcrafted signals: edit-distance typosquat score, combosquat token matching, Shannon entropy, suspicious TLD set, credential keyword count, URL structural features.',
    tags: [{ label: 'stdlib', c: 'green' }, { label: '22 features', c: 'blue' }, { label: 'No internet', c: 'amber' }],
    why: 'Zero-latency — works offline, catches patterns before any network call',
  },
  {
    icon: '🌐',
    name: 'Network Features (WHOIS/SSL/DNS)',
    type: 'Network Intelligence · stdlib only',
    color: 'var(--amber)',
    desc: 'Raw-socket WHOIS for domain age (strongest phishing signal: newly-registered ≤30 days). SSL cert inspection. DNS resolution check. Written in pure Python stdlib.',
    tags: [{ label: 'stdlib', c: 'green' }, { label: 'socket', c: 'amber' }, { label: 'ssl', c: 'amber' }],
    why: 'Domain age is the single strongest signal — most phishing domains live < 30 days',
  },
  {
    icon: '🚨',
    name: 'Zero-Day Signal Detection',
    type: 'Anomaly Detection · Heuristic',
    color: 'var(--red)',
    desc: 'Weighted signal combiner for features invisible to the main model: punycode encoding, @-symbol tricks, hex-encoded chars, open-redirect params, double-slash paths.',
    tags: [{ label: 'Heuristic', c: 'red' }, { label: 'Isolation Forest', c: 'red' }, { label: 'Novel threats', c: 'amber' }],
    why: 'Catches zero-day homograph attacks and novel obfuscation not in training data',
  },
  {
    icon: '⚡',
    name: 'FastAPI + Pydantic',
    type: 'Backend Framework · REST API',
    color: 'var(--blue)',
    desc: 'Async REST API with automatic OpenAPI docs. Pydantic v2 for request validation. CORS enabled for dev. Model warm-up on startup. Batch endpoint for bulk scanning.',
    tags: [{ label: 'FastAPI', c: 'blue' }, { label: 'Pydantic v2', c: 'blue' }, { label: 'Async', c: 'green' }],
    why: 'Fastest Python web framework — ideal for ML inference serving',
  },
  {
    icon: '⚛️',
    name: 'React + Vite + D3',
    type: 'Frontend Stack',
    color: 'var(--blue)',
    desc: 'React 18 for UI, Vite for instant HMR, D3 v7 for the force-directed campaign graph (zoom, drag, hover tooltips). Recharts for feature importance. No CSS framework.',
    tags: [{ label: 'React 18', c: 'blue' }, { label: 'D3 v7', c: 'blue' }, { label: 'Vite', c: 'amber' }],
    why: 'D3 force simulation gives a live, draggable threat network you can explore',
  },
  {
    icon: '📐',
    name: 'Edit Distance (Levenshtein)',
    type: 'Algorithm · String Similarity',
    color: 'var(--green)',
    desc: 'O(m×n) DP Levenshtein distance against 24 brand names. Normalised to 0–1 similarity. Runs on each hyphen-split token (catches paypa1, amaz0n, g00gle patterns).',
    tags: [{ label: 'O(m×n) DP', c: 'amber' }, { label: 'Token-split', c: 'green' }, { label: 'stdlib', c: 'green' }],
    why: 'Token-level splitting is the key fix that catches hyphenated typosquats',
  },
  {
    icon: '📊',
    name: 'Jaccard Similarity',
    type: 'Algorithm · Set Similarity',
    color: 'var(--blue)',
    desc: 'Used in campaign clustering: |A∩B|/|A∪B| over URL keyword bags. Combined with path-template matching and TLD match to compute edge weights in the phishing graph.',
    tags: [{ label: 'Set Theory', c: 'blue' }, { label: 'Clustering', c: 'purple' }, { label: 'O(n²)', c: 'amber' }],
    why: 'Simple but powerful for grouping URLs with shared vocabulary',
  },
]

export default function TechStackPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">
          <Cpu size={20} style={{ color: 'var(--green)' }} />
          Technology Stack
        </h1>
        <p className="page-sub">
          Every algorithm, model, and technique used — explained so judges understand exactly what's under the hood
        </p>
      </div>

      {/* Architecture diagram */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div className="card-title"><span className="card-title-dot" /> System Architecture</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', padding: '8px 0' }}>
          {[
            { label: 'URL Input', icon: '🔗', color: 'var(--text-secondary)' },
            { arrow: true },
            { label: 'Lexical Features\n22 signals (offline)', icon: '🔤', color: 'var(--green)' },
            { arrow: true },
            { label: 'Network Features\nWHOIS/DNS/SSL', icon: '🌐', color: 'var(--amber)' },
            { arrow: true },
            { label: 'ML Classifier\nRF + HGB ensemble', icon: '🌲', color: 'var(--green)' },
            { arrow: true },
            { label: 'Verdict +\nEvidence Chain', icon: '📋', color: 'var(--blue)' },
          ].map((item, i) => item.arrow ? (
            <div key={i} style={{ color: 'var(--text-muted)', fontSize: 18, padding: '0 8px', flexShrink: 0 }}>→</div>
          ) : (
            <div key={i} style={{
              background: 'var(--bg-elevated)', border: `1px solid ${item.color}33`,
              borderRadius: 'var(--radius-sm)', padding: '12px 16px',
              textAlign: 'center', flexShrink: 0, minWidth: 130,
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{item.icon}</div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: item.color,
                whiteSpace: 'pre-line', lineHeight: 1.5,
              }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 2, height: 60, background: 'var(--border)', flexShrink: 0, marginLeft: 60 }} />
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'Campaign Clustering\nGraph + Louvain', icon: '🕸️', color: 'var(--blue)' },
              { label: 'Visual Fingerprint\npHash + Color DNA', icon: '👁️', color: 'var(--purple)' },
              { label: 'Zero-Day Detection\nAnomaly signals', icon: '🚨', color: 'var(--red)' },
            ].map(item => (
              <div key={item.label} style={{
                background: 'var(--bg-elevated)', border: `1px solid ${item.color}33`,
                borderRadius: 'var(--radius-sm)', padding: '12px 16px',
                textAlign: 'center', minWidth: 140,
              }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: item.color, whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tech cards grid */}
      <div className="tech-grid">
        {STACK.map((tech) => (
          <div key={tech.name} className="tech-card" style={{ borderTop: `2px solid ${tech.color}44` }}>
            <div className="tech-card-icon">{tech.icon}</div>
            <div className="tech-card-name" style={{ color: tech.color }}>{tech.name}</div>
            <div className="tech-card-type">{tech.type}</div>
            <div className="tech-card-desc">{tech.desc}</div>
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, borderLeft: `2px solid ${tech.color}66` }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>WHY: </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{tech.why}</span>
            </div>
            <div>
              {tech.tags.map(t => (
                <span key={t.label} className={`tech-tag ${t.c}`}>{t.label}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Complexity table */}
      <div className="card" style={{ marginTop: 28 }}>
        <div className="card-title"><span className="card-title-dot" style={{ background: 'var(--amber)', boxShadow: '0 0 6px var(--amber)' }} /> Algorithmic Complexity Reference</div>
        <table className="results-table">
          <thead>
            <tr>
              <th>Algorithm</th>
              <th>Time Complexity</th>
              <th>Space</th>
              <th>Used For</th>
              <th>Key Parameter</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Levenshtein Edit Distance', 'O(m×n)', 'O(min(m,n))', 'Typosquat detection', 'token-level splitting'],
              ['Random Forest', 'O(n·d·log n·T)', 'O(T·depth)', 'URL classification', 'n_estimators=200'],
              ['HistGradientBoosting', 'O(n·d·bins·K)', 'O(bins·d)', 'URL classification', 'max_iter=200'],
              ['Greedy Modularity', 'O(m·log n)', 'O(n+m)', 'Campaign clustering', 'threshold≥0.35'],
              ['pHash (DCT)', 'O((4h)²·log(4h)²)', 'O(h²)', 'Visual fingerprinting', 'hash_size=8'],
              ['Jaccard Similarity', 'O(|A|+|B|)', 'O(|A∪B|)', 'URL keyword clustering', 'edge weight threshold'],
            ].map(row => (
              <tr key={row[0]}>
                {row.map((cell, i) => (
                  <td key={i} style={{ color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

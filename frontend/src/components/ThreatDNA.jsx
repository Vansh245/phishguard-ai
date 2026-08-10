import { useEffect, useRef } from 'react'

const LABELS = ['Lexical Risk', 'TLD Risk', 'Brand Impersonation', 'Entropy', 'Keyword Density', 'Structure']

function polarToXY(angle, r, cx, cy) {
  const rad = (angle - 90) * (Math.PI / 180)
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

export default function ThreatDNA({ features, verdict }) {
  // Map feature values to 0-1 radar axes
  const f = features || {}
  const maxes = { url_length: 200, hyphen_count: 6, hostname_entropy: 5,
                  cred_keyword_count: 5, subdomain_depth: 4 }

  const normalize = (val, max) => Math.min(1, (val || 0) / max)

  const values = [
    // Lexical Risk: combo of length, hyphens, structure anomalies
    Math.min(1, (normalize(f.url_length, 200) * 0.4
      + normalize(f.hyphen_count, 6) * 0.3
      + (f.ip_host || 0) * 0.3)),
    // TLD Risk
    (f.suspicious_tld || 0) * 0.8 + (f.punycode || 0) * 0.2,
    // Brand Impersonation
    Math.min(1, (f.typosquat_score || 0) * 0.6 + (f.combosquat || 0) * 0.4),
    // Entropy
    normalize(f.hostname_entropy, 5),
    // Keyword density
    normalize(f.cred_keyword_count, 5),
    // Structure anomalies
    Math.min(1, normalize(f.subdomain_depth, 4) * 0.5
      + (f.redirect_param || 0) * 0.25
      + (f.at_symbol || 0) * 0.25),
  ]

  const SIZE = 220
  const cx = SIZE / 2
  const cy = SIZE / 2
  const R = 80
  const n = LABELS.length
  const step = 360 / n

  // Polygon points for threat score
  const threatPoints = values.map((v, i) => {
    const p = polarToXY(i * step, v * R, cx, cy)
    return `${p.x},${p.y}`
  }).join(' ')

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1.0]

  // Axis endpoints
  const axes = Array.from({ length: n }, (_, i) => polarToXY(i * step, R, cx, cy))

  const color = verdict === 'PHISHING' ? '#ff4757' : '#00ff88'
  const fillColor = verdict === 'PHISHING' ? 'rgba(255,71,87,0.15)' : 'rgba(0,255,136,0.12)'

  return (
    <div className="radar-wrap">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Grid rings */}
        {rings.map((r, i) => {
          const pts = Array.from({ length: n }, (_, j) => {
            const p = polarToXY(j * step, r * R, cx, cy)
            return `${p.x},${p.y}`
          }).join(' ')
          return (
            <polygon
              key={i}
              points={pts}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          )
        })}

        {/* Axis lines */}
        {axes.map((pt, i) => (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={pt.x} y2={pt.y}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
        ))}

        {/* Threat polygon */}
        <polygon
          points={threatPoints}
          fill={fillColor}
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />

        {/* Data points */}
        {values.map((v, i) => {
          const pt = polarToXY(i * step, v * R, cx, cy)
          return (
            <circle
              key={i}
              cx={pt.x} cy={pt.y} r={4}
              fill={color}
              style={{ filter: `drop-shadow(0 0 4px ${color})` }}
            />
          )
        })}

        {/* Labels */}
        {LABELS.map((label, i) => {
          const pt = polarToXY(i * step, R + 22, cx, cy)
          const anchor = pt.x < cx - 5 ? 'end' : pt.x > cx + 5 ? 'start' : 'middle'
          return (
            <text
              key={i}
              x={pt.x} y={pt.y}
              textAnchor={anchor}
              fill="rgba(136,136,170,0.9)"
              fontSize="9"
              fontFamily="JetBrains Mono"
              dominantBaseline="middle"
            >
              {label}
            </text>
          )
        })}

        {/* Center label */}
        <text
          x={cx} y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize="11"
          fontFamily="JetBrains Mono"
          fontWeight="700"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        >
          THREAT DNA
        </text>
      </svg>
    </div>
  )
}

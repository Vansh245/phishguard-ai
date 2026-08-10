import { useEffect, useRef, useCallback } from 'react'

function drag(simulation) {
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart()
    d.fx = d.x; d.fy = d.y
  }
  function dragged(event, d) { d.fx = event.x; d.fy = event.y }
  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0)
    d.fx = null; d.fy = null
  }
  return { dragstarted, dragged, dragended }
}

const CAMPAIGN_COLORS = ['#00ff88', '#3d9cf5', '#ffa502', '#a855f7', '#ff4757', '#00d4ff']

export default function CampaignGraph({ campaigns }) {
  const svgRef = useRef(null)
  const simRef = useRef(null)

  useEffect(() => {
    if (!campaigns || campaigns.length === 0 || !svgRef.current) return

    // Lazy-load d3
    import('d3').then((d3) => {
      const svg = d3.select(svgRef.current)
      svg.selectAll('*').remove()

      const rect = svgRef.current.parentElement.getBoundingClientRect()
      const W = rect.width || 800
      const H = rect.height || 500

      svg.attr('width', W).attr('height', H)

      const g = svg.append('g')

      // Build nodes & links from campaigns
      const nodes = []
      const links = []
      const urlToId = {}

      campaigns.forEach((camp, ci) => {
        camp.urls.forEach((url, ui) => {
          const id = `${ci}-${ui}`
          urlToId[url] = id
          nodes.push({
            id,
            url,
            campaign: ci,
            color: CAMPAIGN_COLORS[ci % CAMPAIGN_COLORS.length],
          })
        })
        // Link all URLs in same campaign
        for (let i = 0; i < camp.urls.length - 1; i++) {
          links.push({
            source: `${ci}-${i}`,
            target: `${ci}-${i + 1}`,
            campaign: ci,
          })
        }
        // Fully connect small campaigns
        if (camp.urls.length <= 6) {
          for (let i = 0; i < camp.urls.length; i++) {
            for (let j = i + 1; j < camp.urls.length; j++) {
              if (!(i === j - 1)) {
                links.push({ source: `${ci}-${i}`, target: `${ci}-${j}`, campaign: ci })
              }
            }
          }
        }
      })

      // Simulation
      const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(60).strength(0.8))
        .force('charge', d3.forceManyBody().strength(-120))
        .force('center', d3.forceCenter(W / 2, H / 2))
        .force('collision', d3.forceCollide(20))
        .force('cluster', () => {
          nodes.forEach(node => {
            const camp = campaigns[node.campaign]
            if (!camp) return
            const cx = (node.campaign % 3) * (W / 3) + W / 6
            const cy = Math.floor(node.campaign / 3) * (H / 2) + H / 4
            node.vx += (cx - node.x) * 0.01
            node.vy += (cy - node.y) * 0.01
          })
        })

      simRef.current = simulation

      // Links
      const link = g.append('g')
        .selectAll('line')
        .data(links)
        .join('line')
        .attr('stroke', d => CAMPAIGN_COLORS[d.campaign % CAMPAIGN_COLORS.length])
        .attr('stroke-opacity', 0.3)
        .attr('stroke-width', 1.5)

      // Campaign hulls (background blobs)
      const hull = g.append('g').lower()
      
      // Nodes
      const node = g.append('g')
        .selectAll('g')
        .data(nodes)
        .join('g')
        .attr('cursor', 'pointer')

      node.append('circle')
        .attr('r', 10)
        .attr('fill', d => d.color + '22')
        .attr('stroke', d => d.color)
        .attr('stroke-width', 1.5)
        .style('filter', d => `drop-shadow(0 0 4px ${d.color})`)

      node.append('text')
        .attr('dy', 0)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', d => d.color)
        .attr('font-size', '9px')
        .attr('font-family', 'JetBrains Mono')
        .text(d => {
          try {
            const url = new URL(d.url.startsWith('http') ? d.url : 'http://' + d.url)
            return url.hostname.length > 16 ? url.hostname.slice(0, 14) + '…' : url.hostname
          } catch { return d.url.slice(0, 14) }
        })

      // Tooltip
      const tooltip = d3.select('body').append('div')
        .attr('class', 'graph-tooltip')
        .style('position', 'fixed')
        .style('background', '#13131f')
        .style('border', '1px solid rgba(255,255,255,0.1)')
        .style('border-radius', '8px')
        .style('padding', '10px 14px')
        .style('font-family', 'JetBrains Mono')
        .style('font-size', '11px')
        .style('color', '#f0f0f5')
        .style('pointer-events', 'none')
        .style('z-index', '9999')
        .style('display', 'none')
        .style('max-width', '320px')

      node
        .on('mouseover', (event, d) => {
          tooltip
            .style('display', 'block')
            .html(`<div style="color:${d.color};margin-bottom:4px">Campaign ${d.campaign + 1}</div>${d.url}`)
        })
        .on('mousemove', event => {
          tooltip
            .style('left', (event.clientX + 12) + 'px')
            .style('top', (event.clientY - 8) + 'px')
        })
        .on('mouseleave', () => tooltip.style('display', 'none'))

      // Drag
      const { dragstarted, dragged, dragended } = drag(simulation)
      node.call(
        d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended)
      )

      // Zoom
      svg.call(d3.zoom()
        .scaleExtent([0.3, 4])
        .on('zoom', e => g.attr('transform', e.transform)))

      // Campaign legend
      const legend = svg.append('g').attr('transform', `translate(16,16)`)
      campaigns.forEach((camp, i) => {
        const row = legend.append('g').attr('transform', `translate(0,${i * 20})`)
        row.append('circle').attr('r', 5).attr('cx', 5).attr('cy', 5)
          .attr('fill', CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length])
          .style('filter', `drop-shadow(0 0 3px ${CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length]})`)
        row.append('text').attr('x', 16).attr('y', 10)
          .attr('fill', 'rgba(136,136,170,0.8)')
          .attr('font-size', '10px')
          .attr('font-family', 'JetBrains Mono')
          .text(`Campaign ${i + 1} — ${camp.size} URLs${camp.common_tld ? ` [.${camp.common_tld}]` : ''}`)
      })

      simulation.on('tick', () => {
        link
          .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
        node.attr('transform', d => `translate(${d.x},${d.y})`)
      })

      return () => {
        simulation.stop()
        tooltip.remove()
      }
    })
  }, [campaigns])

  return (
    <svg
      ref={svgRef}
      className="graph-svg"
      style={{ background: 'transparent' }}
    />
  )
}

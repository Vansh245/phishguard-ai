import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE } from '../config'

export function useFeed() {
  const [feed, setFeed] = useState([])
  const [backendOnline, setBackendOnline] = useState(false)
  // null = "not loaded yet", distinct from a real 0 — callers must not
  // treat 0 as falsy and silently swap in a fake fallback number.
  const [stats, setStats] = useState(null)
  const [health, setHealth] = useState(null)
  const [capabilities, setCapabilities] = useState(null)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await axios.get(`${API_BASE}/health`, { timeout: 8000 })
        setBackendOnline(true)
        setHealth(res.data)
      } catch {
        setBackendOnline(false)
      }
    }

    const fetchFeed = async () => {
      try {
        const [feedRes, statsRes] = await Promise.all([
          axios.get(`${API_BASE}/feed?limit=30`),
          axios.get(`${API_BASE}/stats`),
        ])
        setFeed(feedRes.data.feed || [])
        setStats(statsRes.data)
      } catch {}
    }

    const fetchCapabilities = async () => {
      try {
        const res = await axios.get(`${API_BASE}/capabilities`, { timeout: 8000 })
        setCapabilities(res.data)
      } catch {
        // 503 while still computing at startup, or offline — leave null,
        // caller shows a loading/unavailable state rather than fake numbers.
      }
    }

    check()
    fetchFeed()
    fetchCapabilities()
    const id = setInterval(() => { check(); fetchFeed() }, 6000)
    // Capabilities are expensive to compute and cached server-side for the
    // process lifetime — poll it far less often, just enough to pick it up
    // once startup evaluation finishes.
    const capId = setInterval(fetchCapabilities, 15000)
    return () => { clearInterval(id); clearInterval(capId) }
  }, [])

  return { feed, backendOnline, stats, health, capabilities }
}

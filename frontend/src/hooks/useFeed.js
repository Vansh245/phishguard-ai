import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE } from '../config'

export function useFeed() {
  const [feed, setFeed] = useState([])
  const [backendOnline, setBackendOnline] = useState(false)
  const [stats, setStats] = useState({
    total_scanned: 0,
    total_phishing: 0,
    total_safe: 0,
    phishing_rate_pct: 0,
  })

  useEffect(() => {
    const check = async () => {
      try {
        await axios.get(`${API_BASE}/health`, { timeout: 8000 })
        setBackendOnline(true)
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

    check()
    fetchFeed()
    const id = setInterval(() => { check(); fetchFeed() }, 6000)
    return () => clearInterval(id)
  }, [])

  return { feed, backendOnline, stats }
}

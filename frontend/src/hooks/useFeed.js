import { useState, useEffect } from 'react'
import axios from 'axios'

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
        await axios.get('/health', { timeout: 2000 })
        setBackendOnline(true)
      } catch {
        setBackendOnline(false)
      }
    }

    const fetchFeed = async () => {
      try {
        const [feedRes, statsRes] = await Promise.all([
          axios.get('/feed?limit=30'),
          axios.get('/stats'),
        ])
        setFeed(feedRes.data.feed || [])
        setStats(statsRes.data)
      } catch {}
    }

    check()
    fetchFeed()
    const id = setInterval(() => { check(); fetchFeed() }, 5000)
    return () => clearInterval(id)
  }, [])

  return { feed, backendOnline, stats }
}

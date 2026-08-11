import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Upload, AlertTriangle, ShieldCheck, ArrowRight, FileText } from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config'

const BRAND_OFFICIAL_URLS = {
  paypal: 'https://www.paypal.com',
  google: 'https://www.google.com',
  amazon: 'https://www.amazon.com',
  apple: 'https://www.apple.com',
  microsoft: 'https://www.microsoft.com',
  netflix: 'https://www.netflix.com',
  facebook: 'https://www.facebook.com',
  chase: 'https://www.chase.com',
  github: 'https://www.github.com',
  instagram: 'https://www.instagram.com',
  linkedin: 'https://www.linkedin.com',
}

export default function AssistantPage() {
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: 'Hello! I am your PhishGuard AI Assistant. Ask me about phishing, scams, or online safety — or paste a link, email, or document and I\'ll scan it for you.',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)
  const chatEndRef = useRef(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  // Send the full conversation to the real AI Assistant backend. The
  // assistant decides for itself whether to call the scan_url tool
  // (running the real classifier) based on what's in the message.
  const sendToAssistant = async (allMessages) => {
    const payload = {
      messages: allMessages
        .filter(m => m.sender === 'user' || m.sender === 'bot')
        .map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
    }
    const res = await axios.post(`${API_BASE}/chat`, payload)
    return res.data // { reply, scans }
  }

  const handleSend = async (textToSend = input) => {
    const text = textToSend.trim()
    if (!text) return

    const userMsg = { sender: 'user', text, timestamp: new Date() }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    if (textToSend === input) setInput('')
    setLoading(true)

    try {
      const { reply, scans } = await sendToAssistant(nextMessages)
      setMessages(prev => [
        ...prev,
        { sender: 'bot', text: reply, scans: scans?.length ? scans : undefined, timestamp: new Date() },
      ])
    } catch (err) {
      const notConfigured = err?.response?.status === 503
      setMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: notConfigured
            ? "The AI Assistant isn't configured yet — the server is missing its OpenAI API key. Ask the site admin to set OPENAI_API_KEY."
            : "Sorry, I couldn't reach the assistant just now. Please try again in a moment.",
          timestamp: new Date(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  // Handle file drop / upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const content = event.target.result
      const userText = `Please check this document (${file.name}) for phishing links:\n\n${content}`

      const userMsg = {
        sender: 'user',
        text: `📄 Uploaded file: **${file.name}**\n\n*Scanning file content...*`,
        timestamp: new Date(),
      }
      const nextMessages = [...messages, { ...userMsg, text: userText }]
      setMessages(prev => [...prev, userMsg])
      setLoading(true)

      try {
        const { reply, scans } = await sendToAssistant(nextMessages)
        setMessages(prev => [
          ...prev,
          { sender: 'bot', text: reply, scans: scans?.length ? scans : undefined, timestamp: new Date() },
        ])
      } catch (err) {
        const notConfigured = err?.response?.status === 503
        setMessages(prev => [
          ...prev,
          {
            sender: 'bot',
            text: notConfigured
              ? "The AI Assistant isn't configured yet — the server is missing its OpenAI API key."
              : "Sorry, I couldn't scan that file just now. Please try again in a moment.",
            timestamp: new Date(),
          },
        ])
      } finally {
        setLoading(false)
      }
    }

    reader.readAsText(file)
  }

  return (
    <div className="page" style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">
          <Bot size={20} style={{ color: 'var(--green)' }} />
          PhishGuard AI Assistant
        </h1>
        <p className="page-sub">
          AI Copilot to scan emails, message text, and documents for phishing URLs and spoofed sites
        </p>
      </div>

      {/* Main chat window */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        {/* Messages */}
        <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 12,
                maxWidth: '85%',
                alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                flexDirection: m.sender === 'user' ? 'row-reverse' : 'row',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: m.sender === 'user' ? 'var(--green-glow)' : 'var(--blue-glow)',
                  border: `1px solid ${m.sender === 'user' ? 'var(--green-border)' : 'rgba(61,156,245,0.2)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  flexShrink: 0,
                  color: m.sender === 'user' ? 'var(--green)' : 'var(--blue)',
                }}
              >
                {m.sender === 'user' ? '👤' : '🤖'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div
                  className="chat-bubble"
                  style={{
                    background: m.sender === 'user' ? 'var(--bg-elevated)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${m.sender === 'user' ? 'var(--border-bright)' : 'var(--border)'}`,
                    borderRadius: 12,
                    padding: '12px 16px',
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {m.text}

                  {/* Scan reports in the bubble */}
                  {m.scans && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                      {m.scans.map((s, idx) => {
                        const isPhish = s.verdict === 'PHISHING'
                        const brandKey = s.features?.typosquat_brand || s.features?.combosquat_brand
                        const realUrl = brandKey ? BRAND_OFFICIAL_URLS[brandKey.toLowerCase()] : null

                        return (
                          <div
                            key={idx}
                            style={{
                              background: 'rgba(0,0,0,0.2)',
                              border: `1px solid ${isPhish ? 'rgba(255,71,87,0.25)' : 'var(--green-border)'}`,
                              borderRadius: 8,
                              padding: 12,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all', maxWidth: '70%', color: 'var(--text-secondary)' }}>
                                {s.url}
                              </span>
                              <span
                                className={`feed-verdict-badge ${s.verdict.toLowerCase()}`}
                                style={{ flexShrink: 0 }}
                              >
                                {s.verdict}
                              </span>
                            </div>

                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                              Confidence: <strong style={{ color: isPhish ? 'var(--red)' : 'var(--green)' }}>{s.confidence_pct?.toFixed(1)}%</strong>
                            </div>

                            {/* Evidence check */}
                            {s.evidence?.length > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 8, borderLeft: '1px solid var(--border)', marginBottom: 8 }}>
                                {s.evidence.map((ev, eIdx) => (
                                  <div key={eIdx}>• {ev}</div>
                                ))}
                              </div>
                            )}

                            {/* Brand match warning & real site link */}
                            {isPhish && (
                              <div
                                style={{
                                  background: 'var(--red-glow)',
                                  border: '1px solid rgba(255,71,87,0.2)',
                                  borderRadius: 6,
                                  padding: '8px 10px',
                                  marginTop: 8,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 4,
                                }}
                              >
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <AlertTriangle size={12} /> FAKE SITE DETECTED!
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>
                                  This link mimics {brandKey ? <strong>{brandKey.toUpperCase()}</strong> : 'a secure service'} to steal your credentials.
                                </span>
                                {realUrl && (
                                  <a
                                    href={realUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      fontSize: 11,
                                      color: 'var(--green)',
                                      textDecoration: 'underline',
                                      fontWeight: 600,
                                      marginTop: 2,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    Go to official site instead: {realUrl} <ArrowRight size={10} />
                                  </a>
                                )}
                              </div>
                            )}

                            {!isPhish && (
                              <div
                                style={{
                                  background: 'var(--green-glow)',
                                  border: '1px solid var(--green-border)',
                                  borderRadius: 6,
                                  padding: '8px 10px',
                                  marginTop: 8,
                                  fontSize: 11,
                                  color: 'var(--green)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontWeight: 600,
                                }}
                              >
                                <ShieldCheck size={12} /> Link is verified safe to click.
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                  {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', gap: 12, maxWidth: '80%' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-elevated)',
                border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0
              }}>
                🤖
              </div>
              <div className="chat-bubble" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="spinner" style={{ color: 'var(--green)', width: 14, height: 14 }} />
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>AI is thinking...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input box */}
        <div style={{ padding: 16, borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          {/* Quick templates */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              className="quick-url-chip"
              onClick={() => handleSend("Dear Customer, your Paypal account has been suspended. Please login immediately to verify: http://paypa1-secure-verify.tk/login")}
              style={{ fontSize: 10 }}
            >
              📧 Suspicious Paypal Email
            </button>
            <button
              className="quick-url-chip"
              onClick={() => handleSend("Hi Vansh, check out this cool project repository on github: https://github.com/Vansh245/phishguard-ai")}
              style={{ fontSize: 10 }}
            >
              📧 Safe GitHub Message
            </button>
            <button
              className="quick-url-chip"
              onClick={() => fileInputRef.current?.click()}
              style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Upload size={10} /> Scan Text Document (.txt)
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".txt,.csv,.log,.json"
              style={{ display: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <textarea
              className="scanner-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Paste email text, paste links, or chat with PhishGuard..."
              style={{ height: 50, resize: 'none', padding: '12px 16px', flex: 1, fontFamily: 'var(--font-ui)' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <button
              className="btn btn-primary"
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              style={{ height: 50, width: 50, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


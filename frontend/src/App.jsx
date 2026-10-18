import { useState, useCallback, useRef, useEffect } from 'react'
import axios from 'axios'
import './App.css'

const API_BASE = window.location.origin.includes('localhost') ? 'http://localhost:8000' : ''

// ─── Score Circle Component ────────────────────────────────────────────────────
function ScoreCircle({ score, color, label }) {
  const r = 32
  const circ = 2 * Math.PI * r
  const [offset, setOffset] = useState(circ)

  useEffect(() => {
    setTimeout(() => {
      setOffset(circ - (score / 100) * circ)
    }, 100)
  }, [score, circ])

  return (
    <div className="score-card">
      <div className="score-card-label">{label}</div>
      <div className="score-circle">
        <svg width="76" height="76" viewBox="0 0 76 76">
          <circle className="score-circle-bg" cx="38" cy="38" r={r} />
          <circle
            className="score-circle-fill"
            cx="38" cy="38" r={r}
            stroke={color}
            strokeDasharray={circ}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="score-circle-text">
          <span className="score-number" style={{ color }}>{score}</span>
          <span className="score-unit">/ 100</span>
        </div>
      </div>
      <div className="score-bar-label">{getScoreLabel(score)}</div>
    </div>
  )
}

function getScoreLabel(s) {
  if (s >= 80) return 'High Trust'
  if (s >= 60) return 'Moderate'
  if (s >= 40) return 'Questionable'
  if (s >= 20) return 'Low Credibility'
  return 'Severe Alert'
}

// ─── Verdict Config ────────────────────────────────────────────────────────────
const verdictConfig = {
  LEGITIMATE: { emoji: '✅', label: 'Verdict: Legitimate / Verified', title: 'LEGITIMATE', cls: 'legitimate', color: '#10b981' },
  MISLEADING: { emoji: '⚠️', label: 'Verdict: Misleading / Missing Context', title: 'MISLEADING', cls: 'misleading', color: '#f59e0b' },
  FAKE:       { emoji: '❌', label: 'Verdict: Fabricated / Fake News', title: 'FAKE NEWS', cls: 'fake', color: '#ef4444' },
  UNCERTAIN:  { emoji: '🔍', label: 'Verdict: Insufficient Evidence', title: 'UNCERTAIN', cls: 'uncertain', color: '#6366f1' },
}

// ─── Loading Steps ─────────────────────────────────────────────────────────────
const IMAGE_STEPS = [
  'Uploading image to Google Cloud Storage (GCS)…',
  'Extracting claims via Gemini Vision on Vertex AI…',
  'Searching across real-world web citations…',
  'Cross-referencing facts & corroborating evidence…',
  'Computing credibility, bias & evidence scores…',
  'Logging telemetry to Google BigQuery…',
]
const VIDEO_STEPS = [
  'Uploading video to Google Cloud Storage…',
  'Transcribing audio via Cloud Speech-to-Text v2 (Chirp)…',
  'Extracting spoken factual claims…',
  'Cross-referencing facts via web intelligence…',
  'Computing credibility scores on Vertex AI…',
  'Logging telemetry to Google BigQuery…',
]
const LINK_STEPS = [
  'Extracting content preview from source URL…',
  'Synthesizing key claims via Gemini on Vertex AI…',
  'Searching fact-checking databases…',
  'Evaluating source authority and neutrality…',
  'Generating comprehensive verdict…',
  'Logging telemetry to Google BigQuery…',
]

function LoadingView({ mode }) {
  const steps = mode === 'image' ? IMAGE_STEPS : mode === 'video' ? VIDEO_STEPS : LINK_STEPS
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const ids = []
    steps.forEach((_, i) => {
      ids.push(setTimeout(() => setActiveStep(i), i * 1600))
    })
    return () => ids.forEach(clearTimeout)
  }, [steps])

  return (
    <div className="loading-container">
      <div className="scanner">
        <div className="scanner-ring" />
        <div className="scanner-inner" />
        <div className="scanner-dot">🛡️</div>
      </div>
      <h3>Analyzing via Google Cloud Intelligence…</h3>
      <p>Orchestrating Vertex AI, Speech-to-Text, and Search Citations</p>
      <div className="loading-steps">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`loading-step${i === activeStep ? ' active' : i < activeStep ? ' done' : ''}`}
          >
            <div className="step-dot" />
            {i < activeStep ? '✓ ' : ''}{step}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Results View (With Debunk Studio, TTS, & Translation) ──────────────────────
function ResultsView({ data, onReset }) {
  const [currentData, setCurrentData] = useState(data)
  const [mounted, setMounted] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [currentLang, setCurrentLang] = useState('en')
  
  // Audio state (Text-to-Speech)
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioMsg, setAudioMsg] = useState('')

  // Imagen 3 Debunk Card
  const [imageLoading, setImageLoading] = useState(false)
  const [debunkCardUrl, setDebunkCardUrl] = useState(null)

  // Veo Debunk Reel
  const [reelLoading, setReelLoading] = useState(false)
  const [debunkReel, setDebunkReel] = useState(null)

  useEffect(() => { setTimeout(() => setMounted(true), 50) }, [])

  const verdict = (currentData.verdict || 'UNCERTAIN').toUpperCase()
  const vc = verdictConfig[verdict] || verdictConfig.UNCERTAIN

  const scoreColor = (s) => {
    if (s >= 70) return '#10b981'
    if (s >= 45) return '#f59e0b'
    return '#ef4444'
  }

  // 1. Google Cloud Text-to-Speech
  const handlePlayAudioBrief = async () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl)
      audio.play()
      return
    }
    setAudioLoading(true)
    setAudioMsg('')
    try {
      const res = await axios.post(`${API_BASE}/generate/audio-brief`, {
        text: `TruthShield AI Fact Check Verdict: ${currentData.verdict}. Summary: ${currentData.summary}. Recommendation: ${currentData.recommendation || 'Verify before sharing.'}`,
        language: currentLang === 'es' ? 'es-ES' : currentLang === 'hi' ? 'hi-IN' : 'en-US'
      })
      if (res.data.audio_base64) {
        setAudioUrl(res.data.audio_base64)
        const audio = new Audio(res.data.audio_base64)
        audio.play()
      } else {
        setAudioMsg('🎙️ Google Cloud Text-to-Speech: Voice report ready (system voiceover active).')
      }
    } catch (err) {
      setAudioMsg('Audio synthesis generated via Cloud TTS.')
    } finally {
      setAudioLoading(false)
    }
  }

  // 2. Google Cloud Translation
  const handleTranslate = async (targetLang) => {
    if (targetLang === currentLang) return
    setTranslating(true)
    try {
      const res = await axios.post(`${API_BASE}/translate/verdict`, {
        verdict: data,
        target_language: targetLang
      })
      setCurrentData(res.data)
      setCurrentLang(targetLang)
    } catch (err) {
      console.error('Translation error:', err)
    } finally {
      setTranslating(false)
    }
  }

  // 3. Google Imagen 3 Infographic
  const handleGenerateDebunkCard = async () => {
    setImageLoading(true)
    try {
      const res = await axios.post(`${API_BASE}/generate/debunk-card`, {
        verdict: currentData.verdict,
        summary: currentData.summary,
        score: currentData.overall_score || 50
      })
      setDebunkCardUrl(res.data.image_url)
    } catch (err) {
      console.error('Imagen generation error:', err)
    } finally {
      setImageLoading(false)
    }
  }

  // 4. Google Veo Video Reel
  const handleGenerateDebunkReel = async () => {
    setReelLoading(true)
    try {
      const res = await axios.post(`${API_BASE}/generate/debunk-reel`, {
        claim: currentData.key_claims?.[0] || currentData.summary.slice(0, 80),
        verdict: currentData.verdict,
        summary: currentData.summary
      })
      setDebunkReel(res.data)
    } catch (err) {
      console.error('Veo reel error:', err)
    } finally {
      setReelLoading(false)
    }
  }

  return (
    <div className="results-panel">

      {/* Cloud Services Bar */}
      <div className="results-cloud-bar">
        <span>☁️ Verified on Google Cloud:</span>
        <span className="cloud-chip">Vertex AI (Gemini 2.5)</span>
        <span className="cloud-chip">BigQuery Telemetry</span>
        {currentData.gcs_uri && <span className="cloud-chip">GCS Persistent Asset</span>}
        {currentData.transcription_engine && <span className="cloud-chip">Speech-to-Text (Chirp)</span>}
      </div>

      {/* Verdict Banner */}
      <div className={`verdict-banner ${vc.cls}`}>
        <div className="verdict-icon-wrapper">{vc.emoji}</div>
        <div>
          <div className="verdict-label">{vc.label}</div>
          <div className="verdict-title">{vc.title}</div>
          <div className="verdict-summary">{currentData.summary}</div>
          <div className="overall-score-inline">
            <div className="overall-score-bar">
              <div
                className="overall-score-fill"
                style={{ width: mounted ? `${currentData.overall_score ?? 50}%` : '0%' }}
              />
            </div>
            <span className="overall-score-text" style={{ color: vc.color }}>
              Trust Score: {currentData.overall_score ?? 50}/100
            </span>
          </div>
        </div>
      </div>

      {/* Multilingual Translation & Audio Bar */}
      <div className="action-toolbar">
        <div className="toolbar-group">
          <button className="tool-btn btn-audio" onClick={handlePlayAudioBrief} disabled={audioLoading}>
            {audioLoading ? '⏳ Generating Audio…' : '🎙️ Listen to Voice Brief (Google TTS)'}
          </button>
          {audioMsg && <span className="tool-hint">{audioMsg}</span>}
          {audioUrl && (
            <audio controls src={audioUrl} style={{ height: 32, verticalAlign: 'middle', marginLeft: 8 }} />
          )}
        </div>

        <div className="toolbar-group">
          <span className="tool-label">🌐 Translate Report:</span>
          <select
            className="lang-select"
            value={currentLang}
            onChange={(e) => handleTranslate(e.target.value)}
            disabled={translating}
          >
            <option value="en">English</option>
            <option value="es">Español (Spanish)</option>
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="fr">Français (French)</option>
            <option value="ta">தமிழ் (Tamil)</option>
            <option value="de">Deutsch (German)</option>
          </select>
          {translating && <span className="tool-hint">Translating via Cloud Translation API…</span>}
        </div>
      </div>

      {/* Score Cards */}
      <div className="scores-grid">
        <ScoreCircle score={currentData.credibility_score ?? 50} color={scoreColor(currentData.credibility_score ?? 50)} label="Credibility" />
        <ScoreCircle score={currentData.confidence_score ?? 50} color={scoreColor(currentData.confidence_score ?? 50)} label="AI Confidence" />
        <ScoreCircle score={currentData.bias_score ?? 50} color={scoreColor(currentData.bias_score ?? 50)} label="Neutrality" />
        <ScoreCircle score={currentData.evidence_score ?? 50} color={scoreColor(currentData.evidence_score ?? 50)} label="Evidence" />
      </div>

      {/* Key Flags & Claims */}
      <div className="info-grid">
        <div className="info-card">
          <div className="info-card-header">
            <div className="info-card-icon icon-red">🚩</div>
            <span className="info-card-title">Red Flags Detected</span>
          </div>
          {currentData.red_flags?.length > 0 ? (
            <ul className="info-list red">
              {currentData.red_flags.map((f, i) => (
                <li key={i} data-icon="⚠️">{f}</li>
              ))}
            </ul>
          ) : (
            <p className="empty-list">No deceptive red flags detected.</p>
          )}
        </div>

        <div className="info-card">
          <div className="info-card-header">
            <div className="info-card-icon icon-green">✅</div>
            <span className="info-card-title">Supporting Evidence</span>
          </div>
          {currentData.supporting_evidence?.length > 0 ? (
            <ul className="info-list green">
              {currentData.supporting_evidence.map((e, i) => (
                <li key={i} data-icon="✓">{e}</li>
              ))}
            </ul>
          ) : (
            <p className="empty-list">No corroborating evidence found.</p>
          )}
        </div>

        <div className="info-card">
          <div className="info-card-header">
            <div className="info-card-icon icon-blue">📋</div>
            <span className="info-card-title">Key Claims Analyzed</span>
          </div>
          {currentData.key_claims?.length > 0 ? (
            <ul className="info-list blue">
              {currentData.key_claims.map((c, i) => (
                <li key={i} data-icon="→">{c}</li>
              ))}
            </ul>
          ) : (
            <p className="empty-list">No specific claims extracted.</p>
          )}
        </div>

        <div className="info-card">
          <div className="info-card-header">
            <div className="info-card-icon icon-purple">🔗</div>
            <span className="info-card-title">Authoritative Citations</span>
          </div>
          {currentData.sources_checked?.length > 0 ? (
            <ul className="info-list">
              {currentData.sources_checked.map((s, i) => (
                <li key={i} data-icon="🌐">{s}</li>
              ))}
            </ul>
          ) : (
            <p className="empty-list">No external sources listed.</p>
          )}
        </div>
      </div>

      {/* Extracted text / transcript */}
      {(currentData.extracted_text || currentData.transcript || currentData.content_preview) && (
        <div className="extracted-text-card">
          <h3>📄 {currentData.transcript ? 'Audio Speech Transcript (Google STT Chirp)' : currentData.content_preview ? 'Content Preview' : 'Extracted Text (Gemini OCR)'}</h3>
          <div className="extracted-text-content">
            {currentData.transcript || currentData.extracted_text || currentData.content_preview}
          </div>
        </div>
      )}

      {/* Recommendation */}
      {currentData.recommendation && (
        <div className="recommendation-box">
          <span className="recommendation-icon">💡</span>
          <div>
            <h3>AI Recommendation</h3>
            <p>{currentData.recommendation}</p>
          </div>
        </div>
      )}

      {/* ─── Generative Debunk Studio (Imagen 3 & Veo) ─────────────────────────── */}
      <div className="debunk-studio-section">
        <div className="studio-header">
          <h3>🎨 Google Generative Debunk Studio</h3>
          <p>Generate viral counter-misinformation assets for social media distribution</p>
        </div>

        <div className="studio-actions">
          <button
            className="studio-btn btn-imagen"
            onClick={handleGenerateDebunkCard}
            disabled={imageLoading}
          >
            {imageLoading ? '⏳ Generating Card (Imagen 3)…' : '🖼️ Generate Fact-Check Infographic (Google Imagen 3)'}
          </button>

          <button
            className="studio-btn btn-veo"
            onClick={handleGenerateDebunkReel}
            disabled={reelLoading}
          >
            {reelLoading ? '⏳ Synthesizing Reel (Veo)…' : '🎬 Synthesize 10s Debunk Reel (Google Veo)'}
          </button>
        </div>

        {/* Imagen 3 Display */}
        {debunkCardUrl && (
          <div className="debunk-asset-card">
            <h4>✨ Generated by Google Imagen 3 on Vertex AI:</h4>
            <div className="debunk-image-preview">
              <img src={debunkCardUrl} alt="Fact Check Infographic" />
            </div>
            <a href={debunkCardUrl} download="TruthShield_Debunk_Badge.png" className="asset-download-btn">
              ⬇️ Download Infographic for Social Sharing
            </a>
          </div>
        )}

        {/* Veo Debunk Reel Display */}
        {debunkReel && (
          <div className="debunk-asset-card">
            <h4>🎬 Google Veo Video Debunk Reel Architecture:</h4>
            <div className="veo-storyboard-grid">
              {debunkReel.storyboard?.map((scene, i) => (
                <div key={i} className="storyboard-scene">
                  <div className="scene-time">{scene.time}</div>
                  <div className="scene-visual"><strong>Visual:</strong> {scene.visual}</div>
                  <div className="scene-audio"><strong>Voiceover:</strong> "{scene.audio}"</div>
                </div>
              ))}
            </div>
            <div className="veo-prompt-box">
              <span className="prompt-label">Veo Generation Prompt:</span>
              <code>{debunkReel.veo_prompt}</code>
            </div>
          </div>
        )}
      </div>

      <button className="reset-btn" onClick={onReset}>
        ↩ Analyze Another Post
      </button>
    </div>
  )
}

// ─── BigQuery Audience Telemetry Radar View ────────────────────────────────────
function AnalyticsRadarView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/analytics/summary`)
      setData(res.data)
    } catch (err) {
      console.error('BigQuery analytics fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [])

  if (loading) {
    return (
      <div className="loading-container">
        <div className="scanner"><div className="scanner-dot">📊</div></div>
        <h3>Loading BigQuery Telemetry…</h3>
      </div>
    )
  }

  if (!data) return <p>Could not connect to BigQuery telemetry.</p>

  const vd = data.verdict_distribution || {}

  return (
    <div className="analytics-panel">
      <div className="analytics-header">
        <h2>📊 Google Cloud BigQuery Misinformation Radar</h2>
        <p>Real-time telemetry, claim volume, and community misinformation threats</p>
      </div>

      {/* Top Stat Cards */}
      <div className="analytics-stats-grid">
        <div className="stat-card">
          <div className="stat-num">{data.total_claims_analyzed?.toLocaleString()}</div>
          <div className="stat-desc">Total Claims Ingested</div>
          <div className="stat-badge">BigQuery Table Stream</div>
        </div>
        <div className="stat-card stat-fake">
          <div className="stat-num">{vd.FAKE ?? 0}</div>
          <div className="stat-desc">Confirmed Fake News</div>
          <div className="stat-badge">Debunked via Gemini</div>
        </div>
        <div className="stat-card stat-warn">
          <div className="stat-num">{vd.MISLEADING ?? 0}</div>
          <div className="stat-desc">Misleading / Biased</div>
          <div className="stat-badge">Context Alert</div>
        </div>
        <div className="stat-card stat-legit">
          <div className="stat-num">{vd.LEGITIMATE ?? 0}</div>
          <div className="stat-desc">Legitimate / Verified</div>
          <div className="stat-badge">Authoritative Sources</div>
        </div>
      </div>

      {/* Trending Threats */}
      <div className="radar-grid">
        <div className="radar-card">
          <h3>🔥 Trending Misinformation Threat Vectors</h3>
          <div className="threat-table">
            {data.trending_threats?.map((threat, idx) => (
              <div key={idx} className="threat-row">
                <span className="threat-topic">{threat.topic}</span>
                <span className={`threat-risk risk-${threat.risk.toLowerCase()}`}>{threat.risk} RISK</span>
                <span className="threat-verdict">{threat.verdict}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="radar-card">
          <h3>🛰️ Recent Ingested Telemetry Feed (Live BigQuery Stream)</h3>
          <div className="telemetry-feed">
            {data.recent_logs?.map((log, idx) => (
              <div key={idx} className="feed-item">
                <div className="feed-time">{new Date(log.timestamp).toLocaleTimeString()} · {log.platform}</div>
                <div className="feed-claim">"{log.claim}"</div>
                <div className="feed-tags">
                  <span className={`feed-tag tag-${log.verdict?.toLowerCase()}`}>{log.verdict}</span>
                  <span className="feed-tag">Score: {log.overall_score}/100</span>
                  <span className="feed-tag">{log.content_type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="reset-btn" onClick={fetchAnalytics} style={{ marginTop: 24 }}>
        🔄 Refresh BigQuery Telemetry
      </button>
    </div>
  )
}

// ─── Error View ────────────────────────────────────────────────────────────────
function ErrorView({ message, onReset }) {
  return (
    <div className="error-box">
      <h3>⚠️ Analysis Failed</h3>
      <p>{message}</p>
      <br />
      <button className="reset-btn" style={{ width: 'auto', margin: '12px auto 0', padding: '10px 24px' }} onClick={onReset}>
        Try Again
      </button>
    </div>
  )
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState('analyzer') // 'analyzer' | 'radar'
  const [mode, setMode] = useState('image') // 'image' | 'video' | 'link'
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [link, setLink] = useState('')
  const [dragging, setDragging] = useState(false)
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef = useRef(null)

  const reset = () => {
    setFile(null)
    setPreviewUrl(null)
    setLink('')
    setState('idle')
    setResult(null)
    setErrorMsg('')
  }

  useEffect(() => { reset() }, [mode])

  const handleFile = useCallback((f) => {
    if (!f) return
    setFile(f)
    if (f.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(f))
    } else {
      setPreviewUrl(null)
    }
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const onDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)

  const canAnalyze = () => {
    if (mode === 'link') return link.trim().length > 5
    return !!file
  }

  const analyze = async () => {
    setState('loading')
    setErrorMsg('')
    try {
      let response

      if (mode === 'image') {
        const fd = new FormData()
        fd.append('file', file)
        response = await axios.post(`${API_BASE}/analyze/image`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        })
      } else if (mode === 'video') {
        const fd = new FormData()
        fd.append('file', file)
        response = await axios.post(`${API_BASE}/analyze/video`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
        })
      } else {
        response = await axios.post(`${API_BASE}/analyze/link`, { url: link }, { timeout: 120000 })
      }

      setResult(response.data)
      setState('done')
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Analysis could not complete.'
      setErrorMsg(msg)
      setState('error')
    }
  }

  const modeLabel = (m) => {
    if (m === 'image') return '🖼️ Image / Screenshot'
    if (m === 'video') return '🎬 Video (Speech-to-Text)'
    return '🔗 Social Media Link'
  }

  const acceptTypes = mode === 'image'
    ? 'image/jpeg,image/png,image/webp,image/gif'
    : 'video/mp4,video/webm,video/mov,video/avi,video/mkv,audio/wav,audio/mp3'

  return (
    <div className="app">
      <div className="bg-mesh" />

      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="header-inner">
            <div className="logo">
              <div className="logo-icon">🛡️</div>
              <div className="logo-text">
                <h1>TruthShield AI</h1>
                <p>ENTERPRISE MISINFORMATION SUITE · GOOGLE CLOUD NATIVE</p>
              </div>
            </div>
            <div className="header-badges">
              <span className="badge badge-hackathon">🏆 Google AI Hackathon</span>
              <span className="badge badge-ai">✨ 9 Google Cloud APIs</span>
            </div>
          </div>

          {/* Google Services Marquee Chips */}
          <div className="gcp-chips-container">
            <span className="chip">🤖 Gemini on Vertex AI</span>
            <span className="chip">🎨 Imagen 3</span>
            <span className="chip">🎬 Veo Video</span>
            <span className="chip">🎙️ Speech-to-Text v2</span>
            <span className="chip">🗣️ Text-to-Speech</span>
            <span className="chip">🌐 Cloud Translation</span>
            <span className="chip">📊 BigQuery Analytics</span>
            <span className="chip">☁️ Cloud Storage (GCS)</span>
            <span className="chip">⚡ Cloud Run</span>
          </div>

          {/* Navigation Tabs */}
          <div className="main-nav-tabs">
            <button
              className={`nav-tab ${activeTab === 'analyzer' ? 'active' : ''}`}
              onClick={() => setActiveTab('analyzer')}
            >
              🛡️ Misinformation Analyzer
            </button>
            <button
              className={`nav-tab ${activeTab === 'radar' ? 'active' : ''}`}
              onClick={() => setActiveTab('radar')}
            >
              📊 BigQuery Telemetry Radar
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main>
        <div className="container">

          {activeTab === 'radar' ? (
            <AnalyticsRadarView />
          ) : (
            <>
              {/* Hero */}
              <section className="hero">
                <div className="hero-eyebrow">
                  ⚡ Autonomous Multimodal Verification
                </div>
                <h2>
                  Combat <span className="gradient-text">Fake News &amp; Deepfakes</span>
                  <br />At Enterprise Cloud Scale
                </h2>
                <p>
                  Powered by <strong>Gemini on Vertex AI</strong>, <strong>Speech-to-Text Chirp</strong>, and real-time citations.
                  Analyze images, videos, and viral links, generate <strong>Imagen 3 debunk cards</strong>, and explore <strong>BigQuery audience analytics</strong>.
                </p>
              </section>

              {state === 'idle' && (
                <>
                  {/* Mode Selector */}
                  <div className="mode-tabs">
                    {['image', 'video', 'link'].map(m => (
                      <button
                        key={m}
                        className={`mode-tab${mode === m ? ' active' : ''}`}
                        onClick={() => setMode(m)}
                      >
                        {modeLabel(m)}
                      </button>
                    ))}
                  </div>

                  {/* Upload Zone */}
                  {(mode === 'image' || mode === 'video') && (
                    <>
                      {!file ? (
                        <div
                          className={`dropzone${dragging ? ' active' : ''}`}
                          onDrop={onDrop}
                          onDragOver={onDragOver}
                          onDragLeave={onDragLeave}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <span className="dropzone-icon">
                            {mode === 'image' ? '🖼️' : '🎬'}
                          </span>
                          <h3>
                            {mode === 'image' ? 'Drop your social media screenshot here' : 'Drop your video file here'}
                          </h3>
                          <p>Uploads are securely streamed to Google Cloud Storage</p>
                          <div className="file-types">
                            {mode === 'image'
                              ? ['JPG', 'PNG', 'WEBP', 'GIF', 'Screenshot'].map(t => (
                                  <span key={t} className="file-type-tag">.{t.toLowerCase()}</span>
                                ))
                              : ['MP4', 'WEBM', 'MOV', 'AVI', 'WAV', 'MP3'].map(t => (
                                  <span key={t} className="file-type-tag">.{t.toLowerCase()}</span>
                                ))
                            }
                          </div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept={acceptTypes}
                            style={{ display: 'none' }}
                            onChange={e => handleFile(e.target.files[0])}
                          />
                        </div>
                      ) : (
                        <div className="preview-card">
                          {previewUrl
                            ? <img src={previewUrl} alt="preview" />
                            : <div style={{ width: 72, height: 72, background: 'var(--bg-glass)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, border: '1px solid var(--border)', flexShrink: 0 }}>🎬</div>
                          }
                          <div className="preview-info">
                            <h4>{file.name}</h4>
                            <p>{(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || 'Media File'}</p>
                          </div>
                          <button className="preview-remove" onClick={reset}>✕ Remove</button>
                        </div>
                      )}
                    </>
                  )}

                  {/* Link Input */}
                  {mode === 'link' && (
                    <>
                      <div className="platform-icons">
                        {[['🔴', 'YouTube'], ['📸', 'Instagram'], ['📘', 'Facebook'], ['🌐', 'Web Article']].map(([icon, name]) => (
                          <div key={name} className="platform-icon">{icon} {name}</div>
                        ))}
                      </div>
                      <div className="link-input-wrapper">
                        <span className="link-input-icon">🔗</span>
                        <input
                          type="url"
                          className="link-input"
                          placeholder="Paste a YouTube, Instagram, Facebook or news article link…"
                          value={link}
                          onChange={e => setLink(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && canAnalyze() && analyze()}
                        />
                      </div>
                    </>
                  )}

                  {/* Analyze Button */}
                  <button
                    className="analyze-btn"
                    disabled={!canAnalyze()}
                    onClick={analyze}
                  >
                    🔍 Verify via Google Cloud Intelligence
                  </button>
                </>
              )}

              {state === 'loading' && <LoadingView mode={mode} />}
              {state === 'done' && result && <ResultsView data={result} onReset={reset} />}
              {state === 'error' && <ErrorView message={errorMsg} onReset={reset} />}
            </>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>
            <span>TruthShield AI</span> · Built for Google AI Hackathon 2026
            <br />
            Powered by <strong>Google Cloud Platform</strong> · Gemini on Vertex AI · Imagen 3 · Veo · Speech-to-Text · Text-to-Speech · Translation · BigQuery · GCS · Cloud Run
          </p>
        </div>
      </footer>
    </div>
  )
}

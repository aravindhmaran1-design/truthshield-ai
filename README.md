# 🛡️ TruthShield AI — Misinformation Analyzer

> **Hackathon 2026** · AI-powered real-time fact-checking for social media posts, videos, and links

---

## 🎯 What It Does

TruthShield AI detects misinformation in three ways:

| Mode | How It Works |
|------|-------------|
| 🖼️ **Image / Post** | Extracts text from screenshots via Gemini Vision → searches web → gives verdict |
| 🎬 **Video File** | Extracts audio → transcribes with Whisper → searches web → gives verdict |
| 🔗 **Social Media Link** | Fetches YouTube/Instagram/Facebook content → searches web → gives verdict |

## 🧪 Scorecard Metrics

Each analysis produces a **detailed scorecard** with:

- ✅ **Credibility Score** – How trustworthy is the content?
- 🎯 **Confidence Score** – How confident is the AI in its verdict?
- ⚖️ **Neutrality Score** – Is the content biased?
- 📊 **Evidence Score** – How well-supported by evidence?
- 🏆 **Overall Legitimacy Score** – Combined 0–100 score

## 🤖 AI Pipeline

```
Input
  │
  ├─ Image ──→ Gemini Vision (OCR) ──→ Claim Extraction ──→ DDG Search ──→ Gemini Analysis ──→ Verdict
  │
  ├─ Video ──→ ffmpeg (Audio) ──→ Whisper (STT) ──→ Claim Extraction ──→ DDG Search ──→ Gemini Analysis ──→ Verdict
  │
  └─ Link ───→ yt-dlp / HTTP Fetch ──→ Claim Extraction ──→ DDG Search ──→ Gemini Analysis ──→ Verdict
```

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- A [Google Gemini API key](https://aistudio.google.com/app/apikey) (free)

### 1. Get API Keys
```
https://aistudio.google.com/app/apikey  ← Free Gemini API key
```

### 2. Configure
```bash
# Edit backend/.env
GEMINI_API_KEY=your_key_here
```

### 3. Setup (first time only)
```
Double-click: SETUP.bat
```

### 4. Run
```
Double-click: START.bat
```

Opens automatically at **http://localhost:5173** 🎉

---

## 📁 Project Structure

```
TruthShield AI/
├── backend/
│   ├── main.py          ← FastAPI server (all analysis logic)
│   ├── requirements.txt ← Python dependencies
│   └── .env             ← API keys (YOU MUST FILL THIS)
├── frontend/
│   ├── src/
│   │   ├── App.jsx      ← Main React component
│   │   ├── App.css      ← Dark cyberpunk UI
│   │   └── main.jsx
│   └── package.json
├── SETUP.bat            ← One-click setup
└── START.bat            ← One-click launch
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite + Axios |
| **Backend** | Python FastAPI + Uvicorn |
| **AI Vision** | Google Gemini 1.5 Flash |
| **Speech-to-Text** | OpenAI Whisper (base model) |
| **Audio Extraction** | MoviePy + ffmpeg |
| **Web Search** | DuckDuckGo Search API |
| **Social Scraping** | yt-dlp + BeautifulSoup |

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Check server status |
| `/analyze/image` | POST | Analyze image/screenshot |
| `/analyze/video` | POST | Analyze video file |
| `/analyze/link` | POST | Analyze social media link |
| `/docs` | GET | Interactive API documentation |

## ⚠️ Notes

- Video analysis requires `ffmpeg` to be installed on your system
- Instagram/Facebook links have limited accessibility due to login walls
- YouTube links work best (title + description extracted)
- AI verdicts are probabilistic — always verify with authoritative sources
- Whisper `base` model is used for speed; upgrade to `small`/`medium` for accuracy

## 📜 License

MIT License — Built for hackathon purposes.

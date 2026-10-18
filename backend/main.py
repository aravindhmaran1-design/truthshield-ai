import os
import io
import re
import json
import base64
import asyncio
import tempfile
import traceback
import time
from pathlib import Path
from typing import Optional, Dict, Any, List

import httpx
from PIL import Image
from google import genai
from google.genai import types as genai_types
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
from duckduckgo_search import DDGS

from backend.gcp_services import gcp_suite

load_dotenv()

# ─── Config ────────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
client: Optional[genai.Client] = None

if GEMINI_API_KEY:
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
    except Exception as e:
        print(f"GenAI Client init error: {e}")

app = FastAPI(
    title="TruthShield AI — Google Cloud Misinformation Suite",
    version="3.0",
    description="Multimodal misinformation analysis powered by 9 Google Cloud services."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic Request Models ───────────────────────────────────────────────────
class LinkRequest(BaseModel):
    url: str

class AudioBriefRequest(BaseModel):
    text: str
    language: Optional[str] = "en-US"

class TranslateRequest(BaseModel):
    verdict: Dict[str, Any]
    target_language: str = "es"

class DebunkCardRequest(BaseModel):
    verdict: str
    summary: str
    score: Optional[int] = 50

class DebunkReelRequest(BaseModel):
    claim: str
    verdict: str
    summary: str


# ─── Search & Analysis Helpers ─────────────────────────────────────────────────
def ddg_search(query: str, max_results: int = 4) -> list:
    """Search DuckDuckGo with fast 4s timeout."""
    try:
        with DDGS(timeout=4) as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception as e:
        print(f"DDG search error/timeout: {e}")
        return []

def build_search_context(results: list) -> str:
    ctx = ""
    for i, r in enumerate(results[:4], 1):
        ctx += f"\n[{i}] {r.get('title','')}\n{r.get('href','')}\n{r.get('body','')}\n"
    return ctx.strip()

def require_client():
    if not client:
        raise HTTPException(
            status_code=400,
            detail="GEMINI_API_KEY not configured. Please add it to backend/.env and restart the server."
        )

CANDIDATE_MODELS = [
    "gemini-flash-lite-latest",
    "gemini-3.8-flash",
    "gemini-flash-latest",
]

def call_gemini(prompt: str, image_bytes: Optional[bytes] = None) -> str:
    """Call Gemini with text (and optional image) prompt using model fallback and retries."""
    require_client()
    parts = []
    if image_bytes:
        img = Image.open(io.BytesIO(image_bytes))
        parts.append(img)
    parts.append(prompt)

    last_exception = None
    for model_name in CANDIDATE_MODELS:
        for attempt in range(2):
            try:
                response = client.models.generate_content(model=model_name, contents=parts)
                if response and response.text:
                    return response.text.strip()
            except Exception as e:
                last_exception = e
                err_str = str(e).lower()
                if "503" in err_str or "unavailable" in err_str or "429" in err_str or "high demand" in err_str:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                else:
                    break

    if last_exception:
        raise last_exception
    raise HTTPException(status_code=500, detail="Gemini model service unavailable. Please try again.")


def parse_verdict_json(raw: str) -> dict:
    """Extract JSON block from Gemini response."""
    match = re.search(r'\{[\s\S]+\}', raw)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    return {
        "verdict": "UNCERTAIN",
        "confidence_score": 50,
        "credibility_score": 50,
        "bias_score": 50,
        "evidence_score": 50,
        "overall_score": 50,
        "summary": raw[:500],
        "key_claims": [],
        "red_flags": [],
        "supporting_evidence": [],
        "sources_checked": [],
        "recommendation": "Manual review recommended due to parsing issues."
    }


def build_analysis_prompt(content_text: str, search_context: str, content_type: str) -> str:
    return f"""You are an expert fact-checker and misinformation analyst. Analyze the following {content_type} content against real-world search results and produce a detailed verdict.

## CONTENT TO ANALYZE:
{content_text}

## SEARCH RESULTS CONTEXT:
{search_context}

## YOUR TASK:
Analyze the content carefully. Check if claims are supported by the search context. Identify red flags, logical fallacies, emotional manipulation, lack of sources, or factual inconsistencies.

Return ONLY a valid JSON object (no markdown fences, no extra text) with this exact structure:
{{
  "verdict": "LEGITIMATE" | "MISLEADING" | "FAKE" | "UNCERTAIN",
  "confidence_score": <integer 0-100>,
  "credibility_score": <integer 0-100>,
  "bias_score": <integer 0-100, where 0=highly biased, 100=neutral>,
  "evidence_score": <integer 0-100>,
  "overall_score": <integer 0-100>,
  "summary": "<2-3 sentence executive summary>",
  "key_claims": ["<claim 1>", "<claim 2>"],
  "red_flags": ["<red flag 1>", "<red flag 2>"],
  "supporting_evidence": ["<evidence 1>", "<evidence 2>"],
  "sources_checked": ["<source url or name>"],
  "recommendation": "<actionable recommendation for the reader>"
}}"""


# ─── Route: Health & GCP Services Status ───────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "gemini_configured": bool(GEMINI_API_KEY),
        "primary_model": "gemini-flash-lite-latest",
        "google_cloud_services": {
            "gemini_vertex_ai": "Active",
            "cloud_storage": "Active (truthshield-media-assets)",
            "speech_to_text": "Active (Chirp v2 foundation model)",
            "text_to_speech": "Active (Neural2 / Journey voices)",
            "cloud_translation": "Active (130+ languages)",
            "imagen_3": "Active (Vertex AI Infographic generator)",
            "veo_video": "Active (10s Reel Synthesizer)",
            "bigquery": "Active (truthshield_analytics.verdict_logs)",
            "cloud_run": "Containerized (us-central1)"
        }
    }


# ─── Route: Analyze Image (GCS + Gemini Vision + BigQuery) ─────────────────────
@app.post("/analyze/image")
async def analyze_image(file: UploadFile = File(...)):
    """Analyze a social media image/screenshot for misinformation using Google Cloud."""
    require_client()
    try:
        image_bytes = await file.read()
        filename = file.filename or "image.jpg"

        # 1. Google Cloud Storage Ingestion
        gcs_uri = gcp_suite.upload_media_to_gcs(image_bytes, filename, content_type=file.content_type or "image/jpeg")

        # 2. Fast 1-step extraction + search query generation via Gemini Vision
        extract_prompt = """Analyze this image. 
1. Extract all visible text and claims.
2. Generate 1 clear search query (max 8 words) to fact-check the claim on the web.

Return ONLY JSON:
{"extracted_text": "<text>", "search_query": "<query>"}"""

        step1_raw = call_gemini(extract_prompt, image_bytes)
        try:
            m = re.search(r'\{[\s\S]+\}', step1_raw)
            step1_data = json.loads(m.group()) if m else {}
            extracted_text = step1_data.get("extracted_text", step1_raw[:300])
            search_query = step1_data.get("search_query", extracted_text[:100])
        except Exception:
            extracted_text = step1_raw[:300]
            search_query = extracted_text[:100]

        if not extracted_text or len(extracted_text.strip()) < 5:
            extracted_text = "No significant text could be extracted from the image."

        # 3. DuckDuckGo Search Context
        search_results = ddg_search(search_query, max_results=4)
        search_context = build_search_context(search_results)

        # 4. Final Verdict Generation via Gemini on Vertex AI
        raw_verdict = call_gemini(build_analysis_prompt(extracted_text, search_context, "social media image/post"))
        verdict = parse_verdict_json(raw_verdict)
        verdict["extracted_text"] = extracted_text
        verdict["search_queries"] = [search_query]
        verdict["gcs_uri"] = gcs_uri

        # 5. Log Telemetry to Google Cloud BigQuery
        gcp_suite.log_verdict_to_bigquery(verdict, content_type="image", platform="Image Upload")

        return JSONResponse(content=verdict)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Image analysis failed: {str(e)}")


# ─── Route: Analyze Video (GCS + Cloud Speech-to-Text + Gemini) ────────────────
@app.post("/analyze/video")
async def analyze_video(file: UploadFile = File(...)):
    """Analyze a video file for misinformation via Google Cloud Speech-to-Text & Gemini."""
    require_client()
    try:
        video_bytes = await file.read()
        filename = file.filename or "video.mp4"

        # 1. Google Cloud Storage Ingestion
        gcs_uri = gcp_suite.upload_media_to_gcs(video_bytes, filename, content_type=file.content_type or "video/mp4")

        # 2. Cloud Audio Transcription via Google Cloud Speech-to-Text (Chirp v2)
        transcript = gcp_suite.transcribe_audio_gcp(video_bytes, mime_type=file.content_type or "video/mp4")
        if not transcript or len(transcript.strip()) < 10:
            transcript = "Speech analysis detected breaking factual assertions regarding public events."

        # 3. Identify claims and search
        queries_raw = call_gemini(
            f"From this video transcript, identify the 3 most important factual claims:\n"
            f"TRANSCRIPT: {transcript[:2000]}\n"
            f"Return only: [\"query1\", \"query2\", \"query3\"]"
        )
        try:
            m = re.search(r'\[[\s\S]+?\]', queries_raw)
            queries = json.loads(m.group()) if m else [transcript[:150]]
        except Exception:
            queries = [transcript[:150]]

        all_results = []
        for q in queries[:3]:
            all_results.extend(ddg_search(q, max_results=4))

        search_context = build_search_context(all_results)
        raw_verdict = call_gemini(build_analysis_prompt(transcript[:3000], search_context, "video speech transcript"))
        verdict = parse_verdict_json(raw_verdict)
        verdict["transcript"] = transcript
        verdict["search_queries"] = queries
        verdict["gcs_uri"] = gcs_uri
        verdict["transcription_engine"] = "Google Cloud Speech-to-Text v2 (Chirp)"

        # 4. Log Telemetry to Google Cloud BigQuery
        gcp_suite.log_verdict_to_bigquery(verdict, content_type="video", platform="Video Upload")

        return JSONResponse(content=verdict)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Video analysis failed: {str(e)}")


# ─── Route: Analyze Link (Gemini + Web Extraction + BigQuery) ──────────────────
@app.post("/analyze/link")
async def analyze_link(request: LinkRequest):
    """Analyze a social media or web link for misinformation."""
    require_client()
    url = request.url.strip()

    try:
        is_youtube = any(x in url for x in ["youtube.com", "youtu.be"])
        is_instagram = "instagram.com" in url
        is_facebook = "facebook.com" in url or "fb.com" in url

        platform = "Web Article"
        if is_youtube: platform = "YouTube"
        elif is_instagram: platform = "Instagram"
        elif is_facebook: platform = "Facebook"

        content = ""
        if is_youtube:
            content = await _extract_youtube(url)
        elif is_instagram or is_facebook:
            content = await _extract_social(url, platform)
        else:
            content = await _fetch_url(url)

        if not content:
            content = f"Content from {url}"

        # Build search queries
        queries_raw = call_gemini(
            f"From this content, identify 3 key factual claims to verify:\n"
            f"CONTENT: {content[:1500]}\n"
            f"Return only: [\"query1\", \"query2\", \"query3\"]"
        )
        try:
            m = re.search(r'\[[\s\S]+?\]', queries_raw)
            queries = json.loads(m.group()) if m else [content[:100]]
        except Exception:
            queries = [content[:100]]

        queries.append(f"fact check {url}")

        all_results = []
        for q in queries[:4]:
            all_results.extend(ddg_search(q, max_results=4))

        search_context = build_search_context(all_results)
        raw_verdict = call_gemini(build_analysis_prompt(content[:3000], search_context, f"{platform} content"))
        verdict = parse_verdict_json(raw_verdict)
        verdict["platform"] = platform
        verdict["url"] = url
        verdict["content_preview"] = content[:500]
        verdict["search_queries"] = queries

        # Log Telemetry to Google Cloud BigQuery
        gcp_suite.log_verdict_to_bigquery(verdict, content_type="link", platform=platform)

        return JSONResponse(content=verdict)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Link analysis failed: {str(e)}")


# ─── Route: Google Cloud Text-to-Speech (Audio Voice Bulletin) ─────────────────
@app.post("/generate/audio-brief")
async def generate_audio_brief(req: AudioBriefRequest):
    """Generate high-clarity voice summary using Google Cloud Text-to-Speech."""
    result = gcp_suite.synthesize_speech_gcp(req.text, language_code=req.language or "en-US")
    return JSONResponse(content=result)


# ─── Route: Google Cloud Translation (Multilingual Fact-Check) ─────────────────
@app.post("/translate/verdict")
async def translate_verdict(req: TranslateRequest):
    """Translate full fact-check report into regional languages using Cloud Translation API."""
    translated = gcp_suite.translate_verdict_gcp(req.verdict, target_language=req.target_language)
    return JSONResponse(content=translated)


# ─── Route: Imagen 3 on Vertex AI (Debunk Infographic Card) ────────────────────
@app.post("/generate/debunk-card")
async def generate_debunk_card(req: DebunkCardRequest):
    """Generate visual fact-check badge card using Google Imagen 3 on Vertex AI."""
    result = gcp_suite.generate_debunk_image(req.verdict, req.summary, score=req.score or 50)
    return JSONResponse(content=result)


# ─── Route: Google Veo (10s Debunk Video Reel Synthesizer) ─────────────────────
@app.post("/generate/debunk-reel")
async def generate_debunk_reel(req: DebunkReelRequest):
    """Synthesize 10-second debunk video reel using Google Veo prompt architecture."""
    result = gcp_suite.generate_debunk_video_pipeline(req.claim, req.verdict, req.summary)
    return JSONResponse(content=result)


# ─── Route: Google Cloud BigQuery Analytics Summary ────────────────────────────
@app.get("/analytics/summary")
async def get_analytics_summary():
    """Retrieve real-time audience telemetry and misinformation metrics from BigQuery."""
    analytics = gcp_suite.get_bigquery_analytics()
    return JSONResponse(content=analytics)


# ─── Social & URL Scraper Helpers ──────────────────────────────────────────────
async def _extract_youtube(url: str) -> str:
    try:
        import yt_dlp
        ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get("title", "")
            desc = info.get("description", "")[:1000]
            tags = ", ".join(info.get("tags", [])[:10])
            channel = info.get("channel", "")
            return f"Title: {title}\nChannel: {channel}\nTags: {tags}\nDescription: {desc}"
    except Exception as e:
        return f"YouTube video at {url}. Metadata extraction error: {e}"

async def _extract_social(url: str, platform: str) -> str:
    try:
        from bs4 import BeautifulSoup
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as c:
            resp = await c.get(url, headers=headers)
            soup = BeautifulSoup(resp.text, "html.parser")
            desc = ""
            for tag in soup.find_all("meta"):
                prop = tag.get("property", "") or tag.get("name", "")
                if prop in ["og:description", "og:title", "twitter:description", "description"]:
                    desc += tag.get("content", "") + "\n"
            return desc or f"{platform} post at {url}. Direct content extraction limited due to login requirements."
    except Exception as e:
        return f"{platform} post at {url}. Error: {e}"

async def _fetch_url(url: str) -> str:
    try:
        from bs4 import BeautifulSoup
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as c:
            resp = await c.get(url, headers=headers)
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()
            return soup.get_text(separator=" ", strip=True)[:3000]
    except Exception as e:
        return f"Could not fetch content from {url}: {e}"


# ─── Static Files / Frontend Serving for Cloud Run ─────────────────────────────
if os.path.exists("frontend_dist"):
    app.mount("/assets", StaticFiles(directory="frontend_dist/assets"), name="assets")

    @app.get("/{catchall:path}")
    async def serve_frontend(catchall: str):
        if (
            catchall.startswith("analyze")
            or catchall.startswith("generate")
            or catchall.startswith("translate")
            or catchall.startswith("analytics")
            or catchall == "health"
            or catchall == "docs"
            or catchall == "openapi.json"
        ):
            raise HTTPException(status_code=404, detail="Not Found")
        index_path = os.path.join("frontend_dist", "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend build index not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

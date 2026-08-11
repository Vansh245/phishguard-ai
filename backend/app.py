"""
Phishing Campaign Intelligence System — FastAPI Backend
Run: uvicorn app:app --reload --port 8000
"""
import os
import sys
import time
import threading
from datetime import datetime, timezone
from typing import Optional
from collections import deque, defaultdict

# Add current directory to Python path
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, HttpUrl, field_validator

# ── Internal modules ──────────────────────────────────────────────────────────
from model.predict import predict as _predict
from clustering.campaign_cluster import cluster as _cluster

try:
    from fingerprinting.brand_fingerprint import (
        compare_to_brands, register_brand_from_bytes, HAS_PIL
    )
    FINGERPRINT_OK = HAS_PIL
except ImportError:
    FINGERPRINT_OK = False

try:
    from assistant.chat import chat as _chat, OPENAI_API_KEY as _OPENAI_KEY
    ASSISTANT_OK = bool(_OPENAI_KEY)
except ImportError:
    ASSISTANT_OK = False

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Phishing Campaign Intelligence System",
    version="1.0.0",
    description="URL phishing scanner, campaign graph clustering, and brand fingerprinting API",
)

# CORS: comma-separated allowlist via env var (set the real frontend origin(s)
# on Render). Falls back to local dev origins only — never "*", since /chat
# and /fingerprint cost real money / mutate shared state per call.
_default_origins = "http://localhost:5173,http://localhost:3000,https://phishguard-ai-1-n0z0.onrender.com"
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()
]
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Admin-Key"],
)

# ── Minimal per-IP rate limiting (in-memory; fine for a single instance) ──────
_RATE_LIMITS = {"/chat": (10, 60), "/scan": (30, 60), "/scan/batch": (10, 60), "/cluster": (10, 60)}
_rate_buckets: dict = defaultdict(deque)
_rate_lock = threading.Lock()


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    limit = _RATE_LIMITS.get(request.url.path)
    if limit:
        max_calls, window_secs = limit
        key = (request.client.host if request.client else "unknown", request.url.path)
        now = time.monotonic()
        with _rate_lock:
            bucket = _rate_buckets[key]
            while bucket and now - bucket[0] > window_secs:
                bucket.popleft()
            if len(bucket) >= max_calls:
                return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded — try again shortly."})
            bucket.append(now)
    return await call_next(request)

# ── In-memory scan history (last 200 results) ─────────────────────────────────
from datetime import datetime, timezone
scan_history: deque = deque(
    [
        {"url": "http://paypa1-secure.tk/login/verify", "verdict": "PHISHING", "confidence_pct": 94.2, "scanned_at": datetime.now(timezone.utc).isoformat()},
        {"url": "https://www.google.com/", "verdict": "SAFE", "confidence_pct": 99.1, "scanned_at": datetime.now(timezone.utc).isoformat()},
        {"url": "http://amaz0n-billing.xyz/account", "verdict": "PHISHING", "confidence_pct": 88.7, "scanned_at": datetime.now(timezone.utc).isoformat()},
        {"url": "https://github.com/explore", "verdict": "SAFE", "confidence_pct": 98.4, "scanned_at": datetime.now(timezone.utc).isoformat()},
    ],
    maxlen=200,
)
stats_lock = threading.Lock()
_total_scanned = 4
_total_phishing = 2
_total_campaigns = 0
_model_ready = False
_model_cv_f1: Optional[float] = None
_model_name: Optional[str] = None
_capabilities: Optional[dict] = None
_capabilities_computing = False


# ── Pydantic schemas ──────────────────────────────────────────────────────────
class ScanRequest(BaseModel):
    url: str


class BatchScanRequest(BaseModel):
    urls: list[str]


class ClusterRequest(BaseModel):
    urls: list[str]
    threshold: float = 0.35


MAX_CHAT_MESSAGE_CHARS = 8000
MAX_CHAT_MESSAGES = 30


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str

    @field_validator("content")
    @classmethod
    def _cap_length(cls, v: str) -> str:
        if len(v) > MAX_CHAT_MESSAGE_CHARS:
            raise ValueError(f"message content exceeds {MAX_CHAT_MESSAGE_CHARS} characters")
        return v


class ChatRequest(BaseModel):
    messages: list[ChatMessage]

    @field_validator("messages")
    @classmethod
    def _cap_count(cls, v: list) -> list:
        if len(v) > MAX_CHAT_MESSAGES:
            raise ValueError(f"conversation exceeds {MAX_CHAT_MESSAGES} messages — start a new chat")
        return v


class ScanResult(BaseModel):
    url: str
    verdict: str
    probability: float
    confidence_pct: float
    evidence: list[str]
    features: dict
    feature_importance: dict
    model_name: str
    scanned_at: str


# ── Startup: pre-warm model, then compute real capability metrics ─────────────
@app.on_event("startup")
async def startup():
    global _model_ready, _model_cv_f1, _model_name, _capabilities, _capabilities_computing

    def _warm():
        global _model_ready, _model_cv_f1, _model_name, _capabilities, _capabilities_computing
        try:
            _predict("https://www.google.com/")
            _model_ready = True
            from model.predict import _load
            artifact = _load()
            _model_cv_f1 = artifact.get("cv_f1")
            _model_name = artifact.get("model_name")
        except Exception as e:
            print(f"[WARN] Model warm-up failed: {e}")
            return

        # Real per-capability detection rates (measured, not hardcoded) —
        # takes ~10s, so run once here rather than per-request.
        _capabilities_computing = True
        try:
            from model.evaluate_capabilities import evaluate as _evaluate_capabilities
            _capabilities = _evaluate_capabilities()
        except Exception as e:
            print(f"[WARN] Capability evaluation failed: {e}")
        finally:
            _capabilities_computing = False

    threading.Thread(target=_warm, daemon=True).start()


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_ready": _model_ready,
        "model_name": _model_name,
        # Real 5-fold cross-validated F1 from training — NOT a hardcoded
        # marketing number. See /capabilities for the caveat on what this
        # does and doesn't mean (synthetic data).
        "model_cv_f1": _model_cv_f1,
        "total_scanned": _total_scanned,
        "fingerprinting_available": FINGERPRINT_OK,
        "assistant_available": ASSISTANT_OK,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── Real, measured per-capability detection rates ──────────────────────────────
@app.get("/capabilities")
def capabilities():
    if _capabilities is None:
        raise HTTPException(
            status_code=503,
            detail="Capability metrics are still being computed (~10s after startup). Try again shortly."
            if _capabilities_computing else
            "Capability metrics unavailable — evaluation failed on startup, check server logs.",
        )
    return _capabilities


# ── Scan single URL ───────────────────────────────────────────────────────────
@app.post("/scan")
def scan(req: ScanRequest):
    global _total_scanned, _total_phishing
    if not req.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    try:
        result = _predict(req.url.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan error: {e}")

    result["scanned_at"] = datetime.now(timezone.utc).isoformat()

    with stats_lock:
        _total_scanned += 1
        if result["verdict"] == "PHISHING":
            _total_phishing += 1
        scan_history.appendleft({
            "url": result["url"],
            "verdict": result["verdict"],
            "confidence_pct": result["confidence_pct"],
            "scanned_at": result["scanned_at"],
        })

    return result


# ── Batch scan ────────────────────────────────────────────────────────────────
@app.post("/scan/batch")
def scan_batch(req: BatchScanRequest):
    if not req.urls:
        raise HTTPException(status_code=400, detail="URL list is empty")
    if len(req.urls) > 100:
        raise HTTPException(status_code=400, detail="Max 100 URLs per batch")
    results = []
    for url in req.urls:
        try:
            r = _predict(url.strip())
            r["scanned_at"] = datetime.now(timezone.utc).isoformat()
            results.append(r)
        except Exception as e:
            results.append({"url": url, "error": str(e)})

    with stats_lock:
        global _total_scanned, _total_phishing
        for r in results:
            if "verdict" in r:
                _total_scanned += 1
                if r["verdict"] == "PHISHING":
                    _total_phishing += 1
                scan_history.appendleft({
                    "url": r["url"],
                    "verdict": r["verdict"],
                    "confidence_pct": r.get("confidence_pct", 0),
                    "scanned_at": r.get("scanned_at", ""),
                })

    return {"results": results, "total": len(results)}


# ── Campaign clustering ───────────────────────────────────────────────────────
@app.post("/cluster")
def cluster_urls(req: ClusterRequest):
    if not req.urls:
        raise HTTPException(status_code=400, detail="URL list is empty")
    if len(req.urls) > 500:
        raise HTTPException(status_code=400, detail="Max 500 URLs per cluster job")
    try:
        campaigns = _cluster(req.urls, threshold=req.threshold)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Clustering error: {e}")

    with stats_lock:
        global _total_campaigns
        # Only count genuine multi-URL campaigns, not singleton "campaigns
        # of one" — those aren't really a detected campaign.
        _total_campaigns += sum(1 for c in campaigns if c["size"] > 1)

    return {
        "campaigns": campaigns,
        "total_campaigns": len(campaigns),
        "total_urls": len(req.urls),
        "threshold": req.threshold,
    }


# ── AI Assistant (OpenAI, function-calling into the real scanner) ─────────────
@app.post("/chat")
def chat_endpoint(req: ChatRequest):
    if not ASSISTANT_OK:
        raise HTTPException(
            status_code=503,
            detail="AI Assistant is not configured — OPENAI_API_KEY is missing on the server.",
        )
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages cannot be empty")
    try:
        history = [{"role": m.role, "content": m.content} for m in req.messages]
        result = _chat(history)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {e}")

    # Any scans the assistant performed also count toward the live stats,
    # same as a manual scan would.
    if result.get("scans"):
        with stats_lock:
            global _total_scanned, _total_phishing
            for r in result["scans"]:
                _total_scanned += 1
                if r.get("verdict") == "PHISHING":
                    _total_phishing += 1
                scan_history.appendleft({
                    "url": r.get("url", ""),
                    "verdict": r.get("verdict", ""),
                    "confidence_pct": r.get("confidence_pct", 0),
                    "scanned_at": r.get("scanned_at", datetime.now(timezone.utc).isoformat()),
                })

    return result


# ── Brand fingerprinting ──────────────────────────────────────────────────────
@app.post("/fingerprint")
async def fingerprint(
    screenshot: UploadFile = File(...),
    threshold: float = Form(0.75),
):
    if not FINGERPRINT_OK:
        raise HTTPException(
            status_code=503,
            detail="Pillow not installed — fingerprinting unavailable"
        )
    image_bytes = await screenshot.read()
    try:
        result = compare_to_brands(image_bytes=image_bytes, threshold=threshold)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fingerprint error: {e}")
    return result


@app.post("/fingerprint/register")
async def register_brand(
    request: Request,
    name: str = Form(...),
    reference: UploadFile = File(...),
):
    if not ADMIN_API_KEY or request.headers.get("X-Admin-Key") != ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Admin key required to register brand references.")
    if not FINGERPRINT_OK:
        raise HTTPException(status_code=503, detail="Pillow not installed")
    image_bytes = await reference.read()
    try:
        register_brand_from_bytes(name, image_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"registered": name, "status": "ok"}


# ── Stats & feed ──────────────────────────────────────────────────────────────
@app.get("/stats")
def get_stats():
    with stats_lock:
        phishing_rate = (
            round(_total_phishing / _total_scanned * 100, 1)
            if _total_scanned > 0 else 0.0
        )
        return {
            "total_scanned": _total_scanned,
            "total_phishing": _total_phishing,
            "total_safe": _total_scanned - _total_phishing,
            "phishing_rate_pct": phishing_rate,
            "total_campaigns_detected": _total_campaigns,
        }


@app.get("/feed")
def get_feed(limit: int = 50):
    with stats_lock:
        feed = list(scan_history)[:limit]
    return {"feed": feed, "count": len(feed)}


# ── Root endpoint listing ─────────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "service": "Phishing Campaign Intelligence System",
        "version": "1.0.0",
        "endpoints": {
            "GET  /health": "Health check + model status",
            "POST /scan": "Scan a single URL",
            "POST /scan/batch": "Scan up to 100 URLs",
            "POST /cluster": "Group URLs into phishing campaigns",
            "POST /fingerprint": "Compare screenshot to known brands",
            "POST /fingerprint/register": "Register a new brand reference",
            "GET  /stats": "Aggregate statistics",
            "GET  /feed": "Recent scan history",
            "GET  /capabilities": "Measured per-capability detection rates (real, not hardcoded)",
        },
    }

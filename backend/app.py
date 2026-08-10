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
from collections import deque

# Add current directory to Python path
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, HttpUrl

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

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Phishing Campaign Intelligence System",
    version="1.0.0",
    description="URL phishing scanner, campaign graph clustering, and brand fingerprinting API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
_model_ready = False


# ── Pydantic schemas ──────────────────────────────────────────────────────────
class ScanRequest(BaseModel):
    url: str
    include_network: bool = False


class BatchScanRequest(BaseModel):
    urls: list[str]
    include_network: bool = False


class ClusterRequest(BaseModel):
    urls: list[str]
    threshold: float = 0.35


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


# ── Startup: pre-warm model ───────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    global _model_ready
    def _warm():
        global _model_ready
        try:
            _predict("https://www.google.com/")
            _model_ready = True
        except Exception as e:
            print(f"[WARN] Model warm-up failed: {e}")
    threading.Thread(target=_warm, daemon=True).start()


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_ready": _model_ready,
        "total_scanned": _total_scanned,
        "fingerprinting_available": FINGERPRINT_OK,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


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
    return {
        "campaigns": campaigns,
        "total_campaigns": len(campaigns),
        "total_urls": len(req.urls),
        "threshold": req.threshold,
    }


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
    name: str = Form(...),
    reference: UploadFile = File(...),
):
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
        },
    }

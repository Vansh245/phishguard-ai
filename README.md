# PhishGuard AI — Phishing Campaign Intelligence System

> **Hackathon-ready full-stack web application** for phishing URL detection, campaign graph clustering, and brand visual fingerprinting.

---

## ⚡ Quick Start

### 1. Backend (Python / FastAPI)

```bash
cd backend
pip install -r requirements.txt
# First run: automatically trains the ML model
uvicorn app:app --reload --port 8000
```

### 2. Frontend (React / Vite)

```bash
cd frontend
npm install        # already done if you ran the setup
npm run dev        # opens http://localhost:5173
```

> **Works offline too!** The frontend falls back to a realistic mock when the backend isn't running — fully demo-able without any Python setup.

---

## 🏆 Unique Features (Hackathon Differentiators)

| Feature | What it does | Tech |
|---------|-------------|------|
| **Threat DNA Radar** | Spider chart profiling 6 dimensions per URL | SVG + custom math |
| **Campaign Graph** | D3 force-directed network of linked phishing domains | D3 v7 + NetworkX |
| **Visual Clone Detector** | Screenshot → pHash + color DNA comparison | Pillow + Numpy |
| **Zero-Day Signal** | Catches IDN homographs, @-tricks, hex-encoding | Heuristic combiner |
| **Evidence Chain** | Human-readable numbered reasoning per verdict | Explainable AI |
| **Batch Scan** | CSV/TXT upload → 100-URL batch analysis | FastAPI + Dropzone |
| **Tech Stack page** | Explains every algorithm to judges | Custom architecture diagram |

---

## 🧠 Intelligence Modules

### 1. URL Scanner (`/scanner`)
- **22 lexical features** extracted from URL string — no network needed
- **Levenshtein edit-distance** typosquat scoring against 24 brands
- **Combosquat** token detection
- **ML Ensemble**: RandomForest + HistGradientBoosting — best on 5-fold CV F1 wins
- **Explainable verdict**: evidence chain + feature importance bars
- **Threat DNA radar** — visual 6-axis threat profile
- **Zero-day anomaly meter** — Isolation Forest-inspired signal combiner

### 2. Campaign Graph (`/campaigns`)
- Build URL similarity graph (path template + TLD + Jaccard keyword overlap)
- **Louvain/Greedy Modularity** community detection via NetworkX
- Interactive **D3 force-directed graph** (drag, zoom, hover tooltips)
- Campaign detail cards with keyword fingerprints
- JSON export

### 3. Brand Shield (`/fingerprint`)
- Screenshot upload (PNG/JPG/WebP)
- **pHash** (DCT-based 64-bit perceptual hash) for layout structure
- **Regional color histogram** — top-20% header area captures brand palette
- Combined 50/50 score → VISUAL_CLONE_DETECTED verdict

### 4. Tech Stack (`/tech`)
- Architecture diagram
- 12 algorithm/technique cards with WHY explanations
- Algorithmic complexity reference table

---

## 🗂️ Project Structure

```
project/
├── backend/
│   ├── app.py                  # FastAPI: /scan, /cluster, /fingerprint, /stats, /feed
│   ├── features/
│   │   ├── lexical_features.py # 22 URL features, offline
│   │   └── network_features.py # WHOIS/DNS/SSL, needs internet
│   ├── model/
│   │   ├── train_model.py      # RF + HGB, 5-fold CV
│   │   ├── predict.py          # Verdict + evidence chain
│   │   └── phishing_model.pkl  # Auto-generated on first run
│   ├── clustering/
│   │   └── campaign_cluster.py # Graph + Louvain
│   ├── fingerprinting/
│   │   └── brand_fingerprint.py# pHash + color DNA
│   ├── data/
│   │   └── generate_dataset.py # Synthetic 2400-URL dataset
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── App.jsx             # Layout + routing + matrix rain
    │   ├── pages/
    │   │   ├── DashboardPage.jsx
    │   │   ├── ScannerPage.jsx
    │   │   ├── CampaignPage.jsx
    │   │   ├── FingerprintPage.jsx
    │   │   └── TechStackPage.jsx
    │   ├── components/
    │   │   ├── ThreatDNA.jsx   # SVG radar chart
    │   │   └── CampaignGraph.jsx # D3 force graph
    │   └── hooks/
    │       └── useFeed.js      # Live feed + backend health
    ├── index.css               # Full design system (no CSS framework)
    └── vite.config.js          # API proxy → :8000
```

---

## 🔬 Honest Caveats

- **Synthetic training data**: The model trains on 2,400 rule-generated URLs. ~100% accuracy is expected but not real-world valid. Swap in real [PhishTank](https://www.phishtank.com/developer_info.php) + [Tranco](https://tranco-list.eu/) data for real performance numbers.
- **Network features need internet**: WHOIS/DNS/SSL checks require live internet. The frontend shows a demo when the backend is offline.
- **Visual fingerprinting**: Works best with screenshots close to real login pages. The reference brand database is empty at startup — register brands via `POST /fingerprint/register`.

---

## 📡 API Reference

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/health` | — | Model status |
| POST | `/scan` | `{url}` | Verdict + evidence + features |
| POST | `/scan/batch` | `{urls[]}` | Array of results |
| POST | `/cluster` | `{urls[], threshold}` | Campaign list |
| POST | `/fingerprint` | form: screenshot file | Clone verdict |
| POST | `/fingerprint/register` | form: name + reference image | OK |
| GET | `/stats` | — | Aggregate counts |
| GET | `/feed` | `?limit=50` | Recent scan history |

"""
Real-world dataset loader — PhishTank + IP2Location-crawled legitimate URLs.

Source: ESDAUNG/PhishDataset (github.com/ESDAUNG/PhishDataset), released
alongside "Segmentation-based Phishing URL Detection" (WI-IAT '21,
https://doi.org/10.1145/3486622.3493983). 10,000 phishing URLs collected
from PhishTank (May-Jun 2021) + 10,000 legitimate URLs crawled from real
domains via IP2Location + Apache Nutch. Labels: 0 = legitimate, 1 = phishing
(same convention this project already uses).

This is a genuine improvement over the old fully-synthetic dataset: real
phishing URLs have organic obfuscation patterns (not just our 3 hand-coded
generator templates), and real legitimate URLs include the credential/login
keyword paths (e.g. real bank/SSO login pages) that our synthetic benign
set never had — which is exactly what was causing legitimate sites like
paypal.com/signin to score suspiciously low confidence.

Downloaded once and cached locally (gitignored — not committed, since it's
a third-party redistributed research dataset without an explicit license
file; refetching from the source on each fresh environment is safer than
bundling a copy).
"""
import os
import urllib.request

CACHE_PATH = os.path.join(os.path.dirname(__file__), ".cache_real_dataset.xlsx")
SOURCE_URL = "https://raw.githubusercontent.com/ESDAUNG/PhishDataset/main/data_bal%20-%2020000.xlsx"


def _download(dest: str = CACHE_PATH, timeout: int = 30) -> str:
    if not os.path.exists(dest):
        urllib.request.urlretrieve(SOURCE_URL, dest)
    return dest


def load_real_dataset(max_rows: int | None = None) -> list[dict]:
    """Returns [{"url": ..., "label": 0|1}, ...]. Downloads + caches on first call."""
    import pandas as pd

    path = _download()
    df = pd.read_excel(path)
    df = df.dropna(subset=["URLs", "Labels"])
    df["Labels"] = df["Labels"].astype(int)
    if max_rows:
        df = df.sample(n=min(max_rows, len(df)), random_state=42)
    return [{"url": str(row.URLs), "label": int(row.Labels)} for row in df.itertuples()]


if __name__ == "__main__":
    rows = load_real_dataset()
    phishing = sum(r["label"] for r in rows)
    print(f"Loaded {len(rows)} real URLs — {phishing} phishing, {len(rows) - phishing} legitimate")

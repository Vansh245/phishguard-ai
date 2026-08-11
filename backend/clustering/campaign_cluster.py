"""
Campaign graph clustering — groups related phishing domains by shared signals.
Uses networkx community detection (Louvain-style greedy modularity).
"""
import sys
import os
import re
from urllib.parse import urlparse
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

try:
    import networkx as nx
    from networkx.algorithms import community as nx_community
    HAS_NETWORKX = True
except ImportError:
    HAS_NETWORKX = False

try:
    from features.lexical_features import extract as lex_extract
    HAS_LEXICAL = True
except ImportError:
    HAS_LEXICAL = False


def _extract_signals(url: str) -> dict:
    """Extract linkage signals from a URL."""
    try:
        parsed = urlparse(url if "://" in url else "http://" + url)
    except Exception:
        return {}

    hostname = (parsed.hostname or "").lower()
    tld = hostname.split(".")[-1] if "." in hostname else ""
    reg_domain = ".".join(hostname.split(".")[-2:]) if "." in hostname else hostname

    # Registrar-level fingerprint: base domain without subdomain
    base = re.sub(r"^www\.", "", hostname)

    # Path template: tokenize into words, ignoring digits/hashes, so
    # "/login/verify" and "/login/update" still share the "login" token
    # instead of requiring an exact string match.
    path_clean = re.sub(r"[0-9a-f]{6,}", "", parsed.path or "")
    path_tokens = set(re.findall(r"[a-z]{3,}", path_clean.lower()))

    # Keyword bag — drop generic URL/protocol noise that doesn't carry
    # campaign signal (these were diluting Jaccard overlap for genuinely
    # related domains).
    STOPWORDS = {"http", "https", "www", "com", "net", "org"}
    keywords = set(re.findall(r"[a-z]{4,}", url.lower())) - STOPWORDS

    # Brand being impersonated (typosquat or combosquat), reusing the same
    # detector the URL scanner uses — this is the strongest campaign signal:
    # two domains spoofing the same brand belong together even if their
    # TLD, path, and generic keywords all differ.
    brand = ""
    if HAS_LEXICAL:
        try:
            feats = lex_extract(url)
            # combosquat is a precise substring match ("paypal" literally
            # appears in the hostname) — trust it first. Fuzzy typosquat
            # (edit-distance) is checked second since it's needed to catch
            # character-substitution tricks like "g00gle" for "google", but
            # is more prone to picking a similarly-spelled but wrong brand
            # on compound domains.
            if feats.get("combosquat"):
                brand = feats.get("combosquat_brand", "") or ""
            if not brand and feats.get("typosquat_score", 0) > 0.6:
                brand = feats.get("typosquat_brand", "") or ""
        except Exception:
            pass

    return {
        "hostname": hostname,
        "reg_domain": reg_domain,
        "tld": tld,
        "base": base,
        "path_tokens": path_tokens,
        "keywords": keywords,
        "brand": brand,
    }


def _similarity(a: dict, b: dict) -> float:
    """Edge weight between two URL signal sets (0.0–1.0)."""
    score = 0.0
    # Same brand impersonated — strongest campaign signal, independent of
    # TLD/path/keyword phrasing (e.g. "paypa1-secure.tk" and
    # "paypal-confirm.tk" both spoof PayPal).
    if a.get("brand") and a["brand"] == b.get("brand"):
        score += 0.55
    # Same TLD
    if a["tld"] and a["tld"] == b["tld"]:
        score += 0.15
    # Shared path tokens (Jaccard over path words, not exact-string match)
    pt_a, pt_b = a.get("path_tokens", set()), b.get("path_tokens", set())
    if pt_a and pt_b:
        path_jaccard = len(pt_a & pt_b) / len(pt_a | pt_b)
        score += 0.20 * path_jaccard
    # Keyword overlap (Jaccard)
    kw_a, kw_b = a["keywords"], b["keywords"]
    if kw_a and kw_b:
        jaccard = len(kw_a & kw_b) / len(kw_a | kw_b)
        score += 0.30 * jaccard
    # Same base domain (different subdomains)
    if a["base"] == b["base"] and a["base"]:
        score += 0.50
    return min(1.0, score)



def cluster(urls: list[str], threshold: float = 0.35) -> list[dict]:
    """
    Cluster URLs into campaigns.

    Returns list of campaign dicts:
    {
        "campaign_id": int,
        "urls": [...],
        "size": int,
        "common_tld": str,
        "common_keywords": [...],
    }
    """
    if not urls:
        return []

    signals = [_extract_signals(u) for u in urls]

    if HAS_NETWORKX:
        G = nx.Graph()
        for i, u in enumerate(urls):
            G.add_node(i, url=u, **{k: v for k, v in signals[i].items() if k not in ("keywords", "path_tokens")})

        for i in range(len(urls)):
            for j in range(i + 1, len(urls)):
                sim = _similarity(signals[i], signals[j])
                if sim >= threshold:
                    G.add_edge(i, j, weight=sim)

        # Use greedy modularity communities
        comps = list(nx_community.greedy_modularity_communities(G, weight="weight"))
    else:
        # Fallback: connected components via union-find
        parent = list(range(len(urls)))

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(x, y):
            parent[find(x)] = find(y)

        for i in range(len(urls)):
            for j in range(i + 1, len(urls)):
                if _similarity(signals[i], signals[j]) >= threshold:
                    union(i, j)

        groups = defaultdict(list)
        for i in range(len(urls)):
            groups[find(i)].append(i)
        comps = list(groups.values())

    campaigns = []
    for cid, comp in enumerate(sorted(comps, key=lambda c: -len(c))):
        indices = list(comp)
        camp_urls = [urls[i] for i in indices]
        camp_sigs = [signals[i] for i in indices]

        # Common TLD
        tlds = [s["tld"] for s in camp_sigs if s.get("tld")]
        common_tld = max(set(tlds), key=tlds.count) if tlds else ""

        # Impersonated brand, if the campaign consistently targets one
        brands = [s["brand"] for s in camp_sigs if s.get("brand")]
        common_brand = max(set(brands), key=brands.count) if brands else ""

        # Common keywords
        all_kw = defaultdict(int)
        for s in camp_sigs:
            for kw in s.get("keywords", set()):
                all_kw[kw] += 1
        common_kw = [kw for kw, cnt in sorted(all_kw.items(), key=lambda x: -x[1])
                     if cnt >= max(2, len(indices) // 2)][:8]

        campaigns.append({
            "campaign_id": cid,
            "urls": camp_urls,
            "size": len(camp_urls),
            "common_tld": common_tld,
            "common_brand": common_brand,
            "common_keywords": common_kw,
        })

    return campaigns


if __name__ == "__main__":
    test_urls = [
        "http://paypa1-secure.tk/login/verify",
        "http://paypal-confirm.tk/login/update",
        "http://paypal-account.tk/login/billing",
        "http://g00gle-signin.ml/auth/validate",
        "http://google-security.ml/auth/confirm",
        "https://www.github.com/users",
        "https://github.com/explore",
        "http://amazon-billing.xyz/account/suspended",
        "http://amaz0n-update.xyz/account/verify",
    ]
    results = cluster(test_urls)
    for c in results:
        print(f"\nCampaign {c['campaign_id']} ({c['size']} URLs, TLD={c['common_tld']}):")
        for u in c["urls"]:
            print(f"  {u}")
        if c["common_keywords"]:
            print(f"  Keywords: {', '.join(c['common_keywords'])}")

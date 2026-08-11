"""
Capability evaluator — measures REAL detection rates for each capability
claimed on the dashboard, using a held-out synthetic test set generated with
a different random seed than training (so numbers aren't just training-set
recall). Run standalone or import `evaluate()` for the API to serve live.

IMPORTANT CAVEAT (surfaced in the output, not hidden): this evaluates against
synthetic rule-generated URLs, the same generator family used for training.
It measures whether each detector does what it's designed to do — it is NOT
a measurement of real-world phishing-catch rate, which would need labeled
live phishing feeds (e.g. PhishTank/OpenPhish) plus real benign traffic.
"""
import os
import re
import sys
import random
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from features.lexical_features import extract as lex_extract
from data.generate_dataset import (
    make_benign, make_phishing_typosquat, make_phishing_ip, make_phishing_subdomain,
)

EVAL_SEED = 20260811  # deliberately different from train_model's dataset seed
N = 300


def _rate(hits: int, total: int) -> float:
    return round(100 * hits / total, 1) if total else 0.0


def eval_typosquat():
    rng = random.Random(EVAL_SEED)
    random.seed(EVAL_SEED)
    phishing = [make_phishing_typosquat() for _ in range(N)]
    benign = [make_benign() for _ in range(N)]
    tp = sum(1 for u in phishing if lex_extract(u).get("typosquat_score", 0) > 0.7)
    fp = sum(1 for u in benign if lex_extract(u).get("typosquat_score", 0) > 0.7)
    return {
        "recall_pct": _rate(tp, N),
        "false_positive_pct": _rate(fp, N),
        "n": N,
    }


def eval_combosquat():
    random.seed(EVAL_SEED + 1)
    phishing = [make_phishing_subdomain() for _ in range(N)]
    benign = [make_benign() for _ in range(N)]
    tp = sum(1 for u in phishing if lex_extract(u).get("combosquat"))
    fp = sum(1 for u in benign if lex_extract(u).get("combosquat"))
    return {"recall_pct": _rate(tp, N), "false_positive_pct": _rate(fp, N), "n": N}


def eval_ip_host():
    random.seed(EVAL_SEED + 2)
    phishing = [make_phishing_ip() for _ in range(N)]
    benign = [make_benign() for _ in range(N)]
    tp = sum(1 for u in phishing if lex_extract(u).get("ip_host"))
    fp = sum(1 for u in benign if lex_extract(u).get("ip_host"))
    return {"recall_pct": _rate(tp, N), "false_positive_pct": _rate(fp, N), "n": N}


def eval_suspicious_tld():
    """Replaces the old, unimplemented 'Newly-Registered Domain (WHOIS)' card —
    this repo makes no WHOIS calls anywhere, so that number was fabricated.
    Suspicious-TLD detection is real and implemented; measure it instead."""
    random.seed(EVAL_SEED + 3)
    phishing = [make_phishing_typosquat() for _ in range(N)] + [make_phishing_subdomain() for _ in range(N)]
    benign = [make_benign() for _ in range(N)]
    tp = sum(1 for u in phishing if lex_extract(u).get("suspicious_tld"))
    fp = sum(1 for u in benign if lex_extract(u).get("suspicious_tld"))
    return {"recall_pct": _rate(tp, len(phishing)), "false_positive_pct": _rate(fp, N), "n": len(phishing)}


def eval_zero_day():
    """URL obfuscation patterns NOT produced by any training/eval generator
    above — punycode homographs, @ tricks, hex-encoded chars, double
    subdomain stacking. Tests generalization to unseen obfuscation, not
    just memorized generator patterns."""
    from model.predict import predict as _predict
    rng = random.Random(EVAL_SEED + 4)
    brands = ["paypal", "google", "apple", "microsoft", "amazon"]
    novel = []
    for b in brands:
        novel.append(f"http://xn--{b}-{rng.randint(100,999)}.com/login")           # punycode-style
        novel.append(f"http://{b}.com@evil-{rng.randint(100,999)}.ru/verify")      # @ trick
        novel.append(f"http://evil.com/%{rng.randint(10,99)}/{b}/login")           # hex-encoded
        novel.append(f"http://secure.{b}.account.verify.{rng.randint(100,999)}-update.info/auth")  # deep subdomain stack
    benign = [make_benign() for _ in range(len(novel))]
    tp = sum(1 for u in novel if _predict(u)["verdict"] == "PHISHING")
    fp = sum(1 for u in benign if _predict(u)["verdict"] == "PHISHING")
    return {"recall_pct": _rate(tp, len(novel)), "false_positive_pct": _rate(fp, len(benign)), "n": len(novel)}


def eval_visual_clone():
    try:
        from fingerprinting.brand_fingerprint import compare_to_brands, HAS_PIL, _init_default_brands, KNOWN_BRANDS_DB, _render_brand_template, _BRAND_TEMPLATES
        from PIL import Image, ImageDraw
        import io
    except ImportError:
        return {"error": "Pillow not installed — cannot evaluate", "recall_pct": None, "false_positive_pct": None}

    _init_default_brands()
    hits, total = 0, 0
    fp, fp_total = 0, 0
    for name, (header_rgb, accent_rgb, header_h) in _BRAND_TEMPLATES.items():
        # "clone": near-identical re-render of the same template (simulates a
        # pixel-cloned phishing login page)
        clone_img = _render_brand_template(header_rgb, accent_rgb, header_h)
        buf = io.BytesIO()
        clone_img.save(buf, format="PNG")
        result = compare_to_brands(image_bytes=buf.getvalue(), threshold=0.75)
        total += 1
        if result["best_match"] and result["best_match"]["brand"] == name and result["best_match"]["is_clone"]:
            hits += 1

    # false positives: several genuinely unrelated flat-color page mockups
    # (not derived from any brand template) — same simple two-tone
    # header/body structure the templates use, but unrelated colors, to
    # test whether the signature discriminates on more than "has a header".
    fp_colors = [
        ((34, 139, 87), (12, 45, 30)),
        ((120, 60, 200), (60, 20, 120)),
        ((200, 180, 40), (120, 100, 10)),
        ((30, 30, 30), (10, 10, 10)),
        ((220, 90, 150), (140, 30, 90)),
    ]
    for body_rgb, header_rgb in fp_colors:
        unrelated = Image.new("RGB", (800, 600), body_rgb)
        d = ImageDraw.Draw(unrelated)
        d.rectangle([0, 0, 800, 90], fill=header_rgb)
        buf = io.BytesIO()
        unrelated.save(buf, format="PNG")
        result = compare_to_brands(image_bytes=buf.getvalue(), threshold=0.75)
        fp_total += 1
        if result["best_match"] and result["best_match"]["is_clone"]:
            fp += 1

    return {"recall_pct": _rate(hits, total), "false_positive_pct": _rate(fp, fp_total), "n": total, "fp_n": fp_total}


def eval_campaign_clustering():
    from clustering.campaign_cluster import cluster
    random.seed(EVAL_SEED + 5)
    # 4 synthetic "campaigns": each is one typosquat brand across several
    # near-identical hosts/paths — a real coordinated campaign would look
    # like this. Plus unrelated singleton URLs as noise.
    campaigns = []
    for brand in ["paypal", "chase", "netflix", "apple"]:
        family = [f"http://{brand}{i}-secure.tk/login/verify" for i in range(5)]
        campaigns.append(family)
    noise = [make_benign() for _ in range(10)]

    all_urls = [u for fam in campaigns for u in fam] + noise
    result = cluster(all_urls, threshold=0.35)

    # purity: for each detected multi-URL cluster, what fraction of its
    # members came from the SAME true campaign family
    correct_pairs, total_pairs = 0, 0
    url_to_true_campaign = {}
    for idx, fam in enumerate(campaigns):
        for u in fam:
            url_to_true_campaign[u] = idx

    for c in result:
        members = [u for u in c["urls"] if u in url_to_true_campaign]
        if len(members) < 2:
            continue
        from collections import Counter
        counts = Counter(url_to_true_campaign[u] for u in members)
        majority = counts.most_common(1)[0][1]
        correct_pairs += majority
        total_pairs += len(members)

    purity = _rate(correct_pairs, total_pairs) if total_pairs else 0.0
    return {"purity_pct": purity, "campaigns_detected": len(result), "n": len(all_urls)}


def evaluate() -> dict:
    return {
        "typosquatting": eval_typosquat(),
        "combosquatting": eval_combosquat(),
        "ip_as_host": eval_ip_host(),
        "suspicious_tld": eval_suspicious_tld(),
        "zero_day_obfuscation": eval_zero_day(),
        "visual_clone": eval_visual_clone(),
        "campaign_clustering": eval_campaign_clustering(),
        "note": "Measured against synthetic rule-generated test URLs (fresh seed, not the training set). Reflects whether each detector does what it's designed to do — not a real-world phishing catch rate, which requires labeled live-traffic data.",
    }


if __name__ == "__main__":
    import json
    print(json.dumps(evaluate(), indent=2))

"""
Prediction engine — loads the trained model and returns verdict + evidence.
"""
import os
import sys
import pickle
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from features.lexical_features import feature_vector, extract as lex_extract, FEATURE_NAMES

MODEL_PATH = os.path.join(os.path.dirname(__file__), "phishing_model.pkl")

_artifact = None


def _load():
    global _artifact
    if _artifact is None:
        if not os.path.exists(MODEL_PATH):
            from model.train_model import train
            print("Model not found — training now...")
            train()
        with open(MODEL_PATH, "rb") as f:
            _artifact = pickle.load(f)
    return _artifact


def _build_evidence(features: dict, prob: float) -> list[str]:
    evidence = []
    if features.get("ip_host"):
        evidence.append("domain is a raw IP address (not a registered domain)")
    if features.get("typosquat_score", 0) > 0.7:
        brand = features.get("typosquat_brand", "a known brand")
        evidence.append(f"mimics '{brand}' but isn't their real domain (typosquatting)")
    if features.get("combosquat"):
        brand = features.get("combosquat_brand", "a known brand")
        evidence.append(f"hostname contains '{brand}' as a keyword trap (combosquatting)")
    if features.get("suspicious_tld"):
        evidence.append("uses a TLD disproportionately used for abuse (.tk/.ml/.xyz etc.)")
    if features.get("cred_keyword_count", 0) >= 2:
        evidence.append("URL contains multiple credential/urgency keywords (login, verify, secure…)")
    elif features.get("cred_keyword_count", 0) == 1:
        evidence.append("URL contains an urgency/credential keyword")
    if not features.get("uses_https"):
        evidence.append("no HTTPS — connection is unencrypted")
    if features.get("punycode"):
        evidence.append("uses punycode encoding (IDN homograph attack pattern)")
    if features.get("subdomain_depth", 0) > 2:
        evidence.append(f"unusually deep subdomain nesting ({features['subdomain_depth']} levels)")
    if features.get("hyphen_count", 0) > 2:
        evidence.append(f"many hyphens in hostname ({features['hyphen_count']}) — common obfuscation tactic")
    if features.get("hostname_entropy", 0) > 3.8:
        evidence.append("high randomness/entropy in hostname — suggests auto-generated domain")
    if features.get("is_shortener"):
        evidence.append("URL is a known link shortener — destination is hidden")
    if features.get("redirect_param"):
        evidence.append("URL contains an open redirect parameter")
    if features.get("at_symbol"):
        evidence.append("@ symbol in URL — browser ignores everything before it (credential trick)")
    if not evidence and prob > 0.5:
        evidence.append("combination of subtle signals raises risk score above threshold")
    return evidence


def predict(url: str) -> dict:
    art = _load()
    feats = lex_extract(url)
    vec = np.array(feature_vector(url)).reshape(1, -1)
    vec_scaled = art["scaler"].transform(vec)
    prob = float(art["model"].predict_proba(vec_scaled)[0][1])
    verdict = "PHISHING" if prob >= 0.5 else "SAFE"
    evidence = _build_evidence(feats, prob)

    # Feature importance (if RandomForest)
    feature_importance = {}
    model = art["model"]
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
        for name, imp in zip(FEATURE_NAMES, importances):
            feature_importance[name] = round(float(imp), 4)

    return {
        "url": url,
        "verdict": verdict,
        "probability": round(prob, 4),
        "confidence_pct": round(prob * 100, 1) if verdict == "PHISHING" else round((1 - prob) * 100, 1),
        "evidence": evidence,
        "features": feats,
        "feature_importance": feature_importance,
        "model_name": art["model_name"],
    }


if __name__ == "__main__":
    test_urls = [
        "http://paypa1-secure-login.tk/account/verify",
        "https://www.paypal.com/signin",
        "https://accounts.google.com/login",
        "http://192.168.1.1/login/urgent",
        "http://paypal.verify-account-update.ml/billing",
    ]
    for u in test_urls:
        r = predict(u)
        print(f"\nURL: {r['url']}")
        print(f"Verdict: {r['verdict']} ({r['confidence_pct']}%)")
        for e in r["evidence"]:
            print(f"  - {e}")

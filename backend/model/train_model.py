"""
Model trainer — trains RandomForest + HistGradientBoosting, keeps the better one.

Dataset: real PhishTank + IP2Location-crawled URLs (see data/real_dataset.py)
as the primary signal, topped up with a small synthetic supplement so the
specific patterns our evidence UI names (typosquat, combosquat, IP-host,
punycode...) are still represented even if underrepresented in the real
sample. Reports metrics on a genuinely held-out test split, not just
cross-validation on the training pool — CV on this kind of feature set
tends to read optimistically high because near-duplicate URLs (same
domain, different path) end up split across folds.
"""
import os
import pickle
import sys

import numpy as np
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import f1_score, precision_score, recall_score, accuracy_score

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from features.lexical_features import feature_vector, FEATURE_NAMES
from data.generate_dataset import generate, make_benign_login, make_benign_sso_subdomain
from data.real_dataset import load_real_dataset

MODEL_PATH = os.path.join(os.path.dirname(__file__), "phishing_model.pkl")


def _build_dataset(synthetic_supplement: int = 150, verbose: bool = True) -> list[dict]:
    try:
        real_rows = load_real_dataset()
        if verbose:
            n_phish = sum(r["label"] for r in real_rows)
            print(f"Loaded {len(real_rows)} real URLs ({n_phish} phishing, {len(real_rows) - n_phish} legitimate)")
    except Exception as e:
        real_rows = []
        if verbose:
            print(f"[WARN] Could not load real dataset ({e}) — falling back to synthetic only")

    if verbose:
        print(f"Adding {synthetic_supplement * 4} synthetic rows for pattern coverage...")
    synthetic_rows = generate(synthetic_supplement)

    # Targeted supplement: real brand domains + real login-style paths,
    # labeled legitimate — see make_benign_login() docstring for why this
    # specific gap matters (real dataset's "legitimate" class barely
    # includes major-brand domains, so the model over-generalizes "brand
    # name = phishing" and misfires on the brand's own real login page).
    brand_login_rows = [{"url": make_benign_login(), "label": 0} for _ in range(synthetic_supplement * 2)]
    sso_subdomain_rows = [{"url": make_benign_sso_subdomain(), "label": 0} for _ in range(synthetic_supplement)]

    rows = real_rows + synthetic_rows + brand_login_rows + sso_subdomain_rows
    # De-dupe exact URL repeats between the two sources
    seen, deduped = set(), []
    for r in rows:
        if r["url"] not in seen:
            seen.add(r["url"])
            deduped.append(r)
    return deduped


def train(verbose: bool = True) -> dict:
    rows = _build_dataset(verbose=verbose)

    X = np.array([feature_vector(r["url"]) for r in rows])
    y = np.array([r["label"] for r in rows])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    models = {
        "RandomForest": RandomForestClassifier(n_estimators=200, max_depth=12,
                                               min_samples_leaf=2, n_jobs=-1,
                                               random_state=42),
        "HistGradientBoosting": HistGradientBoostingClassifier(
            max_iter=200, max_depth=8, learning_rate=0.05, random_state=42),
    }

    best_name, best_cv_score, best_model = "", 0.0, None
    for name, clf in models.items():
        cv_scores = cross_val_score(clf, X_train_scaled, y_train, cv=5, scoring="f1", n_jobs=-1)
        score = cv_scores.mean()
        if verbose:
            print(f"  {name}: train-fold CV F1 = {score:.4f} +/- {cv_scores.std():.4f}")
        if score > best_cv_score:
            best_cv_score, best_name, best_model = score, name, clf

    best_model.fit(X_train_scaled, y_train)

    # Honest metrics: held-out test set the model never touched during
    # training or model selection.
    y_pred = best_model.predict(X_test_scaled)
    test_metrics = {
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "precision": round(float(precision_score(y_test, y_pred)), 4),
        "recall": round(float(recall_score(y_test, y_pred)), 4),
        "f1": round(float(f1_score(y_test, y_pred)), 4),
        "n_test": int(len(y_test)),
    }
    if verbose:
        print(f"\nHeld-out test set ({test_metrics['n_test']} rows, never used for fitting):")
        print(f"  Accuracy={test_metrics['accuracy']}  Precision={test_metrics['precision']}  "
              f"Recall={test_metrics['recall']}  F1={test_metrics['f1']}")

    # Refit on ALL data for the final deployed artifact (standard practice
    # once model selection + honest eval are done) — but cv_f1 / test_metrics
    # above reflect the held-out numbers, not this refit.
    scaler_final = StandardScaler()
    X_all_scaled = scaler_final.fit_transform(X)
    best_model.fit(X_all_scaled, y)

    artifact = {
        "model": best_model,
        "scaler": scaler_final,
        "feature_names": FEATURE_NAMES,
        "model_name": best_name,
        "cv_f1": best_cv_score,          # train-fold CV score (model selection only)
        "test_metrics": test_metrics,    # honest held-out numbers — use these to report accuracy
        "n_train_rows": len(rows),
    }

    os.makedirs(os.path.dirname(MODEL_PATH) or ".", exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(artifact, f)

    if verbose:
        print(f"\nSaved: {best_name} -> {MODEL_PATH}")

    return artifact


if __name__ == "__main__":
    train()

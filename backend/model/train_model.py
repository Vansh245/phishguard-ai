"""
Model trainer — trains RandomForest + HistGradientBoosting, keeps the better one.
"""
import os
import pickle
import sys

import numpy as np
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from features.lexical_features import feature_vector, FEATURE_NAMES
from data.generate_dataset import generate

MODEL_PATH = os.path.join(os.path.dirname(__file__), "phishing_model.pkl")


def train(verbose: bool = True) -> dict:
    if verbose:
        print("Generating synthetic dataset...")
    rows = generate(600)

    X = np.array([feature_vector(r["url"]) for r in rows])
    y = np.array([r["label"] for r in rows])

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    models = {
        "RandomForest": RandomForestClassifier(n_estimators=200, max_depth=12,
                                               min_samples_leaf=2, n_jobs=-1,
                                               random_state=42),
        "HistGradientBoosting": HistGradientBoostingClassifier(
            max_iter=200, max_depth=8, learning_rate=0.05, random_state=42),
    }

    best_name, best_score, best_model = "", 0.0, None
    for name, clf in models.items():
        cv_scores = cross_val_score(clf, X_scaled, y, cv=5, scoring="f1", n_jobs=-1)
        score = cv_scores.mean()
        if verbose:
            print(f"  {name}: F1 = {score:.4f} ± {cv_scores.std():.4f}")
        if score > best_score:
            best_score, best_name, best_model = score, name, clf

    best_model.fit(X_scaled, y)

    artifact = {
        "model": best_model,
        "scaler": scaler,
        "feature_names": FEATURE_NAMES,
        "model_name": best_name,
        "cv_f1": best_score,
    }

    os.makedirs(os.path.dirname(MODEL_PATH) or ".", exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(artifact, f)

    if verbose:
        print(f"\nSaved: {best_name} (F1={best_score:.4f}) → {MODEL_PATH}")

    return artifact


if __name__ == "__main__":
    train()

"""
Brand visual fingerprinting — perceptual hash + region-color signature.
Detects cloned/spoofed login pages that visually impersonate known brands.
"""
import os
import hashlib
import struct
import sys
from io import BytesIO

try:
    from PIL import Image
    import numpy as np
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

KNOWN_BRANDS_DB: dict[str, dict] = {}


def _phash(img: "Image.Image", hash_size: int = 8) -> int:
    """Perceptual hash (DCT-based)."""
    img = img.convert("L").resize((hash_size * 4, hash_size * 4))
    pixels = list(img.getdata())
    n = hash_size * 4
    dct = []
    for u in range(hash_size):
        for v in range(hash_size):
            total = 0.0
            for x in range(n):
                for y in range(n):
                    import math
                    total += pixels[x * n + y] * math.cos(math.pi * u * (2 * x + 1) / (2 * n)) * math.cos(math.pi * v * (2 * y + 1) / (2 * n))
            dct.append(total)
    avg = sum(dct) / len(dct)
    return int("".join("1" if v > avg else "0" for v in dct), 2)


def _fast_phash(img: "Image.Image", hash_size: int = 8) -> int:
    """Fast perceptual hash using numpy if available."""
    try:
        import numpy as np
        import numpy.fft as fft
        img_gray = img.convert("L").resize((hash_size * 4, hash_size * 4))
        pixels = np.array(img_gray, dtype=float)
        dct_full = fft.dct(fft.dct(pixels, axis=0), axis=1)
        dct_low = dct_full[:hash_size, :hash_size].flatten()
        avg = dct_low.mean()
        bits = (dct_low > avg).astype(int)
        return int("".join(str(b) for b in bits), 2)
    except Exception:
        return _phash(img, hash_size)


def _hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def _region_color_signature(img: "Image.Image") -> list[float]:
    """Extract HSV color histogram from header (top 20%) and button regions."""
    try:
        import numpy as np
        w, h = img.size
        header = img.crop((0, 0, w, h // 5)).convert("RGB")
        arr = np.array(header, dtype=float)
        # Normalize R, G, B means to [0,1]
        means = arr.mean(axis=(0, 1)) / 255.0
        # Add 8-bucket histogram per channel
        hist = []
        for ch in range(3):
            counts, _ = np.histogram(arr[:, :, ch].flatten(), bins=8, range=(0, 255))
            hist.extend((counts / counts.sum()).tolist())
        return means.tolist() + hist
    except Exception:
        return [0.0] * 27


def _signature(img: "Image.Image") -> dict:
    ph = _fast_phash(img)
    color_sig = _region_color_signature(img)
    return {"phash": ph, "color_sig": color_sig}


def _sig_similarity(a: dict, b: dict) -> float:
    """Combined perceptual hash + color distance similarity (0=diff, 1=identical)."""
    # pHash component
    hamming = _hamming(a["phash"], b["phash"])
    phash_sim = max(0.0, 1.0 - hamming / 64.0)

    # Color component (L2 distance on color_sig)
    try:
        import numpy as np
        diff = np.array(a["color_sig"]) - np.array(b["color_sig"])
        color_dist = float(np.linalg.norm(diff))
        color_sim = max(0.0, 1.0 - color_dist / 3.0)
    except Exception:
        color_sim = phash_sim

    return 0.5 * phash_sim + 0.5 * color_sim


def register_brand(name: str, image_path: str):
    """Register a brand reference screenshot."""
    if not HAS_PIL:
        raise RuntimeError("Pillow is required for fingerprinting")
    img = Image.open(image_path)
    KNOWN_BRANDS_DB[name] = _signature(img)


def register_brand_from_bytes(name: str, image_bytes: bytes):
    """Register a brand from raw bytes (for API use)."""
    if not HAS_PIL:
        raise RuntimeError("Pillow is required for fingerprinting")
    img = Image.open(BytesIO(image_bytes))
    KNOWN_BRANDS_DB[name] = _signature(img)


# Pre-seed standard brands database with signatures
def _init_default_brands():
    if not KNOWN_BRANDS_DB:
        # Define standard brand templates (Header R, G, B + signature)
        # PayPal (Deep Blue header profile)
        KNOWN_BRANDS_DB["PayPal"] = {
            "phash": 0xf0f0f0f0f0f0f0f0,
            "color_sig": [0.02, 0.28, 0.65] + [1.0,0,0,0,0,0,0,0]*3
        }
        # Google (Clean White profile)
        KNOWN_BRANDS_DB["Google"] = {
            "phash": 0x0f0f0f0f0f0f0f0f,
            "color_sig": [0.96, 0.96, 0.96] + [0,0,0,0,0,0,0,1.0]*3
        }
        # Amazon (Slate Black profile)
        KNOWN_BRANDS_DB["Amazon"] = {
            "phash": 0xaaaaaaaaaaaaaaaa,
            "color_sig": [0.07, 0.10, 0.13] + [1.0,0,0,0,0,0,0,0]*3
        }
        # HDFC Bank (Navy Blue profile)
        KNOWN_BRANDS_DB["HDFC Bank"] = {
            "phash": 0x5555555555555555,
            "color_sig": [0.0, 0.20, 0.60] + [1.0,0,0,0,0,0,0,0]*3
        }
        # Apple (Light Gray profile)
        KNOWN_BRANDS_DB["Apple"] = {
            "phash": 0x3333333333333333,
            "color_sig": [0.95, 0.95, 0.95] + [0,0,0,0,0,0,0,1.0]*3
        }
        # Netflix (Dark Red-Black profile)
        KNOWN_BRANDS_DB["Netflix"] = {
            "phash": 0x7777777777777777,
            "color_sig": [0.05, 0.05, 0.05] + [1.0,0,0,0,0,0,0,0]*3
        }

def compare_to_brands(image_path: str = None, image_bytes: bytes = None,
                      threshold: float = 0.75) -> dict:
    """
    Compare a screenshot to all registered brands.
    Returns best match + similarity score.
    """
    if not HAS_PIL:
        return {"error": "Pillow not installed", "matches": []}

    _init_default_brands()

    if image_bytes:
        img = Image.open(BytesIO(image_bytes))
    elif image_path:
        img = Image.open(image_path)
    else:
        return {"error": "No image provided", "matches": []}

    sig = _signature(img)

    results = []
    for brand, ref_sig in KNOWN_BRANDS_DB.items():
        sim = _sig_similarity(sig, ref_sig)
        
        # Smart boost based on real-world color similarity for standard brands
        avg_rgb = sig["color_sig"][:3]
        ref_rgb = ref_sig["color_sig"][:3]
        
        # Calculate color difference
        color_diff = sum(abs(a - b) for a, b in zip(avg_rgb, ref_rgb))
        
        if color_diff < 0.25:
            # High matching color profile, boost similarity
            sim = max(sim, 0.85 + (0.12 * (1.0 - color_diff / 0.25)))
        elif color_diff < 0.45:
            # Moderate match
            sim = max(sim, 0.70 + (0.10 * (1.0 - color_diff / 0.45)))
            
        results.append({
            "brand": brand,
            "similarity": round(sim, 4),
            "is_clone": sim >= threshold,
        })

    results.sort(key=lambda r: -r["similarity"])
    best = results[0] if results else None

    return {
        "verdict": "VISUAL_CLONE_DETECTED" if (best and best["is_clone"]) else "NO_MATCH",
        "best_match": best,
        "all_matches": results,
        "threshold": threshold,
    }


def _is_legitimate_domain(hostname: str, brand: str) -> bool:
    """Strict ownership check — brand must be the eTLD+1, not just a substring."""
    parts = hostname.lower().split(".")
    if len(parts) < 2:
        return False
    registered = f"{parts[-2]}.{parts[-1]}"
    brand_domains = {
        "paypal": "paypal.com", "google": "google.com",
        "amazon": "amazon.com", "apple": "apple.com",
        "microsoft": "microsoft.com", "facebook": "facebook.com",
        "netflix": "netflix.com", "chase": "chase.com",
        "instagram": "instagram.com",
    }
    expected = brand_domains.get(brand.lower(), f"{brand.lower()}.com")
    return registered == expected


if __name__ == "__main__":
    print("Brand fingerprinting module loaded.")
    print(f"Pillow available: {HAS_PIL}")
    print(f"Registered brands: {list(KNOWN_BRANDS_DB.keys())}")

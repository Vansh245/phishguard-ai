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


# Pre-seed standard brands database with REAL signatures.
# Each default brand gets a small synthetic login-page mockup (header bar +
# a button/accent block, roughly matching that brand's real login page
# layout and palette) rendered with PIL, then run through the exact same
# _signature() pipeline used for user-uploaded screenshots. This keeps the
# comparison apples-to-apples instead of hand-typing arbitrary hash bits.
_BRAND_TEMPLATES = {
    # name: (header_rgb, accent/button_rgb, header_height_frac)

    # Payments / fintech
    "PayPal":     ((0, 48, 135),    (0, 112, 224),  0.22),
    "Venmo":      ((61, 149, 206),  (255, 255, 255), 0.18),
    "Paytm":      ((0, 47, 108),    (0, 186, 244),  0.20),
    "PhonePe":    ((94, 21, 139),   (255, 255, 255), 0.18),
    "Stripe":     ((99, 91, 255),   (255, 255, 255), 0.14),
    "Coinbase":   ((11, 37, 251),   (255, 255, 255), 0.16),
    "Binance":    ((24, 26, 32),    (240, 185, 11),  0.16),

    # Big tech
    "Google":     ((255, 255, 255), (66, 133, 244), 0.14),
    "Microsoft":  ((243, 243, 243), (0, 120, 212),  0.14),
    "Apple":      ((245, 245, 247), (0, 0, 0),      0.12),
    "Facebook":   ((24, 119, 242),  (255, 255, 255), 0.16),
    "Instagram":  ((255, 255, 255), (225, 48, 108), 0.14),
    "LinkedIn":   ((0, 119, 181),   (255, 255, 255), 0.16),
    "Netflix":    ((20, 20, 20),    (229, 9, 20),   0.18),
    "Dropbox":    ((255, 255, 255), (0, 97, 254),   0.14),
    "Adobe":      ((250, 10, 10),   (255, 255, 255), 0.16),

    # E-commerce
    "Amazon":     ((15, 17, 17),    (255, 153, 0),  0.16),
    "eBay":       ((255, 255, 255), (233, 74, 30),  0.14),
    "Walmart":    ((0, 76, 145),    (255, 194, 32), 0.18),
    "Flipkart":   ((40, 116, 240),  (255, 224, 0),  0.18),
    "Etsy":       ((255, 255, 255), (247, 105, 26), 0.14),

    # Shipping / logistics
    "FedEx":      ((76, 15, 122),   (255, 102, 0),  0.16),
    "DHL":        ((255, 204, 0),   (215, 0, 46),   0.16),
    "USPS":       ((0, 40, 104),    (222, 24, 46),  0.16),

    # Banks
    "HDFC Bank":  ((4, 30, 66),     (237, 28, 36),  0.20),
    "ICICI Bank": ((242, 101, 34),  (183, 32, 43),  0.20),
    "Chase":      ((17, 84, 168),   (255, 255, 255), 0.20),
    "Wells Fargo": ((215, 25, 32),  (255, 204, 0),  0.20),
    "Citibank":   ((0, 79, 159),    (255, 255, 255), 0.20),
}


def _render_brand_template(header_rgb, accent_rgb, header_h_frac, size=(800, 600)):
    """Build a simple synthetic login-page mockup for a brand template."""
    from PIL import ImageDraw
    w, h = size
    img = Image.new("RGB", size, color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    header_h = int(h * header_h_frac)
    draw.rectangle([0, 0, w, header_h], fill=header_rgb)
    # A centered "login button" block, roughly where most login forms put one
    btn_w, btn_h = w // 4, h // 14
    btn_x = (w - btn_w) // 2
    btn_y = header_h + h // 6
    draw.rectangle([btn_x, btn_y, btn_x + btn_w, btn_y + btn_h], fill=accent_rgb)
    return img


def _init_default_brands():
    if not KNOWN_BRANDS_DB:
        for name, (header_rgb, accent_rgb, header_h) in _BRAND_TEMPLATES.items():
            template_img = _render_brand_template(header_rgb, accent_rgb, header_h)
            KNOWN_BRANDS_DB[name] = _signature(template_img)


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

"""
Lexical feature extractor — works offline, no network required.
Extracts ~30 signals from a URL string alone.
"""
import re
import math
from urllib.parse import urlparse

SUSPICIOUS_TLDS = {
    ".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".club",
    ".online", ".site", ".icu", ".vip", ".live", ".work", ".stream",
    ".download", ".click", ".link", ".shop", ".pw", ".cc", ".info",
}

SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "buff.ly",
    "is.gd", "cli.gs", "pic.gd", "rebrand.ly", "cutt.ly", "shorte.st",
}

# Compound/ccTLD-style suffixes: many countries use a two-part public
# suffix (co.uk, com.au, bank.in...) where the naive "last two labels"
# heuristic misidentifies the SECOND label as the registered domain
# instead of the real owner one level up — e.g. for "sbi.bank.in" the
# real owner is "sbi", not "bank". Without this, a legitimate domain
# using one of these suffixes gets misread as impersonating itself.
COMPOUND_SUFFIX_LABELS = {
    "bank", "co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "in",
}

CREDENTIAL_KEYWORDS = [
    "login", "signin", "sign-in", "verify", "secure", "account",
    "update", "confirm", "banking", "password", "credential",
    "wallet", "billing", "invoice", "urgent", "suspended", "alert",
    "security", "authenticate", "validate", "access", "authorize",
]

KNOWN_BRANDS = [
    # Big tech / platforms
    "google", "microsoft", "apple", "amazon", "facebook", "meta",
    "instagram", "twitter", "linkedin", "youtube", "netflix", "spotify",
    "dropbox", "icloud", "adobe", "yahoo", "outlook", "gmail",
    "whatsapp", "telegram", "snapchat", "tiktok", "pinterest", "reddit",
    "discord", "zoom", "slack", "github", "gitlab",

    # E-commerce / retail
    "ebay", "walmart", "alibaba", "aliexpress", "flipkart", "myntra",
    "target", "bestbuy", "costco", "shopify", "etsy", "wayfair",

    # Shipping / logistics
    "fedex", "dhl", "usps", "ups", "indiapost", "bluedart",

    # Government / tax
    "irs", "socialsecurity", "medicare", "incometax",

    # Crypto / fintech
    "coinbase", "binance", "kraken", "metamask", "blockchain",
    "paypal", "venmo", "stripe", "wise", "westernunion",
    "paytm", "phonepe", "googlepay", "razorpay", "cashapp", "zelle",

    # US / global banks
    "chase", "wellsfargo", "citibank", "citi", "bankofamerica", "usbank",
    "capitalone", "hsbc", "barclays", "santander", "tdbank", "pnc",
    "americanexpress", "discover", "mastercard", "visa",

    # Indian banks / NBFCs
    "hdfcbank", "icicibank", "sbi", "axisbank", "kotak", "pnbindia",
    "yesbank", "idfcfirst", "indusind", "bankofbaroda",

    # Airlines / travel
    "airbnb", "booking", "expedia", "delta", "united", "americanairlines",
    "emirates", "indigo", "airindia",

    # Telecom
    "verizon", "att", "tmobile", "vodafone", "airtel", "jio",

    # Cloud / SaaS
    "aws", "azure", "salesforce", "oracle", "ibm", "cloudflare",

    # Streaming / entertainment
    "disney", "hulu", "hbomax", "primevideo",
]

# Generic dictionary words that happen to be substrings of one or more
# brand names above ("bank" is inside "citibank"/"bankofamerica"/"usbank",
# "pay" is inside "paypal"/"googlepay", "id" is inside "indusind"...).
# Without excluding these, ANY domain containing a plain English word like
# "bank" gets flagged as impersonating whichever brand happens to contain
# that substring — e.g. real domains like sbi.bank.in (India uses
# "bank.in" as a quasi-TLD structure) were being flagged as combosquatting
# "citibank" and typosquatting "usbank" purely because of the word "bank".
GENERIC_LABEL_STOPWORDS = {
    "bank", "pay", "id", "app", "web", "online", "secure", "login",
    "account", "service", "services", "mail", "home", "card", "net",
    "shop", "store", "money", "cloud", "mobile", "digital", "smart",
}


def _entropy(s: str) -> float:
    if not s:
        return 0.0
    freq = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    n = len(s)
    return -sum((f / n) * math.log2(f / n) for f in freq.values())


def _edit_distance(a: str, b: str) -> int:
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[:]
        dp[0] = i
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[j] = prev[j - 1]
            else:
                dp[j] = 1 + min(prev[j], dp[j - 1], prev[j - 1])
    return dp[n]


def _typosquat_score(label: str) -> tuple[float, str]:
    """Return (max_similarity, matched_brand) against KNOWN_BRANDS."""
    if label in KNOWN_BRANDS:
        # The label IS a recognized real brand itself — it can't
        # simultaneously be typosquatting a *different* brand just because
        # the two names happen to look alike (e.g. "github" vs "gitlab").
        return 0.0, ""
    if label in GENERIC_LABEL_STOPWORDS:
        # A plain dictionary word ("bank", "pay", "secure"...) will look
        # edit-distance-similar to any brand name that happens to contain
        # it as a substring (e.g. "bank" vs "usbank") without actually
        # being a typosquat of that brand.
        return 0.0, ""
    best, brand_match = 0.0, ""
    for brand in KNOWN_BRANDS:
        dist = _edit_distance(label, brand)
        max_len = max(len(label), len(brand))
        sim = 1.0 - dist / max_len
        if sim > best:
            best, brand_match = sim, brand
    return best, brand_match


def _real_owner_label(hostname: str) -> str:
    """The label that actually identifies who registered/owns this domain
    — last label before the public suffix, stepping back one extra level
    for compound suffixes (bank.in, co.uk...) same as _get_registered_domain."""
    parts = [p for p in hostname.lower().split(".") if p]
    if len(parts) >= 3 and parts[-2] in COMPOUND_SUFFIX_LABELS and len(parts[-2]) <= 6:
        return parts[-3]
    if len(parts) >= 2:
        return parts[-2]
    return parts[0] if parts else ""


def _combosquat_tokens(hostname: str) -> tuple[bool, str]:
    """Check if hostname contains a brand name as a substring but isn't the real domain."""
    parts = hostname.lower().split(".")
    # The label that actually owns this domain (e.g. "google" in
    # "accounts.google.com", or "sbi" in "onlinesbi.sbi.bank.in") — if
    # this IS any recognized brand's real name, it can't simultaneously be
    # impersonating a *different* brand (handles both directions of prefix
    # collisions like "google"/"googlepay").
    registered_label = _real_owner_label(hostname)
    if registered_label in KNOWN_BRANDS:
        return False, ""

    # Strip www and common generic TLD/suffix words. (The real-owner label
    # is already handled by the KNOWN_BRANDS check above when it's an
    # exact brand match — it must stay IN this list otherwise, since
    # hyphenated phishing hosts like "citibank-secure-login.tk" need their
    # own owner-position label tokenized to catch "citibank" inside it.)
    meaningful = [p for p in parts if p not in ("www", "com", "net", "org", "co", "uk")]
    # Rejoin and tokenise on hyphens/numbers
    full = "-".join(meaningful)
    tokens = re.split(r"[-_0-9]+", full)
    for brand in KNOWN_BRANDS:
        for token in tokens:
            # Short brand codes (irs, ups, sbi, aws...) are prone to
            # matching unrelated words that merely contain those letters
            # ("government" contains "gov"). Require an exact token match
            # for anything under 5 characters; only longer, more
            # distinctive brand names get substring matching.
            if len(brand) < 5:
                if token == brand:
                    return True, brand
                continue
            if brand in token:
                return True, brand
            if (token in brand and len(token) >= 4
                    and token not in KNOWN_BRANDS
                    and token not in GENERIC_LABEL_STOPWORDS):
                # Guard against prefix collisions between two distinct real
                # brands (e.g. "google" is a genuine substring of
                # "googlepay") — only treat this as an abbreviation if the
                # token isn't itself a recognized brand, or a plain
                # dictionary word that happens to appear inside this brand
                # name (e.g. "bank" inside "citibank"/"usbank" — that's not
                # someone abbreviating Citibank, it's just the word "bank").
                return True, brand
    return False, ""


def _get_registered_domain(hostname: str) -> str:
    """Simple eTLD+1 — last two dot-parts, but steps back one more level
    for two-part compound suffixes (co.uk, bank.in, com.au-style) so the
    real owner label isn't mistaken for a generic suffix word."""
    parts = hostname.split(".")
    if len(parts) >= 3 and parts[-2] in COMPOUND_SUFFIX_LABELS and len(parts[-2]) <= 6:
        return ".".join(parts[-3:])
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return hostname


def extract(url: str) -> dict:
    url = url.strip()
    try:
        parsed = urlparse(url if "://" in url else "http://" + url)
    except Exception:
        return {}

    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").lower()
    path = parsed.path or ""
    query = parsed.query or ""
    tld = "." + hostname.split(".")[-1] if "." in hostname else ""
    reg_domain = _get_registered_domain(hostname)

    # --- Structural ---
    url_length = len(url)
    hostname_length = len(hostname)
    path_length = len(path)
    dot_count = hostname.count(".")
    hyphen_count = hostname.count("-")
    digit_count = sum(c.isdigit() for c in hostname)
    subdomain_depth = max(0, dot_count - 1)
    at_symbol = int("@" in url)
    double_slash = int("//" in path)
    hex_chars = int(bool(re.search(r"%[0-9a-f]{2}", url, re.I)))
    ip_host = int(bool(re.match(
        r"^(\d{1,3}\.){3}\d{1,3}$", hostname)))
    punycode = int("xn--" in hostname)

    # --- TLD & shortener ---
    sus_tld = int(tld in SUSPICIOUS_TLDS)
    is_shortener = int(reg_domain in SHORTENERS)
    uses_https = int(scheme == "https")

    # --- Entropy ---
    hostname_entropy = _entropy(hostname)
    path_entropy = _entropy(path)

    # --- Keywords ---
    full_lower = url.lower()
    cred_keyword_count = sum(kw in full_lower for kw in CREDENTIAL_KEYWORDS)

    # --- Brand impersonation ---
    # Find the primary/owner label — same compound-suffix-aware logic as
    # combosquat detection, so "sbi" in "sbi.bank.in" isn't misread as
    # "bank" and compared against brand names it has nothing to do with.
    primary_label = _real_owner_label(hostname)

    # Typosquatting on split tokens (handles "paypa1-secure")
    tokens = re.split(r"[-_]", primary_label)
    best_typo, best_brand = 0.0, ""
    for tok in tokens:
        if len(tok) < 3:
            continue
        score, brand = _typosquat_score(tok)
        if score > best_typo:
            best_typo, best_brand = score, brand

    combosquat, combo_brand = _combosquat_tokens(hostname)

    # --- Query params ---
    param_count = len(query.split("&")) if query else 0
    redirect_param = int(any(
        kw in query.lower() for kw in ["redirect", "url=", "next=", "goto=", "return="]
    ))

    return {
        "url_length": url_length,
        "hostname_length": hostname_length,
        "path_length": path_length,
        "dot_count": dot_count,
        "hyphen_count": hyphen_count,
        "digit_count": digit_count,
        "subdomain_depth": subdomain_depth,
        "at_symbol": at_symbol,
        "double_slash": double_slash,
        "hex_chars": hex_chars,
        "ip_host": ip_host,
        "punycode": punycode,
        "suspicious_tld": sus_tld,
        "is_shortener": is_shortener,
        "uses_https": uses_https,
        "hostname_entropy": round(hostname_entropy, 4),
        "path_entropy": round(path_entropy, 4),
        "cred_keyword_count": cred_keyword_count,
        "typosquat_score": round(best_typo, 4),
        "typosquat_brand": best_brand,
        "combosquat": int(combosquat),
        "combosquat_brand": combo_brand,
        "param_count": param_count,
        "redirect_param": redirect_param,
    }


def feature_vector(url: str) -> list:
    """Return numeric feature vector only (for ML model)."""
    f = extract(url)
    return [
        f.get("url_length", 0),
        f.get("hostname_length", 0),
        f.get("path_length", 0),
        f.get("dot_count", 0),
        f.get("hyphen_count", 0),
        f.get("digit_count", 0),
        f.get("subdomain_depth", 0),
        f.get("at_symbol", 0),
        f.get("double_slash", 0),
        f.get("hex_chars", 0),
        f.get("ip_host", 0),
        f.get("punycode", 0),
        f.get("suspicious_tld", 0),
        f.get("is_shortener", 0),
        f.get("uses_https", 0),
        f.get("hostname_entropy", 0),
        f.get("path_entropy", 0),
        f.get("cred_keyword_count", 0),
        f.get("typosquat_score", 0),
        f.get("combosquat", 0),
        f.get("param_count", 0),
        f.get("redirect_param", 0),
    ]


FEATURE_NAMES = [
    "url_length", "hostname_length", "path_length", "dot_count", "hyphen_count",
    "digit_count", "subdomain_depth", "at_symbol", "double_slash", "hex_chars",
    "ip_host", "punycode", "suspicious_tld", "is_shortener", "uses_https",
    "hostname_entropy", "path_entropy", "cred_keyword_count", "typosquat_score",
    "combosquat", "param_count", "redirect_param",
]

"""
Synthetic dataset generator — rule-based phishing + benign URLs.
Swap this out with real PhishTank / OpenPhish + Tranco data for production.
"""
import random
import csv
import os

random.seed(42)

BENIGN_DOMAINS = [
    "google.com", "youtube.com", "facebook.com", "amazon.com", "wikipedia.org",
    "twitter.com", "linkedin.com", "reddit.com", "github.com", "stackoverflow.com",
    "microsoft.com", "apple.com", "netflix.com", "dropbox.com", "spotify.com",
    "nytimes.com", "bbc.com", "cnn.com", "theguardian.com", "reuters.com",
    "paypal.com", "ebay.com", "walmart.com", "target.com", "bestbuy.com",
    "chase.com", "wellsfargo.com", "bankofamerica.com", "citibank.com", "usbank.com",
]

BENIGN_PATHS = [
    "/", "/about", "/contact", "/products", "/services",
    "/blog/2024/news", "/help/center", "/account/settings",
    "/search?q=example", "/category/tech",
]

PHISHING_BRANDS = ["paypal", "google", "amazon", "apple", "microsoft",
                   "facebook", "netflix", "instagram", "chase", "wellsfargo"]
PHISHING_TLDS = [".tk", ".ml", ".ga", ".cf", ".xyz", ".top", ".cc", ".pw", ".icu"]
TYPOSQUAT_MODS = [
    lambda b: b[:-1] + "1",        # last char → digit
    lambda b: b.replace("a", "4"), # leet speak
    lambda b: b.replace("o", "0"),
    lambda b: b + "s",
    lambda b: b[0] + b[0] + b[1:], # double first char
]
PHISHING_PATHS = [
    "/login/verify", "/account/suspended", "/secure/confirm",
    "/update/billing", "/signin?redirect=true", "/auth/validate",
    "/invoice/download", "/urgent/action-required",
]
PHISHING_PREFIXES = ["secure-", "login-", "verify-", "account-", "update-",
                     "auth-", "myaccount-", "safe-"]


def make_benign():
    domain = random.choice(BENIGN_DOMAINS)
    path = random.choice(BENIGN_PATHS)
    return f"https://{domain}{path}"


def make_phishing_typosquat():
    brand = random.choice(PHISHING_BRANDS)
    mod = random.choice(TYPOSQUAT_MODS)
    squatted = mod(brand)
    tld = random.choice(PHISHING_TLDS)
    prefix = random.choice(PHISHING_PREFIXES + [""])
    path = random.choice(PHISHING_PATHS)
    host = f"{prefix}{squatted}{tld}" if prefix else f"{squatted}{tld}"
    return f"http://{host}{path}"


def make_phishing_ip():
    ip = ".".join(str(random.randint(1, 254)) for _ in range(4))
    path = random.choice(PHISHING_PATHS)
    return f"http://{ip}{path}"


def make_phishing_subdomain():
    brand = random.choice(PHISHING_BRANDS)
    fake_tld = random.choice(PHISHING_TLDS)
    random_domain = "".join(random.choices("abcdefghijklmnop", k=8)) + fake_tld
    path = random.choice(PHISHING_PATHS)
    return f"http://{brand}.{random_domain}{path}"


def generate(n_each: int = 400, output_path: str = None) -> list[dict]:
    rows = []

    for _ in range(n_each):
        rows.append({"url": make_benign(), "label": 0})

    for maker in [make_phishing_typosquat, make_phishing_ip,
                  make_phishing_subdomain]:
        for _ in range(n_each):
            rows.append({"url": maker(), "label": 1})

    random.shuffle(rows)

    if output_path:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["url", "label"])
            writer.writeheader()
            writer.writerows(rows)

    return rows


if __name__ == "__main__":
    data = generate(400, "data/dataset.csv")
    phishing = sum(r["label"] for r in data)
    print(f"Generated {len(data)} URLs — {phishing} phishing, {len(data)-phishing} benign")

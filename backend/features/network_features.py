"""
Network feature extractor — requires internet access.
Uses only Python stdlib (socket, ssl, http.client).
"""
import socket
import ssl
import re
from datetime import datetime, timezone


def _whois_age_days(domain: str) -> int | None:
    """Query WHOIS via raw socket and extract domain age in days."""
    try:
        tld = domain.split(".")[-1].lower()
        whois_servers = {
            "com": "whois.verisign-grs.com", "net": "whois.verisign-grs.com",
            "org": "whois.pir.org", "io": "whois.nic.io",
            "co": "whois.nic.co", "uk": "whois.nic.uk",
            "tk": "whois.dot.tk", "xyz": "whois.nic.xyz",
        }
        server = whois_servers.get(tld, f"whois.nic.{tld}")
        with socket.create_connection((server, 43), timeout=5) as s:
            s.sendall(f"{domain}\r\n".encode())
            raw = b""
            while True:
                chunk = s.recv(4096)
                if not chunk:
                    break
                raw += chunk
        text = raw.decode(errors="ignore")
        for pattern in [
            r"Creation Date:\s*(.+)",
            r"created:\s*(.+)",
            r"Registered on:\s*(.+)",
        ]:
            m = re.search(pattern, text, re.I)
            if m:
                date_str = m.group(1).strip()[:19]
                for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d-%b-%Y"]:
                    try:
                        created = datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc)
                        age = (datetime.now(timezone.utc) - created).days
                        return max(0, age)
                    except ValueError:
                        continue
    except Exception:
        pass
    return None


def _ssl_info(hostname: str) -> dict:
    """Fetch SSL certificate details."""
    result = {"has_ssl": 0, "ssl_days_valid": None, "ssl_issuer": ""}
    try:
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(
            socket.create_connection((hostname, 443), timeout=5),
            server_hostname=hostname
        ) as s:
            cert = s.getpeercert()
            result["has_ssl"] = 1
            not_after = cert.get("notAfter", "")
            if not_after:
                exp = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
                result["ssl_days_valid"] = (exp - datetime.now(timezone.utc)).days
            issuer_dict = dict(x[0] for x in cert.get("issuer", []))
            result["ssl_issuer"] = issuer_dict.get("organizationName", "")
    except Exception:
        pass
    return result


def _dns_resolves(hostname: str) -> bool:
    try:
        socket.getaddrinfo(hostname, None, timeout=3)
        return True
    except Exception:
        return False


def extract(url: str, hostname: str) -> dict:
    dns_ok = _dns_resolves(hostname)
    age = _whois_age_days(hostname) if dns_ok else None
    ssl = _ssl_info(hostname) if dns_ok else {"has_ssl": 0, "ssl_days_valid": None, "ssl_issuer": ""}
    return {
        "dns_resolves": int(dns_ok),
        "domain_age_days": age,
        "has_ssl": ssl["has_ssl"],
        "ssl_days_valid": ssl["ssl_days_valid"],
        "ssl_issuer": ssl["ssl_issuer"],
        "newly_registered": int(age is not None and age < 30),
    }

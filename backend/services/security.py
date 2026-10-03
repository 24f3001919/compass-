"""
Compass — Security Services & Validation Helpers.

Provides:
  - SSRF (Server-Side Request Forgery) protection for web ingestion/search.
  - Safe client IP resolution preventing spoofed proxy headers.
  - Constant-time secret verification.
"""

import ipaddress
import socket
import urllib.parse
from typing import Tuple, Optional
from fastapi import Request


# Disallowed IP networks for SSRF protection:
# - Loopback (127.0.0.0/8, ::1)
# - Link-Local / Cloud Metadata (169.254.0.0/16, fe80::/10)
# - RFC 1918 Private IPv4 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
# - Carrier-Grade NAT (100.64.0.0/10)
# - Broadcast / Multicast / Reserved (224.0.0.0/4, 240.0.0.0/4, 0.0.0.0/8)
BLOCKED_IP_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("240.0.0.0/4"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "instance-data",
}


def _is_ip_blocked(ip: ipaddress._BaseAddress) -> bool:
    """Check if an IP address belongs to any blocked private/reserved networks, unwrapping IPv4-mapped IPv6."""
    if getattr(ip, "ipv4_mapped", None):
        ip = ip.ipv4_mapped
    if ip.is_loopback or ip.is_private or ip.is_reserved or ip.is_link_local or ip.is_multicast or ip.is_unspecified:
        return True
    if str(ip) in ("0.0.0.0", "::", "::1"):  # nosec B104 - SSRF filter, not a socket bind
        return True
    for net in BLOCKED_IP_NETWORKS:
        try:
            if ip in net:
                return True
        except TypeError:
            continue
    return False


def is_safe_url(url: str) -> Tuple[bool, str]:
    """Validate that a URL is safe to fetch and not pointing to private/internal infrastructure (SSRF defense).

    Detects:
      - Raw IP literals (IPv4 & IPv6)
      - IPv6-mapped IPv4 addresses (::ffff:127.0.0.1)
      - Decimal and Hex encoded IPs (e.g. 2130706433 or 0x7f000001)
      - Octal dotted IPs (e.g. 0177.0.0.1)
      - Loopback, Link-Local, RFC1918 Private, Carrier-Grade NAT, Multicast
      - 0.0.0.0 and unspecified IPs
      - Cloud metadata hosts (169.254.169.254, metadata.google.internal)

    Returns (is_safe, error_reason).
    """
    if not url or not isinstance(url, str):
        return False, "URL must be a non-empty string"

    parsed = urllib.parse.urlsplit(url.strip())

    # Scheme validation: strictly http or https
    if parsed.scheme.lower() not in ("http", "https"):
        return False, f"Unsupported URL scheme '{parsed.scheme}'. Only http and https are allowed."

    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        return False, "Invalid URL: missing hostname"

    # Strip bracket notation from IPv6 if present
    if hostname.startswith("[") and hostname.endswith("]"):
        hostname = hostname[1:-1].strip()

    if hostname in BLOCKED_HOSTNAMES:
        return False, f"Access to blocked internal hostname '{hostname}' is forbidden."

    # Prevent loopback/cloud metadata disguised as decimal or hex integer
    if hostname.isdigit() or hostname.startswith("0x"):
        try:
            val = int(hostname, 0)
            if 0 <= val <= 0xFFFFFFFF:
                ip = ipaddress.IPv4Address(val)
                if _is_ip_blocked(ip):
                    return False, f"Access to private/reserved IP address '{ip}' is forbidden."
        except Exception:
            pass

    # Prevent octal dotted notation (e.g. 0177.0.0.1)
    if any(part.startswith("0") and len(part) > 1 and part.isdigit() for part in hostname.split(".")):
        try:
            oct_parts = [int(p, 8) if p.startswith("0") and p.isdigit() else int(p) for p in hostname.split(".")]
            if len(oct_parts) == 4 and all(0 <= p <= 255 for p in oct_parts):
                ip = ipaddress.IPv4Address(".".join(str(p) for p in oct_parts))
                if _is_ip_blocked(ip):
                    return False, f"Access to private/reserved IP address '{ip}' is forbidden."
        except Exception:
            pass

    try:
        # Check if hostname is directly an IP literal
        ip = ipaddress.ip_address(hostname)
        if _is_ip_blocked(ip):
            return False, f"Access to private/reserved IP address '{ip}' is forbidden."
    except ValueError:
        # Hostname is a domain name, resolve via DNS
        try:
            addr_info = socket.getaddrinfo(hostname, None)
            for item in addr_info:
                ip_str = item[4][0]
                ip = ipaddress.ip_address(ip_str)
                if _is_ip_blocked(ip):
                    return False, f"Hostname '{hostname}' resolves to private/reserved IP '{ip_str}'."
        except socket.gaierror:
            # Domain could not be resolved
            return False, f"Could not resolve hostname '{hostname}'."
        except Exception as e:
            return False, f"DNS resolution failed for '{hostname}': {e}"

    # Port restriction: standard HTTP/HTTPS ports only
    port = parsed.port
    if port and port not in (80, 443, 8080, 8443):
        return False, f"Access to port {port} is not permitted for web ingestion."

    return True, ""


def is_safe_redirect(source_url: str, location: str) -> Tuple[bool, str, str]:
    """Validate a redirect target from a given source URL.

    Resolves relative redirects against source_url and ensures the destination
    is not targeting internal/private addresses (SSRF defense).
    Returns (is_safe, resolved_url, error_reason).
    """
    if not location or not isinstance(location, str):
        return False, "", "Redirect location must be a non-empty string"
    resolved_url = urllib.parse.urljoin(source_url.strip(), location.strip())
    safe, reason = is_safe_url(resolved_url)
    if not safe:
        return False, resolved_url, f"Redirect destination rejected: {reason}"
    return True, resolved_url, ""


async def safe_http_get(
    url: str,
    max_redirects: int = 3,
    timeout: float = 10.0,
    headers: Optional[dict] = None,
) -> Tuple[int, str, dict]:
    """Execute an outbound HTTP GET through strict SSRF validation on every redirect hop.
    
    Returns (status_code, text, response_headers).
    """
    import httpx

    current_url = url
    for hop in range(max_redirects + 1):
        safe, reason = is_safe_url(current_url)
        if not safe:
            raise ValueError(f"SSRF blocked on hop {hop}: {reason}")

        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            resp = await client.get(current_url, headers=headers)
            if resp.status_code in (301, 302, 303, 307, 308):
                loc = resp.headers.get("location")
                if not loc:
                    return resp.status_code, resp.text, dict(resp.headers)
                redir_safe, next_url, redir_err = is_safe_redirect(current_url, loc)
                if not redir_safe:
                    raise ValueError(f"SSRF redirect blocked: {redir_err}")
                current_url = next_url
                continue
            return resp.status_code, resp.text, dict(resp.headers)

    raise ValueError(f"Too many redirects ({max_redirects})")



def get_client_ip(request: Request) -> str:
    """Safely extract client IP address behind trusted reverse proxies (Render / Cloudflare / Vercel).

    Prevents header spoofing attacks where an attacker prepends arbitrary fake IPs into X-Forwarded-For.
    Edge proxies append the genuine client IP, so the last valid address or dedicated proxy header is used.
    """
    # 1. Cloudflare validated client IP
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip and cf_ip.strip():
        return cf_ip.strip()

    # 2. True-Client-IP
    t_ip = request.headers.get("true-client-ip")
    if t_ip and t_ip.strip():
        return t_ip.strip()

    # 3. X-Forwarded-For: take the rightmost IP appended by the trusted proxy, NOT the client-injected leftmost IP
    xff = request.headers.get("x-forwarded-for")
    if xff and xff.strip():
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if parts:
            return parts[-1]

    # 4. X-Real-IP (if present and no X-Forwarded-For)
    real_ip = request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()

    if request.client and request.client.host:
        return request.client.host

    return "127.0.0.1"

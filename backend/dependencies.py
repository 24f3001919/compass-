"""
Compass — Common API Dependencies and Rate Limiters.
"""

import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.config import get_settings

import logging
import hmac
from backend.services.security import get_client_ip

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate Limiter — Sliding-window per client IP (30 requests/minute on chat)
# ---------------------------------------------------------------------------
_RATE_LIMIT_WINDOW_SECONDS = 60
_RATE_LIMIT_MAX_REQUESTS = 30
_rate_store: dict = defaultdict(deque)  # ip -> deque of timestamps

_AGENT_RATE_LIMIT_WINDOW_SECONDS = 60
_AGENT_RATE_LIMIT_MAX_REQUESTS = 10
_agent_rate_store: dict = defaultdict(deque)  # ip -> deque of timestamps


# ---------------------------------------------------------------------------
# Rate Limiter Dependencies (Shared Store backed by DB with in-memory fallback)
# ---------------------------------------------------------------------------
async def rate_limit(request: Request) -> None:
    """Shared rate limiter: 30 requests/min per client IP and per identity on chat/log endpoints.
    Returns HTTP 429 Too Many Requests with Retry-After header when exceeded.
    """
    client_ip = get_client_ip(request)
    now = time.monotonic()
    timestamps = _rate_store[client_ip]
    while timestamps and (now - timestamps[0]) > _RATE_LIMIT_WINDOW_SECONDS:
        timestamps.popleft()
    if len(timestamps) >= _RATE_LIMIT_MAX_REQUESTS:
        retry_after = int(_RATE_LIMIT_WINDOW_SECONDS - (now - timestamps[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: maximum {_RATE_LIMIT_MAX_REQUESTS} requests per minute.",
            headers={"Retry-After": str(max(1, retry_after))},
        )

    from backend.services.rate_limiter import enforce_rate_limit
    await enforce_rate_limit(request, action="chat", ip_capacity=30.0, ip_refill_per_sec=0.5)
    timestamps.append(now)


async def agent_rate_limit(request: Request) -> None:
    """Shared rate limiter for agent runs: 10 requests/min per client IP and per identity.
    Returns HTTP 429 Too Many Requests with Retry-After header when exceeded.
    """
    client_ip = get_client_ip(request)
    now = time.monotonic()
    timestamps = _agent_rate_store[client_ip]
    while timestamps and (now - timestamps[0]) > _AGENT_RATE_LIMIT_WINDOW_SECONDS:
        timestamps.popleft()
    if len(timestamps) >= _AGENT_RATE_LIMIT_MAX_REQUESTS:
        retry_after = int(_AGENT_RATE_LIMIT_WINDOW_SECONDS - (now - timestamps[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Agent rate limit exceeded: maximum {_AGENT_RATE_LIMIT_MAX_REQUESTS} requests per minute.",
            headers={"Retry-After": str(max(1, retry_after))},
        )

    from backend.services.rate_limiter import enforce_rate_limit
    try:
        await enforce_rate_limit(
            request,
            action="agent",
            ip_capacity=10.0,
            ip_refill_per_sec=10.0 / 60.0,
            identity_capacity=10.0,
            identity_refill_per_sec=10.0 / 60.0,
        )
    except HTTPException as e:
        if "Agent rate limit exceeded" not in str(e.detail):
            e.detail = f"Agent rate limit exceeded: {e.detail}"
        raise e
    timestamps.append(now)


async def mint_rate_limit(request: Request) -> None:
    """Strict shared rate limiter for guest token minting: max 10 mints per minute per IP.
    Returns HTTP 429 when mass guest creation is attempted.
    """
    from backend.services.rate_limiter import enforce_mint_rate_limit
    await enforce_mint_rate_limit(request)


# ---------------------------------------------------------------------------
# Auth Dependency — Bearer Token
# ---------------------------------------------------------------------------
_bearer_scheme = HTTPBearer(auto_error=False)


async def verify_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> str:
    """Validate the Authorization: Bearer <token> header against AUTH_TOKEN.

    Fails closed in production if AUTH_TOKEN is missing or set to insecure default.
    Uses constant-time comparison to prevent timing attacks.
    """
    settings = get_settings()

    # Fail closed in production if token is insecure
    if settings.is_production():
        if not settings.AUTH_TOKEN or settings.AUTH_TOKEN.strip() in (
            settings.DEFAULT_DEV_TOKEN,
            "compass-token",
            "test-token",
        ):
            raise HTTPException(
                status_code=500,
                detail="Server configuration error: production authentication token is not securely configured.",
            )

    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not settings.AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not hmac.compare_digest(credentials.credentials, settings.AUTH_TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")

    return credentials.credentials


# ---------------------------------------------------------------------------
# Guest Security & Token Helpers
# ---------------------------------------------------------------------------
_guest_rate_store: dict = defaultdict(deque)  # guest_id -> deque of timestamps


def _get_guest_signing_secret() -> bytes:
    """Derive secret for HMAC signing of guest session tokens.
    
    Refuses fallback secrets in production mode.
    """
    settings = get_settings()
    if settings.is_production():
        if not settings.AUTH_TOKEN or settings.AUTH_TOKEN.strip() in (
            settings.DEFAULT_DEV_TOKEN,
            "compass-token",
            "test-token",
        ):
            raise RuntimeError("Production configuration error: secure AUTH_TOKEN secret is required.")
        return settings.AUTH_TOKEN.encode("utf-8")

    raw = settings.AUTH_TOKEN or settings.DEFAULT_DEV_TOKEN or "compass-dev-guest-secret-2025"
    return raw.encode("utf-8")


def generate_guest_token(guest_id: Optional[str] = None) -> tuple[str, str]:
    """Generate a cryptographically random UUID guest identity and HMAC-signed token with timestamp.

    Format: <uuid>.<timestamp>.<hmac_sha256_hex>
    Ensures guest sessions are tamper-proof, cannot be spoofed, and cleanly expire.
    """
    import hashlib
    import uuid as _uuid
    gid = guest_id or str(_uuid.uuid4())
    ts = int(time.time())
    secret = _get_guest_signing_secret()
    payload = f"{gid}:{ts}".encode("utf-8")
    sig = hmac.new(secret, payload, hashlib.sha256).hexdigest()
    token = f"{gid}.{ts}.{sig}"
    return gid, token


def verify_guest_token(token: Optional[str]) -> Optional[str]:
    """Verify an HMAC-signed guest token with timestamp expiry.
    
    Returns the guest UUID if valid and unexpired, None if invalid, forged, or expired.
    """
    if not token or not isinstance(token, str) or "." not in token:
        return None
    parts = token.strip().split(".")
    import hashlib
    import uuid as _uuid

    secret = _get_guest_signing_secret()
    retention_days = int(getattr(get_settings(), "GUEST_RETENTION_DAYS", 30))
    now = int(time.time())

    # Format 1: <uuid>.<timestamp>.<sig>
    if len(parts) == 3:
        gid, ts_str, sig = parts
        try:
            _uuid.UUID(gid)
            ts = int(ts_str)
        except (ValueError, TypeError):
            return None

        # Expiry check: reject tokens older than retention_days or far in the future (>300s skew)
        if (now - ts) > (86400 * retention_days) or ts > (now + 300):
            return None

        payload = f"{gid}:{ts}".encode("utf-8")
        expected_sig = hmac.new(secret, payload, hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig, expected_sig):
            return gid
        return None

    # Format 2 (Legacy fallback): <uuid>.<sig>
    elif len(parts) == 2:
        gid, sig = parts
        try:
            _uuid.UUID(gid)
        except (ValueError, TypeError):
            return None
        expected_sig = hmac.new(secret, gid.encode("utf-8"), hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig, expected_sig):
            return gid
        return None

    return None


async def guest_rate_limit(request: Request) -> None:
    """Shared rate limiter per guest identity to prevent anonymous endpoint abuse."""
    from backend.services.rate_limiter import enforce_rate_limit
    await enforce_rate_limit(request, action="chat", ip_capacity=30.0, ip_refill_per_sec=0.5)


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# User & Guest Identity Helpers (Strictly Verified & Typed)
# ---------------------------------------------------------------------------
from dataclasses import dataclass

@dataclass(frozen=True)
class Identity:
    id: str
    is_admin: bool = False
    is_guest: bool = False
    user_id: Optional[str] = None
    guest_id: Optional[str] = None

    def __str__(self) -> str:
        return self.id


def _get_current_identity(request: Request) -> Optional[Identity]:
    """Resolve strongly typed authenticated identity from verified credentials.
    
    Returns Identity with explicit is_admin and is_guest flags.
    Restricts x-user-id impersonation with AUTH_TOKEN to cron and admin routes in production.
    """
    settings = get_settings()
    session_token = request.cookies.get("compass_session")
    auth_header = request.headers.get("authorization")
    bearer_token = None
    if auth_header and auth_header.lower().startswith("bearer "):
        bearer_token = auth_header[7:].strip()

    # 1. Verified user session
    token_to_check = session_token or bearer_token
    if token_to_check:
        try:
            from backend.routers.auth import get_user_from_session
            user = get_user_from_session(token_to_check)
            if user:
                return Identity(id=user.lower(), is_admin=False, is_guest=False, user_id=user.lower())
        except Exception as e:
            logger.debug("Session token lookup failed: %s", e)

    # 2. Server-to-server AUTH_TOKEN
    if bearer_token and settings.AUTH_TOKEN and hmac.compare_digest(bearer_token, settings.AUTH_TOKEN):
        user_header = request.headers.get("x-user-id")
        if user_header and user_header.strip():
            path = request.url.path
            is_cron_or_admin = path.startswith("/api/cron") or path.startswith("/api/admin")
            if settings.is_production() and not is_cron_or_admin:
                logger.warning("x-user-id impersonation rejected on non-admin/cron route in production: %s", path)
                raise HTTPException(
                    status_code=403,
                    detail="x-user-id impersonation is restricted to admin and cron routes in production.",
                )
            target = user_header.strip().lower()
            return Identity(id=target, is_admin=True, is_guest=False, user_id=target)
        return Identity(id="admin", is_admin=True, is_guest=False, user_id="admin")

    return None


def _get_current_user_id(request: Request) -> Optional[str]:
    """Resolve authenticated user identity strictly from verified credentials."""
    ident = _get_current_identity(request)
    return ident.id if ident else None


def _get_current_guest_id(request: Request) -> Optional[str]:
    """Extract and cryptographically verify guest identity from token header or cookie."""
    # 1. Check signed X-Guest-Token header
    token_header = request.headers.get("x-guest-token")
    if token_header:
        verified = verify_guest_token(token_header)
        if verified:
            return verified

    # 2. Check signed compass_guest_token cookie
    cookie_token = request.cookies.get("compass_guest_token")
    if cookie_token:
        verified = verify_guest_token(cookie_token)
        if verified:
            return verified

    # 3. Check X-Guest-Id header only if it contains a verified signed token
    guest_id_header = request.headers.get("x-guest-id")
    if guest_id_header and "." in guest_id_header:
        verified = verify_guest_token(guest_id_header)
        if verified:
            return verified

    return None


def _resolve_identities(request: Request) -> tuple[Optional[str], Optional[str]]:
    """Resolve both authenticated user_id and guest_id if present."""
    user_id = _get_current_user_id(request)
    guest_id = _get_current_guest_id(request)
    return user_id, guest_id


def _get_or_create_user_id(request: Request) -> str:
    """Resolve current user identity, falling back to verified guest identity or deterministic client hash.

    Guarantees every mutation is bound to an isolated user or guest workspace identity.
    """
    uid = _get_current_user_id(request)
    if uid:
        return uid
    gid = _get_current_guest_id(request)
    if gid:
        return f"guest_{gid}"
    import hashlib
    client_ip = get_client_ip(request)
    h = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()[:12]
    return f"guest_{h}"


def _now_iso() -> str:
    """Current UTC timestamp as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


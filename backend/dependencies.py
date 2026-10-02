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

import hmac
from backend.services.security import get_client_ip

# ---------------------------------------------------------------------------
# Rate Limiter — Sliding-window per client IP (30 requests/minute on chat)
# ---------------------------------------------------------------------------
_RATE_LIMIT_WINDOW_SECONDS = 60
_RATE_LIMIT_MAX_REQUESTS = 30
_rate_store: dict = defaultdict(deque)  # ip -> deque of timestamps

_AGENT_RATE_LIMIT_WINDOW_SECONDS = 60
_AGENT_RATE_LIMIT_MAX_REQUESTS = 10
_agent_rate_store: dict = defaultdict(deque)  # ip -> deque of timestamps


async def rate_limit(request: Request) -> None:
    """Sliding-window rate limiter: 30 requests/min per client IP on chat endpoints.
    Returns HTTP 429 Too Many Requests with Retry-After header when exceeded.
    """
    client_ip = get_client_ip(request)
    now = time.monotonic()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS

    q = _rate_store[client_ip]
    while q and q[0] < window_start:
        q.popleft()

    if len(q) >= _RATE_LIMIT_MAX_REQUESTS:
        retry_after = int(_RATE_LIMIT_WINDOW_SECONDS - (now - q[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {_RATE_LIMIT_MAX_REQUESTS} requests per minute per IP.",
            headers={"Retry-After": str(retry_after)},
        )

    q.append(now)


async def agent_rate_limit(request: Request) -> None:
    """Separate sliding-window rate limiter for agent runs: 10 requests/min per client IP.
    Returns HTTP 429 Too Many Requests with Retry-After header when exceeded.
    """
    client_ip = get_client_ip(request)
    now = time.monotonic()
    window_start = now - _AGENT_RATE_LIMIT_WINDOW_SECONDS

    q = _agent_rate_store[client_ip]
    while q and q[0] < window_start:
        q.popleft()

    if len(q) >= _AGENT_RATE_LIMIT_MAX_REQUESTS:
        retry_after = int(_AGENT_RATE_LIMIT_WINDOW_SECONDS - (now - q[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Agent rate limit exceeded. Max {_AGENT_RATE_LIMIT_MAX_REQUESTS} runs per minute per IP.",
            headers={"Retry-After": str(retry_after)},
        )

    q.append(now)


# ---------------------------------------------------------------------------
# Auth Dependency — Bearer Token
# ---------------------------------------------------------------------------
_bearer_scheme = HTTPBearer()


async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
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
    """Derive secret for HMAC signing of guest session tokens."""
    settings = get_settings()
    raw = settings.AUTH_TOKEN or settings.DEFAULT_DEV_TOKEN or "compass-guest-signing-secret"
    return raw.encode("utf-8")


def generate_guest_token(guest_id: Optional[str] = None) -> tuple[str, str]:
    """Generate a cryptographically random UUID guest identity and HMAC-signed token.

    Format: <uuid>.<hmac_sha256_hex>
    Ensures guest sessions are tamper-proof and cannot be spoofed by guessing IDs.
    """
    import hashlib
    import uuid as _uuid
    gid = guest_id or str(_uuid.uuid4())
    secret = _get_guest_signing_secret()
    sig = hmac.new(secret, gid.encode("utf-8"), hashlib.sha256).hexdigest()
    token = f"{gid}.{sig}"
    return gid, token


def verify_guest_token(token: Optional[str]) -> Optional[str]:
    """Verify an HMAC-signed guest token. Returns the guest UUID if valid, None if invalid or forged."""
    if not token or not isinstance(token, str) or "." not in token:
        return None
    parts = token.strip().split(".", 1)
    if len(parts) != 2:
        return None
    gid, sig = parts
    import uuid as _uuid
    try:
        # Strict validation: must be a valid UUID
        _uuid.UUID(gid)
    except (ValueError, TypeError):
        return None

    import hashlib
    secret = _get_guest_signing_secret()
    expected_sig = hmac.new(secret, gid.encode("utf-8"), hashlib.sha256).hexdigest()
    if hmac.compare_digest(sig, expected_sig):
        return gid
    return None


async def guest_rate_limit(request: Request) -> None:
    """Sliding-window rate limiter per guest identity to prevent anonymous endpoint abuse."""
    guest_id = _get_current_guest_id(request)
    if not guest_id:
        return
    settings = get_settings()
    max_reqs = getattr(settings, "GUEST_RATE_LIMIT", 30)
    window = 60
    now = time.monotonic()
    window_start = now - window

    q = _guest_rate_store[guest_id]
    while q and q[0] < window_start:
        q.popleft()

    if len(q) >= max_reqs:
        retry_after = int(window - (now - q[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Guest rate limit exceeded. Max {max_reqs} requests per minute.",
            headers={"Retry-After": str(retry_after)},
        )
    q.append(now)


# ---------------------------------------------------------------------------
# User & Guest Identity Helpers
# ---------------------------------------------------------------------------
def _get_current_user_id(request: Request) -> Optional[str]:
    """Resolve authenticated user identity strictly from headers or cookies."""
    user_header = request.headers.get("x-user-id")
    if user_header and user_header.strip():
        val = user_header.strip().lower()
        if "@" in val:
            return val

    session_token = request.cookies.get("compass_session")
    if session_token:
        try:
            from backend.routers.auth import get_user_from_session
            user = get_user_from_session(session_token)
            if user and "@" in user:
                return user.lower()
        except Exception:
            pass

    cookie_user = request.cookies.get("compass_user_id")
    if cookie_user and cookie_user.strip():
        import urllib.parse
        val = urllib.parse.unquote(cookie_user.strip()).lower()
        if "@" in val:
            return val
    return None


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

    # 3. Check X-Guest-Id header if formatted as signed token or UUID with cookie verification
    guest_id_header = request.headers.get("x-guest-id")
    if guest_id_header:
        # Check if header itself contains signed token
        if "." in guest_id_header:
            verified = verify_guest_token(guest_id_header)
            if verified:
                return verified
        # Or if matching the verified cookie token
        if cookie_token:
            verified = verify_guest_token(cookie_token)
            if verified and verified == guest_id_header.strip():
                return verified

    return None


def _resolve_identities(request: Request) -> tuple[Optional[str], Optional[str]]:
    """Resolve both authenticated user_id and guest_id if present."""
    user_id = _get_current_user_id(request)
    guest_id = _get_current_guest_id(request)
    return user_id, guest_id


def _get_or_create_user_id(request: Request) -> str:
    """Resolve current user identity, falling back to verified guest identity or fresh UUID.

    Guarantees every mutation is bound to an isolated user or guest workspace identity.
    Does NOT use IP address or browser fingerprinting.
    """
    uid = _get_current_user_id(request)
    if uid:
        return uid
    gid = _get_current_guest_id(request)
    if gid:
        return f"guest_{gid}"
    import uuid as _uuid
    return f"guest_{_uuid.uuid4()}"


def _now_iso() -> str:
    """Current UTC timestamp as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


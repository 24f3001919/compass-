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
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")
    client_ip = client_ip.split(",")[0].strip()
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
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")
    client_ip = client_ip.split(",")[0].strip()
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
    """Validate the Authorization: Bearer <token> header against AUTH_TOKEN."""
    if credentials.credentials != get_settings().AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return credentials.credentials


# ---------------------------------------------------------------------------
# User Identity Helper
# ---------------------------------------------------------------------------
def _get_current_user_id(request: Request) -> Optional[str]:
    """Resolve current user identity strictly from headers or cookies."""
    user_header = request.headers.get("x-user-id")
    if user_header and user_header.strip():
        return user_header.strip().lower()
    cookie_user = request.cookies.get("compass_user_id")
    if cookie_user and cookie_user.strip():
        import urllib.parse
        return urllib.parse.unquote(cookie_user.strip()).lower()
    return None


def _now_iso() -> str:
    """Current UTC timestamp as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()

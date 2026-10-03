"""
Compass — Pytest Configuration & Test Fixtures.
"""

import os
import sys
from pathlib import Path
from urllib.parse import urlparse
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))

# Suppress harmless GC teardown warnings when loops close before unexhausted generators
def _quiet_unraisablehook(unraisable):
    if unraisable.exc_value and "Event loop is closed" in str(unraisable.exc_value):
        return
    if hasattr(sys, "__unraisablehook__"):
        sys.__unraisablehook__(unraisable)

sys.unraisablehook = _quiet_unraisablehook

# Production database endpoint marker that must never be targeted by tests
_PROD_ENDPOINT_MARKER = "ep-sweet-fire-b2y9w95z"

test_db_url = os.environ.get("TEST_DATABASE_URL", "").strip()

# Set DATABASE_URL from test_db_url before importing backend
if test_db_url:
    os.environ["DATABASE_URL"] = test_db_url

from backend.main import app
from backend.config import get_settings

settings = get_settings()
if test_db_url:
    settings.DATABASE_URL = test_db_url


def pytest_configure(config):
    """Guard against executing test runs against production database.
    FAILS CLOSED: Tests REFUSE to run unless TEST_DATABASE_URL is explicitly set
    and points to an isolated non-production database.
    """
    if not test_db_url:
        pytest.exit(
            "ABORTED: TEST_DATABASE_URL environment variable is not set. Refusing to run tests against default or production database.",
            returncode=1,
        )

    parsed_test = urlparse(test_db_url)
    hostname = (parsed_test.hostname or "").lower()

    if _PROD_ENDPOINT_MARKER in hostname:
        pytest.exit(
            "ABORTED: Refusing to run tests. TEST_DATABASE_URL points to the production database endpoint.",
            returncode=1,
        )

    parsed_settings = urlparse(settings.DATABASE_URL)
    settings_host = (parsed_settings.hostname or "").lower()
    if _PROD_ENDPOINT_MARKER in settings_host:
        pytest.exit(
            "ABORTED: Refusing to run tests. settings.DATABASE_URL points to the production database endpoint.",
            returncode=1,
        )


@pytest_asyncio.fixture
async def client():
    """Async HTTP client fixture configured against the FastAPI app instance."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    import asyncio
    await asyncio.sleep(0.05)


@pytest.fixture
def auth_headers():
    """Valid authorization bearer header fixture."""
    return {"Authorization": f"Bearer {settings.AUTH_TOKEN}"}


@pytest_asyncio.fixture(autouse=True)
async def cleanup_db_pool():
    """Ensure database connection pool is closed within the test's event loop."""
    yield
    try:
        from backend.memory.db import close_pool
        await close_pool()
        import asyncio
        await asyncio.sleep(0.05)
    except Exception:
        pass




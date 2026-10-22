import os
from unittest.mock import AsyncMock, MagicMock
import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app
from backend.dependencies import generate_guest_token
from backend.config import get_settings


@pytest.mark.asyncio
async def test_sse_flows(monkeypatch):
    # Mock LLM stream so the test runs fast and doesn't spend external tokens repeatedly
    class DummyDelta:
        content = "Hi there!"
        tool_calls = None

    class DummyChoice:
        delta = DummyDelta()
        finish_reason = "stop"

    class DummyChunk:
        choices = [DummyChoice()]
        usage = None

    class MockStream:
        def __aiter__(self):
            return self._gen()

        async def _gen(self):
            yield DummyChunk()

        async def aclose(self):
            pass

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=MockStream())
    monkeypatch.setattr("backend.services.chat_stream.openai.AsyncOpenAI", lambda **kwargs: mock_client)

    # In production or when ENVIRONMENT is unset, GUEST_SIGNING_SECRET is required
    os.environ["GUEST_SIGNING_SECRET"] = "custom-secure-guest-signing-secret-32bytes!"
    os.environ["ENVIRONMENT"] = "development"
    get_settings.cache_clear()

    gid, token = generate_guest_token()
    print(f"\nFresh guest token minted: user_id={gid[:8]}...")

    # Scenario 1: ENVIRONMENT=development + fresh signed guest
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/chat/stream",
            json={"message": "hello"},
            headers={"Authorization": f"Bearer {token}"},
        )
        print(f"[1] ENV=development + guest token -> status: {resp.status_code}, content-type: {resp.headers.get('content-type')}")
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

    # Scenario 2: ENVIRONMENT unset + fresh signed guest
    if "ENVIRONMENT" in os.environ:
        del os.environ["ENVIRONMENT"]
    get_settings.cache_clear()
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/chat/stream",
            json={"message": "hello"},
            headers={"Authorization": f"Bearer {token}"},
        )
        print(f"[2] ENV unset + guest token -> status: {resp.status_code}, content-type: {resp.headers.get('content-type')}")
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

    # Scenario 3: Stale cookie + valid guest token (ENV unset)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/chat/stream",
            json={"message": "hello"},
            headers={"Authorization": f"Bearer {token}"},
            cookies={"compass_user_id": "stale_expired_fake_user"},
        )
        print(f"[3] Stale cookie + guest token -> status: {resp.status_code}, content-type: {resp.headers.get('content-type')}")
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

    # Scenario 4: Stale cookie ALONE (no Authorization token, ENV unset)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/chat/stream",
            json={"message": "hello"},
            cookies={"compass_user_id": "stale_expired_fake_user"},
        )
        set_cookie = resp.headers.get("set-cookie", "")
        print(f"[4] Stale cookie ALONE (ENV unset) -> status: {resp.status_code}, set-cookie: {set_cookie}")
        assert resp.status_code == 401
        assert "compass_user_id=" in set_cookie
        assert "Max-Age=0" in set_cookie

    print("ALL 4 SSE & AUTH SCENARIOS VERIFIED SUCCESSFULLY!")

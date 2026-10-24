"""
Regression test for stream serialization safety.
Verifies that when tool execution yields non-standard JSON types
(date, datetime, Decimal, UUID), chat_stream completes with 'done'
and never throws an unhandled serialization error or yields an error frame.
"""

import datetime
from decimal import Decimal
import json
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_stream_serialization_handles_date_datetime_decimal_uuid(client: AsyncClient, monkeypatch):
    """When tool output contains date, datetime, Decimal, and UUID objects,
    chat_stream must serialize them safely and yield done=True with zero error frames."""

    test_date = datetime.date(2026, 10, 24)
    test_dt = datetime.datetime(2026, 10, 24, 18, 30, 0, tzinfo=datetime.timezone.utc)
    test_decimal = Decimal("42.50")
    test_uuid = uuid.uuid4()

    mock_tool_result = {
        "response": "Found tasks with complex types.",
        "data": [
            {
                "id": 101,
                "title": "Complex serialized task",
                "due_date": test_date,
                "created_at": test_dt,
                "budget": test_decimal,
                "item_id": test_uuid,
            }
        ],
    }

    class MockChunk:
        def __init__(self, tool_call=None, finish_reason=None):
            self.choices = [
                MagicMock(
                    delta=MagicMock(content="", tool_calls=[tool_call] if tool_call else None, reasoning=None, reasoning_content=None),
                    finish_reason=finish_reason,
                )
            ]
            self.usage = None

    class MockStream:
        def __aiter__(self):
            return self._gen()
        async def _gen(self):
            fn = MagicMock()
            fn.name = "upcoming_tasks"
            fn.arguments = "{}"
            tc = MagicMock(index=0, function=fn)
            yield MockChunk(tool_call=tc, finish_reason=None)
            yield MockChunk(tool_call=None, finish_reason="tool_calls")
        async def aclose(self):
            pass

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=MockStream())
    monkeypatch.setattr("backend.router.get_openai_client", lambda: mock_client)
    monkeypatch.setattr(
        "backend.orchestrator.route_message",
        AsyncMock(return_value=("upcoming_tasks", {}, None)),
    )
    monkeypatch.setattr(
        "backend.orchestrator.handle_message",
        AsyncMock(return_value=mock_tool_result),
    )

    payload = {
        "message": "Check my upcoming deadlines",
    }

    events = []
    has_error_frame = False
    saw_done_frame = False

    async with client.stream("POST", "/api/chat/stream", json=payload, timeout=10.0) as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

        async for line in resp.aiter_lines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("data: "):
                data_str = line[6:]
                if data_str == "[DONE]":
                    continue
                try:
                    parsed = json.loads(data_str)
                    events.append(parsed)
                    if parsed.get("type") == "error" or parsed.get("error"):
                        has_error_frame = True
                    if parsed.get("done") is True or parsed.get("type") == "done":
                        saw_done_frame = True
                except Exception:
                    pass

    assert not has_error_frame, f"Stream unexpectedly yielded error frame: {events}"
    assert saw_done_frame, f"Stream failed to yield done event. Events received: {events}"

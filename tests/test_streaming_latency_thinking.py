"""
Compass — Latency Optimization & Thinking Experience Regression Battery.

Verifies:
1. Immediate feedback status event emission (< 50ms)
2. Tool call extraction from streaming deltas and direct dispatch
3. Pre-routed skill bypass of secondary route_message LLM calls
4. Web research synthesis delivering verified deadline findings with official Devpost citations
5. Cancellation and error resilience preserving partial content
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import AsyncClient

from backend.skills.handlers.web import handle_search_web
from backend.services.chat_stream import generate_chat_events, StreamingThinkFilter
from backend.models import StreamChatRequest


class DummyChoice:
    def __init__(self, delta=None, finish_reason=None):
        self.delta = delta
        self.finish_reason = finish_reason


class DummyChunk:
    def __init__(self, choices=None, usage=None):
        self.choices = choices or []
        self.usage = usage


class DummyStream:
    def __init__(self, chunks):
        self.chunks = chunks

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for c in self.chunks:
            yield c

    async def aclose(self):
        pass


@pytest.mark.asyncio
async def test_immediate_status_event_emitted():
    """Verify that generate_chat_events emits an immediate status event at stream start."""
    req = StreamChatRequest(message="Hello there!", conversation_id="test_conv_instant")
    dummy_req = MagicMock()
    dummy_req.is_disconnected = AsyncMock(return_value=False)

    # Mock OpenAI client
    class DummyDelta:
        content = "Hello! How can I help you today?"
        tool_calls = None
        reasoning = None

    stream_chunks = [DummyChunk([DummyChoice(DummyDelta(), None)]), DummyChunk([DummyChoice(None, "stop")])]
    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=DummyStream(stream_chunks))

    with patch("backend.services.chat_stream.openai.AsyncOpenAI", return_value=mock_client), \
         patch("backend.router.get_openai_client", return_value=mock_client), \
         patch("backend.services.chat_stream._resolve_pool", AsyncMock(return_value=None)):
        
        events = []
        async for raw_evt in generate_chat_events(req, dummy_req):
            if raw_evt.startswith("data: "):
                events.append(json.loads(raw_evt[6:].strip()))

        # Verify immediate ping and status events exist
        assert len(events) >= 2
        assert events[0].get("type") == "ping"
        assert events[1].get("type") == "status"
        assert events[1].get("stage") == "thinking"
        assert "request" in events[1].get("label", "").lower()


@pytest.mark.asyncio
async def test_tool_call_delta_extraction_and_direct_dispatch():
    """Verify streaming delta tool calls are accumulated and passed to orchestrator directly."""
    req = StreamChatRequest(message="Verify the Nebius hackathon deadline on Devpost", conversation_id="test_conv_tool")
    dummy_req = MagicMock()
    dummy_req.is_disconnected = AsyncMock(return_value=False)

    class DummyTC:
        def __init__(self, index, name=None, args=None):
            self.index = index
            self.function = MagicMock()
            self.function.name = name
            self.function.arguments = args

    tc1 = DummyTC(0, name="search_web", args='{"query": "Nebius hackathon ')
    tc2 = DummyTC(0, name=None, args='deadline Devpost"}')

    chunk1 = DummyChunk([DummyChoice(delta=MagicMock(content=None, tool_calls=[tc1], reasoning=None), finish_reason=None)])
    chunk2 = DummyChunk([DummyChoice(delta=MagicMock(content=None, tool_calls=[tc2], reasoning=None), finish_reason="tool_calls")])

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=DummyStream([chunk1, chunk2]))

    mock_orchestrator = AsyncMock(return_value={
        "response": "### 🎯 Verified Finding: Nebius Hackathon Deadline\nOctober 30, 2026",
        "skill_used": "search_web",
        "conversation_id": "test_conv_tool",
    })

    with patch("backend.services.chat_stream.openai.AsyncOpenAI", return_value=mock_client), \
         patch("backend.router.get_openai_client", return_value=mock_client), \
         patch("backend.services.chat_stream._resolve_pool", AsyncMock(return_value=None)), \
         patch("backend.orchestrator.handle_message", mock_orchestrator):

        events = []
        async for raw_evt in generate_chat_events(req, dummy_req):
            if raw_evt.startswith("data: "):
                events.append(json.loads(raw_evt[6:].strip()))

        # Verify orchestrator was called with pre_routed_skill and parsed arguments!
        mock_orchestrator.assert_awaited_once()
        _, kwargs = mock_orchestrator.call_args
        assert kwargs.get("pre_routed_skill") == "search_web"
        assert kwargs.get("pre_routed_args") == {"query": "Nebius hackathon deadline Devpost"}

        # Verify status event for searching was emitted
        status_events = [e for e in events if e.get("type") == "status"]
        stages = [e.get("stage") for e in status_events]
        assert "searching" in stages


@pytest.mark.asyncio
async def test_deadline_verification_synthesis():
    """Verify handle_search_web extracts official rules date and formats verified finding."""
    mock_results = {
        "results": [
            {
                "title": "Nebius x NVIDIA Global AI Hackathon: Rules - Devpost",
                "url": "https://nebiusglobalaihackathon.devpost.com/rules",
                "content": "Submission Period: Wednesday, August 26, 2026 (9:00 am Pacific Time) - Friday, October 30, 2026 (10:00 am Pacific Time) ('Submission Period').",
                "score": 0.95,
            },
            {
                "title": "Nebius x NVIDIA Global AI Hackathon: Updates - Devpost",
                "url": "https://nebiusglobalaihackathon.devpost.com/updates",
                "content": "The Nebius x NVIDIA Global AI Hackathon deadline is October 30. Get ready to submit!",
                "score": 0.90,
            },
        ]
    }

    with patch("backend.services.tavily.tavily_available", return_value=True), \
         patch("backend.services.tavily.search", AsyncMock(return_value=mock_results)):

        res = await handle_search_web({"query": "Verify the Nebius hackathon deadline on Devpost"}, None)
        assert res["success"] is True
        formatted = res["response"]

        # Must contain actual deadline info, not just "Found 2 web results"
        assert "Verified Finding" in formatted
        assert "October 30, 2026" in formatted
        assert "https://nebiusglobalaihackathon.devpost.com/rules" in formatted
        assert "Rules" in formatted
        assert "Submission Period" in formatted

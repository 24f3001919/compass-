"""
Tests for Agent Schedule Routing, Empty LLM Error State, and Stream Shape Parsing.

Verifies:
1. Schedule and task queries route to the ReAct agent, not the greeting handler.
2. Empty LLM output triggers an error state with can_retry=True, not the greeting fallback.
3. Actual greetings strictly trigger the greeting response.
4. Stream SSE events emit thought, token, and error shapes correctly.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.router_helpers import is_greeting_intent, is_schedule_or_agent_intent
from backend.router import route_message
import backend.orchestrator as orchestrator
from backend.services.chat_stream import generate_chat_events
from backend.models import StreamChatRequest
from fastapi import Request


def test_schedule_and_task_intent_detection():
    """Verify repro queries and variants are recognized as schedule/agent intents."""
    repro1 = "Please review my upcoming tasks and projects and propose a focus schedule for this week."
    repro2 = "Check my weekend schedule for conflicts across hackathon and coursework."
    
    assert is_schedule_or_agent_intent(repro1)
    assert is_schedule_or_agent_intent(repro2)
    assert not is_greeting_intent(repro1)
    assert not is_greeting_intent(repro2)

    assert is_schedule_or_agent_intent("What is my schedule for tomorrow?")
    assert is_schedule_or_agent_intent("Propose a schedule for my upcoming deadlines")
    assert is_schedule_or_agent_intent("Check for calendar clashes between hackathon and classes")


def test_greeting_intent_strictness():
    """Verify greeting detector only fires for actual greetings, never task/schedule inputs."""
    assert is_greeting_intent("hi")
    assert is_greeting_intent("hello compass")
    assert is_greeting_intent("hey there")
    assert is_greeting_intent("who are you?")
    assert is_greeting_intent("")
    assert is_greeting_intent("   ")

    # Actionable/task inputs must NEVER be classified as greetings
    assert not is_greeting_intent("Please review my upcoming tasks and projects and propose a focus schedule for this week.")
    assert not is_greeting_intent("Check my weekend schedule for conflicts across hackathon and coursework.")
    assert not is_greeting_intent("what are my tasks?")
    assert not is_greeting_intent("add a task buy groceries")


@pytest.mark.asyncio
async def test_schedule_intents_route_to_agent():
    """Verify route_message routes schedule planning queries to the 'agent' skill, not a greeting."""
    repro1 = "Please review my upcoming tasks and projects and propose a focus schedule for this week."
    skill, args, text = await route_message(repro1)
    assert skill == "agent"
    assert args is not None
    assert args.get("goal") == repro1
    assert text == ""

    repro2 = "Check my weekend schedule for conflicts across hackathon and coursework."
    skill, args, text = await route_message(repro2)
    assert skill == "agent"
    assert args is not None
    assert args.get("goal") == repro2
    assert text == ""


@pytest.mark.asyncio
async def test_empty_llm_output_triggers_error_state_not_greeting():
    """Verify empty LLM reply produces an error state with can_retry=True for non-greetings."""
    # Mock route_message to return empty text reply on a non-greeting message
    with patch("backend.orchestrator.route_message", new_callable=AsyncMock) as mock_route:
        mock_route.return_value = (None, None, "")
        
        result = await orchestrator.handle_message(
            conversation_id="conv-test",
            message="Please review my upcoming tasks and projects and propose a focus schedule for this week.",
            persist=False,
        )
        assert result["success"] is False
        assert result["error"] == "empty_model_response"
        assert result.get("data", {}).get("can_retry") is True
        assert "How can I help you today?" not in result["message"]
        assert "retry" in result["message"].lower()


@pytest.mark.asyncio
async def test_actual_greeting_returns_greeting_fallback():
    """Verify real greetings return the introductory greeting."""
    with patch("backend.orchestrator.route_message", new_callable=AsyncMock) as mock_route:
        mock_route.return_value = (None, None, "")
        
        result = await orchestrator.handle_message(
            conversation_id="conv-test",
            message="hello",
            persist=False,
        )
        assert result["success"] is True
        assert "How can I help you today?" in result["message"]


@pytest.mark.asyncio
async def test_stream_shape_emits_thought_and_tokens():
    """Verify chat_stream generates thought and token events for schedule queries."""
    req = StreamChatRequest(
        message="Please review my upcoming tasks and projects and propose a focus schedule for this week.",
        conversation_id="conv-stream-1",
    )
    request = MagicMock(spec=Request)
    request.is_disconnected = AsyncMock(return_value=False)

    fake_agent_result = {
        "conversation_id": "conv-stream-1",
        "response": "Here is your suggested focus schedule:\n- Mon: Work on Hackathon\n- Tue: CS Coursework",
        "skill_used": "agent",
        "success": True,
        "data": {
            "thought": "Thinking...\nTool: list_projects()\nTool: query_tasks()\nCritic: Schedule approved",
        },
    }

    with patch("backend.orchestrator.handle_message", new_callable=AsyncMock) as mock_handle:
        mock_handle.return_value = fake_agent_result

        events = []
        async for chunk in generate_chat_events(req, request):
            events.append(chunk)

        # Parse event types
        event_types = []
        thought_values = []
        token_values = []
        for ev in events:
            if not ev.startswith("data: "):
                continue
            payload = json.loads(ev[6:].strip())
            event_types.append(payload["type"])
            if payload["type"] == "thought":
                thought_values.append(payload["value"])
            elif payload["type"] == "token":
                token_values.append(payload["value"])

        assert "thought" in event_types
        assert "token" in event_types
        assert "done" in event_types
        assert any("Thinking" in t for t in thought_values)
        joined_tokens = "".join(token_values)
        assert "suggested focus schedule" in joined_tokens

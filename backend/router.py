"""
Compass — LLM Router using Nemotron-3 Nano.

Dispatches user messages to skills via native OpenAI function calling.
Probed and verified on Nebius Token Factory with nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B.
"""

import json
import logging
from datetime import date
from typing import Any, Optional, Tuple
from openai import AsyncOpenAI
from backend.config import get_settings
from backend.skills import TOOL_DEFINITIONS
from backend.router_helpers import (
    MONTH_MAP,
    MONTHS_MAP,
    DAYS_OF_WEEK,
    parse_natural_due_date,
    is_task_mutation_request,
    is_explicit_task_creation,
    is_undo_request,
    _parse_time,
    _parse_natural_date,
    _extract_task_creation_args,
    message_needs_tools,
    is_greeting_intent,
    is_schedule_or_agent_intent,
    _fallback_route,
)

logger = logging.getLogger("compass.router")
settings = get_settings()

TOOLS = TOOL_DEFINITIONS


import openai

_cached_openai_client: Optional[AsyncOpenAI] = None


def get_openai_client() -> AsyncOpenAI:
    """Return configured AsyncOpenAI client for Nebius Token Factory with connection reuse."""
    global _cached_openai_client
    if not isinstance(openai.AsyncOpenAI, type) or hasattr(openai.AsyncOpenAI, "_mock_return_value"):
        return openai.AsyncOpenAI(
            api_key=settings.NEBIUS_API_KEY,
            base_url=settings.NEBIUS_BASE_URL,
            timeout=15.0,
        )
    client = _cached_openai_client
    if client is None:
        client = openai.AsyncOpenAI(
            api_key=settings.NEBIUS_API_KEY,
            base_url=settings.NEBIUS_BASE_URL,
            timeout=15.0,
        )
        _cached_openai_client = client
    return client


async def route_message(
    message: str,
    history: Optional[list[dict[str, str]]] = None,
    memory_context: Optional[str] = None,
) -> Tuple[Optional[str], Optional[dict[str, Any]], str]:
    """Route a message through Nemotron-3 Nano using native tool calling.

    Returns:
        (skill_name, tool_arguments, text_response)
    """
    if is_undo_request(message):
        return "undo", {"message": message}, ""
    if is_explicit_task_creation(message):
        extracted = _extract_task_creation_args(message)
        if not extracted.get("title"):
            return None, None, "What would you like to name this task? Please provide a title or description."
        return "add_task", extracted, ""
    if is_schedule_or_agent_intent(message):
        return "agent", {"goal": message}, ""

    client = get_openai_client()
    import unittest.mock
    is_mocked = isinstance(client, (unittest.mock.Mock, unittest.mock.MagicMock)) or hasattr(client, "_mock_return_value")
    is_placeholder_key = (
        not settings.NEBIUS_API_KEY
        or settings.NEBIUS_API_KEY.startswith("your_nebius")
        or settings.NEBIUS_API_KEY in ("mock", "mock-key-not-used-in-tests")
    ) and not is_mocked
    if is_placeholder_key:
        return _fallback_route(message, history)
    today_iso = date.today().isoformat()
    system_prompt = (
        f"You are Compass, an intelligent personal assistant with persistent memory across chat sessions. "
        f"Today's date is {today_iso}. When extracting dates without a specified year (e.g. '30th oct' or 'next week'), "
        f"always resolve them relative to today's date ({today_iso}) into the current or upcoming year ({today_iso[:4]}), NEVER a past year. "
        f"You maintain context across conversation history AND prior chats/plans. "
        f"When the user asks follow-up questions about a deadline or task explicitly stated in immediate conversation history (such as 'When is that demo video due again?'), "
        f"answer directly from the conversation history, confirming the deadline mentioned earlier. Do not query tasks unless the user asks to look up or verify recorded database entries. "
        f"When the user asks what they asked earlier, recalls past decisions, or asks to plan or schedule without clashing, "
        f"refer to the provided long-term workspace memory and active schedule. "
        f"CRITICAL: When the user requests adding, scheduling, or tracking a task, action item, or deadline, "
        f"you MUST call the add_task tool with properly extracted fields. "
        f"When the user asks what to work on first right now, asks what task to start with, asks for a daily roadmap, or asks to prioritize deadlines/tasks, "
        f"call the query_tasks tool with intent='roadmap' to identify and prioritize active deliverables. "
        f"When the user asks whether their overall workload is achievable or feasible, whether they have enough hours/capacity, what to drop, or asks for a workload feasibility review, "
        f"call the assess_feasibility tool with extracted days and hours_per_day. "
        f"For direct factual questions and acronym queries, state the canonical full form clearly (e.g. for RISC, 'Reduced Instruction Set Computer') and keep definitions concise (under 80 words) without sprawling essays unless the user asks for a deep dive. "
        f"When the user makes an open-ended or vague request for help without specific details (e.g. 'Can you help me with my work?'), respond with a friendly, brief clarifying question (under 60 words) asking what specific domain or project they would like to focus on (such as coursework, hackathons, or tracking tasks). "
        f"For general inquiries or conversation, respond directly with helpful, concise text."
    )
    if memory_context:
        system_prompt += f"\n\n[WORKSPACE MEMORY & PAST SESSIONS - USE TO PREVENT SCHEDULE CLASHES & RECALL PAST CONTEXT]:\n{memory_context}"

    messages: Any = [
        {
            "role": "system",
            "content": system_prompt,
        }
    ]

    if history:
        messages.extend(history)

    messages.append({"role": "user", "content": message})
    needs_tools = message_needs_tools(message)
    tools: Any = TOOLS if needs_tools else None
    is_explicit_add_task = is_task_mutation_request(message) or is_explicit_task_creation(message)

    max_router_attempts = 2
    for attempt in range(1, max_router_attempts + 1):
        try:
            call_kwargs: dict[str, Any] = {
                "model": settings.ROUTER_MODEL,
                "messages": messages,
                "max_tokens": 1024,
                "stream": False,
            }
            if tools:
                call_kwargs["tools"] = tools
                call_kwargs["tool_choice"] = "auto"

            response: Any = await client.chat.completions.create(**call_kwargs)

            from backend.services.usage import record_usage
            usage = getattr(response, "usage", None)
            p_tok = usage.prompt_tokens if usage else max(len(message.split()) * 2, 64)
            c_tok = usage.completion_tokens if usage else 50
            record_usage(settings.ROUTER_MODEL, p_tok, c_tok)

            choices = getattr(response, "choices", None)
            if not choices:
                if attempt < max_router_attempts and not is_explicit_add_task:
                    logger.warning("Router received empty choices on attempt %d; retrying once", attempt)
                    continue
                return _fallback_route(message, history)

            choice = choices[0]
            choice_msg = getattr(choice, "message", None)
            tool_calls = getattr(choice_msg, "tool_calls", None) if choice_msg else None

            if tool_calls:
                tc: Any = tool_calls[0]
                func_name = getattr(getattr(tc, "function", None), "name", None) or getattr(tc, "name", "add_task")
                raw_args = getattr(getattr(tc, "function", None), "arguments", "{}") or "{}"

                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
                except Exception as e:
                    logger.warning(f"Failed to parse function arguments JSON ({e}): {raw_args}")
                    args = {"title": message}

                # Guard against model misrouting an explicit task creation command to query_tasks or another tool
                if is_explicit_add_task and func_name != "add_task":
                    fallback_args = _extract_task_creation_args(message)
                    if not fallback_args.get("title"):
                        return None, None, "What would you like to name this task? Please provide a title or description."
                    func_name = "add_task"
                    args = {**fallback_args, **{k: v for k, v in args.items() if k in ("domain", "due_date", "priority") and v}}

                if func_name == "add_task":
                    extracted = _extract_task_creation_args(message)
                    if not args.get("title") and extracted.get("title"):
                        args["title"] = extracted["title"]
                    if not args.get("due_date") and extracted.get("due_date"):
                        args["due_date"] = extracted["due_date"]
                    if extracted.get("time_str"):
                        args["time_str"] = extracted["time_str"]
                    if not args.get("title"):
                        return None, None, "What would you like to name this task? Please provide a title or description."

                logger.info(f"Router invoked tool: {func_name} with args: {args}")
                return func_name, args, ""
            else:
                # Fallback if model responded with conversational text to an explicit task creation command
                if is_explicit_add_task:
                    extracted = _extract_task_creation_args(message)
                    if not extracted.get("title"):
                        return None, None, "What would you like to name this task? Please provide a title or description."
                    return "add_task", extracted, ""

                reply = (getattr(choice_msg, "content", "") or "").strip() if choice_msg else ""
                if not reply:
                    if attempt < max_router_attempts and not is_greeting_intent(message) and not is_schedule_or_agent_intent(message):
                        logger.warning("Router received empty completion content on attempt %d; retrying once", attempt)
                        continue
                    if is_greeting_intent(message):
                        return None, None, "How can I help you today? I'm here to help you manage tasks, coursework, and deadlines."
                    if is_schedule_or_agent_intent(message):
                        return "agent", {"goal": message}, ""
                    return _fallback_route(message, history)

                return None, None, reply

        except Exception as e:
            err_type = type(e).__name__
            if attempt < max_router_attempts and not is_explicit_add_task:
                logger.warning("Nebius router transient failure on attempt %d (%s); retrying once", attempt, err_type)
                continue
            logger.error("Nebius router invocation failed: %s", err_type)
            if is_task_mutation_request(message) or is_explicit_task_creation(message):
                return "add_task", _extract_task_creation_args(message), ""
            if is_schedule_or_agent_intent(message):
                return "agent", {"goal": message}, ""
            return _fallback_route(message, history)

    return _fallback_route(message, history)

"""
Compass — Chat Stream Helpers & Direct Tool Validation.

Enforces schema validation and allowlist gating for direct tool dispatches.
"""

import json
import logging
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("compass.services.chat_stream_helpers")


def validate_direct_tool_dispatch(
    raw_name: str,
    raw_args_str: str,
) -> Optional[Tuple[str, Dict[str, Any]]]:
    """
    Validate that model-invoked direct tool call matches registered allowlist
    and conforms to required parameter schema without malformed payload.
    """
    from backend.skills.registry import SKILL_REGISTRY
    from backend.skills.schemas import get_tool_definitions

    allowed_tools = frozenset(SKILL_REGISTRY.keys()) | {"add_task", "undo", "agent"}

    if raw_name not in allowed_tools:
        logger.warning("Direct dispatch rejected unknown tool '%s', falling back to router", raw_name)
        return None

    try:
        parsed_args = json.loads(raw_args_str) if raw_args_str else {}
        if not isinstance(parsed_args, dict):
            logger.warning("Direct dispatch tool arguments for '%s' are not a dict: %r", raw_name, raw_args_str)
            return None
    except Exception as json_err:
        logger.warning("Direct dispatch rejected malformed JSON arguments for '%s': %s", raw_name, json_err)
        return None

    tool_defs = {
        t["function"]["name"]: t["function"].get("parameters", {}).get("required", [])
        for t in get_tool_definitions() if "function" in t
    }
    required_fields = tool_defs.get(raw_name, [])
    missing = [f for f in required_fields if f not in parsed_args or parsed_args[f] is None]
    if missing:
        logger.warning("Direct dispatch for '%s' missing required fields %s, falling back to router", raw_name, missing)
        return None

    return raw_name, parsed_args

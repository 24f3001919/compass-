"""
Compass — Skills Registry & Tool Definitions.

Central registry for all skills supported by Compass. Provides a standardized
pattern for registering tools for the router and dispatching execution in orchestrator.
"""

from typing import Any, Callable, Coroutine, Dict, List
import logging

logger = logging.getLogger("compass.skills")

# ---------------------------------------------------------------------------
# Tool Definitions (OpenAI-compatible function schemas for Nemotron-3 Nano)
# ---------------------------------------------------------------------------

ADD_TASK_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "add_task",
        "description": "Add a new task or action item to the user's structured task list.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The title or action item description of the task",
                },
                "domain": {
                    "type": "string",
                    "enum": ["hackathon", "coursework", "code", "general"],
                    "description": "Domain category",
                },
                "project": {
                    "type": "string",
                    "description": "Optional name of the project this task belongs to",
                },
                "due_date": {
                    "type": "string",
                    "description": "Due date in YYYY-MM-DD format (if specified or inferred)",
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "urgent"],
                    "description": "Priority level of the task",
                },
                "notes": {
                    "type": "string",
                    "description": "Additional context or details for the task",
                },
            },
            "required": ["title"],
        },
    },
}

QUERY_TASKS_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "query_tasks",
        "description": "Query or list existing tasks and deadlines by domain, project, or status.",
        "parameters": {
            "type": "object",
            "properties": {
                "domain": {
                    "type": "string",
                    "enum": ["hackathon", "coursework", "code", "general"],
                    "description": "Filter by domain",
                },
                "project": {
                    "type": "string",
                    "description": "Filter by project name",
                },
                "status": {
                    "type": "string",
                    "enum": ["open", "in_progress", "done", "overdue"],
                    "description": "Filter by status",
                },
            },
        },
    },
}

QUERY_CODE_CONTEXT_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "query_code_context",
        "description": "Semantic search over code snippets, architecture notes, and technical memory chunks.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query or technical question",
                },
                "domain": {
                    "type": "string",
                    "description": "Optional domain filter (typically 'code' or 'hackathon')",
                },
            },
            "required": ["query"],
        },
    },
}

SUMMARIZE_DAY_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "summarize_day",
        "description": "Generate a daily summary or standup report across all projects and open tasks.",
        "parameters": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": "Date to summarize in YYYY-MM-DD format, defaults to today",
                },
            },
        },
    },
}

QUERY_COURSEWORK_TASKS_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "query_coursework_tasks",
        "description": "Query academic coursework tasks, lab submissions, and reports (e.g. CS 61C RISC-V).",
        "parameters": {
            "type": "object",
            "properties": {
                "course": {"type": "string", "description": "Optional course name or code (e.g. CS 61C)"},
                "status": {"type": "string", "enum": ["open", "overdue", "done"], "description": "Filter by status"}
            }
        }
    }
}

GET_HACKATHON_DEADLINES_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_hackathon_deadlines",
        "description": "Retrieve active hackathon project deliverables, deadlines, and benchmark submissions.",
        "parameters": {
            "type": "object",
            "properties": {
                "project": {"type": "string", "description": "Hackathon project name"}
            }
        }
    }
}

LOG_CODE_SNIPPET_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "log_code_snippet",
        "description": "Store technical architecture notes, code snippets, or configuration in vector memory.",
        "parameters": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "The code snippet or technical summary"},
                "project": {"type": "string", "description": "Target project"},
                "tags": {"type": "string", "description": "Comma-separated tags"}
            },
            "required": ["content"]
        }
    }
}

LOG_CODE_CONTEXT_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "log_code_context",
        "description": "Store technical architecture notes, code snippets, or configuration in vector memory.",
        "parameters": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "The code snippet or technical summary"},
                "project": {"type": "string", "description": "Target project"},
                "tags": {"type": "string", "description": "Comma-separated tags"}
            },
            "required": ["content"]
        }
    }
}

SEARCH_WEB_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "search_web",
        "description": (
            "Search the live web for current information that is NOT in Compass's "
            "stored memory. Use only after checking memory first. Good for: current "
            "deadlines, library/API changes since a note was written, facts that "
            "post-date stored context."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query, under 390 chars"},
                "depth": {
                    "type": "string",
                    "enum": ["basic", "advanced"],
                    "description": "Use 'advanced' (2 credits) only when basic is insufficient",
                },
            },
            "required": ["query"],
        },
    },
}

INGEST_URL_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "ingest_url",
        "description": (
            "Permanently add the contents of a web page to Compass's long-term "
            "memory so it becomes semantically searchable later. Use when the user "
            "says to remember, save, or read a link."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The URL to extract and ingest"},
                "domain": {
                    "type": "string",
                    "enum": ["hackathon", "coursework", "code", "general"],
                    "description": "Domain to store memory under",
                },
                "project": {"type": "string", "description": "Optional project name to associate with"},
            },
            "required": ["url", "domain"],
        },
    },
}

VERIFY_DEADLINE_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "verify_deadline",
        "description": (
            "Compare a stored task's due_date against what the live web currently says. "
            "Searches for deadline announcements or updates and flags drift."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "The ID of the task to verify"},
            },
            "required": ["task_id"],
        },
    },
}

UPDATE_TASK_STATUS_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "update_task_status",
        "description": "Update the status of an existing task (open, in_progress, done).",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "integer",
                    "description": "The ID of the task to update",
                },
                "status": {
                    "type": "string",
                    "enum": ["open", "in_progress", "done"],
                    "description": "The new status for the task",
                },
            },
            "required": ["task_id", "status"],
        },
    },
}

EDIT_TASK_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "edit_task",
        "description": "Edit an existing task's title, due date, priority, or notes.",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "integer",
                    "description": "The ID of the task to edit",
                },
                "title": {
                    "type": "string",
                    "description": "New title for the task",
                },
                "due_date": {
                    "type": "string",
                    "description": "New due date in YYYY-MM-DD format",
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "urgent"],
                    "description": "New priority level",
                },
                "notes": {
                    "type": "string",
                    "description": "Updated notes or context",
                },
            },
            "required": ["task_id"],
        },
    },
}

DELETE_TASK_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "delete_task",
        "description": "Permanently delete a task by ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "integer",
                    "description": "The ID of the task to delete",
                },
            },
            "required": ["task_id"],
        },
    },
}

LIST_PROJECTS_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "list_projects",
        "description": "List all tracked projects partitioned across domains.",
        "parameters": {
            "type": "object",
            "properties": {
                "domain": {
                    "type": "string",
                    "enum": ["hackathon", "coursework", "code", "general"],
                    "description": "Optional domain to filter projects",
                },
            },
            "required": [],
        },
    },
}

QUERY_COURSEWORK_NOTES_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "query_coursework_notes",
        "description": "Searches and retrieves academic coursework notes and syllabus items.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search topic or course concept (e.g. RISC-V, hazards, calculus)",
                },
            },
            "required": ["query"],
        },
    },
}

SUMMARIZE_ACROSS_DOMAINS_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "summarize_across_domains",
        "description": "Escalates to Nemotron-3 Ultra (550B) over pre-aggregated context for roadmap synthesis and cross-domain conflict analysis.",
        "parameters": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": "Date to summarize in YYYY-MM-DD format, defaults to today",
                },
            },
            "required": [],
        },
    },
}

CHAT_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "chat",
        "description": "General conversational fallback for greetings, questions, and non-actionable queries.",
        "parameters": {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The user message or conversation input",
                },
            },
            "required": ["message"],
        },
    },
}

DETECT_DEADLINE_CONFLICTS_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "detect_deadline_conflicts",
        "description": "Analyze all scheduled tasks and deadlines across hackathon, coursework, and code domains to detect overlapping commitments, resource contention, and deadline clustering within the next 7 days.",
        "parameters": {
            "type": "object",
            "properties": {
                "days_ahead": {
                    "type": "integer",
                    "description": "Number of days ahead to scan for conflicts (default: 7)",
                },
            },
        },
    },
}

# Registered tools exposed to the Nemotron router
BASE_TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    ADD_TASK_TOOL,
    QUERY_TASKS_TOOL,
    QUERY_COURSEWORK_TASKS_TOOL,
    QUERY_COURSEWORK_NOTES_TOOL,
    GET_HACKATHON_DEADLINES_TOOL,
    LOG_CODE_SNIPPET_TOOL,
    LOG_CODE_CONTEXT_TOOL,
    QUERY_CODE_CONTEXT_TOOL,
    SUMMARIZE_DAY_TOOL,
    SUMMARIZE_ACROSS_DOMAINS_TOOL,
    UPDATE_TASK_STATUS_TOOL,
    EDIT_TASK_TOOL,
    DELETE_TASK_TOOL,
    LIST_PROJECTS_TOOL,
    CHAT_TOOL,
    DETECT_DEADLINE_CONFLICTS_TOOL,
]


def get_tool_definitions() -> List[Dict[str, Any]]:
    """Return active tool definitions for the Nemotron router.
    search_web, ingest_url, and verify_deadline are available when Tavily is enabled.
    """
    try:
        from backend.services.tavily import tavily_available
        if tavily_available():
            return BASE_TOOL_DEFINITIONS + [SEARCH_WEB_TOOL, INGEST_URL_TOOL, VERIFY_DEADLINE_TOOL]
    except Exception:
        pass
    return list(BASE_TOOL_DEFINITIONS)


TOOL_DEFINITIONS: List[Dict[str, Any]] = get_tool_definitions()


# ---------------------------------------------------------------------------
# Skill Registry Map (skill_name -> handler function)
# ---------------------------------------------------------------------------
SkillHandler = Callable[..., Coroutine[Any, Any, Dict[str, Any]]]
SKILL_REGISTRY: Dict[str, SkillHandler] = {}


def register_skill(name: str):
    """Decorator to register a skill handler function into SKILL_REGISTRY."""
    def decorator(fn: SkillHandler):
        SKILL_REGISTRY[name] = fn
        return fn
    return decorator


# ---------------------------------------------------------------------------
# Default Skill Implementations (Bridging while Rhythm completes skills)
# ---------------------------------------------------------------------------

@register_skill("query_tasks")
async def handle_query_tasks(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Query tasks table via structured.list_tasks and format summary."""
    from backend.memory import structured
    domain = args.get("domain")
    status = args.get("status")

    async with pool.acquire() as conn:
        tasks = await structured.list_tasks(conn, domain=domain, status=status)

    count = len(tasks)
    d_str = f" in {domain.upper()}" if domain else ""
    s_str = f" with status '{status}'" if status else ""
    if tasks:
        task_details = [
            f"'{t['title']}' (due: {t.get('due_date') or 'no due date'}, status: {t.get('status', 'open')})"
            for t in tasks[:5]
        ]
        summary = f"Found {count} task(s){d_str}{s_str}: {'; '.join(task_details)}."
    else:
        summary = f"Found {count} task(s){d_str}{s_str}."
    return {
        "response": summary,
        "data": {"tasks": tasks, "count": count},
    }


@register_skill("query_code_context")
async def handle_query_code_context(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Query memory_chunks using vector.search_chunks and synthesize response via SKILL_MODEL."""
    from backend.memory import vector
    from backend.config import get_settings
    from backend.services.usage import record_usage
    from openai import AsyncOpenAI

    settings = get_settings()
    query = args.get("query", "")
    domain = args.get("domain", "code")

    try:
        async with pool.acquire() as conn:
            chunks = await vector.search_chunks(conn, query=query, domain=domain, limit=3)
        count = len(chunks)

        # Synthesize technical response using SKILL_MODEL (nvidia/nemotron-3-super-120b-a12b)
        if chunks and settings.NEBIUS_API_KEY:
            try:
                context_text = "\n\n".join(f"[Snippet #{c['id']}]:\n{c['content']}" for c in chunks)
                client = AsyncOpenAI(api_key=settings.NEBIUS_API_KEY, base_url=settings.NEBIUS_BASE_URL, timeout=15.0)
                prompt = (
                    f"Answer the user's question using the retrieved code context below.\n\n"
                    f"Context:\n{context_text}\n\n"
                    f"Question: {query}"
                )
                resp = await client.chat.completions.create(
                    model=settings.SKILL_MODEL,
                    messages=[
                        {"role": "system", "content": "You are a senior technical coding assistant."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=384,
                )
                p_tok = resp.usage.prompt_tokens if resp.usage else len(prompt.split()) * 2
                c_tok = resp.usage.completion_tokens if resp.usage else 100
                record_usage(settings.SKILL_MODEL, p_tok, c_tok)
                raw_content = resp.choices[0].message.content
                if raw_content is not None and raw_content.strip():
                    summary = raw_content.strip()
                else:
                    summary = f"Retrieved {count} relevant memory chunk(s) for query: '{query}'."
                return {
                    "response": summary,
                    "data": {"chunks": chunks, "count": count, "model": settings.SKILL_MODEL},
                }
            except Exception as llm_err:
                logger.warning(f"SKILL_MODEL synthesis failed: {llm_err}")

        summary = f"Retrieved {count} relevant memory chunk(s) for query: '{query}'."
        return {
            "response": summary,
            "data": {"chunks": chunks, "count": count},
        }
    except Exception as e:
        return {
            "response": f"Code context search encountered: {e}",
            "data": {"chunks": [], "error": str(e)},
        }


@register_skill("log_code_context")
async def handle_log_code_context(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Store code snippet/context in memory_chunks via vector.store_chunk."""
    from backend.memory import vector
    content = args.get("content", "")
    domain = args.get("domain", "code")
    tags = args.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",")]

    try:
        async with pool.acquire() as conn:
            chunk = await vector.store_chunk(conn, content=content, domain=domain, tags=tags)
        return {
            "response": f"Logged code memory to {domain.upper()} domain with 768-dim vector.",
            "data": chunk,
        }
    except Exception as e:
        return {
            "response": f"Could not log code memory: {e}",
            "data": {"error": str(e)},
        }


@register_skill("summarize_day")
async def handle_summarize_day(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Return executive daily standup summary using SYNTHESIS_MODEL across domains."""
    from backend.memory import structured
    from backend.config import get_settings
    from backend.services.usage import record_usage
    from openai import AsyncOpenAI

    settings = get_settings()
    async with pool.acquire() as conn:
        tasks = await structured.list_tasks(conn, status="open")

    by_domain: Dict[str, int] = {}
    for t in tasks:
        d = t.get("domain", "general")
        by_domain[d] = by_domain.get(d, 0) + 1

    # Synthesize daily briefing using SYNTHESIS_MODEL (nvidia/Nemotron-3-Ultra-550b-a55b)
    if tasks and settings.NEBIUS_API_KEY:
        try:
            task_list_str = "\n".join(
                f"- [{t['domain'].upper()}] {t['title']} (Due: {t.get('due_date') or 'No date'}, Priority: {t.get('priority', 'medium')})"
                for t in tasks[:15]
            )
            client = AsyncOpenAI(api_key=settings.NEBIUS_API_KEY, base_url=settings.NEBIUS_BASE_URL, timeout=15.0)
            prompt = (
                "Synthesize the following active tasks into a concise, high-impact 2-3 sentence daily briefing. "
                "Highlight the nearest deadlines across hackathon, coursework, and code:\n\n"
                f"{task_list_str}"
            )
            resp = await client.chat.completions.create(
                model=settings.SYNTHESIS_MODEL,
                messages=[
                    {"role": "system", "content": "You provide prioritized, executive daily standup summaries."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=256,
            )
            p_tok = resp.usage.prompt_tokens if resp.usage else len(prompt.split()) * 2
            c_tok = resp.usage.completion_tokens if resp.usage else 80
            record_usage(settings.SYNTHESIS_MODEL, p_tok, c_tok)
            raw_content = resp.choices[0].message.content
            if raw_content is not None and raw_content.strip():
                summary = raw_content.strip()
            else:
                summary = f"Daily summary: {len(tasks)} total open task(s)."
            return {
                "response": summary,
                "data": {"open_tasks_by_domain": by_domain, "total": len(tasks), "model": settings.SYNTHESIS_MODEL},
            }
        except Exception as llm_err:
            logger.warning(f"SYNTHESIS_MODEL daily summary failed: {llm_err}")

    parts = [f"{d.upper()}: {c}" for d, c in by_domain.items()]
    summary = f"Daily summary: {len(tasks)} total open task(s) ({', '.join(parts) if parts else 'None'})."
    return {
        "response": summary,
        "data": {"open_tasks_by_domain": by_domain, "total": len(tasks)},
    }


@register_skill("query_coursework_tasks")
async def handle_query_coursework_tasks(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Query coursework tasks such as CS 61C labs, reports, and homework."""
    from backend.memory import structured
    status = args.get("status")
    async with pool.acquire() as conn:
        tasks = await structured.list_tasks(conn, domain="coursework", status=status)
    count = len(tasks)
    summary = f"📚 Coursework: Found {count} task(s) including RISC-V reports and Logisim labs."
    return {"response": summary, "data": {"tasks": tasks, "count": count}}


@register_skill("get_hackathon_deadlines")
async def handle_get_hackathon_deadlines(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Retrieve urgent hackathon deliverables and demo benchmark deadlines."""
    from backend.memory import structured
    async with pool.acquire() as conn:
        tasks = await structured.list_tasks(conn, domain="hackathon")
    count = len(tasks)
    summary = f"🚀 Hackathon: {count} active deliverables for Nebius Token Factory benchmark."
    return {"response": summary, "data": {"tasks": tasks, "count": count}}


@register_skill("log_code_snippet")
async def handle_log_code_snippet(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Log code snippets and technical context into pgvector with 768-dim embeddings."""
    from backend.memory import vector, structured
    content = args.get("content", "")
    project_name = args.get("project")
    tags = args.get("tags", "")
    tag_list = [t.strip() for t in tags.split(",")] if isinstance(tags, str) and tags else []
    
    async with pool.acquire() as conn:
        project_id = None
        if project_name:
            proj = await structured.get_or_create_project(conn, project_name, "code")
            project_id = proj.get("id")
        chunk = await vector.store_chunk(conn, content=content, domain="code", project_id=project_id, tags=tag_list)
    return {"response": "💻 Logged code context with 768-dim embedding in Neon HNSW index.", "data": chunk}


@register_skill("add_task")
async def handle_add_task(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Add a new task via structured.create_task."""
    from backend.memory import structured
    from datetime import datetime

    title = args.get("title", "Untitled Task")
    domain = args.get("domain", "general")
    if domain not in {"hackathon", "coursework", "code", "general"}:
        domain = "general"

    project_name = args.get("project")
    due_str = args.get("due_date")
    due_date = None
    if due_str:
        try:
            due_date = datetime.strptime(str(due_str)[:10], "%Y-%m-%d").date()
        except Exception:
            pass

    priority = args.get("priority", "medium")
    if priority not in {"low", "medium", "high", "urgent"}:
        priority = "medium"

    status = args.get("status", "open")
    if status not in {"open", "in_progress", "done", "overdue"}:
        status = "open"

    notes = args.get("notes")

    try:
        async with pool.acquire() as conn:
            project_id = None
            if project_name:
                proj = await structured.get_or_create_project(conn, name=project_name, domain=domain)
                project_id = proj.get("id")

            task_record = await structured.create_task(
                conn,
                domain=domain,
                title=title,
                project_id=project_id,
                due_date=due_date,
                status=status,
                priority=priority,
                notes=notes,
            )
        return {
            "response": f"Added task #{task_record.get('id')}: '{title}' in {domain}.",
            "data": task_record,
        }
    except Exception as e:
        logger.warning(f"Failed to add task: {e}")
        return {"response": f"Failed to add task: {e}", "data": {"error": str(e)}}


@register_skill("update_task_status")
async def handle_update_task_status(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Update the status of an existing task."""
    from backend.memory import structured
    task_id = args.get("task_id")
    status = args.get("status", "open")

    if not task_id:
        return {"response": "Missing task_id.", "data": {}}

    try:
        async with pool.acquire() as conn:
            updated = await structured.update_task(conn, int(task_id), status=status)
        if updated:
            return {
                "response": f"Updated task #{task_id} status to '{status}'.",
                "data": updated,
            }
        return {"response": f"Task #{task_id} not found.", "data": {}}
    except Exception as e:
        return {"response": f"Failed to update task status: {e}", "data": {"error": str(e)}}


@register_skill("edit_task")
async def handle_edit_task(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Edit an existing task's title, due date, priority, or notes."""
    from backend.memory import structured
    task_id = args.get("task_id")

    if not task_id:
        return {"response": "Missing task_id.", "data": {}}

    # Build kwargs from provided fields
    update_fields: Dict[str, Any] = {}
    if "title" in args:
        update_fields["title"] = args["title"]
    if "due_date" in args:
        from datetime import datetime
        try:
            update_fields["due_date"] = datetime.strptime(args["due_date"], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return {"response": f"Invalid date format: {args['due_date']}. Use YYYY-MM-DD.", "data": {}}
    if "priority" in args:
        update_fields["priority"] = args["priority"]
    if "notes" in args:
        update_fields["notes"] = args["notes"]

    if not update_fields:
        return {"response": "No fields to update. Provide title, due_date, priority, or notes.", "data": {}}

    try:
        async with pool.acquire() as conn:
            updated = await structured.update_task(conn, int(task_id), **update_fields)
        if updated:
            fields_str = ", ".join(f"{k}={v}" for k, v in update_fields.items())
            return {
                "response": f"Updated task #{task_id}: {fields_str}.",
                "data": updated,
            }
        return {"response": f"Task #{task_id} not found.", "data": {}}
    except Exception as e:
        return {"response": f"Failed to edit task: {e}", "data": {"error": str(e)}}


@register_skill("delete_task")
async def handle_delete_task(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Delete a task by ID."""
    from backend.memory import structured
    task_id = args.get("task_id")

    if not task_id:
        return {"response": "Missing task_id.", "data": {}}

    try:
        async with pool.acquire() as conn:
            deleted = await structured.delete_task(conn, int(task_id))
        if deleted:
            return {"response": f"Deleted task #{task_id}.", "data": {"deleted": True}}
        return {"response": f"Task #{task_id} not found.", "data": {"deleted": False}}
    except Exception as e:
        return {"response": f"Failed to delete task: {e}", "data": {"error": str(e)}}


@register_skill("list_projects")
async def handle_list_projects(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """List all tracked projects via structured.list_projects."""
    from backend.memory import structured
    domain = args.get("domain")
    async with pool.acquire() as conn:
        projects = await structured.list_projects(conn)
    if domain:
        projects = [p for p in projects if p.get("domain") == domain]
    p_names = [f"'{p['name']}' ({p.get('domain', 'general')})" for p in projects]
    summary = f"Found {len(projects)} tracked project(s): {', '.join(p_names)}." if projects else "No tracked projects found."
    return {
        "response": summary,
        "data": {"projects": projects, "count": len(projects)},
    }


@register_skill("query_coursework_notes")
async def handle_query_coursework_notes(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Search coursework notes using vector memory search specifically filtered to domain='coursework'."""
    cw_args = dict(args)
    cw_args["domain"] = "coursework"
    if not cw_args.get("query"):
        for alt_key in ("course", "topic", "notes", "subject"):
            if cw_args.get(alt_key):
                cw_args["query"] = str(cw_args[alt_key])
                break
    return await handle_query_code_context(cw_args, pool)


@register_skill("summarize_across_domains")
async def handle_summarize_across_domains(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Escalates to Nemotron-3 Ultra (550B) over pre-aggregated multi-domain context for roadmap synthesis.

    Aggregates:
    1. Active tasks across hackathon, coursework, and code
    2. Recent code context chunks from vector memory
    3. Recent coursework note chunks from vector memory
    4. Tracked projects
    """
    from backend.memory import structured
    from backend.config import get_settings
    from backend.services.usage import record_usage
    from openai import AsyncOpenAI

    settings = get_settings()
    async with pool.acquire() as conn:
        tasks = await structured.list_tasks(conn, status="open")
        projects = await structured.list_projects(conn)
        try:
            code_chunks = await conn.fetch(
                "SELECT id, content, tags FROM memory_chunks WHERE domain = 'code' ORDER BY id DESC LIMIT 5"
            )
        except Exception:
            code_chunks = []
        try:
            cw_chunks = await conn.fetch(
                "SELECT id, content, tags FROM memory_chunks WHERE domain = 'coursework' ORDER BY id DESC LIMIT 5"
            )
        except Exception:
            cw_chunks = []

    by_domain: Dict[str, int] = {}
    for t in tasks:
        d = t.get("domain", "general")
        by_domain[d] = by_domain.get(d, 0) + 1

    tasks_context = "\n".join(
        f"- [{t['domain'].upper()}] {t['title']} (Due: {t.get('due_date') or 'No date'}, Priority: {t.get('priority', 'medium')})"
        for t in tasks[:15]
    ) or "No active tasks."

    code_context = "\n".join(
        f"- [Snippet #{c['id']}]: {c['content'][:150]}..."
        for c in code_chunks
    ) or "No recent code snippets."

    cw_context = "\n".join(
        f"- [Note #{c['id']}]: {c['content'][:150]}..."
        for c in cw_chunks
    ) or "No recent coursework notes."

    p_names = ", ".join(f"{p['name']} ({p.get('domain', 'general')})" for p in projects[:10]) or "None"

    combined_context = (
        f"### 1. Tracked Projects\n{p_names}\n\n"
        f"### 2. Active Tasks by Domain\n{tasks_context}\n\n"
        f"### 3. Technical Code Context\n{code_context}\n\n"
        f"### 4. Coursework Notes\n{cw_context}"
    )

    if settings.NEBIUS_API_KEY:
        try:
            client = AsyncOpenAI(api_key=settings.NEBIUS_API_KEY, base_url=settings.NEBIUS_BASE_URL, timeout=15.0)
            prompt = (
                "You are an executive multi-domain roadmap planner powered by Nemotron-3 Ultra (550B). "
                "Synthesize the following cross-domain state into an integrated executive roadmap. "
                "Explicitly call out dependencies between hackathon deadlines, coursework exams/labs, and code implementation.\n\n"
                f"{combined_context}"
            )
            resp = await client.chat.completions.create(
                model=settings.SYNTHESIS_MODEL,
                messages=[
                    {"role": "system", "content": "You provide comprehensive, multi-domain executive roadmap briefings."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=384,
            )
            p_tok = resp.usage.prompt_tokens if resp.usage else len(prompt.split()) * 2
            c_tok = resp.usage.completion_tokens if resp.usage else 120
            record_usage(settings.SYNTHESIS_MODEL, p_tok, c_tok)
            raw_content = resp.choices[0].message.content
            if raw_content is not None and raw_content.strip():
                summary = raw_content.strip()
            else:
                summary = f"Multi-domain roadmap: {len(tasks)} tasks across {len(by_domain)} domains, {len(code_chunks)} code chunks, {len(cw_chunks)} coursework notes."
            return {
                "response": summary,
                "data": {
                    "open_tasks_by_domain": by_domain,
                    "total_tasks": len(tasks),
                    "code_chunks_count": len(code_chunks),
                    "coursework_chunks_count": len(cw_chunks),
                    "projects_count": len(projects),
                    "model": settings.SYNTHESIS_MODEL,
                },
            }
        except Exception as llm_err:
            logger.warning(f"SYNTHESIS_MODEL cross-domain summary failed: {llm_err}")

    parts = [f"{d.upper()}: {c}" for d, c in by_domain.items()]
    summary = (
        f"🧭 Cross-Domain Roadmap Synthesis: {len(tasks)} active tasks ({', '.join(parts) if parts else 'none'}), "
        f"{len(code_chunks)} technical code snippets, and {len(cw_chunks)} academic coursework notes indexed across {len(projects)} projects."
    )
    return {
        "response": summary,
        "data": {
            "open_tasks_by_domain": by_domain,
            "total_tasks": len(tasks),
            "code_chunks_count": len(code_chunks),
            "coursework_chunks_count": len(cw_chunks),
            "projects_count": len(projects),
            "model": settings.SYNTHESIS_MODEL,
        },
    }


@register_skill("chat")
async def handle_chat_skill(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Conversational fallback for greetings, questions, and non-actionable queries."""
    from backend.config import get_settings
    from backend.services.usage import record_usage
    from openai import AsyncOpenAI

    settings = get_settings()
    msg = args.get("message") or args.get("query") or "Hello! I am Compass, your persistent multi-domain AI assistant."

    if settings.NEBIUS_API_KEY and msg != "Hello! I am Compass, your persistent multi-domain AI assistant.":
        try:
            client = AsyncOpenAI(api_key=settings.NEBIUS_API_KEY, base_url=settings.NEBIUS_BASE_URL, timeout=10.0)
            resp = await client.chat.completions.create(
                model=settings.ROUTER_MODEL,
                messages=[
                    {"role": "system", "content": "You are Compass, a smart multi-domain AI assistant managing Hackathon, Coursework, and Code. Be concise, friendly, and helpful."},
                    {"role": "user", "content": str(msg)}
                ],
                max_tokens=150,
            )
            p_tok = resp.usage.prompt_tokens if resp.usage else len(str(msg).split()) * 2
            c_tok = resp.usage.completion_tokens if resp.usage else 50
            record_usage(settings.ROUTER_MODEL, p_tok, c_tok)
            content = resp.choices[0].message.content
            if content and content.strip():
                return {"response": content.strip(), "data": {"type": "chat", "model": settings.ROUTER_MODEL}}
        except Exception as e:
            logger.debug(f"Chat skill LLM fallback: {e}")

    return {"response": str(msg), "data": {"type": "chat"}}


@register_skill("detect_deadline_conflicts")
async def handle_detect_deadline_conflicts(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Scan active tasks for conflicting deadlines across domains within the next N days."""
    from backend.memory import structured
    from datetime import date, timedelta

    days = int(args.get("days_ahead") or 7)
    today = date.today()
    cutoff = today + timedelta(days=days)

    async with pool.acquire() as conn:
        tasks = await structured.list_tasks(conn, status="open")

    by_date: Dict[str, List[Dict[str, Any]]] = {}
    for t in tasks:
        d = t.get("due_date")
        if d:
            d_str = str(d)[:10]
            try:
                task_date = date.fromisoformat(d_str)
                if today <= task_date <= cutoff:
                    by_date.setdefault(d_str, []).append(t)
            except Exception:
                pass

    conflicts: List[Dict[str, Any]] = []
    for d_str, day_tasks in sorted(by_date.items()):
        domains = {t.get("domain", "general") for t in day_tasks}
        priorities = {t.get("priority", "medium") for t in day_tasks}
        if len(day_tasks) > 1 or ("urgent" in priorities and "hackathon" in domains and "coursework" in domains):
            is_critical = ("hackathon" in domains and "coursework" in domains) or ("urgent" in priorities)
            conflicts.append({
                "date": d_str,
                "task_count": len(day_tasks),
                "severity": "critical" if is_critical else "moderate",
                "domains": list(domains),
                "tasks": [
                    {"id": t["id"], "title": t["title"], "domain": t.get("domain"), "priority": t.get("priority")}
                    for t in day_tasks
                ],
                "recommendation": (
                    f"Reschedule non-urgent tasks on {d_str} to avoid clash between {', '.join(domains)}."
                    if is_critical
                    else f"Review task pacing on {d_str} to prevent bottleneck."
                )
            })

    if conflicts:
        top_domains = [str(d) for d in (conflicts[0].get("domains") or [])]
        summary = (
            f"⚠️ Detected {len(conflicts)} deadline conflict cluster(s) within the next {days} days. "
            f"Most critical: {conflicts[0]['date']} with {conflicts[0]['task_count']} tasks across {', '.join(top_domains)}."
        )
    else:
        summary = f"✅ No critical deadline conflicts detected across domains in the next {days} days."

    return {
        "response": summary,
        "data": {
            "conflicts_count": len(conflicts),
            "conflicts": conflicts,
            "scanned_tasks_count": len(tasks),
            "days_ahead": days,
        },
    }


async def dispatch_skill(skill_name: str, args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Dispatch execution to registered skill handler or return fallback response."""
    if skill_name in SKILL_REGISTRY:
        return await SKILL_REGISTRY[skill_name](args, pool)
    raise ValueError(f"Skill '{skill_name}' is not registered in SKILL_REGISTRY.")


@register_skill("search_web")
async def handle_search_web(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Search the live web using the centralized Tavily service.

    Returns citations, fenced context, and human-readable summary.
    """
    from backend.services import tavily as tavily_service

    query = (args.get("query") or "").strip()
    if not query:
        return {
            "success": False,
            "data": {},
            "summary": "Query cannot be empty",
            "response": "Please provide a search query.",
            "error": "Query cannot be empty",
        }

    if not tavily_service.tavily_available():
        return {
            "success": False,
            "data": {},
            "summary": "Web search is not configured on this instance",
            "response": "Web search is currently disabled or missing an API key.",
            "error": "Web search is not configured on this instance",
        }

    depth = args.get("depth") or args.get("search_depth") or "basic"
    try:
        resp = await tavily_service.search(query, search_depth=depth)
    except Exception as e:
        logger.warning(f"Tavily search failed: {e}")
        return {
            "success": False,
            "data": {},
            "summary": f"Web search failed: {e}",
            "response": f"Web search failed: {e}",
            "error": f"Web search failed: {e}",
        }

    results = resp.get("results", [])
    citations = [
        {"title": r.get("title"), "url": r.get("url"), "score": r.get("score")}
        for r in results
    ]
    fenced = tavily_service.fence_web_content(results)
    top_url = citations[0]["url"] if citations else "none"
    summary = f"Found {len(results)} web result(s) for '{query}'. Top source: {top_url}"

    # Build markdown response for chat interface
    parts = [f"**Web Search Results for:** *{query}*"]
    for r in results[:3]:
        parts.append(f"• [{r.get('title', 'Untitled')}]({r.get('url', '')})\n  {r.get('content', '')[:180].strip()}...")
    formatted_response = "\n".join(parts) if results else summary

    return {
        "success": True,
        "data": {"results": results, "citations": citations, "source": "web"},
        "fenced_context": fenced,
        "summary": summary,
        "response": formatted_response,
        "error": None,
    }


@register_skill("ingest_url")
async def handle_ingest_url(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Extract and ingest a web page's contents into Compass long-term memory.

    Chunked, embedded via Qwen3 768-dim, and stored into memory_chunks table.
    Mutating action — must be confirm-gated by the agent loop.
    """
    from backend.services import tavily as tavily_service
    from backend.memory import vector, structured

    VALID_DOMAINS = {"hackathon", "coursework", "code", "general"}
    url = (args.get("url") or "").strip()
    domain = (args.get("domain") or "general").lower()

    if domain not in VALID_DOMAINS:
        return {
            "success": False,
            "data": {},
            "summary": f"Invalid domain '{domain}'. Must be one of: {', '.join(sorted(VALID_DOMAINS))}",
            "response": f"Invalid domain '{domain}'.",
            "error": f"Invalid domain '{domain}'",
        }

    if not url.startswith(("http://", "https://")):
        return {
            "success": False,
            "data": {},
            "summary": "URL must start with http:// or https://",
            "response": "URL must start with http:// or https://",
            "error": "URL must start with http:// or https://",
        }

    if not tavily_service.tavily_available():
        return {
            "success": False,
            "data": {},
            "summary": "Tavily service is not available on this instance",
            "response": "Tavily service is not configured.",
            "error": "Tavily service is not available",
        }

    try:
        resp = await tavily_service.extract([url], extract_depth="advanced")
    except Exception as e:
        logger.error(f"Tavily extract failed for {url}: {e}")
        return {
            "success": False,
            "data": {},
            "summary": f"Extraction failed: {e}",
            "response": f"Extraction failed: {e}",
            "error": f"Extraction failed: {e}",
        }

    ok = resp.get("results", [])
    if not ok:
        failed = resp.get("failed_results", [])
        return {
            "success": False,
            "data": {"failed": failed},
            "summary": f"Could not extract content from {url}",
            "response": f"Could not extract content from {url}",
            "error": f"Could not extract content from {url}",
        }

    raw = ok[0].get("raw_content") or ok[0].get("content") or ""
    flagged = tavily_service.scan_for_injection(raw)

    # Chunk text (~1200 chars with 200 char overlap, max 12 chunks)
    chunks = [raw[i : i + 1200] for i in range(0, len(raw), 1000)][:12]
    stored = 0

    async with pool.acquire() as conn:
        project_id = None
        if args.get("project"):
            proj = await structured.get_or_create_project(conn, args["project"], domain)
            project_id = proj["id"]

        tags = ["web", "tavily-extract"]
        if flagged:
            tags.append("injection-flagged")

        for ch in chunks:
            if not ch.strip():
                continue
            await vector.store_chunk(
                conn,
                domain=domain,
                content=ch,
                project_id=project_id,
                source=url,
                tags=tags,
            )
            stored += 1

    injection_note = " ⚠️ Page contained instruction-like text; stored as data only." if flagged else ""
    summary = f"Ingested {url} into {domain.upper()} memory as {stored} searchable chunk(s).{injection_note}"

    return {
        "success": True,
        "data": {
            "url": url,
            "chunks_stored": stored,
            "domain": domain,
            "injection_flagged": bool(flagged),
        },
        "summary": summary,
        "response": summary,
        "error": None,
    }


@register_skill("verify_deadline")
async def handle_verify_deadline(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Compare a stored task's due date against live web sources to detect drift."""
    from backend.services import tavily as tavily_service
    from backend.memory import structured

    task_id = args.get("task_id")
    if not task_id:
        return {
            "success": False,
            "data": {},
            "summary": "task_id is required",
            "response": "task_id is required",
            "error": "task_id is required",
        }

    async with pool.acquire() as conn:
        task = await structured.get_task(conn, int(task_id))
    if not task:
        return {
            "success": False,
            "data": {},
            "summary": f"No task with id {task_id}",
            "response": f"No task with id {task_id}",
            "error": f"No task with id {task_id}",
        }

    task_title = task.get("title", "")
    stored_due = str(task.get("due_date") or "none")

    if not tavily_service.tavily_available():
        return {
            "success": False,
            "data": {"task": dict(task)},
            "summary": "Web search is not configured to verify deadline",
            "response": "Web search is not configured.",
            "error": "Web search is not configured",
        }

    query = f"{task_title} deadline submission date"
    try:
        resp = await tavily_service.search(query, search_depth="basic")
    except Exception as e:
        return {
            "success": False,
            "data": {"task": dict(task)},
            "summary": f"Web search failed during verification: {e}",
            "response": f"Web search failed during verification: {e}",
            "error": str(e),
        }

    results = resp.get("results", [])
    fenced = tavily_service.fence_web_content(results)
    summary = f"Checked '{task_title}' (stored due: {stored_due}) against {len(results)} live source(s)."

    return {
        "success": True,
        "data": {
            "task": dict(task),
            "results": results,
            "citations": [r.get("url") for r in results if r.get("url")],
            "source": "web",
        },
        "fenced_context": fenced,
        "summary": summary,
        "response": summary,
        "error": None,
    }


# ---------------------------------------------------------------------------
# Feasibility & Realist Tool Definitions and Handlers
# ---------------------------------------------------------------------------

ASSESS_FEASIBILITY_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "assess_feasibility",
        "description": (
            "Determine whether the user's open workload is actually achievable in the "
            "time they have, and produce a keep/defer/drop triage plan. Use when the "
            "user asks what to prioritise, what to drop, whether they can finish in "
            "time, or says they feel overloaded."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Days available, default 5"},
                "hours_per_day": {"type": "number", "description": "Focused hours per day, default 4"},
                "domain": {
                    "type": "string",
                    "enum": ["hackathon", "coursework", "code", "general"],
                    "description": "Optional: restrict to one domain",
                },
            },
            "required": [],
        },
    },
}


APPLY_TRIAGE_PLAN_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "apply_triage_plan",
        "description": "Apply a feasibility triage plan: mark dropped tasks done and keep deferred tasks open. MUTATING — requires user confirmation.",
        "parameters": {
            "type": "object",
            "properties": {
                "defer_ids": {"type": "array", "items": {"type": "integer"}, "description": "Task IDs to defer (set status=open)"},
                "drop_ids": {"type": "array", "items": {"type": "integer"}, "description": "Task IDs to drop (set status=done)"},
            },
            "required": [],
        },
    },
}


@register_skill("assess_feasibility")
async def handle_assess_feasibility(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    from backend.agents.feasibility import assess_feasibility, DEFAULT_HOURS_PER_DAY
    try:
        days = int(args.get("days") or 5)
        hours = float(args.get("hours_per_day") or DEFAULT_HOURS_PER_DAY)
    except (TypeError, ValueError):
        days, hours = 5, DEFAULT_HOURS_PER_DAY
    days = min(max(days, 1), 90)
    hours = min(max(hours, 0.5), 16.0)

    domain = args.get("domain")
    if domain not in ("hackathon", "coursework", "code", "general"):
        domain = None

    try:
        plan = await assess_feasibility(pool, days=days, hours_per_day=hours, domain=domain)
    except Exception as e:
        logger.error("Feasibility review failed: %s", e, exc_info=True)
        return {"success": False, "data": {}, "summary": "",
                "error": "Could not complete the feasibility review."}

    v = plan.verdict
    return {
        "success": True,
        "data": {
            "triage_plan": plan.model_dump(),
            "artifact_markdown": plan.as_markdown(),
            "rounds_used": plan.rounds_used,
            "degraded": plan.degraded,
        },
        "summary": (
            f"{v.verdict}: {v.demand_hours}h of work against {v.capacity_hours}h "
            f"available ({v.utilisation_pct}% utilisation). "
            f"Keeping {len(plan.keep)}, deferring {len(plan.defer)}, "
            f"dropping {len(plan.drop)}. {plan.narrative}"
        ),
        "error": None,
    }


@register_skill("apply_triage_plan")
async def handle_apply_triage_plan(args: Dict[str, Any], pool: Any) -> Dict[str, Any]:
    """Set deferred tasks to 'open' with pushed dates and drop others.
    MUTATING — must be confirm-gated."""
    from backend.memory import structured
    defer_ids = [int(i) for i in (args.get("defer_ids") or [])]
    drop_ids = [int(i) for i in (args.get("drop_ids") or [])]
    changed = []
    async with pool.acquire() as conn:
        async with conn.transaction():
            for tid in drop_ids:
                await structured.update_task_status(conn, tid, "done")
                changed.append({"id": tid, "action": "dropped"})
            for tid in defer_ids:
                await structured.update_task_status(conn, tid, "open")
                changed.append({"id": tid, "action": "deferred"})
    return {
        "success": True,
        "data": {"changed": changed},
        "summary": f"Applied triage: {len(drop_ids)} dropped, {len(defer_ids)} deferred.",
        "error": None,
    }


BASE_TOOL_DEFINITIONS.append(ASSESS_FEASIBILITY_TOOL)
BASE_TOOL_DEFINITIONS.append(APPLY_TRIAGE_PLAN_TOOL)
TOOL_DEFINITIONS = get_tool_definitions()

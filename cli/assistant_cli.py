# -*- coding: utf-8 -*-
"""
Compass — CLI Interface.

Interactive command-line client for the Compass personal AI assistant.
Communicates with the backend at http://localhost:8000 via httpx.

Usage:
    compass --help          Show all available commands
    compass --version       Show version
    compass login           Obtain caller's own signed guest identity
    compass chat            Interactive conversation REPL
    compass ask "question"  One-shot question
    compass tasks           View current tasks
    compass add "title"     Add a new task
    compass projects        List tracked projects
    compass log "summary"   Log a memory entry
    compass status          Dashboard overview
    compass agent "goal"    Autonomous ReAct planner
    compass triage          Feasibility triage
    compass admin usage     Admin usage statistics (requires AUTH_TOKEN)

Install:
    pip install -e ./cli
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Optional

# Fix Windows console encoding before importing Rich
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

import httpx
import typer
from dotenv import load_dotenv
from rich import box
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table
from rich.text import Text

# Python 3.11+ tomllib or fallback
try:
    import tomllib  # type: ignore[import-not-found]
except ImportError:
    try:
        import tomli as tomllib  # type: ignore[no-redef]
    except ImportError:
        tomllib = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Load environment & persistent config (~/.compass)
# ---------------------------------------------------------------------------
load_dotenv()

CONFIG_DIR = Path.home() / ".compass"
CONFIG_FILE = CONFIG_DIR / "config.toml"
CREDENTIALS_FILE = CONFIG_DIR / "credentials.json"


def _secure_file_permissions(path: Path) -> None:
    """Set owner-only permissions (Windows ACL or 0600 on POSIX)."""
    try:
        if sys.platform == "win32":
            import subprocess
            username = os.environ.get("USERNAME") or os.environ.get("USER")
            if username:
                subprocess.run(
                    ["icacls", str(path), "/inheritance:r", "/grant:r", f"{username}:(R,W)"],
                    capture_output=True,
                    check=False,
                )
        else:
            os.chmod(path, 0o600)
    except Exception:
        pass


def load_config() -> str:
    """Read API base URL from ~/.compass/config.toml, env vars, or defaults."""
    api_url = os.getenv("COMPASS_API_URL")

    if CONFIG_FILE.exists():
        try:
            content = CONFIG_FILE.read_text(encoding="utf-8")
            if tomllib:
                cfg = tomllib.loads(content)
                api_url = api_url or cfg.get("api_url")
            else:
                for line in content.splitlines():
                    line = line.strip()
                    if line.startswith("api_url"):
                        api_url = api_url or line.split("=", 1)[1].strip().strip('"').strip("'")
        except Exception:
            pass

    return (api_url or os.getenv("COMPASS_API_URL") or "http://localhost:8000").strip().rstrip("/")


def save_config(api_url: str) -> None:
    """Save API base URL to ~/.compass/config.toml."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    content = f'api_url = "{api_url}"\n'
    CONFIG_FILE.write_text(content, encoding="utf-8")


def load_credentials() -> dict:
    """Read caller's credentials from ~/.compass/credentials.json or env vars."""
    creds = {}
    if CREDENTIALS_FILE.exists():
        try:
            creds = json.loads(CREDENTIALS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    if os.getenv("GUEST_TOKEN"):
        creds["guest_token"] = os.getenv("GUEST_TOKEN")
    if os.getenv("GUEST_ID"):
        creds["guest_id"] = os.getenv("GUEST_ID")
    if os.getenv("COMPASS_SESSION"):
        creds["session_token"] = os.getenv("COMPASS_SESSION")
    return creds


def save_credentials(data: dict) -> None:
    """Persist caller's credentials with owner-only permissions."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CREDENTIALS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    _secure_file_permissions(CREDENTIALS_FILE)


def _mask_token(tok: Optional[str]) -> str:
    """Mask token without revealing length."""
    if not tok:
        return "[NOT SET]"
    return "[CONFIGURED]"


API_BASE = load_config()

from cli.cli_formatters import (
    DOMAIN_COLORS,
    DOMAIN_EMOJI,
    PRIORITY_STYLE,
    STATUS_EMOJI,
    STEP_COLORS,
    console,
    console_err,
    format_domain_text,
    render_agent_activity_table,
    render_agent_runs_table,
    render_agent_stats_view,
    render_briefing_panel,
    render_projects_view,
    render_status_dashboard,
    render_tasks_table,
    render_usage_tables,
)
from cli.cli_agent_runner import (
    run_feasibility_triage_session,
    run_interactive_agent_session,
)

_domain_text = format_domain_text


def _check_connected_banner():
    """Print visible banner when connecting to remote production host."""
    if API_BASE and "localhost" not in API_BASE and "127.0.0.1" not in API_BASE:
        console.print(f"[bold yellow]Connected to {API_BASE}[/]")


def version_callback(value: bool):
    """Print CLI version and exit cleanly."""
    if value:
        console.print("Compass CLI 0.1.0")
        raise typer.Exit()


# ---------------------------------------------------------------------------
# Typer App
# ---------------------------------------------------------------------------
app = typer.Typer(
    name="compass",
    help="🧭 Compass — Your personal AI assistant CLI",
    no_args_is_help=True,
    rich_markup_mode="rich",
)


@app.callback()
def main(
    version: Optional[bool] = typer.Option(
        None, "--version", "-v", help="Show CLI version and exit", callback=version_callback, is_eager=True
    ),
):
    """Compass — Personal AI Assistant CLI."""
    _check_connected_banner()


# ---------------------------------------------------------------------------
# HTTP Helpers
# ---------------------------------------------------------------------------

def _headers(admin: bool = False, admin_token: Optional[str] = None) -> dict:
    """Return auth headers for API requests.
    
    Normal commands send the caller's guest/session token.
    Admin commands send master AUTH_TOKEN only when explicitly provided.
    """
    if admin:
        token = admin_token or os.getenv("AUTH_TOKEN")
        if not token:
            console_err.print(
                "[compass.error]❌ AUTH_TOKEN required for admin commands. "
                "Provide via --token flag or AUTH_TOKEN environment variable.[/]"
            )
            raise typer.Exit(1)
        return {"Authorization": f"Bearer {token}"}

    creds = load_credentials()
    guest_token = creds.get("guest_token")
    session_token = creds.get("session_token")
    env_token = os.getenv("AUTH_TOKEN") or os.getenv("COMPASS_AUTH_TOKEN")

    if guest_token:
        return {
            "x-guest-token": guest_token,
            "Authorization": f"Bearer {guest_token}",
        }
    elif session_token:
        return {
            "Authorization": f"Bearer {session_token}",
        }
    elif env_token:
        return {
            "Authorization": f"Bearer {env_token}",
        }
    else:
        console_err.print(
            "[compass.error]❌ Not authenticated. Run 'compass login' to initialize your guest session.[/]"
        )
        raise typer.Exit(1)


def _handle_http_error(e: httpx.HTTPStatusError):
    """Format and print HTTP error with status code and Retry-After if present."""
    retry_after = e.response.headers.get("Retry-After")
    detail = e.response.text
    try:
        d = e.response.json()
        if isinstance(d, dict) and "detail" in d:
            detail = str(d["detail"])
    except Exception:
        pass

    msg = f"❌ API error {e.response.status_code}: {detail}"
    if retry_after:
        msg += f" (Retry-After: {retry_after}s)"
    console_err.print(f"[compass.error]{msg}[/]")
    raise typer.Exit(1)


def _get(path: str, params: dict | None = None, headers: dict | None = None) -> dict:
    """Make an authenticated GET request to the backend."""
    h = headers or _headers()
    try:
        resp = httpx.get(f"{API_BASE}{path}", headers=h, params=params, timeout=30.0)
        resp.raise_for_status()
        return resp.json()
    except (httpx.ConnectError, httpx.TimeoutException) as e:
        console_err.print(f"[compass.error]❌ Cannot connect to backend at {API_BASE} (error: {e}). Is the server running?[/]")
        raise typer.Exit(1)
    except httpx.HTTPStatusError as e:
        _handle_http_error(e)
        return {}


def _post(path: str, data: dict, headers: dict | None = None) -> dict:
    """Make an authenticated POST request to the backend."""
    h = headers or _headers()
    try:
        resp = httpx.post(f"{API_BASE}{path}", headers=h, json=data, timeout=30.0)
        resp.raise_for_status()
        return resp.json()
    except (httpx.ConnectError, httpx.TimeoutException) as e:
        console_err.print(f"[compass.error]❌ Cannot connect to backend at {API_BASE} (error: {e}). Is the server running?[/]")
        raise typer.Exit(1)
    except httpx.HTTPStatusError as e:
        _handle_http_error(e)
        return {}


def _stream_chat(payload: dict) -> tuple[str, str | None, str | None]:
    """Consume the SSE streaming endpoint /api/chat/stream, printing tokens live.

    Returns (full_response, conversation_id, skill_used).
    On Ctrl+C, exits cleanly with code 130 and no traceback.
    On partial errors, preserves output and exits non-zero.
    """
    url = f"{API_BASE}/api/chat/stream"
    full_text = []
    conv_id = payload.get("conversation_id")
    skill_used = None

    try:
        try:
            req_headers = _headers()
        except typer.Exit:
            res = _post("/chat", payload)
            resp_text = res.get("response", "")
            console.print(resp_text)
            return resp_text, res.get("conversation_id"), res.get("skill_used")

        with httpx.stream("POST", url, headers=req_headers, json=payload, timeout=60.0) as resp:
            if resp.status_code != 200:
                try:
                    res = _post("/chat", payload)
                    resp_text = res.get("response", "")
                    console.print(resp_text)
                    return resp_text, res.get("conversation_id"), res.get("skill_used")
                except Exception:
                    _handle_http_error(httpx.HTTPStatusError("Stream error", request=resp.request, response=resp))

            for line in resp.iter_lines():
                if not line or not line.startswith("data: "):
                    continue
                try:
                    ev = json.loads(line[6:])
                except Exception:
                    continue

                ev_type = ev.get("type")
                if ev_type == "token":
                    val = ev.get("value", "")
                    console.print(val, end="", markup=False)
                    full_text.append(val)
                elif ev_type == "done":
                    conv_id = ev.get("conversation_id", conv_id)
                    skill_used = ev.get("skill_used")
                elif ev_type == "error":
                    err_msg = ev.get("message", "Unknown error")
                    if not full_text:
                        try:
                            res = _post("/chat", payload)
                            resp_text = res.get("response", "")
                            console.print(resp_text)
                            return resp_text, res.get("conversation_id"), res.get("skill_used")
                        except Exception:
                            pass
                    console_err.print(f"\n[compass.error]Error: {err_msg}[/]")
                    if full_text:
                        console.print()
                    raise typer.Exit(1)

            console.print()
            return "".join(full_text), conv_id, skill_used

    except KeyboardInterrupt:
        if full_text:
            console.print()
        console_err.print("\n[dim]Cancelled.[/]")
        raise typer.Exit(130)
    except httpx.HTTPStatusError as e:
        if full_text:
            console.print()
        _handle_http_error(e)
        return "", None, None
    except (httpx.ConnectError, httpx.TimeoutException) as e:
        if not full_text:
            try:
                res = _post("/chat", payload)
                resp_text = res.get("response", "")
                console.print(resp_text)
                return resp_text, res.get("conversation_id"), res.get("skill_used")
            except typer.Exit:
                raise
            except Exception:
                pass
        if full_text:
            console.print()
        console_err.print(f"[compass.error]❌ Cannot connect to backend at {API_BASE} (error: {e}). Is the server running?[/]")
        raise typer.Exit(1)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


@app.command()
def login(
    url: Optional[str] = typer.Option(None, "--url", "-u", help="Set the Compass API base URL"),
    token: Optional[str] = typer.Option(None, "--token", "-t", help="Existing session token (optional)"),
):
    """🔐 Obtain caller's own signed guest identity or configure session."""
    global API_BASE
    if url:
        API_BASE = url.strip().rstrip("/")
        save_config(API_BASE)

    if token:
        save_credentials({"session_token": token.strip()})
        console.print("[compass.success]✅ Session token saved with owner-only permissions.[/]")
        console.print(f"   API URL: {API_BASE}")
        console.print(f"   Token:   {_mask_token(token)}")
        return

    console.print(f"[bold cyan]🧭 Obtaining new guest session from {API_BASE}...[/]")
    try:
        resp = httpx.post(f"{API_BASE}/api/guest/session", timeout=15.0)
        resp.raise_for_status()
        data = resp.json()
        gid = data.get("guest_id")
        gtok = data.get("guest_token")
        if not gid or not gtok:
            console_err.print("[compass.error]❌ Invalid response from guest session endpoint.[/]")
            raise typer.Exit(1)

        save_credentials({"guest_id": gid, "guest_token": gtok})
        console.print("[compass.success]✅ Logged in successfully![/]")
        console.print(f"   Base URL: {API_BASE}")
        console.print(f"   Guest ID: {gid[:8]}...")
        console.print(f"   Token:    {_mask_token(gtok)}")
    except httpx.HTTPStatusError as e:
        _handle_http_error(e)
    except (httpx.ConnectError, httpx.TimeoutException):
        console_err.print(f"[compass.error]❌ Cannot connect to backend at {API_BASE}. Is the server running?[/]")
        raise typer.Exit(1)


@app.command()
def chat():
    """💬 Interactive conversation with Compass (streaming tokens live)."""
    console.print(Panel(
        "[compass.title]🧭 Compass Chat[/]\n"
        "Type your message and press Enter. Type [bold]quit[/] or [bold]exit[/] to leave.",
        border_style="cyan",
    ))

    conversation_id: str | None = None

    while True:
        try:
            user_input = Prompt.ask("\n[bold cyan]You[/]")
        except (KeyboardInterrupt, EOFError):
            console.print("\n[dim]Goodbye! 👋[/]")
            break

        if user_input.strip().lower() in ("quit", "exit", "q"):
            console.print("[dim]Goodbye! 👋[/]")
            break

        if not user_input.strip():
            continue

        payload = {"message": user_input}
        if conversation_id:
            payload["conversation_id"] = conversation_id

        console.print("\n[bold green]Compass[/]: ", end="")
        _, new_conv_id, skill = _stream_chat(payload)
        if new_conv_id:
            conversation_id = new_conv_id
        if skill:
            console.print(f"[dim]({skill})[/]")


@app.command()
def ask(
    query: str = typer.Argument(..., help="Your question for Compass"),
):
    """❓ Ask a one-shot question (streamed live from Nebius Token Factory)."""
    console.print("\n[bold green]Compass[/]: ", end="")
    _, _, skill = _stream_chat({"message": query})
    if skill:
        console.print(f"[dim]({skill})[/]")


@app.command()
def add(
    title: str = typer.Argument(..., help="Task title"),
    domain: str = typer.Option("general", "--domain", "-d", help="Domain: hackathon, coursework, code, general"),
    project: Optional[str] = typer.Option(None, "--project", "-p", help="Project name"),
    due: Optional[str] = typer.Option(None, "--due", help="Due date (YYYY-MM-DD)"),
    priority: Optional[str] = typer.Option(None, "--priority", help="Priority: urgent, high, medium, low"),
    notes: Optional[str] = typer.Option(None, "--notes", "-n", help="Additional notes"),
):
    """➕ Add a new task via the tasks endpoint."""
    payload = {
        "title": title,
        "domain": domain,
    }
    if project:
        payload["project_id"] = project
    if due:
        payload["due_date"] = due
    if priority:
        payload["priority"] = priority
    if notes:
        payload["notes"] = notes

    result = _post("/api/tasks", payload)
    console.print("\n[compass.success]✅ Task created successfully[/]")
    console.print(f"   ID:       {result.get('id', '')}")
    console.print(f"   Title:    {result.get('title', title)}")
    console.print(f"   Domain:   {_domain_text(domain)}")


@app.command()
def tasks(
    domain: Optional[str] = typer.Option(None, "--domain", "-d", help="Filter by domain"),
    project: Optional[str] = typer.Option(None, "--project", "-p", help="Filter by project name"),
    status: Optional[str] = typer.Option(None, "--status", "-s", help="Filter by status"),
):
    """📋 View current tasks."""
    params = {}
    if domain:
        params["domain"] = domain
    if project:
        params["project"] = project
    if status:
        params["status"] = status

    data = _get("/api/tasks", params)
    task_list = data if isinstance(data, list) else data.get("tasks", [])
    render_tasks_table(task_list)


@app.command()
def projects(
    domain: Optional[str] = typer.Option(None, "--domain", "-d", help="Filter by domain"),
):
    """📁 List tracked projects."""
    params = {}
    if domain:
        params["domain"] = domain

    data = _get("/projects", params)
    render_projects_view(data.get("projects", []))


@app.command()
def log(
    summary: str = typer.Argument(..., help="Summary of what to log"),
    domain: str = typer.Option("code", "--domain", "-d", help="Domain: code, coursework, hackathon, general"),
    project: Optional[str] = typer.Option(None, "--project", "-p", help="Associated project"),
    tags: Optional[str] = typer.Option(None, "--tags", "-t", help="Comma-separated tags"),
):
    """📝 Log a memory entry (code context, coursework note, etc.)."""
    payload = {
        "content": summary,
        "domain": domain,
        "project": project,
        "tags": tags,
    }
    result = _post("/api/log", payload)

    console.print("\n[compass.success]✅ Memory logged to pgvector with 768-dim embedding[/]")
    console.print(f"   Domain:   {_domain_text(domain)}")
    if project:
        console.print(f"   Project:  [bold]{project}[/]")
    if tags:
        console.print(f"   Tags:     [cyan]{tags}[/]")
    console.print(f"   Status:   {result.get('message', 'Logged')}")


@app.command()
def status():
    """📊 Dashboard overview — formatted terminal table across Hackathon, Coursework, Code."""
    data = _get("/dashboard")
    render_status_dashboard(data)


@app.command()
def config(
    url: Optional[str] = typer.Option(None, "--url", "-u", help="Set the Compass API base URL"),
):
    """⚙️ View or update persistent CLI settings (~/.compass/config.toml)."""
    global API_BASE
    if url:
        API_BASE = url.strip().rstrip("/")
        save_config(API_BASE)
        console.print(f"[compass.success]✅ Configuration saved to {CONFIG_FILE}[/]")
        console.print(f"   API URL: {API_BASE}")
        return

    creds = load_credentials()
    tok = creds.get("guest_token") or creds.get("session_token")
    console.print(Panel(
        f"[bold cyan]Compass CLI Configuration[/]\n\n"
        f"  [bold]Config file:[/]      {CONFIG_FILE}\n"
        f"  [bold]Credentials file:[/] {CREDENTIALS_FILE}\n"
        f"  [bold]API URL:[/]          {API_BASE}\n"
        f"  [bold]Active Identity:[/]  {creds.get('guest_id', '[NOT SET]')}\n"
        f"  [bold]Auth Token:[/]       {_mask_token(tok)}",
        border_style="cyan",
    ))


# ---------------------------------------------------------------------------
# Admin Sub-Typer
# ---------------------------------------------------------------------------
admin_app = typer.Typer(
    name="admin",
    help="🛠️ Admin maintenance commands (token usage, database consolidation)",
    no_args_is_help=True,
)
app.add_typer(admin_app, name="admin")


@admin_app.command("usage")
def admin_usage(
    token: Optional[str] = typer.Option(None, "--token", "-t", help="Master admin AUTH_TOKEN"),
):
    """💰 Pretty-print token consumption and estimated USD cost across models."""
    data = _get("/admin/usage", headers=_headers(admin=True, admin_token=token))
    render_usage_tables(data)


@admin_app.command("consolidate")
def admin_consolidate(
    dry_run: bool = typer.Option(False, "--dry-run", help="Simulate without applying updates"),
    threshold: float = typer.Option(0.95, "--threshold", "-t", help="Cosine similarity threshold"),
    stale_days: int = typer.Option(7, "--stale-days", "-s", help="Days before marking thread stale"),
    token: Optional[str] = typer.Option(None, "--token", "-t", help="Master admin AUTH_TOKEN"),
):
    """🧹 Trigger memory consolidation and overdue task flagging."""
    mode_text = "[yellow](DRY RUN)[/]" if dry_run else "[green](LIVE)[/]"
    console.print(f"🧭 Triggering memory consolidation {mode_text}...")

    payload = {
        "dry_run": dry_run,
        "similarity_threshold": threshold,
        "stale_thread_days": stale_days,
    }

    try:
        report = _post("/admin/consolidate", payload, headers=_headers(admin=True, admin_token=token))
        console.print("\n[compass.success]✅ Consolidation complete[/]")
        console.print(f"  • Overdue tasks flagged: [bold]{report.get('overdue_tasks_flagged', 0)}[/]")
        console.print(f"  • Duplicate pairs merged: [bold]{report.get('duplicate_chunks_merged', 0)}[/]")
        console.print(f"  • Stale conversations rolled up: [bold]{report.get('stale_conversations_rolled_up', 0)}[/]")
    except Exception as e:
        console_err.print(f"[compass.error]❌ Remote consolidation request failed: {e}[/]")
        raise typer.Exit(1)


# ---------------------------------------------------------------------------
# Agent — Autonomous ReAct multi-step planner
# ---------------------------------------------------------------------------
@app.command()
def agent(
    goal: str = typer.Argument(..., help="The goal for the agent to accomplish"),
    max_steps: int = typer.Option(8, "--max-steps", "-m", help="Max reasoning steps"),
    no_critic: bool = typer.Option(False, "--no-critic", help="Disable self-critique pass"),
    demo_reject: bool = typer.Option(False, "--demo-reject", help="Run in pre-loaded reject-path demo mode"),
    conversation_id: Optional[str] = typer.Option(None, "--conversation-id", "-c", help="Link run to an existing conversation"),
):
    """🧠 Run the autonomous agent to plan, analyze, and act on your tasks."""
    try:
        run_interactive_agent_session(
            api_base=API_BASE,
            goal=goal,
            max_steps=max_steps,
            no_critic=no_critic,
            demo_reject=demo_reject,
            conversation_id=conversation_id,
            headers=_headers(),
        )
    except KeyboardInterrupt:
        console_err.print("\n[dim]Cancelled.[/]")
        raise typer.Exit(130)


@app.command("agent-undo")
def agent_undo(
    run_id: Optional[str] = typer.Option(None, "--run-id", "-r", help="Specific run ID to revert"),
    log_id: Optional[int] = typer.Option(None, "--log-id", "-l", help="Specific audit log entry ID to revert"),
):
    """Revert an agent-executed mutation using the audit log."""
    try:
        data = _post("/api/agent/undo", {"run_id": run_id, "audit_log_id": log_id})
        if data.get("status") == "ok":
            console.print(f"[green]✅ {data.get('message')}[/]")
            if "reverted" in data:
                console.print(f"[dim]Reverted: {data['reverted']}[/]")
        else:
            console.print(f"[yellow]⚠️ {data.get('message', 'Nothing to undo')}[/]")
    except Exception as e:
        console_err.print(f"[compass.error]❌ Failed to undo: {e}[/]")
        raise typer.Exit(1)


@app.command("agent-activity")
def agent_activity(limit: int = typer.Option(15, "--limit", "-n", help="Number of entries to show")):
    """📋 View recent agent mutations from the audit log with per-item IDs for undo."""
    try:
        data = _get(f"/api/agent/activity?limit={limit}")
        entries = data.get("activity", [])
        render_agent_activity_table(entries)
    except Exception as e:
        console_err.print(f"[compass.error]❌ Failed to fetch activity: {e}[/]")
        raise typer.Exit(1)


@app.command("agent-stats")
def agent_stats():
    """⚖️ Surface real self-critique pass effectiveness metrics."""
    try:
        data = _get("/api/agent/critique-stats")
        render_agent_stats_view(data)
    except Exception as e:
        console_err.print(f"[compass.error]❌ Failed to fetch critique stats: {e}[/]")
        raise typer.Exit(1)


@app.command("agent-runs")
def agent_runs(
    limit: int = typer.Option(15, "--limit", "-n", help="Number of runs to show"),
    conversation_id: Optional[str] = typer.Option(None, "--conversation-id", "-c", help="Filter runs by conversation ID"),
):
    """📜 List recent agent execution runs with statuses and step counts."""
    try:
        path = f"/api/agent/runs?limit={limit}"
        if conversation_id:
            path += f"&conversation_id={conversation_id}"
        data = _get(path)
        render_agent_runs_table(data.get("runs", []))
    except Exception as e:
        console_err.print(f"[compass.error]❌ Failed to fetch agent runs: {e}[/]")
        raise typer.Exit(1)


@app.command("agent-briefing")
def agent_briefing():
    """🌅 Inspect the latest autonomous overnight proactive briefing."""
    try:
        data = _get("/api/agent/proactive-briefing")
        render_briefing_panel(data)
    except Exception as e:
        console_err.print(f"[compass.error]❌ Failed to fetch proactive briefing: {e}[/]")
        raise typer.Exit(1)


@app.command("triage")
def triage(
    days: int = typer.Option(5, "--days", "-d", help="Days available"),
    hours: float = typer.Option(4.0, "--hours", "-h", help="Focused hours per day"),
    domain: Optional[str] = typer.Option(None, "--domain", help="Restrict to domain"),
):
    """Run interactive Planner <-> Realist feasibility negotiation triage."""
    try:
        run_feasibility_triage_session(
            api_base=API_BASE,
            headers=_headers(),
            days=days,
            hours=hours,
            domain=domain,
        )
    except KeyboardInterrupt:
        console_err.print("\n[dim]Cancelled.[/]")
        raise typer.Exit(130)


@app.command("memory")
def view_memory():
    """🧠 View personal profile facts and preferences remembered by Compass."""
    try:
        data = _get("/api/profile/facts")
        facts = data.get("facts", {})
        if not facts:
            console.print("[compass.dim]No personal profile facts stored yet. Tell Compass your name, goals, or preferences in chat.[/]")
            return

        table = Table(
            title="🧠 What Compass Remembers About You",
            box=box.ROUNDED,
            header_style="bold magenta",
        )
        table.add_column("Category", style="cyan", width=18)
        table.add_column("Detail / Preference", style="green")

        for k, v in sorted(facts.items()):
            table.add_row(k.replace("_", " ").capitalize(), str(v))

        console.print(table)
    except Exception as e:
        console_err.print(f"[compass.error]❌ Failed to fetch memory facts: {e}[/]")
        raise typer.Exit(1)


@app.command("parked")
def view_parked():
    """📌 View ideas and tangents saved on the 'Park it' shelf."""
    try:
        data = _get("/api/parked")
        parked = data.get("parked", [])
        if not parked:
            console.print("[compass.dim]Your 'Park it' shelf is currently empty.[/]")
            return

        table = Table(
            title="📌 Parked Thoughts Shelf",
            box=box.ROUNDED,
            header_style="bold yellow",
        )
        table.add_column("ID", style="dim", width=6)
        table.add_column("Thought / Tangent", style="cyan")
        table.add_column("Status", style="green", width=10)
        table.add_column("Parked At", style="dim", width=20)

        for p in parked:
            created = str(p.get("created_at", ""))[:19].replace("T", " ")
            table.add_row(str(p.get("id", "")), str(p.get("text", "")), str(p.get("status", "parked")), created)

        console.print(table)
    except Exception as e:
        console_err.print(f"[compass.error]❌ Failed to fetch parked thoughts: {e}[/]")
        raise typer.Exit(1)


@app.command("recap")
def recap_conversation(
    conversation_id: Optional[str] = typer.Option(None, "--id", "-i", help="Specific conversation ID to recap (defaults to most recent)"),
):
    """📝 Summarize decisions made, open questions, and next steps for a chat conversation."""
    cid = conversation_id
    if not cid:
        try:
            convs = _get("/api/conversations?limit=1").get("conversations", [])
            if convs:
                cid = convs[0].get("id")
        except Exception:
            pass

    if not cid:
        console.print("[compass.dim]No conversation found to recap. Start a chat first with `compass chat`.[/]")
        return

    try:
        data = _post("/api/chat/recap", {"conversation_id": cid})
        recap_text = data.get("recap", "")

        console.print(Panel(
            Markdown(recap_text),
            title=f"📝 Conversation Recap: {cid[:8]}...",
            border_style="magenta",
            padding=(1, 2),
        ))
    except Exception as e:
        console_err.print(f"[compass.error]❌ Failed to fetch conversation recap: {e}[/]")
        raise typer.Exit(1)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app()

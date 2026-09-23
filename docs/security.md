# Compass — Security Architecture & Threat Model

## 1. Overview & Threat Model

Compass is an agentic AI assistant designed to maintain persistent memory across tasks, hackathon deadlines, coursework, code contexts, and conversations. Because it interacts with the live web, external LLM APIs, and a persistent PostgreSQL database, robust defensive boundaries are required against malicious inputs, SSRF, IDOR, and unauthorized mutations.

### Assets to Protect
1. **Persistent Task Store (`tasks`)**: User deadlines, hackathon deliverables, and schedules.
2. **Long-Term Vector Memory (`memory_chunks`)**: 768-dimensional embeddings and contextual text.
3. **Calendar OAuth Credentials (`calendar_connections`)**: Google Calendar refresh tokens stored encrypted at rest.
4. **Agent State & Audit Logs (`agent_runs`, `agent_audit_log`)**: Traces of autonomous decisions, proposed mutations, and reversibility logs.
5. **External Quotas & Costs**: Nebius LLM token quotas and Tavily search API quotas.

### Threat Actors
- **Anonymous Internet User**: Can send HTTP requests to public endpoints without credentials.
- **Malicious Workspace User**: May attempt to query, mutate, or delete another user's tasks or calendar events (IDOR).
- **Adversarial Web Content (Prompt Injection / Indirect Injection)**: External web pages or search results containing prompt-injection payloads intended to coerce the LLM into executing unintended actions.
- **SSRF Exploitation**: Attempts to force server-side web ingestion tools to scan internal IP addresses or cloud metadata endpoints.

### Trust Boundaries

```text
Untrusted Internet (Browser / Client / Web Pages)
                     │
                     ▼ [CORS & Rate Limiting: 30 req/min]
       FastAPI Router & Dependency Layer
                     │
                     ▼ [verify_token / Constant-time HMAC]
       Protected Services & Specialist Agent
                     │
                     ▼ [SSRF Validator & Input Sanitizer]
      External Services (Tavily / Google OAuth)
                     │
                     ▼ [Confirm Gate: Zero DB write prior to approval]
       PostgreSQL / Neon pgvector Database
```

---

## 2. Security Controls Implemented

### 1. Fail-Closed Authentication & Constant-Time Verification
- **Constant-Time Verification**: `backend.dependencies.verify_token` uses `hmac.compare_digest` to prevent side-channel timing attacks when validating Bearer tokens.
- **Production Fail-Closed**: In production (`ENVIRONMENT="production"`), the application strictly refuses to start or validate requests if `AUTH_TOKEN` is blank or set to the default development token (`dev-token`).

### 2. Cryptographic Secret Management & Token Encryption
- **Key Derivation**: Google OAuth tokens stored in `calendar_connections` are encrypted using authenticated symmetric stream encryption (HMAC-SHA256 keystream + integrity tag).
- **Environment Isolation**: In production, `TOKEN_ENCRYPTION_KEY` must be explicitly configured with a secret key; the development fallback key (`compass_secure_local_dev_token_encryption_key_32bytes!`) is rejected with a configuration error.

### 3. Server-Side Request Forgery (SSRF) Protection
- **URL Ingestion Filter**: `backend.services.security.is_safe_url` strictly validates URLs before fetching:
  - Disallows loopback addresses (`127.0.0.0/8`, `::1`).
  - Disallows AWS/GCP/Azure cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`).
  - Disallows RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
  - Restricts schemes strictly to `http` and `https`, and ports to standard web ports (80, 443, 8080, 8443).

### 4. Insecure Direct Object Reference (IDOR) & Object Ownership
- **Task Ownership Enforcement**:
  - `PATCH /api/tasks/{task_id}` and `DELETE /api/tasks/{task_id}` enforce ownership verification.
  - A user cannot modify or delete another user's task unless authenticated as admin (`AUTH_TOKEN`).
- **Account Isolation**: Per-account tasks and conversations are isolated using `_get_current_user_id(request)`.

### 5. Strict CORS Policy
- Wildcard CORS (`allow_origins=["*"]`) combined with credentials has been removed.
- Cross-origin requests are strictly restricted to configured origins in `settings.CORS_ORIGINS` (Vercel deployment domains, local development ports 5173/3000, and Nebius app domains).

### 6. Rate Limiting & Spoofing Resistance
- **Sanitized Client IP**: Rate limiters in `backend.dependencies` extract client IP through `get_client_ip()`, preventing bypasses via forged, prepended `X-Forwarded-For` headers.
- **Dual-Tier Limits**:
  - Chat and memory endpoints: 30 requests/minute per IP.
  - Agent runs: 10 runs/minute per IP.

### 7. Confirmation Gate & Audit Log Integrity
- **Zero Pre-Confirmation Writes**: All state-mutating tools (`add_task`, `delete_task`, `edit_task`, `ingest_url`, `commit_schedule`) require explicit user confirmation.
- **Audit Log**: Every confirmed mutation is immutably logged to `agent_audit_log` with pre- and post-mutation state snapshots for single-click reversion via `/api/agent/undo`.

---

## 3. Security Changelog

### Phase 2 Security Hardening
- Added `backend/services/security.py` providing SSRF validation (`is_safe_url`) and safe client IP extraction (`get_client_ip`).
- Updated `backend/config.py` with `ENVIRONMENT` setting and `validate_production_secrets()` enforcing fail-closed behavior for `AUTH_TOKEN` and `TOKEN_ENCRYPTION_KEY`.
- Updated `backend/dependencies.py` to use `hmac.compare_digest` and fail-closed checks on `verify_token`.
- Hardened `backend/main.py` CORS middleware to use `settings.CORS_ORIGINS`.
- Added SSRF defense to `handle_ingest_url` in `backend/skills/handlers/web.py`.
- Enforced IDOR ownership checks on `PATCH` and `DELETE` in `backend/routers/tasks.py`.
- Added regression test suite in `tests/test_security_hardening.py`.

---

## 4. Known Limitations & Architecture Notes

1. **In-Memory Rate Limiting**: The current rate limiter uses an in-memory sliding window deque. In multi-worker or multi-container horizontal deployments, rate limits apply per worker process rather than globally across the cluster. A distributed Redis/Valkey store can be plugged into `dependencies.py` if scaling horizontally.
2. **Public Interactive Endpoints by Design**: `/api/chat`, `/api/chat/stream`, and `/api/agent/run` remain public by design without Bearer authentication so that evaluators and prospective users can demo the assistant. State mutations are protected by the confirmation gate and per-account isolation.
3. **Indirect Prompt Injection**: While web content is fenced with `[UNTRUSTED WEB CONTENT]` tags and screened with regex heuristics, complex adversarial LLM jailbreaks in ingested content remain an active industry-wide research problem. The primary defensive barrier is the hard confirm-gate preventing autonomous execution without human review.

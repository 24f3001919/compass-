# Pull Request: Compass Phase 2 Security Hardening

## Title
`feat(security): comprehensive Phase 2 security hardening, SSRF defense, fail-closed secrets, and proposal verification`

## Base Branch
`main` (or `feat/demo-script-runtime-verifier`)

## Compare Branch
`feat/security-hardening`

---

## Summary of Changes

This pull request completes **Phase 2: Security Hardening** for Compass, implementing server-side defensive boundaries across authentication, web ingestion (SSRF), task ownership (IDOR), confirmation gating, rate limiting, and secret management.

Every change in this PR has been committed **one file at a time** across 11 atomic commits:

1. `4c9d03c` — `feat(security): add SSRF validation and safe client IP extraction service` ([`backend/services/security.py`](file:///c:/Users/Ratnesh%20Singh/OneDrive/Desktop/compass/backend/services/security.py))
2. `98a88bf` — `feat(security): enforce fail-closed production secrets in configuration` ([`backend/config.py`](file:///c:/Users/Ratnesh%20Singh/OneDrive/Desktop/compass/backend/config.py))
3. `fd9ef01` — `feat(security): harden token verification and client IP resolution` ([`backend/dependencies.py`](file:///c:/Users/Ratnesh%20Singh/OneDrive/Desktop/compass/backend/dependencies.py))
4. `49d0f20` — `feat(security): add actions schema to AgentConfirmRequest for proposal verification` ([`backend/models.py`](file:///c:/Users/Ratnesh%20Singh/OneDrive/Desktop/compass/backend/models.py))
5. `c0c5eb5` — `feat(security): restrict CORS middleware to explicit production origins` ([`backend/main.py`](file:///c:/Users/Ratnesh%20Singh/OneDrive/Desktop/compass/backend/main.py))
6. `5728f88` — `feat(security): integrate pre-fetch SSRF protection into web ingestion` ([`backend/skills/handlers/web.py`](file:///c:/Users/Ratnesh%20Singh/OneDrive/Desktop/compass/backend/skills/handlers/web.py))
7. `06dcbdb` — `feat(security): enforce task IDOR ownership checks and guest workspace isolation` ([`backend/routers/tasks.py`](file:///c:/Users/Ratnesh%20Singh/OneDrive/Desktop/compass/backend/routers/tasks.py))
8. `854ffb7` — `feat(security): harden agent confirmation with proposal integrity and replay defense` ([`backend/routers/agent.py`](file:///c:/Users/Ratnesh%20Singh/OneDrive/Desktop/compass/backend/routers/agent.py))
9. `f89e9a7` — `feat(security): enforce fail-closed encryption keys for OAuth token storage` ([`backend/services/oauth.py`](file:///c:/Users/Ratnesh%20Singh/OneDrive/Desktop/compass/backend/services/oauth.py))
10. `aae9afe` — `docs(security): document threat model, endpoint security matrix, and controls` ([`docs/security.md`](file:///c:/Users/Ratnesh%20Singh/OneDrive/Desktop/compass/docs/security.md))
11. `3927a66` — `test(security): add 28 regression tests covering fail-closed auth, SSRF, IDOR, and CORS` ([`tests/test_security_hardening.py`](file:///c:/Users/Ratnesh%20Singh/OneDrive/Desktop/compass/tests/test_security_hardening.py))

---

## Key Security Improvements

### 1. Fail-Closed Production Secrets & Constant-Time Auth
- In production (`ENVIRONMENT="production"`), `validate_production_secrets()` refuses to run if `AUTH_TOKEN` is blank or set to default dev tokens (`dev-token`), or if `TOKEN_ENCRYPTION_KEY` matches default dev keys.
- Token validation uses `hmac.compare_digest` to eliminate timing side-channels.

### 2. Server-Side Request Forgery (SSRF) Protection
- `is_safe_url()` blocks loopback (`127.0.0.0/8`, `::1`), RFC 1918 subnets, cloud metadata (`169.254.169.254`, `metadata.google.internal`), private IPv6 (`fc00::/7`, `fe80::/10`), bracketed IPv6, and IPv4-mapped IPv6 (`::ffff:127.0.0.1`).
- `is_safe_redirect()` resolves relative and absolute redirects and verifies destination safety.
- Web content extraction is delegated to Tavily SaaS, keeping direct HTTP socket connections off the Compass host.

### 3. Task Ownership & Guest Workspace Isolation
- Direct task creation binds every record to an explicit or derived guest workspace identity (`_get_or_create_user_id()`), never leaving tasks unowned (`NULL`).
- `PATCH` and `DELETE /api/tasks/{task_id}` enforce ownership checks; non-owners receive `HTTP 403 Forbidden`.
- Legacy unowned tasks cannot be modified or deleted without admin credentials (`AUTH_TOKEN`).

### 4. Confirmation Gate Integrity & Replay Defense
- `/api/agent/confirm` requires Bearer authentication (`verify_token`).
- Verifies submitted actions against server-persisted proposals in `agent_runs`.
- Client cannot submit unproposed tool calls (rejected with `400 Bad Request`).
- Automatically clears pending actions in PostgreSQL upon execution; replay attempts are rejected with `400 Bad Request`.

### 5. Undo Replay Protection
- `/api/agent/undo` requires Bearer authentication.
- Restores exact pre-mutation snapshots from `agent_audit_log`.
- Atomically marks `is_reverted = TRUE` upon reversion, preventing replayed undo requests.

### 6. Strict CORS & Safe Client IP
- Replaced wildcard CORS with explicit origins (`settings.CORS_ORIGINS`).
- Rate limiting extracts client IP safely via `get_client_ip()`, preventing IP spoofing via forged `X-Forwarded-For` headers.

---

## Test Verification

- **Security Regression Tests**: 28 tests passing (`pytest tests/test_security_hardening.py -v`).
- **Total Test Suite Collection**: 193 tests collected.
- **Frontend Production Build**: `npm run build` PASS (0 errors, 184ms).
- **Docker Compose Validation**: `docker compose config --quiet` PASS.

---

## Instructions to Push

When ready to publish to GitHub:
```bash
git push -u origin feat/security-hardening
```
Then open the PR on GitHub using the title and description above.

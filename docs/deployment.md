# Compass — Continuous Deployment (CD) Architecture & Runbook

This document defines the deployment architecture, deployment lifecycle, environment configuration, post-deployment verification, and rollback procedures for **Compass**.

---

## 1. System Deployment Architecture

Compass decouples continuous integration (validation) from continuous deployment (delivery) across native cloud providers:

```
                            Developer Feature Branch
                                       │
                                  Pull Request
                                       │
                                       ▼
                         ┌───────────────────────────┐
                         │   GitHub Actions (CI)     │
                         │ ├─ Backend lint & tests   │
                         │ ├─ Frontend Vite build    │
                         │ └─ Docker Compose config  │
                         └─────────────┬─────────────┘
                                       │
                                    PASS
                                       │
                                       ▼
                                 Review & Merge
                                       │
                                       ▼
                             ┌───────────────────┐
                             │    main branch    │
                             └─────────┬─────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     ▼                                   ▼
        ┌─────────────────────────┐         ┌─────────────────────────┐
        │      Vercel Edge        │         │      Render Cloud       │
        │ ├─ React 18 / Vite SPA  │         │ ├─ FastAPI Web Service  │
        │ ├─ Automatic Git Deploy │         │ ├─ Dockerfile Build     │
        │ └─ Same-origin rewrites │         │ └─ Automatic Git Deploy │
        └────────────┬────────────┘         └────────────┬────────────┘
                     │                                   │
                     ▼                                   ▼
        Production Frontend                 Production Backend
   https://compass-farmlytics.vercel.app   https://compass-backend-qryu.onrender.com
                     │                                   │
                     │  transparent same-origin proxy   │
                     └───────────────────────────────────┤
                                                         ▼
                                            ┌─────────────────────────┐
                                            │    Neon Serverless DB   │
                                            │ ├─ PostgreSQL 16        │
                                            │ └─ pgvector HNSW 768d   │
                                            └─────────────────────────┘
                                                         │
                                                         ▼
                                            ┌─────────────────────────┐
                                            │ Post-Deploy Verification│
                                            │ scripts/verify_deployment.py
                                            └─────────────────────────┘
```

---

## 2. CI vs. CD Contract

| Stage | Owner | Trigger | Responsibilities | Secrets Scope |
|-------|-------|---------|------------------|---------------|
| **CI (Validation)** | GitHub Actions (`.github/workflows/ci.yml`) | Pull Request or Push to `main` | Validates code correctness: Ruff linting, Pytest test suite with isolated PostgreSQL service container, Frontend production bundle build (`npm run build`), Docker Compose configuration validation (`docker compose config --quiet`). | Mock/CI secrets only (`ci-test-token`). **Zero** production secrets. |
| **CD (Delivery)** | Vercel + Render Provider-Native Git Hooks | Direct merge or push to `main` | Deploys validated code to live production surfaces. Vercel compiles and distributes static assets to global edge CDN; Render builds Docker image and runs FastAPI container. | Production secrets configured securely in provider dashboards. |
| **Verification** | Automation / Operations (`scripts/verify_deployment.py`) | Post-deployment gate | Non-mutating read-only HTTP probes verifying backend `/health`, Neon DB connection, Vercel frontend reachability, and same-origin proxying. | Read-only public endpoints. No credentials required. |

> [!IMPORTANT]
> **No Fake CD Workflows**: GitHub Actions does not execute deployment scripts or push Docker images to registries. Vercel and Render maintain native Git integrations connected to `Ratnesh-101/compass` tracking branch `main`. Merging PRs to `main` automatically triggers production builds natively without third-party deploy tokens.

---

## 3. Platform Configuration

### A. Frontend (Vercel)

- **Production Domain**: `https://compass-farmlytics.vercel.app`
- **Connected Repository**: `Ratnesh-101/compass`
- **Tracked Branch**: `main`
- **Framework Preset**: Vite
- **Root Directory**: `frontend` (or project root with `frontend/vercel.json`)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node.js Version**: 20.x
- **Reverse Proxy Routing** (`vercel.json`):
  ```json
  {
    "rewrites": [
      { "source": "/health", "destination": "https://compass-backend-qryu.onrender.com/health" },
      { "source": "/chat", "destination": "https://compass-backend-qryu.onrender.com/chat" },
      { "source": "/api/:path*", "destination": "https://compass-backend-qryu.onrender.com/api/:path*" }
    ]
  }
  ```
  *Benefit*: Client requests use same-origin relative URLs (`/api/...`), completely shielding users from CORS issues, ad-blockers (Brave Shields), and backend host leakage.

### B. Backend (Render)

- **Production Domain**: `https://compass-backend-qryu.onrender.com`
- **Connected Repository**: `Ratnesh-101/compass`
- **Tracked Branch**: `main`
- **Service Type**: Web Service (Docker runtime)
- **Dockerfile Path**: `backend/Dockerfile`
- **Docker Context**: Root directory (`.`)
- **Runtime Command**: `uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}`
- **Health Check Path**: `/health` (Expected: HTTP 200, `{"status": "ok", "db_connected": true}`)
- **Commit Tracking**: Automatically reports git short SHA via `RENDER_GIT_COMMIT` in `/health`.

### C. Persistent Storage (Neon PostgreSQL)

- **Host**: `ep-sweet-fire-b2y9w95z.c-6.eu-central-1.aws.neon.tech`
- **Engine**: PostgreSQL 16 + `pgvector`
- **Features**: Serverless autoscaling, scale-to-zero compute, automatic connection pooling, instant branching.
- **Migration Strategy**: Schema initialized and validated dynamically during application startup lifespan (`backend/memory/db.py`).

---

## 4. Environment Variables Matrix

### Frontend (`frontend/.env.production`)

| Variable | Environment | Purpose | Status / Handling |
|----------|-------------|---------|-------------------|
| `VITE_API_BASE_URL` | Production / Preview | Target backend base URL if direct calls are needed | Configured (`https://compass-backend-qryu.onrender.com`). In production, SPA uses same-origin relative URLs (`''`) routed via `vercel.json`. |

### Backend (Render Environment Settings)

| Variable | Scope | Description | Verification State |
|----------|-------|-------------|--------------------|
| `ENVIRONMENT` | Backend | Must be `production` to activate fail-closed security assertions. | Configured in Render Dashboard |
| `DATABASE_URL` | Backend | Neon PostgreSQL connection string with SSL required (`sslmode=require`). | Configured in Render Dashboard |
| `AUTH_TOKEN` | Backend | Secret admin/service token for privileged endpoints. In production, default `dev-token` is blocked. | Configured in Render Dashboard |
| `TOKEN_ENCRYPTION_KEY` | Backend | 32-byte cryptographic secret used for encrypting Google OAuth tokens at rest. | Configured in Render Dashboard |
| `NEBIUS_API_KEY` | Backend | Nebius Token Factory API key for Nemotron and Qwen embedding inference. | Configured in Render Dashboard |
| `NEBIUS_BASE_URL` | Backend | Base endpoint for Nebius Token Factory (`https://api.tokenfactory.nebius.com/v1/`). | Configured in Render Dashboard |
| `TAVILY_API_KEY` | Backend | Tavily Web Search API key for real-time web intelligence. | Configured in Render Dashboard |
| `TAVILY_ENABLED` | Backend | Enables Tavily web search tools (`True`). | Default `True` |
| `TAVILY_ABSTAIN_FIRST`| Backend | Enforces memory search before escalating to web queries. | Default `True` |
| `GOOGLE_CLIENT_ID` | Backend | Google Cloud OAuth 2.0 Web Client ID. | Configured in Render Dashboard |
| `GOOGLE_CLIENT_SECRET`| Backend | Google Cloud OAuth 2.0 Web Client Secret. | Configured in Render Dashboard |
| `GOOGLE_REDIRECT_URI` | Backend | OAuth callback redirect URL (`https://compass-farmlytics.vercel.app/api/calendar/callback`). | Default configured |
| `CORS_ORIGINS` | Backend | Allowed CORS origins (JSON array or comma-separated). | Defaults include `https://compass-farmlytics.vercel.app` |
| `LOG_LEVEL` | Backend | Application logging verbosity (`INFO`). | Configured in Render Dashboard |

> [!CAUTION]
> Never commit actual production secrets to Git. Secret values are injected exclusively at runtime via Render and Vercel project settings dashboards.

---

## 5. Post-Deployment Verification

After any merge to `main` or provider redeployment, run the post-deployment smoke verification suite:

```bash
python scripts/verify_deployment.py
```

### Probes Executed:

1. **Backend `/health`**:
   - Status code HTTP 200
   - JSON response contains `status: "ok"`, `version: "0.1.0"`
   - `db_connected: True` (live query to Neon PostgreSQL succeeded)
   - Commit SHA matches GitHub `main` HEAD (`commit: "30cb1c8..."`)
2. **Frontend Dashboard (Vercel)**:
   - Status code HTTP 200
   - React root container `<div id="root">` present
   - Production JS and CSS bundles load successfully
3. **Vercel `/health` Proxy Rewrite**:
   - Status code HTTP 200
   - Proves Vercel edge reverse proxy reaches Render backend without DNS, TLS, or CORS errors
4. **Public Read-Only API Probe (`/api/usage/summary`)**:
   - Status code HTTP 200
   - Aggregated metrics (`total_requests`, `total_input_tokens`) returned
   - **Zero state mutations**; completely safe for production monitoring
5. **CORS Preflight Probe**:
   - OPTIONS preflight request with `Origin: https://compass-farmlytics.vercel.app`
   - Verifies `Access-Control-Allow-Origin` allows the production frontend

---

## 6. Rollback Procedures

If a newly deployed version introduces regressions or critical errors, follow this rollback runbook:

### A. Vercel Frontend Rollback (Instant)

1. Open the [Vercel Project Dashboard](https://vercel.com/dashboard) -> Select **compass-farmlytics**.
2. Navigate to the **Deployments** tab.
3. Locate the last known good deployment (verified by date/commit SHA).
4. Click the three dots (`...`) on that deployment and click **Promote to Production** (or **Redeploy**).
5. Vercel edge routes will immediately switch traffic to the prior build within seconds without rebuilding.

### B. Render Backend Rollback (Instant)

1. Open the [Render Dashboard](https://dashboard.render.com/) -> Select **compass-backend-qryu**.
2. Navigate to the **Events** tab.
3. Locate the previous successful deploy event.
4. Click **Rollback to this deploy**.
5. Render immediately deploys the previous container build.

### C. Git-Level Rollback (Code Revert)

If both services should be rolled back together in sync:

```bash
# 1. Identify the bad commit on main
git checkout main
git pull origin main

# 2. Revert the commit cleanly
git revert <bad-commit-sha> -m 1  # if merge commit
# or git revert <bad-commit-sha>   # if standard commit

# 3. Push revert to main
git push origin main
```

Both Vercel and Render will detect the new commit on `main`, build the reverted code, and deploy automatically.

### D. Verification After Rollback

Immediately re-run:

```bash
python scripts/verify_deployment.py
```

Verify that `commit` in the report matches the expected prior commit SHA and all checks pass.

---

## 7. CD Security & Hardening Controls

- **Minimal CI Permissions**: GitHub Actions workflows specify `permissions: contents: read` explicitly.
- **Fail-Closed Secrets in Production**: If `ENVIRONMENT=production`, `Settings.validate_production_secrets()` asserts that `AUTH_TOKEN` and `TOKEN_ENCRYPTION_KEY` are not set to default development values.
- **Branch Protection**: Production merges require passing CI checks on GitHub. Feature branches and PRs cannot deploy directly to production.
- **SSRF & Metadata Defense**: All outbound agent requests validate destination IPs against private, link-local, loopback, and cloud metadata addresses (including IPv6 and mapped addresses).
- **Same-Origin Proxying**: Vercel handles `/api/*` and `/health` routing to Render over secure TLS, preventing CORS misconfigurations from affecting end users.

---

## 8. Known Operational Limitations

1. **Render Free-Tier Sleep Cycle**: On free or hobby plans, Render spins down web services after 15 minutes of inactivity. The first request after a period of dormancy will experience a cold-start delay of 30–50 seconds while the container initializes.
2. **In-Memory Rate Limiting**: Endpoint rate limiting is enforced per-worker in memory. If Render scales horizontally across multiple container instances, rate limits apply per container rather than globally across workers (documented trade-off).
3. **Branch Preview Databases**: Pull requests deploy frontend preview builds on Vercel, but preview backend environments require separate Render services or manual database branch creation via Neon CLI.

# 🏆 Compass — Nebius x NVIDIA Hackathon Submission Kit

> **Everything you need for the final submission on Devpost.**  
> Track: **Best Apps and Agents Track**  
> Target Bonus Prizes: **Best Use of Tavily ($3,000)** & **Most Valuable Feedback Award ($100 + NVIDIA Swag)**  
> Live Web App: [https://compass-farmlytics.vercel.app](https://compass-farmlytics.vercel.app)  
> Live Backend API: [https://compass-backend-qryu.onrender.com/health](https://compass-backend-qryu.onrender.com/health)  
> GitHub Repository: [https://github.com/Ratnesh-101/compass](https://github.com/Ratnesh-101/compass)  

---

## 📋 Part 1: Devpost Submission Form Fields (Copy & Paste Ready)

### Project Title
`Compass — The AI Copilot That Remembers Every Hackathon, Repo, and Deadline`

### Tagline (under 200 characters)
`Autonomous cross-domain productivity agent with persistent pgvector memory, tiered NVIDIA Nemotron routing, and real-time Tavily web intelligence.`

### Track
`Best Apps and Agents Track`

### Project Description / Pitch

#### Inspiration
As dual-degree engineering students balancing rigorous university coursework (embedded systems, computer architecture), active open-source repositories, and high-stakes hackathons, we faced a crippling cognitive tax: context switching. Existing tools (Notion, Todoist, ChatGPT) either lack persistent domain memory, hallucinate upcoming deadlines, or lack code-level technical recall. When a hackathon organizer shifts a deadline on Discord, or when an academic lab milestone conflicts with a hackathon demo, fragmented tools fail. We built **Compass** to be the single, cohesive copilot that unifies tasks, code architecture decisions, and academic coursework with verifiable memory and autonomous planning.

#### What It Does
Compass is an autonomous productivity agent and conversational copilot with persistent memory across three partitioned domains: **Hackathons**, **Code**, and **Coursework**. Accessible via both a sleek dark-mode web dashboard and a native terminal CLI, Compass:
1. **Intelligently Routes & Executes Skills (<400ms)**: Uses **NVIDIA Nemotron-3 Nano** to parse user intent into structured skills (`add_task`, `query_tasks`, `log_code_context`, `verify_deadline`) without brittle regex or JSON parsing errors.
2. **Maintains Dense Semantic Code & Lecture Memory**: Generates 768-dimensional Matryoshka-truncated embeddings via `Qwen/Qwen3-Embedding-8B` on Nebius Token Factory, indexing snippets in Neon Serverless PostgreSQL with `pgvector` HNSW cosine indexing for sub-5ms semantic search.
3. **Reasoning with Human-in-the-Loop Confirmation**: Features an autonomous **ReAct (Reason + Act)** planner powered by **NVIDIA Nemotron-3 Super (120B)**. Read-only queries execute instantly, while state-mutating actions (`add_task`, `edit_task`, `delete_task`, `ingest_url`) halt at a confirmation gate requiring explicit user approval.
4. **Synthesizes Executive Roadmaps**: Reserved for **NVIDIA Nemotron-3 Ultra (550B)**, which aggregates cross-domain tasks and identifies deadline conflicts, balancing coursework with hackathon deliverables.
5. **Real-Time Web Intelligence & Anti-Hallucination**: Integrates **Tavily Web Search & Extract** to verify external contest rules and ingest documentation with indirect prompt injection defenses (`<untrusted_web_content>`) and epistemic humility (`[ABSTAIN]`).
6. **ChatGPT-Style Chat Management & Public Share Links**: Full conversation lifecycle (Pin, Rename, Archive, Delete modal) and 1-click viral public share URLs (`/?share=<id>`) so collaborators and judges can view conversations without logins.

#### How We Built It
- **AI Inference (100% Nebius Token Factory)**:
  - `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`: Sub-400ms intent routing & native function calling.
  - `nvidia/nemotron-3-super-120b-a12b`: Deep skill reasoning and technical code retrieval synthesis.
  - `nvidia/Nemotron-3-Ultra-550b-a55b`: Multi-domain executive roadmap synthesis.
  - `Qwen/Qwen3-Embedding-8B`: 768-dim dense semantic vector embeddings.
- **Database Layer**: Neon Serverless PostgreSQL 16 with `pgvector` HNSW cosine index (`<->`) and pooled connections.
- **Backend Architecture**: FastAPI, Python 3.12, Uvicorn, and Server-Sent Events (SSE) token streaming, deployed on Render with 24/7 keep-alive monitoring.
- **Frontend Architecture**: React 18, Vite, Vanilla CSS design system, deployed on Vercel with same-origin edge rewrites (immune to client-side ad-blockers).
- **Web Intelligence**: Tavily Async API with prompt injection sanitization and credit tracking in `tavily_usage_log`.

#### Challenges We Ran Into
1. **The 2,000-Dimension pgvector HNSW Limit**: `Qwen3-Embedding-8B` produces 4,096-dimensional vectors by default, which exceed pgvector's HNSW index limit. We implemented Matryoshka dimension truncation down to 768 dimensions with L2 normalization, fitting the index and achieving 100% Top-1 recall in retrieval benchmarks.
2. **Preventing LLM Hallucination on Dynamic Hackathon Rules**: LLM cutoffs cannot know if a deadline was extended. We paired Nemotron with Tavily's `verify_deadline` skill and epistemic `[ABSTAIN]` tokens to force the agent to consult live web data.
3. **Safe Autonomous Agent Mutations**: Multi-step agents can easily corrupt user data if allowed to run mutations unchecked. We engineered a strict Human-in-the-Loop confirmation gate with state recovery and audit logging (`agent_audit_log`) supporting full 1-click undo.

#### Accomplishments That We're Proud Of
- **100% Test Coverage**: Over 145 passing automated tests across memory, agent loops, endpoints, and CLI commands.
- **Blended Model Economics**: Squeezed 106 full-turn evaluations into just **$0.019** on Nebius Token Factory by dispatching 85% of queries to Nano and PostgreSQL directly.
- **Zero-Friction Evaluation**: Judges can immediately use the live web app and API without setting up accounts or providing API keys.
- **ChatGPT-Quality UX**: Complete chat management with sidebar context menus and instant shareable public links.

#### What We Learned
- Hierarchical open-source model routing outperforms a single monolithic model in both latency and economics.
- Epistemic abstention (`[ABSTAIN]`) paired with targeted web retrieval effectively eliminates hallucination in time-sensitive agent workflows.

#### What's Next for Compass
- Multi-calendar synchronization (Google Calendar, Apple iCal).
- Automated GitHub commit webhooks to log architecture changes passively into vector memory.
- Activating the prepared Nebius Serverless Compute manifests (`deploy/`) once tenant billing verification clears.

#### Team & Contributors
- **Rhythm**: Backend Architecture, Database Schema, and Nebius Token Factory Tool Registration
- **Nandani**: Frontend Web Dashboard, Real-Time Context Stream UI, and Chat Interface
- **Kunal**: Frontend UI Contributor (Timeline Modernizations, UI Components & Refinements per PR #8 & #11)
- **Ratnesh Singh** (VIT+IIT): System Integration, Deployment Engineering (Render, Vercel, Nebius Manifests), and Terminal CLI

---

### 🎁 Bonus Award 1 Justification: Best Use of Tavily ($3,000)

Compass implements Tavily not as an afterthought, but as a core architectural pillar bridging static LLMs and dynamic web reality:
1. **3 Purpose-Built Web Skills**:
   - `search_web`: Live search with domain filtering and citation tracking.
   - `ingest_url`: Human-gated Tavily Extract pipeline that chunks, embeds (768-dim), and stores external docs into PostgreSQL with full undo capability.
   - `verify_deadline`: Proactively checks stored hackathon deadlines against official contest web sources to detect extensions or schedule drift.
2. **Epistemic Humility & Escalation (`[ABSTAIN]`)**: When asked about information past model cutoff or absent from local memory, Nemotron models output `[ABSTAIN]`, which the agent loop intercepts to query Tavily dynamically.
3. **Defense Against Indirect Prompt Injection**: All fetched web data passes through `fence_web_content()` and `scan_for_injection()`, strictly wrapping content in `<untrusted_web_content>` XML fences before entering any model prompt.
4. **Dedicated Credit Accounting**: Web credit usage is partitioned and tracked in `tavily_usage_log` separately from GPU token costs.

---

### 🎁 Bonus Award 2 Justification: Most Valuable Feedback Award ($100 + NVIDIA Swag)

*(See Part 3 below for the full developer feedback text to submit via the hackathon feedback form).*

---

## 🎬 Part 2: 3-Minute Video Demo Script

> **Target Duration**: 2 minutes 45 seconds  
> **Presenter**: Calm, confident, technical pace.  
> **Setup**: Split screen or browser with [https://compass-farmlytics.vercel.app](https://compass-farmlytics.vercel.app) and terminal with `compass status`.

| Timestamp | Video Screen Action | Spoken Narration (Script) |
| :--- | :--- | :--- |
| **0:00 – 0:25** | Open Compass dashboard showing the clean dark interface with timeline, domains, and chat panel. | *"Hey everyone! Meet Compass, an autonomous AI copilot engineered for intense dual-track academic and hackathon workloads. As students balancing university coursework, active open-source codebases, and multiple hackathons, we needed an AI that actually remembers context across domains, verifies real-world deadlines, and plans autonomously."* |
| **0:25 – 0:50** | In the chat box, type: `add a task: submit final demo video, domain hackathon, due tomorrow 5pm`. Press Enter. Show instant response and task appearing in timeline. | *"Under the hood, Compass uses a 3-tier NVIDIA Nemotron architecture on Nebius Token Factory. Notice the sub-400 millisecond response: NVIDIA Nemotron-3 Nano instantly classified user intent into structured function calls, updating our Neon PostgreSQL database without brittle regex."* |
| **0:50 – 1:20** | Type in chat: `log code context: We configured 768-dim Matryoshka embeddings with Qwen3 on Nebius and Neon pgvector`. Then type: `How did we configure our vector embeddings?` | *"Compass also retains deep technical memory. Here, it vectorizes code decisions using Qwen3 embeddings on Nebius, truncated to 768 dimensions for pgvector HNSW compliance. When asked, Nemotron-3 Super synthesizes the answer grounded strictly in retrieved vector chunks."* |
| **1:20 – 1:55** | Switch to the **🧠 Agent Planner** tab. Enter goal: `Plan my week: balance hackathon deliverables with my RISC-V coursework`. Click Run. Show real-time streaming steps (THINK, TOOL CALL, CONFIRMATION REQUIRED). Click Approve & Execute. | *"Now let's see the autonomous ReAct agent. Nemotron-3 Super reasons across multiple steps. Notice this confirmation gate: read tools run automatically, but state mutations require human approval. When I click Approve, it executes and escalates to Nemotron-3 Ultra (550B) to synthesize an executive cross-domain conflict analysis."* |
| **1:55 – 2:20** | In chat, ask: `Verify the deadline for the Nebius x NVIDIA hackathon using Tavily`. Show Tavily web extraction with `<untrusted_web_content>` fencing. | *"Compass bridges LLM cutoffs with Tavily Web Intelligence. With dedicated skills like verify_deadline and ingest_url, it checks live contest rules to detect schedule changes, protected by prompt injection fences and epistemic abstention."* |
| **2:20 – 2:45** | Click the 3 dots on the current chat in the sidebar. Click **Share**. Show the modal generating the link. Copy link, open in incognito tab (`/?share=...`). | *"Finally, Compass supports full ChatGPT-style chat management: pin, rename, archive, and instant 1-click public sharing. Anyone with this link can view the conversation with full Markdown and timestamps, with zero login barriers. Compass: your one AI that remembers every hackathon, repo, and deadline. Thank you!"* |

---

## 📝 Part 3: Nebius & NVIDIA Developer Feedback (For the $100 Award)

### Feedback on Nebius Token Factory & NVIDIA Nemotron Models
1. **Nemotron-3 Nano (30B) Native Function Calling**:
   - *Praise*: Function calling latency is exceptional (<400ms), rivaling proprietary sub-8B models while providing much higher schema adherence. We experienced zero malformed tool JSON across >150 test runs.
   - *Constructive Suggestion*: When multiple tools are passed in `tools`, Nano occasionally emits multiple sequential tool calls in a single response turn where the OpenAI spec expects one or an array. Clearer documentation on multi-tool calling conventions in Token Factory would save developers integration time.
2. **Qwen3-Embedding-8B on Token Factory**:
   - *Praise*: Serving embedding models alongside generative models under a single OpenAI-compatible base URL (`/v1/embeddings`) significantly simplified our SDK configuration.
   - *Constructive Suggestion*: The native 4,096-dimension output is too large for standard `pgvector` HNSW indexes (<2,000 dims). Providing a native `dimensions` query parameter in the Token Factory embedding endpoint (standard Matryoshka slicing) would prevent developers from having to perform manual slicing and L2 re-normalization in client code.
3. **Nemotron-3 Ultra (550B) Context-Escalation Performance**:
   - *Praise*: Synthesis quality across multi-domain structured payloads was remarkably thorough, identifying subtle schedule conflicts that smaller models missed.
   - *Constructive Suggestion*: Adding streaming support (`stream=True`) for Ultra in Token Factory with lower initial time-to-first-token (TTFT) would significantly enhance interactive executive summary user experiences.

---

## 🔀 Part 4: Pull Request Description Template (Reuse Over Replacement)

> **Use this text when opening or updating your Pull Request to `Ratnesh-101/compass` to clearly communicate that Northstar and Specialist Team coexist with and build upon the existing system rather than replacing it.**

### Title:
`feat: introduce Northstar AI workspace, Specialist Team, and ChatGPT-style chat sharing (composition & reuse)`

### Description:
```markdown
### Summary of Changes: Composition & Reuse, Not Replacement

This PR introduces the **Northstar AI** workspace, the **Specialist Team** multi-agent layer, and **ChatGPT-style chat management with 1-click public sharing**, designed around **composition and reuse rather than replacement**.

Every existing foundational component remains 100% intact, active, and leveraged:
- **Existing Chat**: Preserved and integrated inside the unified Northstar shell.
- **Existing Agent Planner (ReAct)**: Preserved and integrated inside the Northstar shell.
- **Existing Timeline**: Preserved as the primary task and deadline feed.
- **Existing Calendar**: Preserved with Google Calendar OAuth sync.
- **Existing Confirmation Flow**: Preserved and reused across all mutating tool calls.
- **Existing Audit & Undo**: Preserved (`agent_audit_log` with 1-click rollback via `/api/agent/undo`).

### System Architecture:
```text
                    COMPASS
                       │
          ┌────────────┴────────────┐
          │                         │
     🧭 NORTHSTAR             🧠 SPECIALIST TEAM
          │                         │
    ┌─────┴─────┐          ┌────────┼────────┐
    │           │          │        │        │
   Chat     Agent/ReAct  Coursework Research Calendar Memory
    │           │
    └─────┬─────┘
          │
          │ delegate when needed
          ▼
    Specialist Team
          │
          ▼
       Result
          │
          ▼
      Northstar
          │
          ▼
 Confirmation → Execution → Audit → Undo
```

### Why This Architecture?
Rather than forcing users to treat Chat and Agent Planner as two competing AI destinations, **Northstar** serves as the unified top-level assistant shell combining conversational chat and goal planning. Meanwhile, the **Specialist Team** (Coursework, Research, Calendar, Memory) remains a dedicated first-class workspace for direct specialist interaction or autonomous delegation.

### Key Additions:
1. **Unified Northstar Shell**: Seamless switching between Conversational Chat and Autonomous ReAct Goal Planning.
2. **Specialist Multi-Agent Layer**: Dedicated experts with scoped toolkits and system prompts.
3. **ChatGPT-Style Session Management**: Pin, rename, archive, and delete chats with interactive confirmation dialogs.
4. **1-Click Public Sharing**: Instant unauthenticated share URLs (`/?share=<id>`) for public viewing with zero login barriers.
5. **Full Test Suite & Zero Regressions**: All 145+ tests passing against live PostgreSQL.
```


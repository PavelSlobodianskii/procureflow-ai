# Task 0002: Vercel demo deployment (two projects, owner-only, persistent storage)

| | |
|---|---|
| **Status** | **PROPOSED. Plan only.** On 2026-11-08 the owner approved D1, D3, D5, D6 and Option A (two separate Vercel projects), and approved D4 conditionally. D7 is pending. **No code change, dependency, database, commit, push or deployment is approved yet.** Each phase below needs its own approval. Current states (deployed, tested, production-ready) are in section 2 |
| **Integration branch** | To be created from the updated `main` after the owner approves (suggested name `feat/vercel-deployment`) |
| **Budget** | EUR 0 planned. Hard maximum EUR 5 per calendar month for everything combined (B-4). Vercel Hobby and Neon Free only: no card, no paid plan, no domain (B-3, B-5) |
| **Data** | Synthetic only |
| **Contract** | `contracts/purchase-request-v1/` stays frozen and unchanged. Its tree hash must remain `62f0a6f7e20aa7a17b8f9bc2e66f50c7bc7a61bf` |
| **Workflow** | One writing Claude Code session on one branch. The owner performs every deployment and every step that touches Vercel, Neon or a secret |

## 1. Goal and scope

Run the purchase-request slice (task 0001) on Vercel as a demo that **only the owner can use**, with drafts that **survive restarts and redeploys**.

In scope:
- A configurable HTTPS `BACKEND_URL` for the Next.js frontend, with the local setup unchanged (section 7, phase 2a).
- A gateway token so that the backend refuses everything that does not come from the frontend project (phase 2b).
- A PostgreSQL repository on Neon Free, before any production write is enabled (phase 3).
- A documented, owner-run deployment workflow (section 8).

Out of scope: authentication and RBAC (S1), a public demo, rate limiting, a separate worker process, contract changes, Docker, any paid service, any change to the approved architecture beyond B-5 and B-6.

## 2. State vocabulary and current status

Three words are used in this project, and each means exactly one thing. A document or message must not use one of them for another.

| Word | Meaning | Evidence that is required |
|---|---|---|
| **Deployed** | The code is running at a URL. It says nothing about who can reach it, whether it is correct, or whether it is safe | A response observed from that URL with its date, or the Vercel deployment record |
| **Tested** | Named tests passed, for a stated scope, in a stated place | The command, the counts, and where it ran (local, the public URL, or owner-run). A test run on a local copy does **not** make the deployed copy tested |
| **Production-ready** | Every acceptance criterion V1 to V9 holds, the deployed copy itself was tested, and the owner signed it off in writing | **Not claimed for any part of T3.** T3 is a demo target. This word is reserved |

**Status on 2026-11-08** (re-check before relying on it):

| Part | Deployed | Tested | Production-ready |
|---|---|---|---|
| Contract v1 files | n/a (files only) | Tree hash identical at the frozen commit and on `main` | n/a |
| Backend code on `main` | n/a | Local: 260 pytest, ruff clean. The 614-check contract replay ran against a **local** backend and a **local** frontend | No |
| Backend on Vercel | **Yes.** Observed at a public `*.vercel.app` URL. Source and settings not verified (section 4) | **Read-only GET probes only** (health 200, unknown route 404 problem, GET on the POST route 405 with `Allow: POST`). No POST was ever sent to the public deployment. The deployed copy has not been run through the contract cases | **No.** Reachable without authentication. In-memory storage on serverless instances |
| Frontend code on `main` | n/a | Local: 371 vitest, eslint, tsc, `next build` | No |
| Frontend on Vercel | **Not verified.** The owner refers to an existing project. No URL was provided and nothing can be read from Vercel | Not tested against any Vercel backend | No |
| Gateway token on the backend | No. Not written | n/a | No |
| Neon database | No. Not created | n/a | No |
| Vercel Authentication on the backend | **Not applied.** A public GET still returned application data on 2026-11-08 (phase 0 pending) | n/a | n/a |

## 3. Owner decisions (2026-11-08)

| ID | Decision | Status |
|---|---|---|
| D1 | Vercel Hobby plus Neon Free as a demo-only target (B-5) | Approved |
| D2 | Option A: two separate Vercel projects joined by an HTTPS `BACKEND_URL`. Vercel Services (Beta) was evaluated and rejected for now | Approved |
| D3 | `AGENTS.md` amended: owner-run deployments, Claude never holds Vercel or Neon credentials | Approved |
| D4 | One maintained PostgreSQL driver for Python and Vercel | **Conditional.** Proposal in section 10. The owner approves the exact package and its licence before it is added |
| D5 | The "no network call" criterion of task 0001 applies to task 0001 only. Task 0002 may add one database connection | Approved |
| D6 | No unrestricted public access until S1 and findings B1 to B5 are fixed (B-6) | Approved |
| D7 | Switching off Vercel Authentication on the backend project | **Pending. Never automatic.** Not part of any phase. It needs the owner's separate, explicit approval, given after the evidence in phase 5a exists, and it must amend B-6 at the same time (B-6 says every public URL is owner-only through Vercel Authentication). Alternatives: keep it on if "Protection Bypass for Automation" turns out to be available on Hobby (not verified), or do not connect the frontend to the backend at all |

## 4. Existing Vercel projects (verification record)

**Rule:** nothing about the existing projects is assumed. Every line below is marked *Verified* (with how and when), *Inference*, or *Not verified* (the owner fills it in). Claude cannot read project settings: the Vercel MCP server is not authenticated, the Vercel CLI is not installed, and Claude holds no Vercel token. Environment variable **values** are never recorded, only names and scopes. The target settings in section 7 are what the plan needs. They are not a description of what exists.

**How to complete this section:** the owner copies the dashboard values (no secrets) into the "Not verified" lines, or authenticates the Vercel MCP server and asks Claude for read-only calls (list and get only).

### 4.1 Backend project

| Item | Value | Status |
|---|---|---|
| Public URL | A `*.vercel.app` URL known to the owner (not recorded here) | Verified: reachable on 2026-11-08 |
| What it serves | This repository's FastAPI app: `GET /health` returns 200 JSON with service `procureflow-api`, version `0.1.0`, `storage_mode: in_memory_dev`. An unknown route returns the contract's 404 problem. `GET /api/v1/requests` returns the contract's 405 problem with `Allow: POST` | Verified: public GET probes, 2026-11-08 |
| Who can reach it | Anyone. An unauthenticated GET returned application data | Verified: public GET probes, 2026-11-08 |
| Function region | `iad1` (the response header `x-vercel-id` shows `fra1` then `iad1`) | Inference from a header |
| Commit or branch of the live deployment | | Not verified. GitHub shows no deployment record or status for the repository |
| Deployed through Git or by upload or CLI | | Not verified |
| Root Directory and framework preset | | Not verified |
| Entry point and Python version used | | Not verified |
| Production Branch and connected repository | | Not verified |
| Environment variable names and scopes | | Not verified. The backend reads none today, so none are required |
| Deployment Protection setting | | Not verified in the dashboard. The public probe shows it is not effective |
| Plan, billing, card on file | | Not verified. The owner confirms Hobby and no card |
| Behaviour of `POST /api/v1/requests` on it | | Not tested. No POST was sent |

### 4.2 Frontend project

| Item | Value | Status |
|---|---|---|
| Existence | The owner refers to an existing frontend project | Not verified: no URL was provided, and nothing can be read from Vercel |
| URL, Root Directory, framework, Node version | | Not verified |
| Connected repository, Production Branch, live commit | | Not verified |
| Environment variable names and scopes (`BACKEND_URL` and others) | | Not verified |
| Which backend it forwards to, if any | | Not verified. It cannot reach a remote backend with the code on `main`, because `next.config.ts` accepts loopback addresses only |
| Deployment Protection setting | | Not verified |

## 5. Target architecture

```
Owner's browser
   |  HTTPS, Vercel Authentication (scope "All Deployments")
   v
Vercel project "frontend"   target Root Directory: frontend    (the only entry point for people)
   |  rewrite /api/v1/*  ->  BACKEND_URL (https), adds the gateway token header
   v
Vercel project "backend"    target Root Directory: backend     (rejects requests without the token;
   |                                                             keeps its own Vercel Authentication
   |                                                             on until the owner decides D7)
   |  pooled PostgreSQL connection, one short-lived connection per request
   v
Neon Free PostgreSQL        (drafts and outbox events; the single source of truth)
```

The browser never talks to the backend project directly. CORS stays disabled. No Server Actions. **Known consequence of keeping Vercel Authentication on the backend:** the frontend's server-side calls would meet Vercel's login wall instead of the API, so the two projects cannot work together until D7 is decided or a bypass is verified (phase 4, step 4).

## 6. Settings and secrets

No secret appears in source code, docs, chat, logs, test output or a commit. Names only are recorded here. This table lists what the plan needs. It does not describe what is currently set.

| Variable | Project | Scope | Set by | Secret | Purpose |
|---|---|---|---|---|---|
| `BACKEND_URL` | frontend | Production | owner | no | `https://` origin of the backend project |
| `BACKEND_ALLOW_REMOTE` | frontend | Production | owner | no | Must be exactly `1` to allow a non-loopback `BACKEND_URL` |
| `BACKEND_GATEWAY_TOKEN` | frontend | Production | owner | **Tier 2** | Sent to the backend as a header. Never `NEXT_PUBLIC_*` |
| `GATEWAY_TOKEN` | backend | Production | owner | **Tier 2** | Same value as above. At least 32 random characters |
| `DATABASE_URL` | backend | Production | owner | **Tier 2** | Neon **pooled** connection string. Phase 3 |
| `TEST_DATABASE_URL` | none (owner's shell only) | n/a | owner | **Tier 2** | For the owner-run Postgres test run. Never stored in Vercel |

No variable is set for the "Preview" scope, so preview deployments cannot reach the production database. Rotation: the owner generates a new token, sets it in both projects and redeploys both.

## 7. Implementation plan

Each step lists who acts. "Claude" steps happen only after the owner approves that phase.

### Phase 0: containment (owner, dashboard, no code, EUR 0). Do this first.
1. On the existing backend project: Settings, Deployment Protection, **Vercel Authentication, scope "All Deployments"**. Do not use "Standard Protection" (it leaves production domains public). Do not use Password Protection (paid).
2. Verify: a plain `GET /health` from a logged-out browser or from `curl` no longer returns the JSON health document.
3. If step 1 is not available, pause the project (Settings, General) until the later phases are done.
4. Do not add a card and do not click any upgrade button.

### Phase 1: inventory, sync and verification (owner and Claude)
1. Owner: fill in section 4 for both projects from the dashboard (Settings, General, Git, Environment Variables names only, Deployment Protection, and the Deployments tab with branch and commit). Confirm the plan is Hobby with no card.
2. Claude, after the owner asks: read-only checks only (`git ls-remote`, the public GitHub API, GET requests to the owner's URLs). If the owner authenticates the Vercel MCP server, read-only list and get calls only.
3. Owner approves: update the local checkout (`git pull` of `main`) and create the working branch.
4. Output: section 4 has no empty "Not verified" line that a later phase depends on.

### Phase 2a: frontend backend-URL configuration (Claude)
Files: `frontend/next.config.ts`, `frontend/tests/safety.test.tsx`, a new proxy file under `frontend/`.
- Loopback stays accepted exactly as today. The default stays `http://127.0.0.1:8000`.
- A non-loopback `BACKEND_URL` is accepted only if **all** of these hold: `BACKEND_ALLOW_REMOTE` is exactly `1`; the scheme is `https`; no user name or password; the path is empty or `/`; no query and no fragment. Otherwise the build stops with an error that never prints the value.
- The proxy file (`proxy.ts` or `middleware.ts`, depending on the Next.js 16 convention in the bundled Next.js docs) adds the header `x-procureflow-gateway` from `BACKEND_GATEWAY_TOKEN` to requests under `/api/v1/` when the variable is set. Nothing is added when it is unset (local development).
- **Open question, proven before it is relied on:** whether a header set in the proxy reaches an external rewrite destination. A throwaway test deployment answers it, and the owner creates and deletes that deployment. Fallback: one route handler under `app/api/v1/` that forwards the raw body and the status and headers of the answer unchanged.
- Tests (local): the existing loopback and refusal tests stay unchanged. New tests: remote accepted only with the flag, https, no credentials, no path; the error message never contains the value; the header is added only when the token is set and only under `/api/v1/`; no `NEXT_PUBLIC_` variable carries the token.

### Phase 2b: backend gateway (Claude)
Files: `backend/app/platform/gateway.py` (new), `backend/app/main.py` (one parameter), `backend/index.py` (new, **outside `app/`**), `backend/pyproject.toml`, `backend/.python-version`, new tests.
- `GatewayGate`: a pure ASGI middleware. With no token the gate is off (local development and every existing test). With a token, every HTTP request must carry `x-procureflow-gateway` with the same value, compared with `hmac.compare_digest`. Otherwise the answer is **exactly the contract's 404 problem for that path** (same body, headers and `instance` as an unknown route). No new status code, no new problem type: contract v1 is unchanged.
- `create_app(..., gateway_token=None)`. The app factory still reads no environment.
- `backend/index.py` reads `GATEWAY_TOKEN` (and, in phase 3, `DATABASE_URL`), builds the app and exposes `app`. If the environment variable `VERCEL` is set and `GATEWAY_TOKEN` is missing or shorter than 32 characters, every route answers the 404 problem (fail closed).
- `pyproject.toml`: `[tool.vercel] entrypoint = "index:app"`. `backend/.python-version`: `3.14`, the version the test suite runs on, to be confirmed in the first build log. The local command `uvicorn app.main:app` keeps working.
- Tests (local): gate off by default; wrong, missing and empty token give the exact contract 404 body; correct token gives the normal answer on `/health` and `POST /api/v1/requests`; fail-closed on Vercel without a token; `test_app_reads_no_environment_or_env_files` passes unchanged because the environment is read only in `index.py`; a new test asserts that `index.py` is the only file that reads it. The full contract and shared-case tests still pass.

### Phase 3: persistence (Neon Free), before any production write
1. **Owner:** create the Neon account directly at neon.com (not through the Vercel Marketplace), Free plan, no card. Create one project. Choose the region that matches the backend's Vercel function region, and set that region explicitly in the Vercel project. Copy the **pooled** connection string into the backend project's `DATABASE_URL` (Production, Sensitive). Nobody else sees it.
2. **Claude:** `backend/migrations/0001_purchase_requests.sql` with the tables `purchase_requests` and `outbox_events` and a sequence for the ID number (`MAXVALUE 999999 NO CYCLE`, so the ID format of the contract holds). **The owner reviews the SQL and applies it by hand** in the Neon SQL editor. Applied migrations are never edited afterwards.
3. **Claude:** `backend/app/modules/requests/repository_postgres.py`: `add(draft, event)` inserts the draft and its outbox event in **one transaction**. One short-lived connection per request (no pool inside a function). Connect and statement timeouts of a few seconds. Server-side prepared statements off, because the pooled endpoint is a transaction pooler (to be confirmed in the driver documentation before coding). ID allocation moves into the transaction (an `INSERT ... RETURNING` or an async ID port). The design is settled in the review of this phase, before code is written.
4. **Claude:** `index.py` selects the Postgres repository when `DATABASE_URL` is set, and starts **no** in-process dispatcher on Vercel. Outbox events stay `pending`. Nothing reads or acts on them until a real worker exists (a later task).
5. **Claude:** the static test that forbids network libraries is amended deliberately: it allows exactly the approved driver, in exactly one module.
6. **Tests:** one repository contract test runs against the in-memory and the Postgres repository. The Postgres variant is skipped unless `TEST_DATABASE_URL` is set. This PC has no Docker and no `psql` (checked on 2026-11-08), so the **owner runs the Postgres variant** against a Neon branch (the Free plan has 10 branches) and shares only the pass or fail summary. A local PostgreSQL install is an alternative and needs a separate approval.
7. **Owner:** set `DATABASE_URL`, redeploy the backend, submit one draft, restart or redeploy, and confirm that the row is still there.

### Phase 4: frontend deployment (owner)
1. **Inspect before creating.** Compare the existing frontend project (section 4.2) with the target settings below and list every difference for the owner. Create a project only if none exists, and only after the owner approves.
2. **Target settings** (what the plan needs, not what exists): Root Directory `frontend`, Framework Next.js, Production Branch `main`, the three frontend variables of section 6 with scope Production only, Deployment Protection Vercel Authentication with scope "All Deployments". The rewrite is fixed when the app is built, so **redeploy after every change of these variables**.
3. Backend project: set `GATEWAY_TOKEN` (same value) and `DATABASE_URL` (Production only), then redeploy.
4. **Vercel Authentication on the backend stays on.** No step of this plan, and no action by Claude, switches it off. Switching it off is decision D7, which is separate and pending. Until D7 is decided, the connected setup does not work end to end (see section 5), and phase 4 stops at: frontend deployed and protected, backend deployed and protected. If "Protection Bypass for Automation" proves to be available on Hobby (not verified), both layers can stay on and D7 is not needed.

### Phase 5: verification (Claude reads, owner acts)
**5a. Before any D7 decision** (backend still protected):
1. A logged-out visitor sees the Vercel login page on the frontend and on the backend.
2. The gateway behaviour is **tested locally** (phase 2b tests). It is not yet tested on the deployed copy, and the documents must say so.
3. Persistence: a draft written while the owner is logged in survives a cold start and a redeploy, if the frontend can reach the backend by a verified bypass. Otherwise this check waits for D7.

**5b. Only after the owner has approved D7 in writing:**
1. Direct request to the backend URL without the token: the contract 404 problem, never a health document.
2. With the token (the owner runs this, the token is not pasted into chat): `GET /health` is 200 and the 52 shared cases pass through the frontend. The contract tree hash is unchanged.
3. Browser walkthrough by the owner: one valid and one invalid form through the frontend, logged in to Vercel.
4. Persistence across a cold start and a redeploy.
5. Hygiene: no secret in the diff, `git diff --name-only` lists only the files named in this brief, local development (`uvicorn` plus `npm run dev`) works unchanged.

Only checks 5b.1 to 5b.4 can move the **deployed** copy to **tested**. Even then it is never called production-ready (section 2).

## 8. Deployment workflow (owner-run)

- **Source:** the target is that both projects are connected to the GitHub repository with Production Branch `main`, so that a change reaches production only through a reviewed pull request merged by the owner. This is a target. The current deployments may have been made another way (section 4), and the owner decides whether to switch. Claude never deploys, never runs `vercel` commands and never changes Vercel or Neon settings. If the owner authenticates the Vercel MCP server, Claude uses it for read-only calls only.
- **Order of a release:** merge to `main`, backend deploys first, check, then the frontend, check. A frontend release that needs a backend release waits for it.
- **Environment changes:** always followed by a redeploy of the affected project.
- **Rollback:** promote the previous deployment in the Vercel dashboard (to be tried once on a harmless change). Database changes are forward-only migrations.
- **Kill switch:** pause the Vercel project, or turn Vercel Authentication on again.
- **Spend:** the owner never adds a card and never upgrades. Passing a free limit pauses or blocks the service. It does not bill. Each month the owner checks the ledger in `docs/architecture.md` Section 13.

## 9. Acceptance criteria

- V1. The frozen contract is unchanged (tree hash above) and every contract and shared-case test passes.
- V2. Backend and frontend test suites, lint, typecheck and build pass, with real output shown.
- V3. A request to the backend without the token never reaches a route handler and gets the contract 404 problem. Proven locally by tests in phase 2b, and on the deployed copy only after D7 (phase 5b).
- V4. The frontend build refuses a non-loopback `BACKEND_URL` unless all conditions of phase 2a hold. Local setup is unchanged.
- V5. Drafts persist in Neon and survive a restart and a redeploy.
- V6. No secret in the repository, in build output or in logs. No `NEXT_PUBLIC_` secret.
- V7. Total additional spend is EUR 0, no card is on file, and the ledger entries are present.
- V8. No commit, push, deployment or Vercel setting change happened without a separate owner approval. Vercel Authentication was never switched off without D7.
- V9. Every statement of status in the documents uses "deployed", "tested" and "production-ready" as defined in section 2, and section 4 has no unverified item that a completed phase depended on.

## 10. Driver proposal for D4 (not yet added, owner approves the exact package)

Data from PyPI metadata, read on 2026-11-08. The licence texts are confirmed at install time from the package files.

| | `psycopg[binary]` (psycopg 3) | `asyncpg` |
|---|---|---|
| Version | 3.3.8 (2026-11-04) | 0.32.0 (2026-10-06) |
| Licence (PyPI metadata) | **LGPL-3.0-only** | **Apache-2.0** |
| Python | 3.10 and newer, classifiers up to 3.15 | 3.9 and newer, classifiers up to 3.14 |
| Linux x86_64 wheel for Python 3.14 | Yes (`psycopg-binary`) | Yes |
| Release activity | 4 releases between 2026-08-31 and 2026-11-04 | Previous release 2025-11-24 (about 10 months earlier) |
| Async API for FastAPI | Yes | Yes (async only) |
| Behind a transaction pooler | Needs `prepare_threshold=None` (to be confirmed in its docs) | Needs the statement cache off (to be confirmed in its docs) |

**Recommendation: `psycopg[binary]`.** It is the more actively maintained of the two, it supports Python 3.12 to 3.14 (the versions Vercel offers) and it has a ready wheel for Linux. Its licence is the weak copyleft **LGPL-3.0**: using it unmodified as a dependency of a project with its own licence is normal, and the cost is that its licence notice must be kept. If the owner prefers a permissive licence, `asyncpg` (Apache-2.0) is the alternative, with slower recent releases. The final choice, with the licence text checked, is the owner's before anything is installed.

## 11. Deferred findings (task 0001, section 13) and this task

| ID | Effect of this task |
|---|---|
| B1 (Medium) | Production storage becomes PostgreSQL, so the in-memory growth and the dispatcher scan disappear there. The 999,999 ID limit remains and is enforced by the sequence. The in-memory repository stays for local development |
| B2, B3 | Unchanged. Contract v1.1 candidates, still deferred |
| B4 | Unchanged. Still scheduled for the first backend fix that touches `api.py` |
| B5 | Reduced: the gateway makes any request without the token a 404. A Host allowlist is still needed before authentication or real data |
| B6 | Unchanged. Vercel installs from `pyproject.toml` without a lock file. A lock file needs a separate tool approval |
| F1, F3 | Unchanged. They concern the mock and `next start`, which are not used on Vercel |
| F2 | Unchanged. The CSP still contains only `frame-ancestors 'none'`. Revisit before any public demo |

## 12. Risks and unverified items

- Section 4: the configuration of both existing projects is not verified.
- Header propagation through an external rewrite (phase 2a). Fallback defined.
- "Protection Bypass for Automation" and rate-limit rules on Hobby. Not relied on.
- Cold starts: Neon resumes after 5 minutes idle. The form's 10 second timeout should cover it. Measure it in phase 5.
- Hobby is for non-commercial personal use. A portfolio demo fits. Revisit if the purpose changes.
- Vercel and Neon limits and prices can change. Re-check them at each phase.

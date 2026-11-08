# Task 0001: Purchase request slice (form -> FastAPI validation)

| | |
|---|---|
| **Integration branch** | `feat/purchase-request-slice` (lead) |
| **Status** | **API contract v1 is APPROVED and FROZEN by the owner (2026-11-08).** Worktrees are not created yet. No application code exists |
| **Budget** | EUR 0. No paid or external services. No API keys. No live LLM |
| **Data** | Synthetic only |
| **Workflow** | Two writing Claude Code sessions in two Git worktrees (backend, frontend), coordinated by a lead session |

## 1. Goal and scope

The smallest runnable full-stack slice:

- A responsive, accessible purchase-request form (Next.js) with item or service description, quantity, estimated unit price, currency and requester display name (synthetic).
- Client-side validation, then a JSON submit to FastAPI.
- Server-side validation with typed schemas. Invalid input is rejected with a structured error.
- A valid request returns an ID, status `"draft"` and the validated data. **Nothing is approved, released, sent to a supplier or turned into a purchase order.**
- `GET /health` and `POST /api/v1/requests`.
- Loading, success and error states in the UI.

### Owner decisions for this task

1. **Option A persistence and events** (section 2). No PostgreSQL, no queue, no Docker in this slice.
2. **Resilience:** bounded timeouts and backoff now (section 3). **Circuit breaker deferred** to the first external integration.
3. **Currencies:** `EUR`, `USD`, `GBP`, `CHF`, with explicit validation. **No currency conversion and no FX API call** in this slice.
4. **Parallel build:** two independent writing sessions in two worktrees (section 7). Maximum two writers. No subagents are created for the build. The existing read-only reviewers run later.

### Rules that stay in force

- Runtime agents recommend, humans authorise money. No code in this slice approves, releases or calls an ERP. The only status that exists is `draft`.
- Money is computed by code, never by an LLM. Prices are decimal strings on the wire and `Decimal` on the server, never floats.
- No real names, emails, companies, purchase orders or credentials. Strict EUR 5 per month additional budget, target EUR 0.
- Do not read, edit or create `.env*` files. Configuration for local runs uses PowerShell variables, not `.env` files.

## 2. Option A, exactly

Option A means "pretend-durable storage, honestly labelled". Everything runs inside the single API process.

| Part | What it is |
|---|---|
| Repository interface | `RequestRepository` with one write method `add(draft, event)`. It stores the draft and the outbox event together under one lock, the in-memory stand-in for a database transaction |
| In-memory implementation | `InMemoryRequestRepository`, labelled **DEV ONLY**. Data is lost on restart. It logs a warning at startup. `/health` and every 201 response report `storage_mode: "in_memory_dev"` |
| Outbox event | Type `purchase_request.drafted`. Payload holds the request ID only. Record fields: `event_id`, `status` (`pending`, `dispatched` or `failed`), `attempts`, `next_attempt_at` |
| In-process dispatcher | A background task inside the API process (FastAPI lifespan). It polls pending events and calls a handler. The only handler is a **no-op that logs the event**. It approves nothing and calls nothing external |
| Not in this slice | No PostgreSQL, no queue, no separate worker process, no crash safety. Events are lost on restart. This is **not** the real transactional outbox, which needs a database |
| Follow-up | Task 0002 (needs separate owner approval): local PostgreSQL, an outbox table, and a separate worker process. The Postgres job queue (AD-2) is still "Proposed, pending approval" |

The slice therefore has an **event-driven seam**, not a fully event-driven system. README and code comments must say so.

## 3. Resilience limits (bounded and testable)

| Where | Limit |
|---|---|
| Browser request | 10 s timeout through `AbortController`. **No automatic retry of the POST** (no idempotency key yet). The user clicks "Try again" |
| API request body | At most 16384 bytes |
| Dispatcher handler call | 2 s timeout per call |
| Dispatcher retries | Exponential backoff with full jitter: base 0.5 s, factor 2, cap 30 s, at most 5 attempts, then status `failed`. The backoff function is pure, with injectable randomness and clock, and is unit-tested |
| Circuit breaker | **Deferred** |

## 4. API contract v1 (FROZEN, approved by the owner on 2026-11-08)

Machine-readable files live in `contracts/purchase-request-v1/` (schemas, `messages.json`, examples and shared test `cases.json`). They are the source of truth for field names, rules and messages. This section is the readable summary.

### 4.1 Routes

| Method and path | Success | Purpose |
|---|---|---|
| `GET /health` | 200 | Process is up. Outside `/api`, so the frontend rewrite does not forward it |
| `POST /api/v1/requests` | 201 | Create a **draft** purchase request |

No other routes exist. There is no GET-by-ID, list, update, approve, release or supplier route. A test must prove that every other route returns the 404 problem.

In development the browser calls `/api/v1/...` on the Next.js origin, and a Next.js rewrite forwards it to the backend. CORS stays disabled. No Next.js Server Actions.

### 4.2 Request body (`POST /api/v1/requests`)

JSON with `Content-Type: application/json` (a `charset=utf-8` parameter is allowed). Unknown fields are rejected. Schema: `schemas/create-purchase-request.request.schema.json`.

| Field | Type | Rule | Possible codes |
|---|---|---|---|
| `description` | string | trimmed, 3 to 500 characters | `required`, `invalid_type`, `too_short`, `too_long` |
| `quantity` | JSON integer | 1 to 100000. A string, boolean, null or fractional number is `invalid_type` | `required`, `invalid_type`, `out_of_range` |
| `unit_price` | JSON string | regex `^(0\|[1-9][0-9]*)(\.[0-9]{1,2})?$`, value greater than 0 and at most 10000000.00 | `required`, `invalid_type`, `invalid_format`, `out_of_range` |
| `currency` | string | exactly `EUR`, `USD`, `GBP` or `CHF` (uppercase, case-sensitive) | `required`, `invalid_type`, `invalid_choice` |
| `requester_display_name` | string | trimmed, 2 to 80 characters, synthetic | `required`, `invalid_type`, `too_short`, `too_long` |

Rules of evaluation:

- A missing key is `required`. A `null` value is `invalid_type`.
- For each field, only the **first failing rule** is reported. Order within a field: type, then format, then range or length.
- Length is measured **after trimming** whitespace. A blank string therefore counts as too short.
- Errors are listed in field order (`description`, `quantity`, `unit_price`, `currency`, `requester_display_name`), followed by unknown fields in the order they appear in the body.
- A body that is valid JSON but not an object gives one error with field `$` and code `invalid_type`.
- Quantity literals such as `2.0` or `1e2` are not specified and not tested in v1.

Example request: `examples/create-request.valid.json`.

### 4.3 Success response (201)

Schema: `schemas/purchase-request-draft.response.schema.json`. Example: `examples/create-response.201.json`.

- `id` matches `^PR-[0-9]{4}-[0-9]{6}$`. It comes from a per-process counter, so it resets on restart.
- `status` is always `"draft"`.
- `created_at` is UTC, ISO 8601, whole seconds, trailing `Z`.
- `storage_mode` is always `"in_memory_dev"`.
- `data` echoes the validated values: strings trimmed, `unit_price` normalised to exactly 2 decimal places (`"250"` becomes `"250.00"`).
- `estimated_total` is `quantity` times `unit_price`, computed by code, exactly 2 decimal places, in the same currency. It is an estimate and commits nobody to anything.
- No other field may appear. The schema forbids extra properties, so any approval, PO or supplier field fails the contract test.
- Headers: `Content-Type: application/json`, `Cache-Control: no-store`.

### 4.4 Errors

Every error is `Content-Type: application/problem+json` (RFC 9457), with `Cache-Control: no-store` under `/api/v1`. Schema: `schemas/problem.schema.json`. Display texts: `messages.json`.

| Status | `type` | When | Example file |
|---|---|---|---|
| 400 | `urn:procureflow:problem:invalid-json` | Body is not parseable JSON | `error.400.invalid-json.json` |
| 404 | `urn:procureflow:problem:not-found` | Unknown route | `error.404.not-found.json` |
| 405 | `urn:procureflow:problem:method-not-allowed` | Wrong method on a known route. Response includes `Allow: POST` for `/api/v1/requests` | `error.405.method-not-allowed.json` |
| 413 | `urn:procureflow:problem:payload-too-large` | Body over 16384 bytes | `error.413.payload-too-large.json` |
| 415 | `urn:procureflow:problem:unsupported-media-type` | Content type is not `application/json` | `error.415.unsupported-media-type.json` |
| 422 | `urn:procureflow:problem:validation-error` | Invalid or unknown fields, or body is not an object | `error.422.validation.json`, `error.422.not-an-object.json` |
| 500 | `urn:procureflow:problem:internal-error` | Unexpected failure. Generic text only: no stack trace, path, SQL or secret | `error.500.internal-error.json` |

Order of checks on `POST /api/v1/requests`: route and method (404, 405), then content type (415), then size (413), then JSON parsing (400), then validation (422).

### 4.5 `GET /health`

200, `Content-Type: application/json`. Schema: `schemas/health.response.schema.json`. Example: `examples/health.200.json`. It reports only that the process is up, never business data.

### 4.6 Client behaviour the frontend must implement

| Situation | UI behaviour |
|---|---|
| Client validation fails | Field errors shown, no request sent. The client mirrors the field rules in 4.2 |
| 201 | Success state showing `id`, status "draft", the submitted data, the estimated total, and a visible note that this is a draft kept in temporary development storage |
| 422 | Map each `errors[].field` to its input and show `message`. An error with field `$` or an unknown field appears in a form-level alert |
| 400, 413, 415, 500 | Form-level alert using `title` and `detail`. Form values are kept |
| Timeout (10 s) or network failure | Form-level alert: the server did not respond, the request may or may not have been saved, try again. Form values are kept |
| Response that is not a valid problem or draft | Generic "unexpected response" alert. Never render raw server text as HTML |
| While loading | Submit button disabled, `aria-busy` set, progress text announced |

### 4.7 Known limitations (documented, not bugs)

- No authentication, authorisation or CSRF protection yet (slice S1). The backend binds to `127.0.0.1` only.
- No idempotency key. A double submit creates two drafts. The UI disables the button while loading to reduce this.
- Storage is in-memory and lost on restart.

## 5. Backend workstream (`backend/**` only)

**Port:** 8000 on `127.0.0.1`.

**Builds:** FastAPI app, `GET /health`, `POST /api/v1/requests`, custom error handlers so every error uses the problem format in 4.4 (FastAPI's default 422 shape is not allowed), the `requests` module layers (API route, application service, domain, repository interface and in-memory implementation), the outbox interface and in-process dispatcher, the backoff helper, request-size limit and content-type checks.

**Suggested layout (writer may refine inside `backend/`):**
```
backend/
  pyproject.toml
  app/
    main.py
    platform/            settings, error handlers
    modules/requests/    api.py, schemas.py, service.py, domain.py,
                         repository.py, repository_memory.py, events.py, dispatcher.py
  tests/
```

**Backend tests (no frontend needed):**

1. **Contract tests:** load `contracts/purchase-request-v1/` and check every status code (201, 400, 404, 405, 413, 415, 422, 500) against the problem and response schemas and the example files.
2. **Shared cases:** run every case in `cases.json`, accepted and rejected, exactly as described there. Compare `errors` (field, code, order) and message texts.
3. **Boundaries generated in code:** 500-character and 501-character descriptions, 80 and 81-character display names.
4. **Money:** normalisation to 2 decimals, the total for the maximum boundary, no float arithmetic.
5. **Safety:** response never contains fields outside the schema, `status` is only `draft`, unknown fields such as `status` or `approved` are rejected, and no route other than the two exists.
6. **Option A:** the repository stores draft and event together, the dispatcher marks events dispatched, retries failures with the bounded backoff, and ends at `failed` after 5 attempts. The backoff function is tested with injected randomness and clock.
7. **Errors:** a forced internal error returns the generic 500 problem with no internals.

**Backend acceptance criteria**

- B1. All tests above pass, and the real `pytest` output is shown.
- B2. The responses match the schemas and examples in `contracts/purchase-request-v1/`.
- B3. Linting passes (`ruff`, or the linter the owner approves).
- B4. The code contains no approve, release, ERP, supplier-selection or LLM call. No network call of any kind.
- B5. In-memory storage is labelled in code, startup log and responses.
- B6. The server starts from PowerShell with the documented command, and `/health` and one invalid request can be demonstrated.
- B7. Only files under `backend/` changed, checked with `git diff --name-only`.

## 6. Frontend workstream (`frontend/**` only)

**Ports:** 3000 for the Next.js app, 8001 for the local mock.

**Builds:** Next.js (App Router) and TypeScript form page at `/requests/new`, client validation mirroring section 4.2, one same-origin API client with the 10 s timeout, success, loading and error states, the Next.js rewrite of `/api/v1/*` to the backend, and a **dependency-free Node mock** in `frontend/mock-api/`.

**Backend URL:** read from the PowerShell variable `BACKEND_URL` (default `http://127.0.0.1:8000`). The mock run uses `http://127.0.0.1:8001`. No `.env` files.

**The mock must:** serve the example files from `contracts/purchase-request-v1/`, apply the same field rules and the exact texts of `messages.json`, and support these magic values in `requester_display_name`:

| Value | Mock behaviour |
|---|---|
| `Simulate Server Error` | 500 problem |
| `Simulate Slow` | wait 12 s, then the normal 201 (exercises the 10 s timeout) |
| `Simulate Bad Request` | 400 problem |
| `Simulate Too Large` | 413 problem |

**Suggested layout (writer may refine inside `frontend/`):**
```
frontend/
  package.json, next.config.*, tsconfig.json
  app/requests/new/       page and form components
  lib/                    api-client, validation, types
  mock-api/               mock server
  tests/ or __tests__/
```

**Frontend tests (no backend needed, using the mock or a stubbed `fetch`):**

1. **Validation unit tests:** the same accepted and rejected cases as `cases.json`, client side.
2. **Component tests:** initial render, field errors, loading state with disabled button, success state, 422 mapped to fields, form-level alert for 400, 413, 415 and 500, timeout state, network failure state. Values are kept after errors.
3. **Accessibility checks:** every input has a label, errors are linked with `aria-describedby`, status messages are in an `aria-live` region, the form is fully keyboard operable, and focus moves to the first error or to the result. An automated check such as `jest-axe` or `axe` is welcome, subject to approval of the dependency.
4. **Responsive:** layout verified at about 360 px and 1280 px wide.
5. **Safety:** no raw HTML injection (`dangerouslySetInnerHTML` is not used), and no approval or purchase-order wording or controls anywhere in the UI.

**Frontend acceptance criteria**

- F1. All tests above pass, and the real `npm test` output is shown.
- F2. `npm run lint` and `npm run build` pass.
- F3. The form works end to end against the mock, including every magic value.
- F4. The UI is professional, responsive and accessible, not a placeholder.
- F5. The success state states that the draft is kept in temporary development storage.
- F6. No Server Actions, no CORS configuration, no secrets, no analytics or external requests.
- F7. Only files under `frontend/` changed, checked with `git diff --name-only`.

## 7. Parallel workflow, ownership and worktrees

### 7.1 Ownership

| Who | May edit | Must not edit |
|---|---|---|
| **Lead** (main checkout, `feat/purchase-request-slice`) | `docs/**`, `contracts/**`, `README.md`, shared and root configuration, this brief | `backend/**`, `frontend/**` (except during the integration checkpoint, by the owner's approval) |
| **Backend writer** | `backend/**` | everything else, including `contracts/**` |
| **Frontend writer** | `frontend/**` | everything else, including `contracts/**` |

Neither writer edits `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `.github/**`, `.env*` or `.gitignore`. There is no ownership-guard hook yet, so ownership is enforced by the writer prompts and by a read-only check before every merge (section 7.4).

### 7.2 Worktrees (to be created only after the owner approves)

| Role | Branch | Folder (sibling of the main checkout) |
|---|---|---|
| Lead | `feat/purchase-request-slice` | the main checkout |
| Backend writer | `feat/pr-slice-backend` | `..\procureflow-wt-backend` |
| Frontend writer | `feat/pr-slice-frontend` | `..\procureflow-wt-frontend` |

Both writer branches start from `feat/purchase-request-slice` **after this brief and `contracts/` are committed there**, because a worktree contains only committed files.

```powershell
git status --short --branch        # must be clean
git worktree add -b feat/pr-slice-backend  ..\procureflow-wt-backend  feat/purchase-request-slice
git worktree add -b feat/pr-slice-frontend ..\procureflow-wt-frontend feat/purchase-request-slice
git worktree list
```

Each writer runs `claude` inside its own folder and starts in plan mode (Shift+Tab). Each writer commits only on its own branch and only when the owner approves in that session.

### 7.3 Contract changes

The contract is frozen (approved by the owner). A writer who finds a problem stops and tells the owner. Only the lead edits and commits `contracts/**` and this brief. Both writer branches then take the change in.

### 7.4 Merging

1. Check ownership: `git diff --name-only feat/purchase-request-slice...feat/pr-slice-backend` must list only `backend/` paths. The same for the frontend branch with `frontend/` paths.
2. The lead merges both branches into `feat/purchase-request-slice` with `git merge --no-ff` (the hook asks for approval on every merge).
3. The lead runs the integration checkpoint (section 8).

### 7.5 Candidate dependencies (NOT approved; each is approved at install time with reason, licence and maintenance status)

- Backend: `fastapi`, `uvicorn`, `pydantic` (comes with FastAPI), `pytest`, `httpx`, `jsonschema`, `ruff`.
- Frontend: `next`, `react`, `typescript`, `tailwindcss`, `zod`, `react-hook-form`, `vitest`, `@testing-library/react`, `eslint`, optionally `jest-axe`.
- Before installing: check that the versions support Python 3.14 and Node 26. If not, use a Python 3.13 or 3.12 virtual environment or a side-by-side Node LTS, with no change to global installs.

## 8. Lead-owned integration checkpoint (after both writers finish)

1. Start the real backend (8000) and the real frontend (3000, default `BACKEND_URL`).
2. In the browser: submit a valid form, then an invalid one. Confirm field errors, the success state and the draft note.
3. In PowerShell: call `GET /health`, and `POST /api/v1/requests` with `examples/create-request.valid.json` and `examples/create-request.invalid.json`.
4. Confirm the same-origin rewrite works and that no CORS is configured.
5. Run the shared cases against the mock and the real API. Both must give identical `errors`.
6. Confirm that nothing approves, releases or calls external services, and that the UI text matches the draft-only behaviour.
7. Lead writes `README.md` with the run steps. Then both read-only reviewers run, and the findings are tracked.

**Integration acceptance criteria**

- I1. Backend and frontend run from PowerShell with the documented steps.
- I2. A valid submission returns a draft in the browser. An invalid one shows clear client and server errors.
- I3. The mock and real API agree on every shared case.
- I4. No payment, approval, release, supplier selection or external integration exists.
- I5. Tests pass in both workstreams, with real output shown.
- I6. `code-reviewer` and `security-reviewer` have run. Findings are fixed or tracked.
- I7. No unexplained dependency, secret, paid call or deployment.
- I8. No commit or push without a separate explicit owner approval.

## 9. Out of scope

Authentication and RBAC, PostgreSQL, Docker, a real worker process, a circuit breaker, currency conversion, FX or any external API, Qdrant, MCP, LLM or agent calls, ERP, deployment, CI, OpenAPI type generation, subagent creation, and any edit to `.github/**`, `.env*`, `CLAUDE.md`, `AGENTS.md` or `.claude/**`.

## 10. Checkpoints

- **A.** Branch, brief, contract. The owner approved the contract. **(done)**
- **A2.** The lead commits the brief and `contracts/` (owner-approved, done when this file appears in git history). The lead creates the two worktrees **only after a separate owner go-ahead**. **(current)**
- **B and C in parallel.** Backend and frontend writers work in their worktrees. Each stops for the owner's verification.
- **D.** The lead merges, runs the integration checkpoint, writes the README, runs the reviewers, and lists exactly what changed. **Stop before any `git add`, commit or push.**

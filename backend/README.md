# ProcureFlow API (backend) — purchase request slice

Task 0001, backend workstream. Two routes only: `GET /health` and `POST /api/v1/requests`.
The API contract is frozen in `contracts/purchase-request-v1/` and is not edited from here.

> **DEV ONLY storage.** Purchase requests are kept in process memory
> (`storage_mode: "in_memory_dev"`). They are not durable and are lost when the process stops.
> There is no authentication yet, so the server must stay bound to `127.0.0.1`.

This is an **event-driven seam, not a fully event-driven system**. A draft and its
`purchase_request.drafted` outbox event are stored together under one lock, and an in-process
background task hands the event to a no-op handler that only logs it. This is **not** the real
transactional outbox, which needs a database (a later, separately approved task).

Nothing here approves, releases, sends to a supplier, calls an ERP, an LLM or any external
service. The only status is `draft`.

## Set up (PowerShell, from the `backend` folder)

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install fastapi uvicorn --group dev
```

## Run

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Try it:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod -Method Post http://127.0.0.1:8000/api/v1/requests -ContentType application/json `
  -InFile ..\contracts\purchase-request-v1\examples\create-request.valid.json
```

## Check

```powershell
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
```

## Layout

```
app/main.py                      app factory, startup warning, dispatcher task
app/platform/                    settings (constants only), problem+json handlers
app/modules/requests/            api -> service -> domain -> repository (+ events, dispatcher)
tests/                           contract, shared cases, boundaries, safety, Option A
```

## Known limitations (by design for this slice)

- Storage is in memory: lost on restart, and unbounded (no cap or eviction).
- Request IDs come from a per-process counter and reset on restart.
- No idempotency key: a double submit creates two drafts.
- No authentication, authorisation or CSRF protection yet.
- No circuit breaker (deferred until the first external integration).

# ProcureFlow AI

A multi-agent procurement app: request, RFQ, quotes, compliance, **human approval**, purchase order.
This is a **portfolio and learning project**. It uses **synthetic data only**, and it is built with
production-grade security habits. The repository is public, so nothing secret is ever committed.

Planning documents: [`docs/architecture.md`](docs/architecture.md) (system design and approved
decisions) and [`docs/ai-native-operating-model.md`](docs/ai-native-operating-model.md) (how the
project is built with AI tools). Rules for AI assistants: [`AGENTS.md`](AGENTS.md).

## What exists today

Only the first vertical slice, **task 0001**: a purchase-request form that sends JSON to a
FastAPI endpoint, which validates it and returns a **draft**. Nothing approves, releases, orders
or sends anything to a supplier. See [`docs/tasks/0001-purchase-request-slice.md`](docs/tasks/0001-purchase-request-slice.md).

| Part | Folder | What it is |
|---|---|---|
| Backend | [`backend/`](backend/README.md) | FastAPI app with `GET /health` and `POST /api/v1/requests` |
| Frontend | `frontend/` | Next.js form at `/requests/new` (dark mode, English, German, Spanish and Russian) |
| API contract | [`contracts/purchase-request-v1/`](contracts/purchase-request-v1/README.md) | Frozen JSON Schemas, messages, examples and shared test cases |

> **Read this first.**
> - **Drafts are stored in memory only** (`storage_mode: "in_memory_dev"`). They are lost when the
>   backend stops. There is no database yet.
> - **There is no login yet.** Run everything on `127.0.0.1` only, and never expose it through a
>   tunnel or any network.
> - Known limitations accepted by the owner are listed in
>   [section 13 of the task brief](docs/tasks/0001-purchase-request-slice.md).

## What you need

- **Windows PowerShell** (the commands below were tested in Windows PowerShell 5.1).
- **Python 3.12 or newer** (tested with 3.14).
- **Node.js 22.12 or newer** (tested with Node 26) and npm.
- Nothing else. No Docker, no database, no account, no API key. Everything is free.

Open **two PowerShell windows**: one for the backend and one for the frontend. Each command below
says which folder to run it from.

## 1. Run the backend (port 8000)

From the `backend` folder, once:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install fastapi uvicorn --group dev
```

Then start it:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

You should see `DEV ONLY: purchase requests are kept in process memory ...` and
`Uvicorn running on http://127.0.0.1:8000`. Stop it with `Ctrl+C`.

Note: the install command takes the newest `fastapi` and `uvicorn` and does not apply the version
bounds from `backend/pyproject.toml`, and there is no lock file yet (known limitation B6).

## 2. Run the frontend (port 3000)

From the `frontend` folder, once:

```powershell
cd frontend
npm ci
```

`npm ci` installs exactly what `package-lock.json` lists. Then start the development server:

```powershell
npm run dev
```

Open <http://127.0.0.1:3000/requests/new> in your browser. The browser talks only to port 3000.
Next.js forwards `/api/v1/*` to the backend, so the backend must be running on port 8000 (this is
what keeps the app same-origin, with no CORS).

To try the production build instead:

```powershell
npm run build
npm run start
```

### Frontend without the backend (mock)

The mock returns the same answers as the contract, including special failures. In a third window,
from the `frontend` folder:

```powershell
npm run mock
```

Then start the frontend pointing at the mock. Set the variable first, **in the same window**, and
start (or rebuild) the frontend after setting it, because the setting is read at start-up:

```powershell
$env:BACKEND_URL = "http://127.0.0.1:8001"
npm run dev
```

When you want the real backend again, clear it with `Remove-Item Env:BACKEND_URL` and restart.
Only addresses on this computer (`127.0.0.1`, `localhost`, `[::1]`) are accepted.

In the mock, these exact requester names trigger a failure so you can see the error states:

| Requester display name | Mock answer |
|---|---|
| `Simulate Server Error` | 500 |
| `Simulate Bad Request` | 400 |
| `Simulate Too Large` | 413 |
| `Simulate Slow` | answers after 12 seconds, longer than the form's 10 s timeout |

## 3. Try the API without the browser

With the backend running, from the repository root (the folder that contains this README):

```powershell
# Is it up?
Invoke-RestMethod http://127.0.0.1:8000/health

# A valid request returns a draft (status "draft", an ID like PR-2026-000001, an estimated total)
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/requests -ContentType "application/json" -InFile contracts\purchase-request-v1\examples\create-request.valid.json

# An invalid request returns HTTP 422 with one error per bad field
try {
  Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/requests -ContentType "application/json" -InFile contracts\purchase-request-v1\examples\create-request.invalid.json
} catch {
  "HTTP status: " + [int]$_.Exception.Response.StatusCode
  $_.ErrorDetails.Message
}
```

The same requests work through the frontend on port 3000 (use `http://127.0.0.1:3000/api/v1/requests`),
which proves the forwarding works. `/health` is not forwarded, so ask the backend directly.

## 4. Run the tests

**Backend**, from the `backend` folder:

```powershell
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
```

**Frontend**, from the `frontend` folder:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

When task 0001 was merged: backend 260 tests passed, frontend 371 tests passed, and the full
workflow check against the real backend passed (239 of 239 checks).

## The API contract

The API contract v1 is **frozen**: nobody edits `contracts/purchase-request-v1/` except the lead,
with the project owner's approval. The backend tests and the frontend mock both read those files,
so the two sides cannot drift apart. The readable summary is section 4 of the task brief.

## Rules for contributors and AI assistants

Read [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md). The short version: synthetic data
only, no secrets or personal paths in commits, no paid services without the owner's approval,
humans authorise money, and work only inside the task brief.

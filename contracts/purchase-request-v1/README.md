# Contract: purchase-request-v1

**Status: FROZEN. Approved by the project owner on 2026-11-08. Lead-owned. It changes only through the lead, with the owner's approval.**

This folder is the machine-readable half of the API contract for task 0001. The human-readable half is in `docs/tasks/0001-purchase-request-slice.md`. If the two ever disagree, stop and ask the lead.

| Path | What it is |
|---|---|
| `schemas/*.json` | JSON Schema (draft 2020-12) for the request, the 201 response, every error (problem) and `/health` |
| `messages.json` | The exact display-ready error messages per field and code |
| `examples/*.json` | Example payloads for every status code of the contract |
| `examples/cases.json` | Accepted and rejected input cases shared by backend tests and the frontend mock |

## Rules

- Writers (backend and frontend sessions) **read** these files and never edit them.
- Only the lead edits and commits this folder. If a writer finds a contract problem, the writer stops and tells the owner.
- Everything here is synthetic. No real names, companies or amounts.
- The backend's contract tests load these files. The frontend's mock serves these files. That is how both sides stay identical without copying text by hand.

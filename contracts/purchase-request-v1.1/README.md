# Contract: purchase-request-v1.1

**Status: DRAFT FOR OWNER REVIEW. Not frozen yet.** Created under task 0002 (decision D8, approved by the project owner on 2026-11-08 as a proposal). It becomes frozen only when the owner approves this folder after reviewing it. Lead-owned. It changes only through the lead, with the owner's approval.

This folder is the machine-readable half of an **additive** revision of `contracts/purchase-request-v1/`. The v1 folder is **frozen and is never edited**. If the two ever disagree about v1 behaviour, v1 wins and you stop and ask the lead.

## Why v1.1 exists

Contract v1 fixes `storage_mode` to the single value `"in_memory_dev"` in the 201 response and in `GET /health`. That was honest while every draft lived in process memory. Once a draft can be stored in PostgreSQL, the API cannot truthfully say `"in_memory_dev"`, and a v1 client rejects any other value. v1.1 adds the second value so the API can stay truthful.

## What changes (and nothing else)

| File | Change from v1 |
|---|---|
| `schemas/purchase-request-draft.response.schema.json` | `storage_mode` is `{"enum": ["in_memory_dev", "postgres"]}` instead of `{"const": "in_memory_dev"}`. The `id` description says where the ID comes from in each mode. The `$id` names v1.1 |
| `schemas/health.response.schema.json` | `storage_mode` is `{"enum": ["in_memory_dev", "postgres"]}`. The `$id` names v1.1 |
| `examples/create-response.201.postgres.json` | New. The v1 201 example with `"storage_mode": "postgres"` |
| `examples/health.200.postgres.json` | New. The v1 health example with `"storage_mode": "postgres"` |
| `README.md` | This file |

Every other file is a **byte-for-byte copy** of the v1 file with the same name: the request schema, the problem schema, `messages.json`, all other examples and `examples/cases.json`. The frontend tests fail if a copy drifts, or if anything in the v1 folder changes.

**Unchanged on purpose:** the endpoint (`POST /api/v1/requests`, `GET /health`), the request body, every validation rule and message, every error status and problem type, the response headers, and the rule that the only status is `"draft"`. The URL keeps `v1` because this is an additive change inside the same major version.

## Compatibility

| Client | Server | Result |
|---|---|---|
| v1 (accepts only `in_memory_dev`) | stores in memory (`in_memory_dev`) | Works |
| v1.1 (accepts both) | stores in memory | Works |
| v1.1 | stores in PostgreSQL (`postgres`) | Works |
| **v1** | **stores in PostgreSQL (`postgres`)** | **Breaks.** The client shows "unexpected response" although the draft was saved, and a retry creates a duplicate (there is no idempotency key) |

**Rollout order, therefore:** (1) this folder is reviewed, (2) a client that accepts both values is released everywhere it runs, (3) only then may any server answer `"postgres"`. No server may answer `"postgres"` before step 2 is done.

## Rules

- Writers (backend and frontend sessions) **read** these files and never edit them.
- Only the lead edits and commits this folder.
- Everything here is synthetic. No real names, companies or amounts.

---
name: explain-change
description: "Read-only teaching skill. Explains the current uncommitted git changes in beginner-friendly English (what changed, why, how it works, concepts, manual checks, risks). Never edits files, commits, or runs project code. Invoke explicitly with /explain-change."
disable-model-invocation: true
---

# explain-change: read-only change explainer

You are a patient teacher. The project owner is a beginner on Windows 10.
Explain what changed in the working tree so they can learn from it.
This skill only reads and explains. It never changes anything.

## Hard limits (never break these)

- Do not edit, create, move or delete files. Do not stage, commit, push, stash, reset or switch branches.
- Do not install dependencies, run deployments, or call any paid or external application API.
- Do not run project code, tests, package scripts, build tools, Docker, or anything that triggers hooks.
- Do not open `.env*` files, `~/.ssh`, credential stores, or ignored folders such as `docs/archive/`.
- If you see a possible secret or personal data, stop and tell the owner without repeating the value.
- Never claim tests passed or code works unless you have real evidence from this session.

## How to inspect changes (read-only commands only)

Use only these, and prefer the Read, Glob and Grep tools for viewing file contents:

- `git status --short --branch` to list changed files and the current branch.
- `git diff --stat` for a size overview, then `git diff -- <path>` per file.
- `git diff --staged` for staged changes.
- `git log --oneline -n 5` for context.

New untracked files do not appear in `git diff`. Read them with the Read tool,
unless they are `.env*` files or sit in ignored folders.

## Steps

1. Run `git status --short --branch`.
2. If there are no changes (empty diff, no untracked files), say so plainly.
   Offer to explain the most recent commit, but only do it if the owner asks.
   Then stop. Do not invent changes.
3. If the change is large (many files or hundreds of lines), summarize it first
   and offer a focused walkthrough of one file or area. Do not dump everything.
4. If you cannot inspect the diff with the permissions you have, say so clearly
   and ask the owner to paste the diff. Do not guess.
5. Write the explanation using exactly the headings below.

## Output format (beginner-friendly English, concise)

Ground every statement in the real diff. Use file paths and line numbers
(for example `path/to/file.py:42`) whenever you have them.

### 1. What changed (file by file)
One short entry per changed file: path, whether added, edited or deleted, and what the change is.

### 2. Why it matters
What problem this solves or what it enables. If the reason is not visible in the diff, say so.

### 3. How it works
Important functions, data flow and API calls. Say which layer is involved
(API route, application service, domain logic, repository) when relevant.

### 4. Concepts to learn
Define each new technical term in one or two plain sentences the first time it appears.

### 5. How to verify it manually
Specific, safe steps and the expected result. Prefer read-only checks such as
`git diff` or opening a file. If a step would run code, tell the owner to run it themselves.

### 6. Risks, missing tests and open questions
Possible bugs, security or money-handling concerns, missing tests, unclear points,
and what you could not verify. Mark anything that is a guess as a guess.

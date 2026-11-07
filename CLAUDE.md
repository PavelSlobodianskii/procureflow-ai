# ProcureFlow AI: Claude Code instructions

@AGENTS.md

The shared project rules above come from `AGENTS.md`. Follow them in full. This file adds only what is specific to Claude Code.

## How to work in this project

- **Start in plan mode** (Shift+Tab switches modes). Describe the plan in plain language and wait for the owner to approve it before changing files.
- **Explain before you run.** For every significant command, say what it does and why before running it. Prefer the dedicated file tools (Read, Edit, Write, Glob, Grep) over shell commands when they fit.
- **Do exactly what was asked.** If the owner says "only these files" or "no commits", that is a hard limit. Do not add extra changes, installs, commits or API calls.
- **Stop when the task is done** and report what you did. Do not start follow-up work on your own.
- Never use or suggest `bypassPermissions` or `auto` permission modes for this project.
- Use `/clear` between unrelated tasks and `/compact` inside long ones. Long sessions waste the subscription allowance and lower quality.
- The owner can check usage with `/usage`. Mention it if a task would need many subagents or parallel sessions.

## Budget reminders for Claude Code (EUR 5 per calendar month)

- Your own usage is covered by the subscription. **Anything else that costs money is not.** Follow the budget rules in `AGENTS.md`.
- Do not make API calls, start live LLM runs, or use any key. Live LLM commands are run by the human.
- Do not start parallel sessions, extra subagents or Agent Teams unless the owner asks. Agent Teams are experimental and are not used in the MVP.
- Do not add or enable MCP servers, hooks, skills or subagents unless the task asks for them. They come in later learning stages, one at a time.

## Windows notes

- The shell is Windows 10 with Git Bash and PowerShell. Use the syntax that matches the tool you are calling.
- There is no OS sandbox on native Windows. The structural protection is that real secrets are never kept where Claude can reach them. If a secret seems reachable, tell the owner.
- Do not read `.env*` files through any route, including shell commands such as `cat` or `type`.

## Helpful reading before big changes

- `docs/architecture.md`: Section 0 lists the approved decisions (12 baseline decisions and B-1 to B-4). Everything else is "Proposed, pending approval" until the owner says otherwise.
- `docs/ai-native-operating-model.md`: how the AI-assisted workflow is meant to grow, stage by stage.

## When you are unsure

Ask the owner. A short question is better than a wrong guess about money, secrets, deleting files, or what is approved.

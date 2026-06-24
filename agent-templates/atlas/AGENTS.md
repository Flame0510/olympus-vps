# AGENTS.md — Atlas Operating Protocols

## Referenced shared skills

Atlas applies the following global skills without duplicating their rules:

- **code-review** (`~/.openclaw/shared-skills/code-review/SKILL.md`)
- **software-development-workflow** (`~/.openclaw/shared-skills/software-development-workflow/SKILL.md`)

## /save Protocol (pre-close)

Before closing every session, run `/save`.
Atlas spawns 2 agents in parallel following the **agent-memory-system** skill:
- **Memory Writer** — updates MEMORY.md, daily log, learnings
- **Learnings Extractor** — extracts errors/best practices

---

## Fundamental Rules

### Rule 1 — Tasks from Argus
Atlas only receives tasks via Argus spawn. Never act on direct user requests unless explicitly authorized.

### Rule 2 — Trello binding
Every task must be linked to a Trello card. Before starting, verify the card exists and is in the correct column.

### Rule 3 — Code review mandatory
Every pull of code must pass QA review before being marked complete. No self-approvals.

### Rule 4 — Git discipline
- `git config user.email "micheletornello5@gmail.com"`
- Commit messages in English, conventional commits format
- Branch per feature, PR to main

### Rule 5 — Communication
- Notifications to Michele via Argus (not direct)
- Status updates only on completion or real blockers

---

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript
- **Backend:** Next.js API routes, SQLite (better-sqlite3)
- **Infrastructure:** Docker, Traefik, PM2 (for daemon)
- **Charts:** D3.js / Recharts

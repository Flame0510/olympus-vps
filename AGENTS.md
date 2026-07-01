# AGENTS.md — Agent Guidelines for Olympus

> **Purpose:** A single entry point for any AI agent (or human contributor) working
> on this repository. Read this first, then follow the docs it references.
>
> **Status:** Active — `main` branch
> **Last updated:** 2026-07-01

---

## 1. First Contact

If you are an AI agent arriving on this repo for the first time:

1. Read this file completely.
2. Read `README.md` for project overview, features, and quick start.
3. Read `docs/OLYMPUS.md` for app-level features, pages, and navigation.
4. Read `docs/ARCHITECTURE.md` for system architecture and component layout.
5. Read `docs/dev/API-REFERENCE.md` for API endpoints.
6. Read `docs/dev/GATEWAY.md` for provider sync and agent model configuration.
7. Read `docs/dev/PROVIDERS.md` for key management and the Olympus provider proxy.
8. Read `docs/FRONTEND-ARCHITECTURE.md` for frontend structure and decisions.
9. Read `docs/CONTAINER-TERMINAL.md` for terminal WebSocket implementation.
10. Read `docs/dev/DATABASE.md` for SQLite schema and storage notes.
11. Read `docs/dev/WORKSPACE.md` for workspace file explorer and editor.
12. Read `docs/DESIGN-SYSTEM.md` for design tokens and visual standards.

> **Additional resources:**
> - `docs/rag/` — LLM-facing knowledge base for RAG-powered responses
> - `agent-templates/` — reusable agent protocols for Atlas, Argus, Prometheus
>
> **Rule:** After reading, if a file is stale (wrong dates, missing info), update it.
> Do not assume docs are authoritative — verify against code.

---

## 2. Repository Rules

### 2.1 Language

**100% English.** Everything:
- Code (variables, comments, functions, types)
- Documentation (`.md` files, code comments)
- Commit messages
- Error messages, UI strings, logs

No Italian, no other languages in code or docs.

### 2.2 Code Style

- **TypeScript strict mode** — `tsconfig.json` has `strict: true`
- **Next.js App Router** — `app/` directory, not `pages/`
- **React Server Components** by default; use `'use client'` only when necessary
- **CSS** — inline styles or `globals.css` tokens (CSS variables). No CSS modules, no Tailwind.
- **SQLite** — via `better-sqlite3`, synchronous API
- **PM2** — process management via `ecosystem.config.js`
- **Python NOT allowed** — no Python scripts, no Jupyter, no notebooks in this repo

### 2.3 Documentation-First Workflow

**Before every commit, complete this checklist:**

- [ ] Are all design decisions documented? If you changed something, write or update the relevant `.md` file.
- [ ] Does `docs/ARCHITECTURE.md` still reflect reality? Update it if your change affects architecture.
- [ ] Does `docs/CONTAINER-TERMINAL.md` need updating? (Terminal-related changes.)
- [ ] Does `docs/FRONTEND-ARCHITECTURE.md` need updating? (Frontend changes.)
- [ ] Does `docs/DESIGN-SYSTEM.md` need updating? (Design token changes.)
- [ ] Does `docs/OLYMPUS.md` need updating? (App-level features, pages, navigation.)
- [ ] Does `docs/dev/API-REFERENCE.md` need updating? (New/modified API routes.)
- [ ] Does `docs/dev/DATABASE.md` need updating? (Schema changes.)
- [ ] Does `docs/dev/GATEWAY.md` need updating? (Provider/agent config changes.)
- [ ] Does `docs/dev/PROVIDERS.md` need updating? (Auth or proxy changes.)
- [ ] Does `docs/dev/WORKSPACE.md` need updating? (Workspace API changes.)
- [ ] Does `docs/rag/` need updating? (RAG knowledge base changes.)
- [ ] Does `agent-templates/README.md` need updating? (New/updated agent protocols.)
- [ ] Does `AGENTS.md` need updating? (New rules or conventions.)
- [ ] Are there new dependencies? Add them to the relevant docs.
- [ ] Does `README.md` need updating? (New features, changed setup.)

**Guideline:** Write docs while you implement, not after. A change without
documentation is incomplete.

### 2.4 Commit & Push Policy

- **No commit/push without confirmation** — ask the user before staging and pushing
- **Commit only when work is validated** — trunk-based development: commit at the end
- **Descriptive commit messages** — explain the *why*, not just the *what*
- **Single logical commit per change** — squash if needed

### 2.5 Secrets & Safety

- **Never commit secrets** — `.env`, tokens, passwords, API keys. Use environment variables.
- **Destructive operations** — `rm -rf`, `docker rm`, `systemctl stop` → ask first. Trash over delete.
- **Sensitive files** (`.env`, `SYSTEM.md`, `start.sh`, debug/proxy endpoints) are `untracked` — never pushed.

---

## 3. Architecture Overview (Quick Reference)

```
domian:      olympus.srv1490011.hstgr.cloud (port 3740, proxied by Traefik)
stack:       Next.js 16 + React 19 + TypeScript + SQLite + PM2
processes:   olympus-next (Next.js, port 3740)
             olympus-terminal-ws (WebSocket PTY, port 3741)
repo:        github.com/Flame0510/olympus-vps.git (branch main)
language:    100% English
```

### Key Docs

| File | What it covers |
|---|---|
| `docs/ARCHITECTURE.md` | System architecture, multi-container vision, component design |
| `docs/CONTAINER-TERMINAL.md` | Terminal WebSocket PTY, custom DOM terminal, design decisions |
| `docs/FRONTEND-ARCHITECTURE.md` | Frontend structure, component tree, mobile breakpoints |
| `docs/OLYMPUS.md` | App-level features, pages, navigation |
| `docs/DESIGN-SYSTEM.md` | Design tokens, colors, typography |
| `docs/dev/API-REFERENCE.md` | API route documentation |
| `docs/dev/DATABASE.md` | SQLite schema, tables, relations |
| `docs/dev/GATEWAY.md` | Gateway page: provider sync, agent model config, UI |
| `docs/dev/PROVIDERS.md` | Provider key management and Olympus proxy gateway |
| `docs/dev/WORKSPACE.md` | Workspace API file explorer and editor |
| `docs/rag/` | LLM-facing knowledge base for RAG-powered responses |

---

## 4. Agent Workflow

When the user asks you to do something on this repository:

1. **Understand the request** — if unclear, ask
2. **Check relevant docs** — understand existing design before changing it
3. **Implement** — code changes
4. **Update docs** — reflect changes in the appropriate `.md` files
5. **Ask for commit approval** — never push without asking
6. **Commit & push** — only after user confirms

### If you are a Nexus-level agent (infra access)

- You have `docker`, `pm2`, `systemctl`, and filesystem access on the VPS
- Use `pm2 restart olympus-next --update-env` after builds
- Use `pm2 restart olympus-terminal-ws --update-env` after terminal server changes
- Use `npm run build` for Next.js builds
- Never expose secrets in responses
- Monitor `docs/MEMORY.md` is NOT part of this repo — it's a private workspace file

---

## 5. Common Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Build for production
npm run start        # Start production server (via PM2)
pm2 status           # Check running processes
pm2 logs olympus-next           # View Next.js logs
pm2 logs olympus-terminal-ws     # View terminal server logs
```

---

## 6. Glossary

| Term | Meaning |
|---|---|
| **Olympus** | This project — monitoring dashboard + orchestrator |
| **PYTHIA** | Embedded AI assistant in the UI |
| **OpenClaw** | The agent runtime that Olympus monitors |
| **Nexus** | Host-level agent on the VPS (ops context) |
| **Traefik** | Reverse proxy in front of all containers |
| **node-pty** | Node.js PTY library for interactive terminal sessions |
| **AGENT_ID** | Docker label used to identify agent containers |

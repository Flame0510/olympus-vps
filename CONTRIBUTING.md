# Contributing to Olympus

## Documentation rule

**Every change to code must include a documentation update in the same commit.**
This applies to all contributors and all AI agents (Claude, Codex, DeepSeek, etc.).

If you are an AI agent working on this repo: read this file before closing any task, and verify that the relevant docs are up to date.

---

## Code → Doc mapping

| What you changed | What you must update |
|---|---|
| `app/api/gateway/**` | `docs/dev/GATEWAY.md` — Gateway provider sync, agent model config |
| `app/api/provider/v1/**` | `docs/dev/PROVIDERS.md` — proxy auth, model list, completions |
| `app/api/vault/**` | `docs/dev/PROVIDERS.md` — key management section |
| `app/gateway/**` | `docs/dev/GATEWAY.md` — Gateway UI, overlay, polling |
| `app/api/**` (other) | `docs/dev/API-REFERENCE.md` — add/update endpoint description, params, response shape |
| `daemon.js` | (no dedicated doc — update `docs/ARCHITECTURE.md` if needed) |
| `lib/**` | `docs/ARCHITECTURE.md` and/or `docs/FRONTEND-ARCHITECTURE.md` |
| `app/**/page.tsx` or `app/**/components` | `docs/FRONTEND-ARCHITECTURE.md` — component tree, layout changes |
| `scripts/**` | `docs/ARCHITECTURE.md` |
| DB schema (migrations, new tables/columns) | `docs/dev/DATABASE.md` — schema section |
| Environment variables | `README.md` — Configuration table |
| New feature (any) | `docs/rag/OLYMPUS-OVERVIEW.md` and `docs/rag/WHAT-I-CAN-ANSWER.md` if PYTHIA should know about it |
| Auth / middleware | `docs/ARCHITECTURE.md` — security/auth section |

---

## Doc structure

```
docs/
├── dev/                     # Developer reference (technical depth)
│   ├── API-REFERENCE.md     # All /api/* endpoints
│   ├── GATEWAY.md           # Gateway page: provider sync, agent model config
│   ├── PROVIDERS.md         # Provider key management, proxy auth
│   ├── WORKSPACE.md         # Workspace API file explorer
│   ├── DATABASE.md          # SQLite schema, WAL, backup
├── rag/                     # PYTHIA knowledge base (plain language)
│   ├── OLYMPUS-OVERVIEW.md  # What Olympus is and does
│   ├── GLOSSARY.md          # Key terms
│   ├── WHAT-I-CAN-ANSWER.md # PYTHIA capability scope
│   └── DATA-FRESHNESS.md    # Update intervals and data latency
├── ARCHITECTURE.md          # High-level architecture diagram/summary
├── CONTAINER-TERMINAL.md    # Terminal WebSocket PTY implementation
├── DESIGN-SYSTEM.md         # Design tokens, colors, typography
├── FRONTEND-ARCHITECTURE.md # Component layers and design system
├── OLYMPUS.md               # Operational docs
└── README.md               # Project overview, setup, configuration
```

---

## What "update the doc" means

- **New endpoint** → add a full entry in `api-reference.md` (method, path, auth, params, response, errors)
- **Changed behavior** → update the relevant section; don't append a changelog note, rewrite the truth
- **Removed feature** → delete it from the doc; no "deprecated" stubs
- **New config variable** → add it to the README table and wherever it's used in setup guides
- **New page/component** → add it to `frontend-architecture.md` with its responsibility

Keep docs accurate and current, not historical. No changelog entries inside doc files.

---

## Commit message format

```
<type>(<scope>): <short description>

Types: feat | fix | refactor | chore | docs
Scope: api | daemon | db | ui | deploy | auth | rag
```

Example: `feat(api): add /api/workspace endpoint` — and the same commit must touch `docs/dev/api-reference.md`.

A `docs`-only commit is valid when fixing stale documentation without touching code.

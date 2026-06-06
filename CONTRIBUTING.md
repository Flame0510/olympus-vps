# Contributing to Olympus

## Documentation rule

**Every change to code must include a documentation update in the same commit.**
This applies to all contributors and all AI agents (Claude, Codex, DeepSeek, etc.).

If you are an AI agent working on this repo: read this file before closing any task, and verify that the relevant docs are up to date.

---

## Code → Doc mapping

| What you changed | What you must update |
|---|---|
| `app/api/**` | `docs/dev/api-reference.md` — add/update endpoint description, params, response shape |
| `daemon.js` | `docs/dev/daemon.md` — polling logic, cost estimation, model pricing table |
| `lib/**` | `docs/dev/architecture.md` and/or `docs/frontend-architecture.md` |
| `app/**/page.tsx` or `app/**/components` | `docs/frontend-architecture.md` — component tree, layout changes |
| `scripts/**` | `docs/dev/deployment.md` or `docs/dev/architecture.md` |
| DB schema (migrations, new tables/columns) | `docs/dev/database.md` — schema section |
| Environment variables | `README.md` — Configuration table |
| New feature (any) | `docs/rag/olympus-overview.md` and `docs/rag/what-i-can-answer.md` if PYTHIA should know about it |
| Deployment / container changes | `docs/container-setup.md` and/or `docs/vps-setup.md` |
| Auth / middleware | `docs/dev/architecture.md` — security/auth section |

---

## Doc structure

```
docs/
├── dev/                     # Developer reference (technical depth)
│   ├── api-reference.md     # All /api/* endpoints
│   ├── architecture.md      # Stack, data flow, DB schema overview
│   ├── daemon.md            # daemon.js logic and cost model
│   ├── database.md          # SQLite schema, WAL, backup
│   └── deployment.md        # Container + VPS setup
├── rag/                     # PYTHIA knowledge base (plain language)
│   ├── olympus-overview.md  # What Olympus is and does
│   ├── glossary.md          # Key terms
│   ├── what-i-can-answer.md # PYTHIA capability scope
│   └── data-freshness.md    # Update intervals and data latency
├── architecture.md          # High-level architecture diagram/summary
├── frontend-architecture.md # Component layers and design system
├── container-setup.md       # OpenClaw container specifics
└── vps-setup.md             # Bare VPS with systemd
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

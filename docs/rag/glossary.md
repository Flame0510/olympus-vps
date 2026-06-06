# Olympus Glossary

## session_id
A unique identifier for one agent work session. Format: `agent:<agent_name>:<role>` for persistent agents (e.g. `agent:ops:main`) or `agent:<agent_name>:subagent:<uuid>` for temporary child agents spawned for a specific task.

## session
A single unit of agent work: starts when an agent receives a task, ends when the task completes or fails. Tracks tokens used, cost, model, status, and a short preview of the task description.

## parent_id
The session ID of the session that spawned the current session. Used to build the lineage tree. A root session (like `agent:ops:main`) has no parent.

## lineage
The parent→child relationship tree between sessions. When Argus spawns a developer agent to implement a feature, that developer agent session is a child of the Argus session. The lineage page in Olympus shows this as a graph.

## lineage label
A human-readable name declared when an agent registers a parent→child relationship. For example: "Developer Agent — Olympus Slice 3". Replaces the raw session key in the graph.

## daemon
The background process (`daemon.js`) that polls OpenClaw every 15–30 seconds and writes session data to the database. If the daemon is not running, Olympus shows stale data.

## status
The current state of a session. Values:
- `idle` — agent is running but not actively processing
- `working` — agent is actively processing a task (tokens being consumed)
- `completed` — task finished successfully
- `error` — task failed

## tokens_in / tokens_out
The number of input tokens (prompt) and output tokens (response) consumed by a session. Used to estimate cost.

## cost_usd
The estimated cost in US dollars for a session, calculated from token counts and per-model pricing. This is an estimate; actual billing may differ.

## cost_override
A manual correction for a month's total cost. If the automatic calculation doesn't match the actual invoice (e.g. GitHub Copilot billed separately), Michele sets a cost_override for that month. The dashboard shows the override value instead of the computed sum.

## model
The AI model used by a session. Examples: `openai-codex/gpt-5.4`, `claude-sonnet-4-6`, `openrouter/deepseek/deepseek-v3.2`. Models are identified by their provider path.

## agent
An AI assistant configured in OpenClaw with a specific role, workspace, and default model. Each agent has an `id` (e.g. `ops`) and can run multiple sessions over time.

## spawn
The event that occurs when one session creates a child session. Recorded in the events table with type `spawn`.

## event
A lifecycle occurrence for a session: `spawn`, `complete`, `error`, or `tool_call`. Events are stored with a timestamp and JSON payload.

## tool_call
An event recording when an agent invoked a tool (e.g. Bash, file read, web search). Useful for auditing what an agent actually did.

## system metrics
Hardware measurements recorded by the daemon: CPU percentage, RAM used/total (MB), disk used/total (GB), 1-minute load average. Shown in the System Health section of the dashboard.

## OLYMPUS_TOKEN
The static bearer token that authenticates API calls to Olympus. Default: `olympus2026`. Set via environment variable.

## PYTHIA
The AI assistant embedded in the Olympus dashboard. Answers questions about the current page content (sessions, costs, agents) in natural language. Backed by a configurable LLM via an OpenAI-compatible API.

## events.db
The SQLite database file that stores all Olympus data: sessions, events, lineage, cost overrides, and system metrics.

## WAL mode
Write-Ahead Logging — the SQLite concurrency mode used by Olympus. Allows the daemon to write while the web server reads simultaneously without blocking.

## cron
A scheduled job that runs an agent automatically at a fixed time (e.g. every night at 3:15 AM). Configured in OpenClaw and visible in the Crons page of Olympus.

## SSE / stream
Server-Sent Events — the real-time push mechanism used by the Olympus dashboard. The browser connects to `/api/stream` and receives updates every ~3 seconds without polling.

## workspace
The directory where an agent's operational files live (MEMORY.md, SOUL.md, task files, etc.). Each agent has its own workspace, e.g. `/data/.openclaw/workspace-ops/` for Argus.

## MEMORY.md
The durable memory file for an agent. Contains current state, rules, path references, and completed task history. Loaded into every session as context.

## lineage.js
A command-line script that registers a parent→child session relationship in the database. Called by agents at spawn time.

## OpenClaw
The AI agent runtime platform that Olympus monitors. OpenClaw manages agent sessions, routing, cron jobs, plugins, and skills. Olympus reads data from OpenClaw via `openclaw sessions --json`.

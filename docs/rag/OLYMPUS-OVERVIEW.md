# What is Olympus?

> **Last updated:** 2026-06-30

Olympus is the monitoring dashboard for the AI agent infrastructure managed by Michele Tornello. It is the central control panel that shows what all the AI agents are doing, how much they cost, and whether the system is healthy.

## What does Olympus monitor?

Olympus tracks three main things:

**1. Agent sessions**
Every time an AI agent starts working — whether it's Argus running an audit, a developer agent writing code, or a QA agent testing a feature — Olympus records that session. It logs the start time, the task the agent was given, how many tokens it used, and the cost.

**2. Costs**
Every AI model call has a cost in USD. Olympus calculates costs from token counts and shows them broken down by day, week, month, and by model. If the automatic calculation is wrong (for example due to a billing quirk), Michele can set a manual override for any month.

**3. System health**
Olympus also monitors the server itself: CPU usage, RAM, disk space, and system load. It checks whether the daemon is running, whether cron jobs are scheduled, and whether the database is accessible.

## Who uses Olympus?

Olympus is used by Michele to get a quick operational picture without having to SSH into the server or read raw logs. The idea is: if everything is green, Olympus is silent. If something is wrong, it shows up immediately.

PYTHIA (the AI assistant inside Olympus) can answer questions about any of the above — costs, sessions, agents, health status — in natural language.

## What is an "agent"?

An agent is an AI assistant that runs tasks autonomously. In this infrastructure, the main agents are:

- **Argus** — the ops lead; manages infrastructure, runs audits, coordinates other agents
- **Forge** — the development lead (separate workspace)
- **Developer agents** — spawned by Argus or Forge to implement features
- **QA agents** — spawned to verify changes
- **Scout agents** — run periodic research (INTEL reports)

Each agent has a unique session ID formatted as `agent:<name>:<role>` or `agent:<name>:subagent:<uuid>` for temporary child agents.

## What is a "session"?

A session is one instance of an agent doing work. It starts when the agent receives a task and ends when the task is complete (or fails). Sessions can be nested: a parent session can spawn child sessions to delegate subtasks. This parent→child relationship is called **lineage**.

## What is the "daemon"?

The daemon is a background process (`daemon.js`) that runs continuously alongside the dashboard. Every 30 seconds (or 15 seconds when agents are actively working), it checks what sessions are currently running and updates the database. Without the daemon, Olympus would not receive any new data.

## How does PYTHIA work?

PYTHIA is the AI assistant embedded in Olympus. It uses the context of the current page (dashboard, agents, costs, etc.) plus a conversation history to answer questions. It is backed by a configurable LLM (default: Groq's `llama-3.1-8b-instant`). PYTHIA can explain what it sees in the dashboard but does not have direct database access — it answers based on the page context provided by the UI.

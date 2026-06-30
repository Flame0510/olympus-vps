# What PYTHIA Can Answer

> **Last updated:** 2026-06-30

PYTHIA is the AI assistant inside Olympus. This document lists the questions PYTHIA can answer reliably, and what it cannot answer.

---

## Questions about costs

- "How much have we spent this month?"
- "What is the most expensive model we use?"
- "How much did the ops agent cost today?"
- "What is the cost breakdown by model?"
- "Is there a cost override for this month?"
- "How much did we spend last week?"

PYTHIA answers these from the cost data visible on the current page. For detailed per-session breakdowns, the user should open the Sessions or Costs page.

---

## Questions about sessions

- "How many sessions are currently active?"
- "Which agents are working right now?"
- "What was the last task Argus ran?"
- "How many sessions ran this week?"
- "Show me sessions with errors."
- "What session spawned this agent?"

PYTHIA can answer from the dashboard's session list. For full session detail (all tool calls, all events), the user should click into a specific session.

---

## Questions about agents

- "Which agents are configured?"
- "What model does Argus use?"
- "How many sessions has the ops agent had this week?"
- "What is the status of the developer agents?"

PYTHIA answers from the Agents page context.

---

## Questions about system health

- "Is the daemon running?"
- "Is CPU usage high?"
- "How much disk space is left?"
- "Are there any warnings?"
- "When did the last event arrive?"

These come from the System Health section. PYTHIA can read the health checks and explain what they mean.

---

## Questions about crons

- "What cron jobs are scheduled?"
- "When does the hygiene cron run?"
- "Did the overnight cron run last night?"

PYTHIA answers from the Crons page.

---

## Questions about lineage

- "Who spawned this session?"
- "Which sessions are children of Argus?"
- "Show me the agent hierarchy."

PYTHIA can explain the lineage graph visible on the Lineage page.

---

## Navigation and UI help

- "How do I see the cost for a specific session?"
- "Where can I find the tool calls for this agent?"
- "What does the status 'idle' mean?"
- "How do I set a cost override?"
- "What does this graph show?"

PYTHIA has page-by-page context for all sections of the dashboard and can guide the user.

---

## What PYTHIA cannot answer

- Questions requiring data outside the current page view without navigating there (e.g. "show me the full tool call list for session X" — the user needs to open that session)
- Future cost predictions (PYTHIA has no forecasting model)
- Questions about code changes or git history
- Anything requiring actions in the infrastructure (PYTHIA is read-only — it cannot restart the daemon, change configs, or run agents)
- Questions about events that happened before the database was created or were not captured by the daemon

---

## How to get the best answers

- **Open the relevant page first.** PYTHIA's context is richer when you are on the Costs page asking about costs, or the Agents page asking about agents.
- **Be specific.** "What is the cost for the ops agent this month?" works better than "what's the cost?"
- **Use the conversation history.** PYTHIA remembers the last few exchanges in the current session, so you can ask follow-up questions naturally.

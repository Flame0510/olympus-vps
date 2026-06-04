import type { Session, TreeNode } from '../types';
import { ACTIVE_STATUSES } from '../types';

function normalizeDisplayLabel(value: string | null | undefined): string {
  const label = String(value ?? '').trim();
  if (!label) return '';
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(label)) return '';
  if (/^(agent:[^\s]+:subagent:[0-9a-f-]+|subagent:[0-9a-f-]{8,}|session:[0-9a-f-]{8,})$/i.test(label)) return '';
  if (/^agent:[a-z0-9_-]+(:[a-z0-9_-]+)*$/i.test(label)) return ''; // agent:ops:main, agent:ops:telegram:...
  if (/^sub\s*agent\b[:\s-]*[a-z0-9-]+$/i.test(label)) return '';
  return label;
}

function prettifyAgentName(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function shortLabel(sessionId: string): string {
  if (!sessionId) return 'session';
  const parts = sessionId.split(':');
  if (parts.length >= 4) return `${parts[2]}:${parts[3].slice(0, 6)}`;
  if (parts.length >= 2) return `${parts[1]}:${parts[parts.length - 1].slice(0, 6)}`;
  return sessionId.slice(0, 14);
}

function stripTaskBoilerplate(value: string): string {
  return value
    .replace(/^\[Subagent Task\]\s*/i, '')
    .replace(/^Task richiesto da .*?:\s*/i, '')
    .replace(/^Sei [^.\n]+\.\s*/i, '')
    .replace(/^Begin\.?\s*/i, '')
    .trim();
}

function summarizeTaskPreview(taskPreview: string | null | undefined): string {
  const raw = String(taskPreview ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  const lines = String(taskPreview ?? '')
    .split(/\r?\n/)
    .map((line) => stripTaskBoilerplate(line.trim()))
    .filter(Boolean);

  const candidate = lines.find((line) => line.length >= 6 && !/^[-*#0-9.)\s]+$/.test(line)) ?? stripTaskBoilerplate(raw);
  if (!candidate) return '';

  const cleaned = candidate
    .replace(/^[\-•*]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  return cleaned.length > 48 ? `${cleaned.slice(0, 45).trimEnd()}…` : cleaned;
}

function isSubagentSessionId(sessionId: string): boolean {
  return sessionId.includes(':subagent:') || sessionId.startsWith('subagent:');
}

function subagentFallback(sessionId: string): string {
  // es. agent:ops:subagent:UUID → "Ops Agent"
  // es. agent:ops:cron:UUID → "Ops Cron"
  const parts = sessionId.split(':');
  const agentName = parts[1] ? prettifyAgentName(parts[1]) : '';
  const kind = parts[2] ?? 'subagent';
  if (kind === 'cron') return agentName ? `${agentName} Cron` : 'Cron';
  const suffix = parts[3]?.replace(/[^a-z0-9]/gi, '').slice(0, 6) ?? '';
  return agentName ? `${agentName} · ${suffix}` : suffix ? `Task ${suffix}` : 'Task';
}

export function isSessionActive(session: Pick<Session, 'status'>): boolean {
  return ACTIVE_STATUSES.has(session.status);
}

export function deriveSessionDisplayLabel(session: Pick<Session, 'session_id' | 'label' | 'lineage_label' | 'task_preview'>): string {
  const sid = session.session_id || '';
  const lineageLabel = normalizeDisplayLabel(session.lineage_label);
  const directLabel = normalizeDisplayLabel(session.label);
  const taskLabel = summarizeTaskPreview(session.task_preview);

  if (lineageLabel) return lineageLabel;
  if (directLabel && !directLabel.startsWith('agent:')) return directLabel;
  if (taskLabel) return taskLabel;

  if (sid.endsWith(':main')) {
    const agent = sid.split(':')[1] ?? '';
    if (agent) return prettifyAgentName(agent);
  }

  if (isSubagentSessionId(sid)) return subagentFallback(sid);
  return shortLabel(sid);
}

export function nodeLabel(session: TreeNode & { lineage_label?: string | null; task_preview?: string | null }): string {
  if (session._virtualRoot) return '';
  if (session._agentNode) {
    const raw = normalizeDisplayLabel((session as TreeNode & { name: string }).name);
    return raw ? prettifyAgentName(raw) : 'Agent';
  }

  return deriveSessionDisplayLabel({
    session_id: session.session_id,
    label: session.name,
    lineage_label: session.lineage_label,
    task_preview: session.task_preview,
  });
}

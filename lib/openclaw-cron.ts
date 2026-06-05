import fs from 'node:fs';
import { CronExpressionParser } from 'cron-parser';

const OPENCLAW_CRON_JOBS_PATH = process.env.OPENCLAW_CRON_JOBS_PATH ?? '/data/.openclaw/cron/jobs.json';

export interface CronSchedule {
  kind?: string;
  expr?: string;
  tz?: string;
  [key: string]: unknown;
}

export interface CronPayload {
  kind?: string;
  text?: string;
  message?: string;
  model?: string;
  fallbacks?: string[];
  [key: string]: unknown;
}

export interface CronState {
  lastStatus?: string;
  nextRunAtMs?: number | null;
  lastRunAtMs?: number | null;
  [key: string]: unknown;
}

export interface OpenClawCronJob {
  id?: string;
  name?: string;
  description?: string;
  agentId?: string;
  enabled?: boolean;
  schedule?: CronSchedule;
  scheduleExpr?: string;
  state?: CronState;
  payload?: CronPayload;
  createdAtMs?: number;
  [key: string]: unknown;
}

export interface OpenClawCronListResult {
  ok: boolean;
  jobs: OpenClawCronJob[];
  total: number;
  source: 'jobs-file' | 'openclaw-cli';
  unavailableReason?: string;
  rawError?: string;
}

function readJobsFile(): OpenClawCronJob[] | null {
  try {
    const raw = fs.readFileSync(OPENCLAW_CRON_JOBS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as OpenClawCronJob[];
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { jobs?: unknown[] }).jobs)) {
      return (parsed as { jobs: OpenClawCronJob[] }).jobs;
    }
    return null;
  } catch {
    return null;
  }
}

function computeNextRun(expr: string, tz?: string): number | null {
  try {
    const interval = CronExpressionParser.parse(expr, tz ? { tz } : {});
    return interval.next().toDate().getTime();
  } catch {
    return null;
  }
}

function normalizeJob(job: OpenClawCronJob): OpenClawCronJob {
  const sched = job.schedule as CronSchedule | undefined;
  const schedExpr =
    typeof job.schedule === 'object' && job.schedule !== null
      ? sched?.expr ?? ''
      : typeof job.schedule === 'string'
        ? job.schedule
        : '';
  const tz = sched?.tz;

  const computedNextRunAtMs =
    job.enabled !== false && schedExpr
      ? computeNextRun(schedExpr, tz ?? undefined)
      : null;

  return {
    ...job,
    scheduleExpr: schedExpr,
    computedNextRunAtMs,
  };
}

export interface CronPatchResult {
  ok: boolean;
  job?: OpenClawCronJob;
  error?: string;
}

export async function patchCronJob(id: string, patch: Partial<OpenClawCronJob>): Promise<CronPatchResult> {
  try {
    const raw = fs.readFileSync(OPENCLAW_CRON_JOBS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    let jobs: OpenClawCronJob[];
    let isWrapped = false;
    if (Array.isArray(parsed)) {
      jobs = parsed as OpenClawCronJob[];
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { jobs?: unknown[] }).jobs)) {
      jobs = (parsed as { jobs: OpenClawCronJob[] }).jobs;
      isWrapped = true;
    } else {
      return { ok: false, error: 'Unrecognized jobs.json format' };
    }

    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) return { ok: false, error: `Job ${id} not found` };

    jobs[idx] = { ...jobs[idx], ...patch };
    const toWrite = isWrapped ? JSON.stringify({ ...(parsed as object), jobs }, null, 2) : JSON.stringify(jobs, null, 2);
    fs.writeFileSync(OPENCLAW_CRON_JOBS_PATH, toWrite, 'utf8');
    return { ok: true, job: normalizeJob(jobs[idx]) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function listOpenClawCronJobs(): Promise<OpenClawCronListResult> {
  const raw = readJobsFile();
  if (raw !== null) {
    const jobs = raw.map(normalizeJob);
    return { ok: true, jobs, total: jobs.length, source: 'jobs-file' };
  }

  return {
    ok: false,
    jobs: [],
    total: 0,
    source: 'openclaw-cli',
    unavailableReason: 'jobs-file-missing',
    rawError: `Cannot read ${OPENCLAW_CRON_JOBS_PATH}`,
  };
}

import { NextResponse, type NextRequest } from 'next/server';
import { openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface ProviderRow {
  provider_key: string;
  total_cost: number;
  total_tokens: number;
  session_count: number;
}

interface ProviderUsageEntry {
  key: string;
  label: string;
  totalCost: number;
  totalTokens: number;
  sessionCount: number;
}

interface QuotaMetric {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  unit: string;
  period: string;
  pct: number;
  source?: string;
  resetAt?: string;
}

interface OpenClawUsageWindow {
  label: string;
  usedPercent: number;
  resetAt?: number;
}

interface OpenClawUsageProvider {
  provider: string;
  windows: OpenClawUsageWindow[];
}

interface OpenClawUsageSummary {
  providers: OpenClawUsageProvider[];
}

interface DbSessionAggregate {
  total_tokens: number;
  session_count: number;
}

const MODEL_PATTERNS: Record<string, string[]> = {
  'openai-codex': ['gpt-%', '%codex%', 'openai-codex/%'],
  'github-copilot': ['gemini-%', 'github-copilot/%'],
  'anthropic': ['claude-%', 'anthropic/%', 'claude-cli', 'claude-cli/%'],
  'openrouter': ['openrouter/%'],
  'groq': ['groq/%'],
  'other': ['other/%'],
};

interface OpenAiUsageBucket {
  n_context_tokens_total?: number;
  n_generated_tokens_total?: number;
}

interface RuntimeStatusQuotaMetric {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  unit: string;
  period: string;
  source: 'runtime-status';
  pct: number;
}

type LoadProviderUsageSummary = (opts?: {
  providers?: string[];
  agentDir?: string;
  timeoutMs?: number;
}) => Promise<OpenClawUsageSummary>;

type FsPromisesModule = typeof import('node:fs/promises');

const LABEL: Record<string, string> = {
  anthropic: 'Anthropic',
  'claude-cli': 'Claude CLI',
  openrouter: 'OpenRouter',
  'openai-codex': 'OpenAI Codex',
  'github-copilot': 'GitHub Copilot',
  groq: 'Groq',
  other: 'Other',
};

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadFsPromises(): FsPromisesModule | null {
  try {
    return (0, eval)('require')('node:fs/promises') as FsPromisesModule;
  } catch {
    return null;
  }
}

function parseOptionalNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampPct(used: number, limit: number): number {
  if (!(limit > 0)) return 0;
  return Math.max(0, Math.min(100, roundMetric((used / limit) * 100)));
}

function buildQuotaMetric(input: {
  label: string;
  used: number;
  limit: number;
  unit: string;
  period: string;
  source?: string;
  resetAt?: string;
}): QuotaMetric | null {
  if (!(input.limit > 0)) return null;
  const used = Math.max(0, roundMetric(input.used));
  const limit = roundMetric(input.limit);
  const remaining = Math.max(0, roundMetric(limit - used));

  return {
    label: input.label,
    used,
    limit,
    remaining,
    unit: input.unit,
    period: input.period,
    pct: clampPct(used, limit),
    source: input.source,
    resetAt: input.resetAt,
  };
}

function startOfDaySeconds(now = new Date()): number {
  const value = new Date(now);
  value.setHours(0, 0, 0, 0);
  return Math.floor(value.getTime() / 1000);
}

function startOfWeekSeconds(now = new Date()): number {
  const value = new Date(now);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return Math.floor(value.getTime() / 1000);
}

function nextUtcMidnightIso(now = new Date()): string {
  const value = new Date(now);
  value.setUTCHours(24, 0, 0, 0);
  return value.toISOString();
}

function nextWeekStartIso(now = new Date()): string {
  const value = new Date(now);
  const day = value.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value.toISOString();
}

async function fetchOpenAiUsageTokens(apiKey: string, day: Date): Promise<number | null> {
  try {
    const date = day.toISOString().slice(0, 10);
    const res = await fetch(`https://api.openai.com/v1/usage?date=${date}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: OpenAiUsageBucket[] };
    return (json.data ?? []).reduce(
      (sum, bucket) => sum + (bucket.n_context_tokens_total ?? 0) + (bucket.n_generated_tokens_total ?? 0),
      0,
    );
  } catch {
    return null;
  }
}

function getModelWhereClause(providerKey: string): string {
  const patterns = MODEL_PATTERNS[providerKey];
  if (!patterns) return `model LIKE '${providerKey}/%'`;
  return patterns.map((p) => `model LIKE '${p}'`).join(' OR ');
}

let openClawUsageLoaderPromise: Promise<LoadProviderUsageSummary | null> | null = null;
const OPENCLAW_PROVIDER_USAGE_MODULE =
  '/usr/local/lib/node_modules/openclaw/dist/provider-usage-Ccwl6xqF.js';

async function loadOpenClawUsageLoader(): Promise<LoadProviderUsageSummary | null> {
  if (!openClawUsageLoaderPromise) {
    openClawUsageLoaderPromise = import(
      /* webpackIgnore: true */ OPENCLAW_PROVIDER_USAGE_MODULE
    )
      .then((mod: unknown) => {
        const runtime = mod as { t?: LoadProviderUsageSummary };
        return typeof runtime.t === 'function' ? runtime.t : null;
      })
      .catch(() => null);
  }

  return openClawUsageLoaderPromise;
}

function buildQuotaMetricFromRuntimeWindow(
  provider: string,
  window: OpenClawUsageWindow,
): QuotaMetric | null {
  const usedPercent = Number.isFinite(window.usedPercent) ? Math.max(0, Math.min(100, window.usedPercent)) : 0;
  const remainingPercent = Math.max(0, 100 - usedPercent);
  return buildQuotaMetric({
    label: provider === 'github-copilot' ? `${window.label} runtime quota` : `${window.label} runtime quota`,
    used: roundMetric(usedPercent),
    limit: 100,
    unit: '%',
    period: normalizeRuntimePeriod(window.label),
    source: 'openclaw-runtime',
    resetAt: typeof window.resetAt === 'number' ? new Date(window.resetAt).toISOString() : undefined,
  }) ?? {
    label: `${window.label} runtime quota`,
    used: roundMetric(usedPercent),
    limit: 100,
    remaining: roundMetric(remainingPercent),
    unit: '%',
    period: normalizeRuntimePeriod(window.label),
    pct: roundMetric(usedPercent),
    source: 'openclaw-runtime',
    resetAt: typeof window.resetAt === 'number' ? new Date(window.resetAt).toISOString() : undefined,
  };
}

function normalizeRuntimePeriod(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'week') return 'weekly';
  if (normalized === 'day') return 'daily';
  if (normalized.endsWith('h')) return normalized;
  if (normalized === 'premium' || normalized === 'chat') return 'runtime';
  return normalized || 'runtime';
}

async function buildRuntimeQuotas(): Promise<Pick<Record<string, QuotaMetric[] | null>, 'anthropic' | 'claude-cli' | 'openai-codex' | 'github-copilot'>> {
  const loader = await loadOpenClawUsageLoader();
  if (!loader) {
    return {
      anthropic: null,
      'claude-cli': null,
      'openai-codex': null,
      'github-copilot': null,
    };
  }

  try {
    const summary = await loader({
      providers: ['anthropic', 'claude-cli', 'openai-codex', 'github-copilot'],
      agentDir: '/data/.openclaw',
      timeoutMs: 5000,
    });

    const byProvider = new Map(summary.providers.map((entry) => [entry.provider, entry]));

    return {
      anthropic: (byProvider.get('anthropic')?.windows ?? [])
        .map((window) => buildQuotaMetricFromRuntimeWindow('anthropic', window))
        .filter((metric): metric is QuotaMetric => Boolean(metric)),
      'claude-cli': (byProvider.get('claude-cli')?.windows ?? [])
        .map((window) => buildQuotaMetricFromRuntimeWindow('claude-cli', window))
        .filter((metric): metric is QuotaMetric => Boolean(metric)),
      'openai-codex': (byProvider.get('openai-codex')?.windows ?? [])
        .map((window) => buildQuotaMetricFromRuntimeWindow('openai-codex', window))
        .filter((metric): metric is QuotaMetric => Boolean(metric)),
      'github-copilot': (byProvider.get('github-copilot')?.windows ?? [])
        .map((window) => buildQuotaMetricFromRuntimeWindow('github-copilot', window))
        .filter((metric): metric is QuotaMetric => Boolean(metric)),
    };
  } catch {
    return {
      anthropic: null,
      'claude-cli': null,
      'openai-codex': null,
      'github-copilot': null,
    };
  }
}

function fetchDbAggregate(
  db: ReturnType<typeof openDb>,
  providerKey: string,
  startedAt: number,
): DbSessionAggregate {
  const whereClause = getModelWhereClause(providerKey);
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(tokens_in), 0) + COALESCE(SUM(tokens_out), 0) AS total_tokens,
        COUNT(*) AS session_count
       FROM sessions
       WHERE (${whereClause})
         AND started_at >= ?`,
    )
    .get(startedAt) as DbSessionAggregate | undefined;

  return {
    total_tokens: row?.total_tokens ?? 0,
    session_count: row?.session_count ?? 0,
  };
}

const SESSION_STATUS_DIRS = [
  '/data/.openclaw/agents/ops/sessions',
  '/data/.openclaw/agents/main/sessions',
] as const;
const SESSION_STATUS_FILE_LIMIT = 30;
const SESSION_STATUS_LINE_LIMIT = 2_000;

function parseStatusDurationHours(value: string | undefined): number | null {
  if (!value) return null;
  const hourMatch = value.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minuteMatch = value.match(/(\d+(?:\.\d+)?)\s*m/i);
  const hours = hourMatch ? Number.parseFloat(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number.parseFloat(minuteMatch[1]) : 0;
  const total = hours + (minutes / 60);
  return total > 0 ? roundMetric(total) : null;
}

function buildRuntimeStatusQuotaMetric(input: {
  label: string;
  period: 'daily' | 'weekly';
  limit: number;
  remainingPct: number;
  remainingLabel?: string;
  unit: string;
}): RuntimeStatusQuotaMetric {
  const remainingPct = Math.max(0, Math.min(100, input.remainingPct));
  const usedPct = roundMetric(100 - remainingPct);
  const used = roundMetric(input.limit * (usedPct / 100));
  const remaining = input.unit === 'hours' && input.remainingLabel
    ? parseStatusDurationHours(input.remainingLabel) ?? roundMetric(input.limit * (remainingPct / 100))
    : roundMetric(input.limit * (remainingPct / 100));

  return {
    label: input.label,
    used,
    limit: roundMetric(input.limit),
    remaining,
    unit: input.unit,
    period: input.period,
    source: 'runtime-status',
    pct: usedPct,
  };
}

function parseCodexRuntimeStatus(statusText: string): QuotaMetric[] | null {
  const hasCodexModel = /Model:\s*openai-codex\//i.test(statusText) || /Runtime:\s*OpenAI Codex/i.test(statusText);
  const usageLine = statusText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /Usage:/i.test(line));

  if (!hasCodexModel || !usageLine) return null;

  const usageMatch = usageLine.match(/Usage:\s*(\d+(?:\.\d+)?)h\s+(\d+)%\s+left(?:\s+⏱\s*([^·]+?))?(?:\s+·\s+Week\s+(\d+)%\s+left(?:\s+⏱\s*(.+))?)?$/i);
  if (!usageMatch) return null;

  const [, dailyLimitHoursRaw, dailyRemainingPctRaw, dailyRemainingLabel, weeklyRemainingPctRaw, weeklyRemainingLabel] = usageMatch;
  const dailyLimitHours = Number.parseFloat(dailyLimitHoursRaw);
  const dailyRemainingPct = Number.parseFloat(dailyRemainingPctRaw);
  if (!Number.isFinite(dailyLimitHours) || !Number.isFinite(dailyRemainingPct)) return null;

  const metrics: QuotaMetric[] = [buildRuntimeStatusQuotaMetric({
    label: 'Daily runtime quota',
    period: 'daily',
    limit: dailyLimitHours,
    remainingPct: dailyRemainingPct,
    remainingLabel: dailyRemainingLabel?.trim(),
    unit: 'hours',
  })];

  if (weeklyRemainingPctRaw) {
    const weeklyRemainingPct = Number.parseFloat(weeklyRemainingPctRaw);
    if (Number.isFinite(weeklyRemainingPct)) {
      metrics.push(buildRuntimeStatusQuotaMetric({
        label: 'Weekly quota',
        period: 'weekly',
        limit: 100,
        remainingPct: weeklyRemainingPct,
        remainingLabel: weeklyRemainingLabel?.trim(),
        unit: 'percent',
      }));
    }
  }

  return metrics;
}

async function findLatestCodexRuntimeStatus(): Promise<QuotaMetric[] | null> {
  try {
    const runtimeFs = loadFsPromises();
    if (!runtimeFs) return null;

    const files = (
      await Promise.all(
        SESSION_STATUS_DIRS.map(async (dir) => {
          const entries = await runtimeFs.readdir(dir, { withFileTypes: true });
          const stats = await Promise.all(entries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
            .map(async (entry) => {
              const filePath = `${dir}/${entry.name}`;
              const stat = await runtimeFs.stat(filePath);
              return { filePath, mtimeMs: stat.mtimeMs };
            }));
          return stats;
        }),
      )
    )
      .flat()
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, SESSION_STATUS_FILE_LIMIT);

    for (const file of files) {
      const content = await runtimeFs.readFile(file.filePath, 'utf8');
      const lines = content.split('\n');
      for (let index = lines.length - 1, seen = 0; index >= 0 && seen < SESSION_STATUS_LINE_LIMIT; index -= 1, seen += 1) {
        const line = lines[index]?.trim();
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as {
            message?: {
              role?: string;
              toolName?: string;
              details?: { statusText?: unknown };
            };
          };
          const statusText = parsed.message?.details?.statusText;
          if (
            parsed.message?.role === 'toolResult'
            && parsed.message?.toolName === 'session_status'
            && typeof statusText === 'string'
          ) {
            const metrics = parseCodexRuntimeStatus(statusText);
            if (metrics?.length) return metrics;
          }
        } catch {
          // Ignore malformed lines.
        }
      }
    }
  } catch {
    // Ignore filesystem/runtime-status failures and keep legacy fallback.
  }

  return null;
}

async function buildCodexQuotas(db: ReturnType<typeof openDb>): Promise<QuotaMetric[] | null> {
  const runtimeStatusQuotas = await findLatestCodexRuntimeStatus();
  if (runtimeStatusQuotas?.length) return runtimeStatusQuotas;

  const metrics: QuotaMetric[] = [];
  const now = new Date();
  const tokensPerHour = parseNumber(process.env.OPENAI_CODEX_TOKENS_PER_HOUR, 1_000_000);
  const dailyHourLimit = parseNumber(process.env.OPENAI_CODEX_DAILY_HOUR_LIMIT, 5);
  const weeklyHourLimit = parseOptionalNumber(process.env.OPENAI_CODEX_WEEKLY_HOUR_LIMIT);
  const apiKey = process.env.OPENAI_API_KEY;

  const dailyDbAggregate = fetchDbAggregate(db, 'openai-codex', startOfDaySeconds(now));
  const dailyApiTokens = apiKey ? await fetchOpenAiUsageTokens(apiKey, now) : null;
  const dailyTokens = dailyApiTokens ?? dailyDbAggregate.total_tokens;
  const dailyMetric = buildQuotaMetric({
    label: 'Daily cloud quota',
    used: dailyTokens / tokensPerHour,
    limit: dailyHourLimit,
    unit: 'hours',
    period: 'daily',
    source: dailyApiTokens !== null ? 'api' : 'estimated',
    resetAt: nextUtcMidnightIso(now),
  });
  if (dailyMetric) metrics.push(dailyMetric);

  if (weeklyHourLimit !== null) {
    const weeklyDbAggregate = fetchDbAggregate(db, 'openai-codex', startOfWeekSeconds(now));
    const weeklyMetric = buildQuotaMetric({
      label: 'Weekly cloud quota',
      used: weeklyDbAggregate.total_tokens / tokensPerHour,
      limit: weeklyHourLimit,
      unit: 'hours',
      period: 'weekly',
      source: 'db-proxy',
      resetAt: nextWeekStartIso(now),
    });
    if (weeklyMetric) metrics.push(weeklyMetric);
  }

  return metrics.length > 0 ? metrics : null;
}

function buildCopilotQuotas(db: ReturnType<typeof openDb>): QuotaMetric[] | null {
  const monthlyLimit =
    parseOptionalNumber(process.env.GITHUB_COPILOT_AI_CREDIT_LIMIT) ??
    parseOptionalNumber(process.env.GITHUB_COPILOT_MONTHLY_LIMIT);
  if (monthlyLimit === null) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);
  const aggregate = fetchDbAggregate(db, 'github-copilot', Math.floor(monthStart.getTime() / 1000));
  const metric = buildQuotaMetric({
    label: 'AI credits',
    used: aggregate.session_count,
    limit: monthlyLimit,
    unit: 'credits',
    period: 'monthly',
    source: 'db-proxy',
    resetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
  });

  return metric ? [metric] : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let providers: ProviderUsageEntry[] = [];
  const quotas: Record<string, QuotaMetric[] | null> = {
    anthropic: null,
    'claude-cli': null,
    openrouter: null,
    'openai-codex': null,
    'github-copilot': null,
    groq: null,
    other: null,
  };

  let openrouterLive: { usage: number; limit: number; limitRemaining: number } | null = null;
  const orKey = process.env.OPENROUTER_API_KEY;

  try {
    const db = openDb();
    try {
      const rows = db
        .prepare(
          `SELECT
            CASE
              WHEN model = 'claude-cli' OR model LIKE 'claude-cli/%' THEN 'claude-cli'
              WHEN model LIKE 'anthropic/%' THEN 'anthropic'
              WHEN model LIKE 'claude-%' THEN 'anthropic'
              WHEN model LIKE 'openrouter/%' THEN 'openrouter'
              WHEN model LIKE 'openai-codex/%' THEN 'openai-codex'
              WHEN model LIKE 'github-copilot/%' THEN 'github-copilot'
              WHEN model LIKE 'groq/%' THEN 'groq'
              WHEN model LIKE 'gpt-%' OR model LIKE '%codex%' THEN 'openai-codex'
              WHEN model LIKE 'gemini-%' THEN 'github-copilot'
              ELSE 'other'
            END AS provider_key,
            COALESCE(SUM(CASE WHEN model LIKE 'openrouter/%' THEN cost_usd ELSE 0 END), 0) AS total_cost,
            COALESCE(SUM(tokens_in), 0) + COALESCE(SUM(tokens_out), 0) AS total_tokens,
            COUNT(*) AS session_count
           FROM sessions
           WHERE model IS NOT NULL
           GROUP BY provider_key
           ORDER BY total_cost DESC`,
        )
        .all() as ProviderRow[];

      providers = rows.map((row) => ({
        key: row.provider_key,
        label: LABEL[row.provider_key] ?? row.provider_key,
        totalCost: row.total_cost,
        totalTokens: row.total_tokens,
        sessionCount: row.session_count,
      }));

      const runtimeQuotas = await buildRuntimeQuotas();
      quotas.anthropic = runtimeQuotas.anthropic;
      quotas['claude-cli'] = runtimeQuotas['claude-cli'];
      // Prefer runtime data (OpenClaw gateway) over DB estimates
{
  const codexQuotas = await buildCodexQuotas(db);
  const runtimeCodex = runtimeQuotas['openai-codex'];
  quotas['openai-codex'] = (runtimeCodex && runtimeCodex.length > 0) ? runtimeCodex : codexQuotas;
}
      quotas['github-copilot'] = runtimeQuotas['github-copilot'];
    } finally {
      db.close();
    }
  } catch {
    // Leave providers/quotas empty when DB is unavailable.
  }

  if (orKey) {
    const orResult = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${orKey}` },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null) as { data?: { usage?: number; limit?: number; limit_remaining?: number } } | null;

    if (orResult?.data) {
      openrouterLive = {
        usage: orResult.data.usage ?? 0,
        limit: orResult.data.limit ?? 0,
        limitRemaining: orResult.data.limit_remaining ?? 0,
      };
    }
  }

  return NextResponse.json({ providers, openrouterLive, quotas });
}

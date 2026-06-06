import { NextResponse } from 'next/server';
import path from 'path';

interface ProviderRow {
  provider_key: string;
  total_cost: number;
  total_tokens: number;
  session_count: number;
}

const LABEL: Record<string, string> = {
  openrouter: 'OpenRouter',
  'openai-codex': 'OpenAI Codex',
  'github-copilot': 'GitHub Copilot',
  groq: 'Groq',
  other: 'Other',
};

export async function GET() {
  const dbPath = process.env.OLYMPUS_DB || path.join(process.cwd(), 'events.db');

  let providers: { key: string; label: string; totalCost: number; totalTokens: number; sessionCount: number }[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const rows: ProviderRow[] = db.prepare(`
      SELECT
        CASE
          WHEN model LIKE 'openrouter/%' THEN 'openrouter'
          WHEN model LIKE 'openai-codex/%' THEN 'openai-codex'
          WHEN model LIKE 'github-copilot/%' THEN 'github-copilot'
          WHEN model LIKE 'groq/%' THEN 'groq'
          ELSE 'other'
        END as provider_key,
        SUM(COALESCE(cost_usd, 0)) as total_cost,
        SUM(COALESCE(tokens_in, 0) + COALESCE(tokens_out, 0)) as total_tokens,
        COUNT(*) as session_count
      FROM sessions
      WHERE model IS NOT NULL
      GROUP BY provider_key
      ORDER BY total_cost DESC
    `).all();
    db.close();
    providers = rows.map(r => ({
      key: r.provider_key,
      label: LABEL[r.provider_key] ?? r.provider_key,
      totalCost: r.total_cost,
      totalTokens: r.total_tokens,
      sessionCount: r.session_count,
    }));
  } catch {
    // db not available — return empty
  }

  let openrouterLive: { usage: number; limit: number; limitRemaining: number } | null = null;
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${orKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = await res.json();
        const d = json?.data;
        if (d) {
          openrouterLive = {
            usage: d.usage ?? 0,
            limit: d.limit ?? 0,
            limitRemaining: d.limit_remaining ?? 0,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ providers, openrouterLive });
}

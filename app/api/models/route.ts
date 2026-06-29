import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';

export const dynamic = 'force-dynamic';

const OPENCLAW_BIN = process.env.OPENCLAW_BIN || '/usr/bin/openclaw';

interface ModelListItem {
  key: string;
  name?: string;
  available?: boolean;
  missing?: boolean;
  tags?: string[];
}

const PROVIDER_EMOJI: Record<string, string> = {
  'default': '🔧',
  'anthropic': '🟣',
  'openai-codex': '🤖',
  'github-copilot': '🤖',
  'openrouter': '🌐',
  'groq': '⚡',
  'deepseek': '🧠',
  'openai': '🤖',
  'codex': '🤖',
};

const PROVIDER_LABEL: Record<string, string> = {
  'default': 'Default',
  'anthropic': 'Anthropic',
  'openai-codex': 'OpenAI Codex',
  'github-copilot': 'GitHub Copilot',
  'openrouter': 'OpenRouter',
  'groq': 'Groq',
  'deepseek': 'DeepSeek',
  'openai': 'OpenAI',
  'codex': 'Codex',
};

function labelForModel(model: ModelListItem): string {
  const base = model.name || model.key.split('/').slice(1).join('/');
  const aliasTags = (model.tags || [])
    .filter((t) => t.startsWith('alias:'))
    .map((t) => t.replace('alias:', ''));
  return aliasTags.length ? `${base} · ${aliasTags.join(', ')}` : base;
}

export async function GET(): Promise<NextResponse> {
  try {
    // Fonte ufficiale: OpenClaw risolve config globale + agent models.json + auth/profile.
    const raw = execFileSync(OPENCLAW_BIN, ['models', 'list', '--json'], {
      encoding: 'utf-8',
      timeout: 20_000,
      env: { ...process.env, HOME: process.env.HOME || '/data' },
    });
    const parsed = JSON.parse(raw);
    const models = Array.isArray(parsed?.models) ? parsed.models as ModelListItem[] : [];

    const grouped = new Map<string, { provider: string; emoji: string; models: { id: string; label: string }[] }>();
    grouped.set('default', { provider: 'Default', emoji: PROVIDER_EMOJI.default, models: [{ id: '', label: 'Default (agente)' }] });

    for (const model of models) {
      if (!model?.key || model.missing || model.available === false) continue;
      const providerId = model.key.split('/')[0];
      if (!grouped.has(providerId)) {
        grouped.set(providerId, {
          provider: PROVIDER_LABEL[providerId] || providerId,
          emoji: PROVIDER_EMOJI[providerId] || '🔌',
          models: [],
        });
      }
      grouped.get(providerId)!.models.push({ id: model.key, label: labelForModel(model) });
    }

    // Ordine stabile e leggibile.
    const order = ['default', 'anthropic', 'openai-codex', 'github-copilot', 'openrouter', 'groq', 'deepseek', 'openai', 'codex'];
    const result = Array.from(grouped.entries())
      .sort(([a], [b]) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        return a.localeCompare(b);
      })
      .map(([, value]) => value);

    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

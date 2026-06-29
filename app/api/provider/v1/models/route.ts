/**
 * Olympus Provider Gateway — v1 Models List
 *
 * GET /api/provider/v1/models
 *
 * Returns models available through the Olympus Gateway
 * in OpenAI-compatible format.
 *
 * The model list is read from models.config.json in the project root.
 * If the file doesn't exist, falls back to provider env config + static defaults.
 */
import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ModelEntry {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  permission: string[];
  root: string;
}

interface ModelsConfigEntry {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
}

const CONFIG_PATH = path.resolve(process.cwd(), 'models.config.json');

/** Get the list of providers that have an API key configured */
function getConfiguredProviders(): string[] {
  const configured: string[] = [];
  if (process.env.PROVIDER_DEEPSEEK_API_KEY) configured.push('deepseek');
  if (process.env.PROVIDER_OPENROUTER_API_KEY) configured.push('openrouter');
  if (process.env.PROVIDER_OPENAI_CODEX_API_KEY) configured.push('openai-codex');
  if (process.env.PROVIDER_OPENAI_API_KEY) configured.push('openai');
  if (process.env.PROVIDER_ANTHROPIC_API_KEY) configured.push('anthropic');
  if (process.env.PROVIDER_GROQ_API_KEY) configured.push('groq');
  return configured;
}

/** Default model catalogue (known models for each provider) */
const DEFAULT_CATALOGUE: ModelsConfigEntry[] = [
  // DeepSeek
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'deepseek', enabled: true },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'deepseek', enabled: true },
  { id: 'deepseek/deepseek-r1-0528', name: 'DeepSeek R1 0528', provider: 'deepseek', enabled: false },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', provider: 'deepseek', enabled: false },
  // OpenAI Codex
  { id: 'openai-codex/gpt-5.4', name: 'GPT 5.4 Codex', provider: 'openai-codex', enabled: true },
  { id: 'openai-codex/gpt-5.4-mini', name: 'GPT 5.4 Mini Codex', provider: 'openai-codex', enabled: true },
  { id: 'openai-codex/gpt-5.4-pro', name: 'GPT 5.4 Pro Codex', provider: 'openai-codex', enabled: true },
  { id: 'openai-codex/gpt-5.2', name: 'GPT 5.2 Codex', provider: 'openai-codex', enabled: false },
  { id: 'openai-codex/gpt-5.3-codex', name: 'GPT 5.3 Codex', provider: 'openai-codex', enabled: false },
  // OpenAI
  { id: 'openai/gpt-5.5-pro', name: 'GPT 5.5 Pro', provider: 'openai', enabled: false },
  // Anthropic
  { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7', provider: 'anthropic', enabled: false },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', provider: 'anthropic', enabled: false },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', provider: 'anthropic', enabled: false },
  // OpenRouter
  { id: 'openrouter/auto', name: 'OpenRouter Auto', provider: 'openrouter', enabled: true },
  { id: 'openrouter/deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash (OR)', provider: 'openrouter', enabled: true },
  { id: 'openrouter/google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (OR)', provider: 'openrouter', enabled: true },
  { id: 'openrouter/google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (OR)', provider: 'openrouter', enabled: true },
  { id: 'openrouter/anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6 (OR)', provider: 'openrouter', enabled: false },
  { id: 'openrouter/deepseek/deepseek-r1-0528', name: 'DeepSeek R1 0528 (OR)', provider: 'openrouter', enabled: false },
  // Groq
  { id: 'groq/llama-3.1-8b-instant', name: 'Llama 3.1 8B (Groq)', provider: 'groq', enabled: false },
  { id: 'groq/llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)', provider: 'groq', enabled: false },
  // Olympus models (always available if any provider is configured)
  { id: 'olympus/deepseek-v4-flash', name: 'DeepSeek V4 Flash (Olympus)', provider: 'olympus', enabled: true },
  { id: 'olympus/deepseek-v4-pro', name: 'DeepSeek V4 Pro (Olympus)', provider: 'olympus', enabled: true },
  { id: 'olympus/fast', name: 'Olympus Fast', provider: 'olympus', enabled: false },
  { id: 'olympus/code', name: 'Olympus Code', provider: 'olympus', enabled: false },
  { id: 'olympus/reason', name: 'Olympus Reason', provider: 'olympus', enabled: false },
  { id: 'olympus/fallback-general', name: 'Olympus Fallback General', provider: 'olympus', enabled: false },
];

/** Load the models config from file, or create from defaults */
function loadConfig(): ModelsConfigEntry[] {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.models)) {
      return parsed.models as ModelsConfigEntry[];
    }
    return DEFAULT_CATALOGUE;
  } catch {
    // File doesn't exist or invalid — write defaults
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify({ models: DEFAULT_CATALOGUE }, null, 2), 'utf-8');
    } catch {
      // Can't write, fall back to defaults in memory
    }
    return DEFAULT_CATALOGUE;
  }
}

export async function GET() {
  const allModels = loadConfig();
  const configuredProviders = getConfiguredProviders();

  // Only return enabled models for providers that have an API key configured
  const activeModels = allModels.filter((m) => {
    if (m.provider === 'olympus') {
      // Olympus aliases available if at least one provider is configured
      return m.enabled && configuredProviders.length > 0;
    }
    return m.enabled && configuredProviders.includes(m.provider);
  });

  return NextResponse.json({
    object: 'list',
    total: activeModels.length,
    data: activeModels.map((m) => ({
      id: m.id,
      object: 'model',
      created: 1700000000,
      owned_by: m.provider,
      permission: [],
      root: m.id,
    })),
  });
}

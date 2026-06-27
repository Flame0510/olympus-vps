/**
 * Olympus Provider Gateway — v1 Models List
 *
 * GET /api/provider/v1/models
 *
 * Returns models available through the Olympus Gateway
 * in OpenAI-compatible format.
 */
import { NextResponse } from 'next/server';

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

const STATIC_MODELS: ModelEntry[] = [
  // DeepSeek
  { id: 'deepseek/deepseek-v4-pro', object: 'model', created: 1700000000, owned_by: 'deepseek', permission: [], root: 'deepseek/deepseek-v4-pro' },
  { id: 'deepseek/deepseek-v4-flash', object: 'model', created: 1700000000, owned_by: 'deepseek', permission: [], root: 'deepseek/deepseek-v4-flash' },
  { id: 'deepseek/deepseek-r1-0528', object: 'model', created: 1700000000, owned_by: 'deepseek', permission: [], root: 'deepseek/deepseek-r1-0528' },
  { id: 'deepseek/deepseek-v3.2', object: 'model', created: 1700000000, owned_by: 'deepseek', permission: [], root: 'deepseek/deepseek-v3.2' },
  // OpenAI Codex
  { id: 'openai-codex/gpt-5.4', object: 'model', created: 1700000000, owned_by: 'openai-codex', permission: [], root: 'openai-codex/gpt-5.4' },
  { id: 'openai-codex/gpt-5.4-mini', object: 'model', created: 1700000000, owned_by: 'openai-codex', permission: [], root: 'openai-codex/gpt-5.4-mini' },
  { id: 'openai-codex/gpt-5.4-pro', object: 'model', created: 1700000000, owned_by: 'openai-codex', permission: [], root: 'openai-codex/gpt-5.4-pro' },
  { id: 'openai-codex/gpt-5.2', object: 'model', created: 1700000000, owned_by: 'openai-codex', permission: [], root: 'openai-codex/gpt-5.2' },
  { id: 'openai-codex/gpt-5.3-codex', object: 'model', created: 1700000000, owned_by: 'openai-codex', permission: [], root: 'openai-codex/gpt-5.3-codex' },
  // OpenAI
  { id: 'openai/gpt-5.5-pro', object: 'model', created: 1700000000, owned_by: 'openai', permission: [], root: 'openai/gpt-5.5-pro' },
  // Anthropic
  { id: 'anthropic/claude-opus-4.7', object: 'model', created: 1700000000, owned_by: 'anthropic', permission: [], root: 'anthropic/claude-opus-4.7' },
  { id: 'anthropic/claude-sonnet-4.6', object: 'model', created: 1700000000, owned_by: 'anthropic', permission: [], root: 'anthropic/claude-sonnet-4.6' },
  { id: 'anthropic/claude-haiku-4.5', object: 'model', created: 1700000000, owned_by: 'anthropic', permission: [], root: 'anthropic/claude-haiku-4.5' },
  // OpenRouter
  { id: 'openrouter/auto', object: 'model', created: 1700000000, owned_by: 'openrouter', permission: [], root: 'openrouter/auto' },
  { id: 'openrouter/deepseek/deepseek-v4-flash', object: 'model', created: 1700000000, owned_by: 'openrouter', permission: [], root: 'openrouter/deepseek/deepseek-v4-flash' },
  { id: 'openrouter/google/gemini-2.5-flash', object: 'model', created: 1700000000, owned_by: 'openrouter', permission: [], root: 'openrouter/google/gemini-2.5-flash' },
  { id: 'openrouter/google/gemini-2.5-pro', object: 'model', created: 1700000000, owned_by: 'openrouter', permission: [], root: 'openrouter/google/gemini-2.5-pro' },
  { id: 'openrouter/anthropic/claude-sonnet-4.6', object: 'model', created: 1700000000, owned_by: 'openrouter', permission: [], root: 'openrouter/anthropic/claude-sonnet-4.6' },
  { id: 'openrouter/deepseek/deepseek-r1-0528', object: 'model', created: 1700000000, owned_by: 'openrouter', permission: [], root: 'openrouter/deepseek/deepseek-r1-0528' },
  // Groq
  { id: 'groq/llama-3.1-8b-instant', object: 'model', created: 1700000000, owned_by: 'groq', permission: [], root: 'groq/llama-3.1-8b-instant' },
  { id: 'groq/llama-3.3-70b-versatile', object: 'model', created: 1700000000, owned_by: 'groq', permission: [], root: 'groq/llama-3.3-70b-versatile' },
  // Olympus aliases (routed by gateway logic, not upstream)
  { id: 'olympus/reason', object: 'model', created: 1700000000, owned_by: 'olympus', permission: [], root: 'olympus/reason' },
  { id: 'olympus/fast', object: 'model', created: 1700000000, owned_by: 'olympus', permission: [], root: 'olympus/fast' },
  { id: 'olympus/code', object: 'model', created: 1700000000, owned_by: 'olympus', permission: [], root: 'olympus/code' },
  { id: 'olympus/fallback-general', object: 'model', created: 1700000000, owned_by: 'olympus', permission: [], root: 'olympus/fallback-general' },
];

export async function GET() {
  return NextResponse.json({
    object: 'list',
    data: STATIC_MODELS.map((m) => ({
      id: m.id,
      object: 'model',
      created: m.created,
      owned_by: m.owned_by,
      permission: [],
      root: m.root,
    })),
  });
}

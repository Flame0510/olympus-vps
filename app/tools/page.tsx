import { requireAuth } from '@/lib/requireAuth';
import fs from 'fs';
import ToolsPageClient, { type AudioConfig } from './ToolsPageClient';

export const dynamic = 'force-dynamic';

const CONFIG_PATH = '/data/.openclaw/openclaw.json';
const OLYMPUS_SETTINGS_PATH = '/data/olympus/settings.json';

type JsonObject = Record<string, unknown>;

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function sanitizeAudioConfig(value: unknown): AudioConfig {
  const raw = asJsonObject(value);
  const audio: AudioConfig = {};
  if (typeof raw.enabled === 'boolean') audio.enabled = raw.enabled;
  if (typeof raw.timeoutSeconds === 'number' && Number.isFinite(raw.timeoutSeconds)) audio.timeoutSeconds = raw.timeoutSeconds;
  if (typeof raw.maxBytes === 'number' && Number.isFinite(raw.maxBytes)) audio.maxBytes = raw.maxBytes;
  if (Array.isArray(raw.models)) {
    audio.models = raw.models
      .filter((model): model is JsonObject => Boolean(model) && typeof model === 'object' && !Array.isArray(model))
      .map((model) => ({
        provider: typeof model.provider === 'string' ? model.provider : '',
        model: typeof model.model === 'string' ? model.model : '',
        baseUrl: typeof model.baseUrl === 'string' ? model.baseUrl : '',
      }));
  }
  return audio;
}

function readInitialTimezone(): string {
  try {
    const settings = JSON.parse(fs.readFileSync(OLYMPUS_SETTINGS_PATH, 'utf8')) as JsonObject;
    return typeof settings.timezone === 'string' && settings.timezone ? settings.timezone : 'Europe/Rome';
  } catch {
    return 'Europe/Rome';
  }
}

function getInitialData(): { audio: AudioConfig; timezone: string; error: string | null } {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as JsonObject;
    const tools = asJsonObject(config.tools);
    const media = asJsonObject(tools.media);
    const timezone = readInitialTimezone();
    return { audio: sanitizeAudioConfig(media.audio), timezone, error: null };
  } catch (error: unknown) {
    return {
      audio: {},
      timezone: 'Europe/Rome',
      error: `Could not read initial config: ${(error as Error).message}`,
    };
  }
}

export default async function ToolsPage() {
  await requireAuth();

  const { audio, timezone, error } = getInitialData();
  return <ToolsPageClient initialAudio={audio} initialTimezone={timezone} initialError={error} />;
}

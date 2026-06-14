import fs from 'fs';
import path from 'path';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const CONFIG_PATH = '/data/.openclaw/openclaw.json';
const OLYMPUS_SETTINGS_PATH = '/data/olympus/settings.json';

type JsonObject = Record<string, unknown>;

function readConfig(): JsonObject {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as JsonObject;
}

function formatBackupTimestamp(date: Date): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function writeConfig(config: JsonObject): void {
  const dir = path.dirname(CONFIG_PATH);
  const base = path.basename(CONFIG_PATH);
  const backup = path.join(dir, `${base}.bak-${formatBackupTimestamp(new Date())}`);
  const tmp = path.join(dir, `${base}.tmp-${process.pid}-${Date.now()}`);
  const data = `${JSON.stringify(config, null, 2)}\n`;

  fs.copyFileSync(CONFIG_PATH, backup);

  let fd: number | undefined;
  let dfd: number | undefined;
  try {
    fd = fs.openSync(tmp, 'w', 0o600);
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, CONFIG_PATH);
    dfd = fs.openSync(dir, 'r');
    fs.fsyncSync(dfd);
    fs.closeSync(dfd);
    dfd = undefined;
  } catch (e) {
    if (fd !== undefined) fs.closeSync(fd);
    if (dfd !== undefined) fs.closeSync(dfd);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    throw e;
  }
}

function getAudio(config: JsonObject): JsonObject {
  const tools = (config.tools ?? {}) as JsonObject;
  const media = (tools.media ?? {}) as JsonObject;
  return (media.audio ?? {}) as JsonObject;
}

function readOlympusSettings(): JsonObject {
  try {
    return JSON.parse(fs.readFileSync(OLYMPUS_SETTINGS_PATH, 'utf8')) as JsonObject;
  } catch {
    return {};
  }
}

function writeOlympusSettings(settings: JsonObject): void {
  const dir = path.dirname(OLYMPUS_SETTINGS_PATH);
  const tmp = path.join(dir, `.settings.json.tmp-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, OLYMPUS_SETTINGS_PATH);
}

function getTimezone(): string {
  const settings = readOlympusSettings();
  const tz = settings.timezone;
  return typeof tz === 'string' && tz ? tz : 'Europe/Rome';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const config = readConfig();
    const audio = getAudio(config);
    const timezone = getTimezone();
    return NextResponse.json({ audio, timezone });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

interface AudioInput {
  enabled?: boolean;
  timeoutSeconds?: number;
  maxBytes?: number;
  models?: JsonObject[];
}

const VALID_TIMEZONES = [
  'Europe/Rome', 'UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Asia/Kolkata',
  'Australia/Sydney', 'Pacific/Auckland',
];

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { audio?: AudioInput; timezone?: string };

    const config = readConfig();
    if (!config.tools) config.tools = {};
    const tools = config.tools as JsonObject;
    let timezone = getTimezone();

    if (body.timezone !== undefined) {
      if (typeof body.timezone !== 'string' || !body.timezone)
        throw new Error('timezone must be a non-empty string');
      if (!VALID_TIMEZONES.includes(body.timezone))
        throw new Error('timezone is not supported');
      timezone = body.timezone;
      writeOlympusSettings({ ...readOlympusSettings(), timezone });
    }

    const input = body?.audio;
    if (input) {
      if (typeof input !== 'object') throw new Error('audio must be an object');
      if (input.enabled !== undefined && typeof input.enabled !== 'boolean')
        throw new Error('enabled must be boolean');
      if (input.timeoutSeconds !== undefined && (typeof input.timeoutSeconds !== 'number' || !Number.isFinite(input.timeoutSeconds)))
        throw new Error('timeoutSeconds must be a number');
      if (input.maxBytes !== undefined && (typeof input.maxBytes !== 'number' || !Number.isFinite(input.maxBytes)))
        throw new Error('maxBytes must be a number');
      if (input.models !== undefined && !Array.isArray(input.models))
        throw new Error('models must be an array');

      if (!tools.media) tools.media = {};
      const media = tools.media as JsonObject;
      const existing = (media.audio ?? {}) as JsonObject;

      const next: JsonObject = { ...existing };
      if (input.enabled !== undefined) next.enabled = input.enabled;
      if (input.timeoutSeconds !== undefined) next.timeoutSeconds = input.timeoutSeconds;
      if (input.maxBytes !== undefined) next.maxBytes = input.maxBytes;
      if (input.models !== undefined) next.models = input.models;

      media.audio = next;
    }

    writeConfig(config);

    return NextResponse.json({ ok: true, timezone, audio: config.tools && (config.tools as JsonObject).media ? ((config.tools as JsonObject).media as JsonObject).audio : {} });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/**
 * Config → Environment Variables API
 *
 * GET  /api/config/env  — read all env vars (values unmasked)
 * PUT  /api/config/env  — upsert one or more env vars
 *
 * Only keys prefixed with OLYMPUS_ or PROVIDER_ are exposed.
 * Auth: browser cookie (authenticated session via middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ENV_PATH = path.resolve(process.cwd(), '.env');

const ALLOWED_PREFIXES = ['OLYMPUS_', 'PROVIDER_'];

function isAllowedKey(key: string): boolean {
  return ALLOWED_PREFIXES.some((p) => key.startsWith(p));
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (isAllowedKey(key)) {
      result[key] = value;
    }
  }
  return result;
}

function serializeEnvFile(vars: Record<string, string>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(vars).sort()) {
    lines.push(`${key}=${value}`);
  }
  return lines.join('\n') + '\n';
}

export async function GET() {
  try {
    let content = '';
    try {
      content = fs.readFileSync(ENV_PATH, 'utf-8');
    } catch {
      content = '';
    }
    const vars = parseEnvFile(content);
    // Also inject runtime values for keys not in file
    for (const key of ALLOWED_PREFIXES.flatMap((p) =>
      Object.keys(process.env).filter((k) => k.startsWith(p) && !(k in vars))
    )) {
      vars[key] = process.env[key] || '';
    }
    return NextResponse.json({ env: vars });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: { env?: Record<string, string> } = await request.json();
    if (!body.env || typeof body.env !== 'object') {
      return NextResponse.json({ error: 'env object required' }, { status: 400 });
    }

    // Validate keys
    const invalidKeys = Object.keys(body.env).filter((k) => !isAllowedKey(k));
    if (invalidKeys.length > 0) {
      return NextResponse.json(
        { error: `Keys not allowed: ${invalidKeys.join(', ')}` },
        { status: 400 },
      );
    }

    // Read current, merge, write back
    let current: Record<string, string> = {};
    try {
      current = parseEnvFile(fs.readFileSync(ENV_PATH, 'utf-8'));
    } catch {
      // File doesn't exist — start fresh
    }

    for (const [key, value] of Object.entries(body.env)) {
      if (value === null || value === undefined || value === '') {
        delete current[key];
      } else {
        current[key] = value;
      }
    }

    fs.writeFileSync(ENV_PATH, serializeEnvFile(current), 'utf-8');

    return NextResponse.json({ status: 'ok', updated: Object.keys(body.env) });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

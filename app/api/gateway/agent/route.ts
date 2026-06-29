/**
 * PUT /api/gateway/agent
 *
 * Update the model configuration for an agent container.
 * Uses base64-safe write — no heredoc shell escaping issues.
 *
 * Body:
 *   { "containerName": "openclaw-atlas", "model": "olympus/deepseek-v4-flash", "fallbacks": ["olympus/deepseek-v4-pro"] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function execInContainer(container: string, cmd: string, timeout = 15000): string {
  try {
    return execSync(
      `docker exec ${container} sh -c ${JSON.stringify(cmd)}`,
      { timeout, maxBuffer: 1024 * 1024, encoding: 'utf-8' },
    ).trim();
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(err.stderr || err.message || `Failed to exec in ${container}`);
  }
}

function ensureOlympusPrefix(id: string): string {
  return id.startsWith('olympus/') ? id : `olympus/${id}`;
}

function ensureOlympusPrefixes(ids: string[]): string[] {
  return ids.map(ensureOlympusPrefix);
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Write content to a file inside a container. */
function writeFileToContainer(container: string, remotePath: string, content: string): void {
  const b64 = Buffer.from(content, 'utf-8').toString('base64');
  execSync(
    `docker exec ${container} sh -c "echo '${b64}' | base64 -d > ${remotePath}"`,
    { timeout: 15000, maxBuffer: 128 * 1024 },
  );
}

/** Read file content from container (stderr goes to /dev/null). */
function readFileFromContainer(container: string, remotePath: string): string {
  try {
    return execInContainer(container, `cat ${remotePath} 2>/dev/null`);
  } catch {
    return '';
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: { containerName?: string; model?: string; fallbacks?: string[] } = await request.json();
    const { containerName } = body;

    if (!containerName) {
      return NextResponse.json({ status: 'error', error: 'containerName is required' }, { status: 400 });
    }

    const safeContainer = containerName.replace(/[^a-zA-Z0-9_.-]/g, '');
    if (safeContainer !== containerName) {
      return NextResponse.json({ status: 'error', error: 'Invalid container name' }, { status: 400 });
    }

    if (!body.model) {
      return NextResponse.json({ status: 'error', error: 'model is required' }, { status: 400 });
    }

    // Read current config
    const raw = readFileFromContainer(safeContainer, '/root/.openclaw/openclaw.json');
    if (!raw) {
      return NextResponse.json({ status: 'error', error: 'Failed to read config from container (empty)' }, { status: 500 });
    }

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(raw);
    } catch (e) {
      return NextResponse.json({
        status: 'error',
        error: 'Failed to parse config from container',
        detail: raw.slice(0, 200),
      }, { status: 500 });
    }

    // Update model config
    const agents = (config.agents || {}) as Record<string, unknown>;
    const list = (agents.list || []) as Record<string, unknown>[];

    const mainAgent = list.find((a) => a.id === 'main');
    if (mainAgent) {
      const primary = ensureOlympusPrefix(body.model);
      let fallbacks = dedupe(ensureOlympusPrefixes(body.fallbacks || []));
      // Remove the primary model dai fallback
      fallbacks = fallbacks.filter((fb) => fb !== primary);
      mainAgent.model = {
        primary,
        fallbacks,
      };
    }

    const defaults = (agents.defaults || {}) as Record<string, unknown>;
    {
      const primary = ensureOlympusPrefix(body.model);
      let fallbacks = dedupe(ensureOlympusPrefixes(body.fallbacks || []));
      fallbacks = fallbacks.filter((fb) => fb !== primary);
      defaults.model = {
        primary,
        fallbacks,
      };
    }

    // Write back
    const newConfig = JSON.stringify(config, null, 2);
    execSync(
      `docker exec -i ${safeContainer} sh -c 'cat > /root/.openclaw/openclaw.json'`,
      { timeout: 15000, maxBuffer: 1024 * 1024, input: newConfig },
    );

    // Restart gateway to pick up the changes
    try {
      execSync(`docker exec ${safeContainer} openclaw gateway restart`, { timeout: 15000, maxBuffer: 64 * 1024 });
    } catch {
      // restart failure is non-fatal, config was written
    }

    // Verify
    const verifyRaw = readFileFromContainer(safeContainer, '/root/.openclaw/openclaw.json');
    const verifyOk = verifyRaw.includes('"primary"');
    const verifyBytes = verifyRaw.length;

    return NextResponse.json({
      status: 'ok',
      agent: safeContainer,
      model: {
        primary: body.model,
        fallbacks: body.fallbacks || [],
      },
      verify: { ok: verifyOk, bytes: verifyBytes },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}

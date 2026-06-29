/**
 * PUT /api/gateway/agent
 *
 * Update the model configuration for an agent container.
 *
 * Body:
 *   { "containerName": "openclaw-atlas", "model": "olympus/deepseek-v4-flash", "fallbacks": ["olympus/deepseek-v4-pro"] }
 *
 * Response:
 *   { "status": "ok", "agent": "openclaw-atlas", "model": { ... } }
 */
import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Run a command inside a Docker container */
function dockerExec(container: string, cmd: string, timeout = 15000): string {
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

export async function PUT(request: NextRequest) {
  try {
    const body: { containerName?: string; model?: string; fallbacks?: string[] } = await request.json();
    const { containerName } = body;

    if (!containerName) {
      return NextResponse.json({ status: 'error', error: 'containerName is required' }, { status: 400 });
    }

    // Sanitize
    const safeContainer = containerName.replace(/[^a-zA-Z0-9_.-]/g, '');
    if (safeContainer !== containerName) {
      return NextResponse.json({ status: 'error', error: 'Invalid container name' }, { status: 400 });
    }

    if (!body.model) {
      return NextResponse.json({ status: 'error', error: 'model is required' }, { status: 400 });
    }

    // Read current config
    const raw = dockerExec(safeContainer, 'cat /root/.openclaw/openclaw.json', 10000);
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(raw);
    } catch {
      return NextResponse.json({ status: 'error', error: 'Failed to parse config from container' }, { status: 500 });
    }

    // Update model config
    const agents = config.agents as Record<string, unknown> || {};
    const list = (agents.list as Record<string, unknown>[]) || [];

    // Find agent by id "main" (standard agent)
    const mainAgent = list.find((a) => a.id === 'main');
    if (mainAgent) {
      mainAgent.model = {
        primary: body.model,
        fallbacks: body.fallbacks || [],
      };
    }

    // Also update defaults
    const defaults = agents.defaults as Record<string, unknown> || {};
    defaults.model = {
      primary: body.model,
      fallbacks: body.fallbacks || [],
    };

    // Write back
    const newConfig = JSON.stringify(config, null, 2);
    dockerExec(safeContainer, `cat > /root/.openclaw/openclaw.json << 'CONFIGEOF'
${newConfig}
CONFIGEOF`, 10000);

    // Verify
    const verifyRaw = dockerExec(safeContainer, 'cat /root/.openclaw/openclaw.json | grep -A2 "primary" | head -3', 5000);

    return NextResponse.json({
      status: 'ok',
      agent: safeContainer,
      model: {
        primary: body.model,
        fallbacks: body.fallbacks || [],
      },
      verify: verifyRaw,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}

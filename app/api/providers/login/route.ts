import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as path from 'path';

/**
 * POST /api/providers/login
 *
 * Body:
 *   provider: string        — provider name (required)
 *   agent?: string          — container name for agent-targeted ops
 *   method?: 'oauth' | 'api-key' | 'refresh'
 *   apiKey?: string         — for api-key method
 *   disconnect?: boolean    — disconnect instead of login
 *   force?: boolean         — force disconnect even if logout fails
 */
export async function POST(req: Request) {
  try {
    const { provider, agent, method, apiKey, disconnect, force } = await req.json();
    if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 });

    const safeAgent = agent ? agent.replace(/[^a-zA-Z0-9_-]/g, '') : null;
    const isLocal = !safeAgent;
    const execPrefix = safeAgent ? `docker exec ${safeAgent}` : '';
    const cli = safeAgent ? `${execPrefix} openclaw` : 'openclaw';

    // ── DISCONNECT ──────────────────────────────────────────────────────
    if (disconnect) {
      if (isLocal) {
        // VPS host — operate on ~/.openclaw directly
        const home = process.env.HOME || '/root';
        const agentDir = `${home}/.openclaw/agents/main/agent`;

        // Remove from auth-profiles.json
        try {
          const raw = require('fs').readFileSync(`${agentDir}/auth-profiles.json`, 'utf-8');
          const profiles = JSON.parse(raw);
          if (profiles.profiles) {
            for (const [pid, p] of Object.entries(profiles.profiles)) {
              const pm = (p as Record<string, unknown>).provider;
              if (typeof pm === 'string' && (pm === provider || pm.includes(provider) || provider.includes(pm))) {
                delete (profiles.profiles as Record<string, unknown>)[pid];
              }
            }
            require('fs').writeFileSync(`${agentDir}/auth-profiles.json`, JSON.stringify(profiles, null, 2));
          }
        } catch {}

        // Remove from models.json auth.providers
        try {
          const raw = require('fs').readFileSync(`${agentDir}/models.json`, 'utf-8');
          const models = JSON.parse(raw);
          if (!models.auth) models.auth = {};
          if (!Array.isArray(models.auth.providers)) models.auth.providers = [];
          models.auth.providers = models.auth.providers.filter((p: any) => {
            if (typeof p === 'string') return p !== provider;
            return p.provider !== provider;
          });
          require('fs').writeFileSync(`${agentDir}/models.json`, JSON.stringify(models, null, 2));
        } catch {}

        // Remove from SQLite
        try {
          const scriptPath = '/home/nexus/.openclaw/workspace/olympus-vps/scripts/remove-auth-profile.js';
          execSync(`node ${scriptPath} '${agentDir}/openclaw-agent.sqlite' '${provider}'`, { timeout: 10000 });
        } catch {}

        // Restart gateway to flush cache
        try {
          execSync('kill \$(ps aux | grep "[n]ode.*openclaw" | awk "{print \$2}") 2>/dev/null || true', { timeout: 5000 });
        } catch {}
      } else {
        // Agent container — use docker exec
        const container = safeAgent!;

        // Try login --force
        try {
          execSync(`${execPrefix} openclaw models auth login --provider ${provider} --force`, { timeout: 15000 });
          return NextResponse.json({ status: 'disconnected', method: 'relogin' });
        } catch {}

        // Find agent data directory
        const findDataDir =
          `docker exec ${container} sh -c 'for d in /data/.openclaw/agents/main/agent ~/.openclaw/agents/main/agent; do if [ -f "$d/models.json" ] || [ -f "$d/openclaw-agent.sqlite" ]; then echo "$d"; exit 0; fi; done; echo "";'`;
        let dataDir = '';
        try { dataDir = execSync(findDataDir, { timeout: 5000, encoding: 'utf-8' }).trim(); } catch {}
        if (!dataDir) dataDir = '/data/.openclaw/agents/main/agent';

        // Remove from auth-profiles.json
        try {
          const raw = execSync(
            `docker exec ${container} sh -c "cat ${dataDir}/auth-profiles.json 2>/dev/null || echo '{}'"`,
            { timeout: 5000, encoding: 'utf-8', maxBuffer: 128 * 1024 },
          );
          const profiles = JSON.parse(raw);
          if (profiles.profiles) {
            for (const [pid, p] of Object.entries(profiles.profiles)) {
              const pm = (p as Record<string, unknown>).provider;
              if (typeof pm === 'string' && (pm === provider || pm.includes(provider) || provider.includes(pm))) {
                delete (profiles.profiles as Record<string, unknown>)[pid];
              }
            }
            const b64 = Buffer.from(JSON.stringify(profiles, null, 2)).toString('base64');
            execSync(
              `docker exec ${container} sh -c "echo '${b64}' | base64 -d > ${dataDir}/auth-profiles.json"`,
              { timeout: 5000 },
            );
          }
        } catch {}

        // Remove from models.json auth.providers
        try {
          const raw = execSync(
            `docker exec ${container} sh -c "cat ${dataDir}/models.json 2>/dev/null || echo '{}'"`,
            { timeout: 5000, encoding: 'utf-8', maxBuffer: 128 * 1024 },
          );
          const models = JSON.parse(raw);
          if (!models.auth) models.auth = {};
          if (!Array.isArray(models.auth.providers)) models.auth.providers = [];
          models.auth.providers = models.auth.providers.filter((p: any) => {
            if (typeof p === 'string') return p !== provider;
            return p.provider !== provider;
          });
          const b64 = Buffer.from(JSON.stringify(models, null, 2)).toString('base64');
          execSync(
            `docker exec ${container} sh -c "echo '${b64}' | base64 -d > ${dataDir}/models.json"`,
            { timeout: 5000 },
          );
        } catch {}

        // Remove from SQLite
        try {
          const scriptPath = '/home/nexus/.openclaw/workspace/olympus-vps/scripts/remove-auth-profile.js';
          const b64Script = execSync(`base64 -w0 ${scriptPath}`, { encoding: 'utf-8' }).trim();
          const sqlitePath = `${dataDir}/openclaw-agent.sqlite`;
          execSync(
            `docker exec ${container} sh -c "which sqlite3 2>/dev/null || exit 0; echo '${b64Script}' | base64 -d > /tmp/remove-profile.js; node /tmp/remove-profile.js '${sqlitePath}' '${provider}'; rm -f /tmp/remove-profile.js"`,
            { timeout: 15000 },
          );
        } catch {}

        // Restart gateway — kill the openclaw process (not PID 1)
        try {
          execSync(
            `docker exec ${container} sh -c 'kill -TERM \$(ps aux | grep "[n]ode.*openclaw" | awk "{print \\$2}") 2>/dev/null || kill -TERM \$(ps aux | grep "[n]ode.*server\\.mjs" | awk "{print \\$2}") 2>/dev/null; sleep 2'`,
            { timeout: 15000 },
          );
        } catch {}
      }

      return NextResponse.json({ status: 'disconnected', method: 'force-remove' });
    }

    // ── OAUTH LOGIN / REFRESH ───────────────────────────────────────────
    if (method === 'oauth' || method === 'refresh') {
      // Try device-code flow first
      const forceArg = (force || method === 'refresh') ? '--force' : '';
      const cmd = `${cli} models auth login --provider ${provider} --device-code ${forceArg}`.trim();
      let out = '';
      try {
        out = execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).toString();
      } catch (e: any) {
        out = e.stdout?.toString() || e.message || '';
      }

      if (out.toLowerCase().includes('already authenticated') || out.toLowerCase().includes('already connected')) {
        return NextResponse.json({ status: method === 'refresh' ? 'refreshed' : 'already_connected' });
      }

      // Extract device code flow info from output
      const uriMatch = out.match(/verification_uri[\s:]+(\S+)/i) || out.match(/uri[\s:]+(\S+)/i) || out.match(/https:\/\/\S+/);
      const codeMatch = out.match(/user_code[\s:]+(\S+)/i) || out.match(/code[\s:]+(\S{4,})/i);

      if (uriMatch || codeMatch) {
        return NextResponse.json({
          status: 'pending',
          verificationUri: uriMatch ? uriMatch[1] : null,
          userCode: codeMatch ? codeMatch[1] : null,
          rawOutput: out.slice(0, 500),
        });
      }

      // If device code not available, return instructions
      if (out.includes('interactive TTY') || out.includes('automation')) {
        return NextResponse.json({
          status: 'tty_required',
          message: 'This provider OAuth requires a terminal. Run this command manually:',
          command: `docker exec -it ${safeAgent || 'openclaw-core'} openclaw models auth login --provider ${provider}`,
          rawOutput: out.slice(0, 500),
        });
      }

      return NextResponse.json({ status: 'pending', rawOutput: out.slice(0, 500) });
    }

    // ── CLAUDE CLI SETUP TOKEN ───────────────────────────────────────
    if (provider === 'claude-cli' && method === 'api-key' && apiKey) {
      // Route directly to the claude-cli setup-token/save endpoint
      const origin = req.headers.get('origin') || 'http://localhost:3000';
      const saveUrl = `${origin}/api/providers/claude-cli/setup-token/save`;
      try {
        const saveRes = await fetch(saveUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: apiKey,
            agent: safeAgent,
            profileId: 'claude-cli:setup',
            setEnv: true,
          }),
        });
        const saveData = await saveRes.json();
        return NextResponse.json({ status: 'ok', provider: 'claude-cli', ...saveData });
      } catch (e: any) {
        return NextResponse.json({ error: `Failed to save claude-cli token: ${e.message}` }, { status: 500 });
      }
    }

    // ── API KEY / SETUP TOKEN ───────────────────────────────────────────
    if (method === 'api-key' && apiKey) {
      // Detect Anthropic setup-token (sk-ant-oat01-) vs regular API key (sk-ant-)
      const isSetupToken = provider === 'anthropic' && apiKey.trim().startsWith('sk-ant-oat01-');

      if (isSetupToken) {
        // Use paste-token for setup tokens
        if (isLocal) {
          execSync(`echo '${apiKey}' | openclaw models auth paste-token --provider anthropic --profile-id anthropic:setup-token`, { timeout: 15000 });
          try { execSync('kill $(ps aux | grep "[n]ode.*openclaw" | awk "{print \$2}") 2>/dev/null || true', { timeout: 5000 }); } catch {}
        } else {
          const dockerContainer = safeAgent!;
          execSync(`docker exec ${dockerContainer} sh -c 'echo "${apiKey}" | openclaw models auth paste-token --provider anthropic --profile-id anthropic:setup-token'`, { timeout: 15000 });
        }
        return NextResponse.json({ status: 'ok', provider, method: 'setup-token' });
      }

      // Regular API key
      if (isLocal) {
        try {
          execSync(`echo '${apiKey}' | openclaw models auth paste-api-key --provider ${provider}`, { timeout: 15000 });
        } catch {
          const home = process.env.HOME || '/root';
          const modelsPath = `${home}/.openclaw/agents/main/agent/models.json`;
          const fs = require('fs');
          let raw = '{}';
          try { raw = fs.readFileSync(modelsPath, 'utf-8'); } catch {}
          const models = JSON.parse(raw);
          if (!models.providers) models.providers = {};
          models.providers[provider] = { ...(models.providers[provider] || {}), apiKey };
          fs.writeFileSync(modelsPath, JSON.stringify(models, null, 2));
        }
        return NextResponse.json({ status: 'ok', provider });
      }

      // Agent container
      const container = safeAgent!;

      // Find agent data directory (same strategy as disconnect branch)
      const findDataDir =
        `docker exec ${container} sh -c 'for d in /data/.openclaw/agents/main/agent /root/.openclaw/agents/main/agent; do if [ -f "$d/models.json" ] || [ -f "$d/openclaw-agent.sqlite" ]; then echo "$d"; exit 0; fi; done; echo "";'`;
      let dataDir = '';
      try { dataDir = execSync(findDataDir, { timeout: 5000, encoding: 'utf-8' }).trim(); } catch {}
      if (!dataDir) dataDir = '/data/.openclaw/agents/main/agent';

      // Try openclaw CLI for paste-api-key
      try {
        const pasteCmd = `${execPrefix} sh -c 'echo ${JSON.stringify(apiKey)} | openclaw models auth paste-api-key --provider ${provider}'`;
        execSync(pasteCmd, { timeout: 15000 });
      } catch {
        // Fallback: write directly into detected data directory
        let raw = '{}';
        try {
          raw = execSync(
            `docker exec ${container} sh -c "cat ${dataDir}/models.json 2>/dev/null || echo '{}'"`,
            { timeout: 5000, encoding: 'utf-8', maxBuffer: 128 * 1024 },
          );
        } catch {}

        const models = JSON.parse(raw);
        if (!models.providers) models.providers = {};
        models.providers[provider] = { ...(models.providers[provider] || {}), apiKey };
        const b64 = Buffer.from(JSON.stringify(models, null, 2)).toString('base64');
        execSync(
          `docker exec ${container} sh -c "echo '${b64}' | base64 -d > ${dataDir}/models.json"`,
          { timeout: 5000 },
        );
      }

      return NextResponse.json({ status: 'ok', provider });
    }

    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

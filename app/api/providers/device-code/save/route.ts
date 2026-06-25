import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

/**
 * POST /api/providers/device-code/save
 *
 * Save OAuth tokens for a provider to the target container or local host.
 *
 * Body:
 *   provider: string        - provider id (e.g. openai-codex)
 *   accessToken: string     - OAuth access token
 *   refreshToken?: string   - OAuth refresh token
 *   expiresMs?: number      - expiration timestamp
 *   agent?: string          - container name (optional, save to host directly if omitted)
 */
export async function POST(req: Request) {
  try {
    const { provider, accessToken, refreshToken, expiresMs, agent } = await req.json();
    if (!provider || !accessToken) {
      return NextResponse.json({ error: 'provider and accessToken required' }, { status: 400 });
    }

    const isLocal = !agent;
    const safeAgent = agent ? agent.replace(/[^a-zA-Z0-9_-]/g, '') : null;
    const profileId = `${provider}:device`;

    const expiresIn = expiresMs ? Math.max(1, Math.floor((expiresMs - Date.now()) / 1000)) : undefined;
    const expiresArg = expiresIn ? `--expires-in ${expiresIn}s` : '';

    if (isLocal) {
      // Save to host (~/.openclaw)
      const home = process.env.HOME || '/root';
      const agentDir = `${home}/.openclaw/agents/main/agent`;

      // Try paste-token via host openclaw
      try {
        execSync(`echo '${accessToken}' | openclaw models auth paste-token --provider ${provider} --profile-id ${profileId} ${expiresArg}`,
          { timeout: 15000, encoding: 'utf-8' });
        return NextResponse.json({ status: 'ok', profileId, method: 'paste-token' });
      } catch (pasteErr: any) {
        // Fallback: write directly to files
      }

      // Write to auth-profiles.json
      try {
        const fs = require('fs');
        const profilePath = `${agentDir}/auth-profiles.json`;
        let raw = '{}';
        try { raw = fs.readFileSync(profilePath, 'utf-8'); } catch {}
        const profiles = JSON.parse(raw);
        if (!profiles.profiles) profiles.profiles = {};
        profiles.profiles[profileId] = {
          provider,
          kind: 'oauth',
          token: accessToken,
          ...(refreshToken ? { refreshToken } : {}),
          ...(expiresMs ? { expiresAt: expiresMs } : {}),
          profileId,
        };
        fs.writeFileSync(profilePath, JSON.stringify(profiles, null, 2));
      } catch {}

      // Update models.json
      try {
        const fs = require('fs');
        const modelsPath = `${agentDir}/models.json`;
        let raw = '{}';
        try { raw = fs.readFileSync(modelsPath, 'utf-8'); } catch {}
        const models = JSON.parse(raw);
        if (!models.auth) models.auth = {};
        if (!Array.isArray(models.auth.providers)) models.auth.providers = [];
        const existingIdx = models.auth.providers.findIndex((p: any) => p.provider === provider);
        const entry: any = { provider, kind: 'oauth', profileId, ...(expiresMs ? { expiresAt: expiresMs } : {}) };
        if (existingIdx >= 0) { models.auth.providers[existingIdx] = { ...models.auth.providers[existingIdx], ...entry }; }
        else { models.auth.providers.push(entry); }
        fs.writeFileSync(modelsPath, JSON.stringify(models, null, 2));
      } catch {}

      // Restart gateway to pick up new profile
      try {
        execSync('kill $(ps aux | grep "[n]ode.*openclaw" | awk "{print $2}") 2>/dev/null || true', { timeout: 5000 });
      } catch {}

      return NextResponse.json({ status: 'ok', profileId, method: 'files' });
    }

    // ── Agent container ─────────────────────────────────────────────────
    const dockerContainer = safeAgent!;

    // Try paste-token inside container
    try {
      const cmd = `docker exec ${dockerContainer} sh -c 'echo "${accessToken}" | openclaw models auth paste-token --provider ${provider} --profile-id ${profileId} ${expiresArg}'`;
      execSync(cmd, { timeout: 15000, encoding: 'utf-8' });
      return NextResponse.json({ status: 'ok', profileId, method: 'paste-token' });
    } catch {}

    // Fallback: write files directly
    const profilePath = `/data/.openclaw/agents/main/agent/auth-profiles.json`;
    try {
      const raw = execSync(
        `docker exec ${dockerContainer} sh -c "cat ${profilePath} 2>/dev/null || echo '{}'"`,
        { timeout: 5000, encoding: 'utf-8', maxBuffer: 128 * 1024 }
      );
      const profiles = JSON.parse(raw);
      if (!profiles.profiles) profiles.profiles = {};
      profiles.profiles[profileId] = {
        provider,
        kind: 'oauth',
        token: accessToken,
        ...(refreshToken ? { refreshToken } : {}),
        ...(expiresMs ? { expiresAt: expiresMs } : {}),
        profileId,
      };
      const b64 = Buffer.from(JSON.stringify(profiles, null, 2)).toString('base64');
      execSync(`docker exec ${dockerContainer} sh -c "echo '${b64}' | base64 -d > ${profilePath}"`, { timeout: 5000 });
    } catch {}

    // Update models.json
    try {
      const modelsPath = `/data/.openclaw/agents/main/agent/models.json`;
      const raw = execSync(
        `docker exec ${dockerContainer} sh -c "cat ${modelsPath} 2>/dev/null || echo '{}'"`,
        { timeout: 5000, encoding: 'utf-8', maxBuffer: 128 * 1024 }
      );
      const models = JSON.parse(raw);
      if (!models.auth) models.auth = {};
      if (!Array.isArray(models.auth.providers)) models.auth.providers = [];
      const existingIdx = models.auth.providers.findIndex((p: any) => p.provider === provider);
      const entry: any = { provider, kind: 'oauth', profileId, ...(expiresMs ? { expiresAt: expiresMs } : {}) };
      if (existingIdx >= 0) { models.auth.providers[existingIdx] = { ...models.auth.providers[existingIdx], ...entry }; }
      else { models.auth.providers.push(entry); }
      const b64 = Buffer.from(JSON.stringify(models, null, 2)).toString('base64');
      execSync(`docker exec ${dockerContainer} sh -c "echo '${b64}' | base64 -d > ${modelsPath}"`, { timeout: 5000 });
    } catch {}

    // Restart gateway
    try {
      execSync(
        `docker exec ${dockerContainer} sh -c 'kill -TERM $(ps aux | grep "[n]ode.*openclaw" | awk "{print \\$2}") 2>/dev/null || kill -TERM $(ps aux | grep "[n]ode.*server\\.mjs" | awk "{print \\$2}") 2>/dev/null; sleep 2'`,
        { timeout: 15000 },
      );
    } catch {}

    return NextResponse.json({ status: 'ok', profileId, method: 'files' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

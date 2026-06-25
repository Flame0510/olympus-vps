import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * POST /api/providers/claude-cli/setup-token/start
 *
 * Checks `claude` CLI availability and guides the user through setup-token.
 *
 * claude setup-token is interactive browser-based — it cannot be automated
 * server-side. This endpoint:
 *   1. Verifies claude CLI exists on the target
 *   2. Checks for existing CLAUDE_CODE_OAUTH_TOKEN in env/vault/auth-profiles
 *   3. If no token, tells the user to run `claude setup-token` manually
 *      OR paste a token they already have.
 *
 * Body:
 *   agent?: string  — container name (optional, uses local VPS if omitted)
 *
 * Response:
 *   { status, message, command? }
 */
export async function POST(req: Request) {
  try {
    const { agent } = (await req.json()) || {};

    const safeAgent = agent ? agent.replace(/[^a-zA-Z0-9_-]/g, '') : null;
    const isLocal = !safeAgent;

    const getHome = () => {
      if (isLocal) return process.env.HOME || '/root';
      try {
        return execSync(`docker exec ${safeAgent} sh -c 'echo \"\$HOME\"'`, { timeout: 5000, encoding: 'utf-8' }).toString().trim();
      } catch { return '/root'; }
    };
    const home = getHome();

    // ── 1. Verify `claude` CLI exists ─────────────────────────────────────
    let claudeCliFound = false;
    if (isLocal) {
      try { execSync('which claude 2>/dev/null || command -v claude 2>/dev/null', { timeout: 5000 }); claudeCliFound = true; } catch {}
    } else {
      try { execSync(`docker exec ${safeAgent} sh -c 'which claude 2>/dev/null || command -v claude 2>/dev/null'`, { timeout: 5000 }); claudeCliFound = true; } catch {}
    }

    // ── 2. Check for existing token ───────────────────────────────────────
    // Check env var
    let existingToken: string | null = null;
    try {
      const checkEnv = isLocal
        ? 'echo "${CLAUDE_CODE_OAUTH_TOKEN:-}"'
        : `docker exec ${safeAgent} sh -c 'echo "\${CLAUDE_CODE_OAUTH_TOKEN:-}"'`;
      existingToken = execSync(checkEnv, { timeout: 5000, encoding: 'utf-8' }).toString().trim();
    } catch {}

    if (existingToken && existingToken.length > 20) {
      return NextResponse.json({
        status: 'already_provisioned',
        source: 'env',
        message: 'CLAUDE_CODE_OAUTH_TOKEN is already set in the environment.',
      });
    }

    // Check ~/.claude/tokens/
    const tokenDir = path.join(home, '.claude', 'tokens');
    let claudeTokenFile: string | null = null;
    if (isLocal) {
      if (fs.existsSync(tokenDir)) {
        const files = fs.readdirSync(tokenDir).filter(f => f.startsWith('sk-ant-oat01-'));
        if (files.length > 0) {
          claudeTokenFile = path.join(tokenDir, files[0]);
        }
      }
    } else {
      try {
        const files = execSync(
          `docker exec ${safeAgent} sh -c 'ls ${tokenDir}/sk-ant-oat01-* 2>/dev/null | head -1'`,
          { timeout: 5000, encoding: 'utf-8' }
        ).toString().trim();
        if (files) claudeTokenFile = files;
      } catch {}
    }

    if (claudeTokenFile) {
      let fileToken = '';
      if (isLocal) {
        fileToken = fs.readFileSync(claudeTokenFile, 'utf-8').trim();
      } else {
        fileToken = execSync(
          `docker exec ${safeAgent} sh -c 'cat ${claudeTokenFile} 2>/dev/null || true'`,
          { timeout: 5000, encoding: 'utf-8' }
        ).toString().trim();
      }
      return NextResponse.json({
        status: 'already_provisioned',
        source: 'claude-tokens-dir',
        tokenDir,
        tokenFile: claudeTokenFile,
        tokenPrefix: fileToken.slice(0, 20) + '...',
        message: `Claude CLI token found in ${claudeTokenFile}. You can save it directly.`,
      });
    }

    // Check vault.json
    if (isLocal) {
      const vaultPath = path.join(process.cwd(), 'vault.json');
      if (fs.existsSync(vaultPath)) {
        try {
          const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf-8'));
          const claudeEntry = vault.services?.find((s: any) => s.service === 'claude-cli');
          if (claudeEntry?.token && claudeEntry.token.length > 20) {
            return NextResponse.json({
              status: 'already_provisioned',
              source: 'vault',
              message: 'Claude CLI token already saved in Olympus vault.',
            });
          }
        } catch {}
      }
    }

    // Check auth-profiles.json
    const agentDir = path.join(home, '.openclaw', 'agents', 'main', 'agent');
    let authProfilesToken = false;
    if (isLocal) {
      try {
        const raw = fs.readFileSync(path.join(agentDir, 'auth-profiles.json'), 'utf-8');
        const profiles = JSON.parse(raw);
        if (profiles.profiles) {
          for (const [, p] of Object.entries(profiles.profiles)) {
            const pm = p as Record<string, unknown>;
            if (pm.provider === 'claude-cli' && pm.token) {
              authProfilesToken = true;
              break;
            }
          }
        }
      } catch {}
    } else {
      try {
        const raw = execSync(
          `docker exec ${safeAgent} sh -c "cat ${agentDir}/auth-profiles.json 2>/dev/null || echo '{}'"`,
          { timeout: 5000, encoding: 'utf-8', maxBuffer: 128 * 1024 }
        );
        const profiles = JSON.parse(raw);
        if (profiles.profiles) {
          for (const [, p] of Object.entries(profiles.profiles)) {
            const pm = p as Record<string, unknown>;
            if (pm.provider === 'claude-cli' && pm.token) authProfilesToken = true;
          }
        }
      } catch {}
    }

    if (authProfilesToken) {
      return NextResponse.json({
        status: 'already_provisioned',
        source: 'auth-profiles',
        message: 'Claude CLI token already saved in OpenClaw auth profiles.',
      });
    }

    // ── 3. Return setup instructions ──────────────────────────────────────
    const containerCmd = safeAgent
      ? `docker exec -it ${safeAgent} claude setup-token`
      : 'claude setup-token';

    return NextResponse.json({
      status: 'manual_required',
      claudeFound: claudeCliFound,
      message: claudeCliFound
        ? 'Claude CLI found. To generate a setup token, run this command on the target, authorize in your browser, then come back to paste the token.'
        : 'Claude CLI not found. Install it first: npm install -g @anthropic-ai/claude-code',
      command: containerCmd,
      tokenDir,
      manualSteps: [
        '1. Run the command in your terminal',
        '2. A browser window will open — authorize Claude CLI',
        '3. After authorization, a long token (sk-ant-oat01-...) is displayed or saved',
        '4. Paste that token into the field in Olympus',
        '5. Click SAVE TOKEN to finalize',
      ],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

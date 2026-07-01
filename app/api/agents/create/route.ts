import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { syncAgent } from '../../gateway/sync';

export const dynamic = 'force-dynamic';

const TEMPLATES_DIR = path.join(process.cwd(), 'agent-templates');
const MODELS_CONFIG = path.join(process.cwd(), 'models.config.json');
const AGENTS_TOKEN_PATH = path.join(process.cwd(), 'data', 'agents-token.json');
const DEFAULT_NETWORK = 'openclaw-core_default';

function isDockerCompatibleName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

function validateName(name: string): string | null {
  if (!name || name.length < 1) return 'Name is required';
  if (name.length > 64) return 'Name must be 64 characters or fewer';
  if (!isDockerCompatibleName(name)) {
    return 'Name must start with a letter or number and contain only letters, numbers, dots, hyphens, and underscores';
  }
  return null;
}

interface CreateBody {
  name: string;
  template: string;
  port?: number;
  model?: string;
  fallbacks?: string[];
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function readAgentsToken(): string {
  try {
    const tokenRaw = fs.readFileSync(AGENTS_TOKEN_PATH, 'utf-8');
    const tokenData = JSON.parse(tokenRaw);
    return typeof tokenData.token === 'string' ? tokenData.token.trim() : '';
  } catch {
    return '';
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: CreateBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const { name, template, port, model, fallbacks } = body;

    // Validate name
    const nameError = validateName(name);
    if (nameError) {
      return NextResponse.json(
        { success: false, error: nameError },
        { status: 400 },
      );
    }

    // Validate template exists
    const templateDir = path.join(TEMPLATES_DIR, template);
    if (!template || !fs.existsSync(templateDir) || !fs.statSync(templateDir).isDirectory()) {
      return NextResponse.json(
        {
          success: false,
          error: `Template '${template}' not found. Available: ${getAvailableTemplates().join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Validate model (if provided) exists in models.config.json
    if (model && !isValidModel(model)) {
      return NextResponse.json(
        { success: false, error: `Model '${model}' not found in models.config.json` },
        { status: 400 },
      );
    }

    // Check if name is already in use by a running container
    const existing = execSync(
      `docker ps --filter "label=AGENT_ID=${name}" --format '{{.Names}}'`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Agent '${name}' is already running (container: ${existing})` },
        { status: 409 },
      );
    }

    // Check if port is already in use
    if (port) {
      if (port < 1 || port > 65535) {
        return NextResponse.json(
          { success: false, error: 'Port must be between 1 and 65535' },
          { status: 400 },
        );
      }
      const portInUse = execSync(
        `docker ps --format '{{.Ports}}' | grep -oP '\d+(?=->)' | grep -Fx '${port}' || true`,
        { encoding: 'utf-8', timeout: 5000 },
      ).trim();
      if (portInUse) {
        return NextResponse.json(
          { success: false, error: `Port ${port} is already in use` },
          { status: 409 },
        );
      }
    }

    // Build docker run command
    const image = 'nexus-agent-base:latest';
    const network = getNetwork();

    // Read agents token for new containers
    const agentsToken = readAgentsToken();
    if (!agentsToken) {
      return NextResponse.json(
        { success: false, error: 'Agents gateway token is missing. Set it from /agents before creating agents.' },
        { status: 400 },
      );
    }

    const labels = [
      `AGENT_ID=${name}`,
      `traefik.enable=true`,
      `traefik.http.routers.agent-${name}.entrypoints=websecure`,
      `traefik.http.routers.agent-${name}.rule=Host(\`${name}.srv1490011.hstgr.cloud\`)`,
      `traefik.http.routers.agent-${name}.tls.certresolver=letsencrypt`,
      `traefik.http.routers.agent-${name}.service=agent-${name}`,
      `traefik.http.services.agent-${name}.loadbalancer.server.port=3000`,
    ];

    const envVars = [
      `AGENT_ID=${name}`,
      `AGENT_NAME=${name}`,
      `OPENCLAW_GATEWAY_TOKEN=${agentsToken}`,
      `AGENT_HOSTNAME=${name}.srv1490011.hstgr.cloud`,
      `TZ=Europe/Rome`,
    ];

    // Pass the selected model to the entrypoint so it writes it at first boot
    if (model) {
      envVars.push(`OPENCLAW_MODEL_PRIMARY=${model}`);
    }

    const labelOpts = labels.map((l) => `-l ${shellQuote(l)}`).join(' ');
    const envOpts = envVars.map((e) => `-e ${shellQuote(e)}`).join(' ');
    const portOpt = port ? `-p ${port}:${port}` : '';

    // Attach template files as volume mounts if they exist
    let volumeOpts = '';
    const templateFiles = ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'MEMORY.md', 'TOOLS.md', 'HEARTBEAT.md'];
    for (const tf of templateFiles) {
      const src = path.join(templateDir, tf);
      if (fs.existsSync(src) && fs.statSync(src).isFile()) {
        volumeOpts += ` -v ${shellQuote(`${src}:/root/.openclaw/workspace/${tf}`)}`;
      }
    }

    const cmd = `docker run -d \
      --name "${name}" \
      --network "${network}" \
      --restart unless-stopped \
      --add-host host.docker.internal:host-gateway \
      ${labelOpts} \
      ${envOpts} \
      ${volumeOpts} \
      ${portOpt} \
      "${image}"`;

    const result = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
    const containerId = result.trim();

    // Log event to events.db if it exists
    try {
      const Database = require('better-sqlite3');
      const dbPath = path.join(process.cwd(), 'data', 'events.db');
      if (fs.existsSync(dbPath)) {
        const db = new Database(dbPath, { readonly: false });
        db.pragma('journal_mode = WAL');
        db.prepare(
          `INSERT INTO events (ts, session_id, type, data) VALUES (?, ?, ?, ?)`,
        ).run(Date.now(), `system:agents`, 'agent_created', JSON.stringify({
          name,
          template,
          port,
          model: model || 'olympus/deepseek-v4-flash',
          fallbacks,
          containerId,
          containerName: name,
        }));
        db.close();
      }
    } catch {
      // DB logging is optional, ignore failures
    }

    // Sync provider models to the new container (no restart — file is live)
    try {
      syncAgent(name);
    } catch {
      // sync failure is non-fatal; models can be synced manually from Gateway page
    }

    return NextResponse.json({
      success: true,
      containerId,
      name,
      image,
      network,
      traefikUrl: `https://${name}.srv1490011.hstgr.cloud#token=${encodeURIComponent(agentsToken)}`,
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json(
      { success: false, error: err.message || 'Unknown error' },
      { status: 500 },
    );
  }
}

function getAvailableTemplates(): string[] {
  try {
    return fs.readdirSync(TEMPLATES_DIR).filter((f) => {
      const p = path.join(TEMPLATES_DIR, f);
      return f !== 'base-image' && f !== 'README.md' && fs.statSync(p).isDirectory();
    });
  } catch {
    return [];
  }
}

function isValidModel(modelId: string): boolean {
  try {
    if (!fs.existsSync(MODELS_CONFIG)) return true; // skip validation if no config
    const raw = fs.readFileSync(MODELS_CONFIG, 'utf-8');
    const config = JSON.parse(raw);
    return config.models?.some((m: { id: string }) => m.id === modelId) ?? false;
  } catch {
    return true; // skip on errors
  }
}

function getNetwork(): string {
  try {
    const networks = execSync(
      `docker network ls --format '{{.Name}}' | grep -E '^openclaw.*'`,
      { encoding: 'utf-8', timeout: 3000 },
    ).trim().split('\n').filter(Boolean);
    return networks[0] || DEFAULT_NETWORK;
  } catch {
    return DEFAULT_NETWORK;
  }
}

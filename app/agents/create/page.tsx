import { requireAuth } from '@/lib/requireAuth';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import CreatePageClient from './PageClient';

export const dynamic = 'force-dynamic';

interface TemplateInfo {
  id: string;
  files: string[];
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

async function getTemplates(): Promise<TemplateInfo[]> {
  const templatesDir = path.join(process.cwd(), 'agent-templates');
  try {
    const entries = fs.readdirSync(templatesDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name !== 'base-image')
      .map((e) => ({
        id: e.name,
        files: fs.readdirSync(path.join(templatesDir, e.name)),
      }));
  } catch {
    return [];
  }
}

async function getModels(): Promise<ModelInfo[]> {
  const configPath = path.join(process.cwd(), 'models.config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    const allModels: ModelInfo[] = (config.models || []).filter((m: { enabled: boolean }) => m.enabled !== false);

    // Fetch configured providers from openclaw-core
    let configuredProviders: string[] = [];
    try {
      const modelsRaw = execSync(
        `docker exec openclaw-core cat /data/.openclaw/agents/main/agent/models.json 2>/dev/null || echo "{}"`,
        { encoding: 'utf-8', timeout: 8000 },
      ).trim();
      const modelsJson = JSON.parse(modelsRaw);
      const providers = modelsJson.providers ?? {};
      configuredProviders = Object.entries(providers)
        .filter(([, p]) => {
          const cfg = p as Record<string, unknown>;
          return !!cfg.apiKey && String(cfg.apiKey).length > 0;
        })
        .map(([name]) => name);
    } catch {
      // fallback: show all models
    }

    if (configuredProviders.length > 0) {
      return allModels.filter((m) => configuredProviders.includes(m.provider));
    }

    return allModels;
  } catch {
    return [];
  }
}

async function getUsedNames(): Promise<string[]> {
  try {
    const raw = execSync(
      `docker ps --filter "label=AGENT_ID" --format '{{.Label "AGENT_ID"}}'`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    return raw ? raw.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function getUsedPorts(): Promise<number[]> {
  try {
    const raw = execSync(
      `docker ps --format '{{.Ports}}'`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    const ports: number[] = [];
    if (raw) {
      for (const line of raw.split('\n')) {
        const matches = line.match(/(\d+)->/g);
        if (matches) {
          matches.forEach((m) => {
            const p = parseInt(m.replace('->', ''), 10);
            if (!isNaN(p)) ports.push(p);
          });
        }
      }
    }
    return [...new Set(ports)];
  } catch {
    return [];
  }
}

export default async function CreateAgentPage() {
  await requireAuth();

  const [templates, models, usedNames, usedPorts] = await Promise.all([
    getTemplates(),
    getModels(),
    getUsedNames(),
    getUsedPorts(),
  ]);

  return (
    <CreatePageClient
      templates={templates}
      models={models}
      usedNames={usedNames}
      usedPorts={usedPorts}
    />
  );
}

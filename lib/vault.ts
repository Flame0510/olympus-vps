/**
 * Olympus Vault — Centralized credential management
 *
 * Provides two layers:
 *   1. Stored vault (vault.json) for manual/saved credentials
 *   2. Runtime resolution via docker exec on openclaw-core for live API keys
 *
 * The runtime layer is the primary source — it reads models.json and
 * auth-profiles.json from the core agent container.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const VAULT_PATH = process.env.OLYMPUS_VAULT_PATH || path.join(process.cwd(), 'vault.json');

export interface ProviderCredential {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  updatedAt: number;
}

export interface ServiceCredential {
  service: string;
  token: string;
  user?: string;
  updatedAt: number;
}

export interface AgentPermissions {
  agentId: string;
  providers: string[];
  services: string[];
}

export interface VaultData {
  providers: ProviderCredential[];
  services: ServiceCredential[];
  permissions: AgentPermissions[];
}

// ── Runtime (live from core agent container) ────────────────────────────────

interface RuntimeProviderEntry {
  provider: string;
  apiKey: string | null;
  kind: 'models.json' | 'token' | 'oauth' | 'api-key';
}

/**
 * Fetch all provider credentials from the core agent container.
 * This is the live source — what's actually configured in OpenClaw.
 */
export function getRuntimeProviders(): RuntimeProviderEntry[] {
  try {
    const statusRaw = execSync(
      'docker exec openclaw-core openclaw models status --json 2>/dev/null',
      { timeout: 10000, encoding: 'utf-8', maxBuffer: 1024 * 1024 },
    );
    const status = JSON.parse(statusRaw);
    const providers: Record<string, unknown>[] = status.auth?.providers ?? [];

    return providers.map((p: any) => {
      let apiKey: string | null = null;
      const kind: RuntimeProviderEntry['kind'] = p.effective?.kind === 'profiles'
        ? (p.profiles?.oauth > 0 ? 'oauth' : p.profiles?.token > 0 ? 'token' : 'api-key')
        : 'models.json';

      // Extract API key from models.json value
      if (p.modelsJson?.value && typeof p.modelsJson.value === 'string') {
        apiKey = p.modelsJson.value;
      }
      // For token profiles, try auth-profiles.json
      if (!apiKey && kind === 'token') {
        try {
          const profilesRaw = execSync(
            'docker exec openclaw-core cat /data/.openclaw/agents/main/agent/auth-profiles.json 2>/dev/null || echo "{}"',
            { timeout: 5000, encoding: 'utf-8', maxBuffer: 128 * 1024 },
          );
          const profiles = JSON.parse(profilesRaw);
          for (const [, profile] of Object.entries(profiles)) {
            const pr = profile as Record<string, unknown>;
            if (String(pr.provider) === p.provider && pr.token) {
              apiKey = String(pr.token);
              break;
            }
          }
        } catch {
          // ignore
        }
      }

      return {
        provider: p.provider,
        apiKey: kind === 'oauth' ? null : apiKey, // OAuth keys are not extractable
        kind,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Get a single provider's API key from the runtime.
 */
export function getRuntimeProviderKey(provider: string): string | null {
  const entries = getRuntimeProviders();
  return entries.find((e) => e.provider === provider)?.apiKey ?? null;
}

// ── Stored vault (vault.json) ───────────────────────────────────────────────

function loadVault(): VaultData {
  try {
    if (!fs.existsSync(VAULT_PATH)) {
      return { providers: [], services: [], permissions: [] };
    }
    const raw = fs.readFileSync(VAULT_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return {
      providers: Array.isArray(data.providers) ? data.providers : [],
      services: Array.isArray(data.services) ? data.services : [],
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
    };
  } catch (err) {
    console.error('[vault] Error loading vault:', err);
    return { providers: [], services: [], permissions: [] };
  }
}

function saveVault(data: VaultData): void {
  const dir = path.dirname(VAULT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(VAULT_PATH)) {
    const bak = VAULT_PATH + '.bak';
    try { fs.copyFileSync(VAULT_PATH, bak); } catch {}
  }
  fs.writeFileSync(VAULT_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// ── Provider (merged: runtime first, vault fallback) ────────────────────────

export function setProviderCredential(provider: string, apiKey: string, baseUrl?: string): ProviderCredential {
  const vault = loadVault();
  const existing = vault.providers.find((p) => p.provider === provider);
  const cred: ProviderCredential = {
    provider,
    apiKey,
    baseUrl: baseUrl || existing?.baseUrl,
    updatedAt: Date.now(),
  };

  if (existing) {
    Object.assign(existing, cred);
  } else {
    vault.providers.push(cred);
  }

  saveVault(vault);
  return cred;
}

export function getProviderCredential(provider: string): ProviderCredential | null {
  // Try runtime first (live from core agent)
  const runtimeKey = getRuntimeProviderKey(provider);
  if (runtimeKey) {
    return { provider, apiKey: runtimeKey, updatedAt: Date.now() };
  }

  // Fallback to stored vault
  const vault = loadVault();
  return vault.providers.find((p) => p.provider === provider) || null;
}

export function getProviderCredentialFull(provider: string): ProviderCredential | null {
  return getProviderCredential(provider);
}

export function getAllProviders(): ProviderCredential[] {
  const runtime = getRuntimeProviders();
  const vault = loadVault();
  const seen = new Set<string>();

  const result: ProviderCredential[] = [];

  // Runtime first
  for (const entry of runtime) {
    if (entry.apiKey) {
      result.push({ provider: entry.provider, apiKey: maskKey(entry.apiKey), updatedAt: Date.now() });
      seen.add(entry.provider);
    }
  }

  // Vault entries not already covered
  for (const p of vault.providers) {
    if (!seen.has(p.provider)) {
      result.push({ ...p, apiKey: maskKey(p.apiKey) });
    }
  }

  return result;
}

export function removeProvider(provider: string): boolean {
  const vault = loadVault();
  const idx = vault.providers.findIndex((p) => p.provider === provider);
  if (idx === -1) return false;
  vault.providers.splice(idx, 1);
  saveVault(vault);
  return true;
}

// ── Services ────────────────────────────────────────────────────────────────

export function setServiceCredential(service: string, token: string, user?: string): ServiceCredential {
  const vault = loadVault();
  const existing = vault.services.find((s) => s.service === service);
  const cred: ServiceCredential = {
    service,
    token,
    user: user || existing?.user,
    updatedAt: Date.now(),
  };

  if (existing) {
    Object.assign(existing, cred);
  } else {
    vault.services.push(cred);
  }

  saveVault(vault);
  return cred;
}

export function getServiceCredential(service: string): ServiceCredential | null {
  const vault = loadVault();
  return vault.services.find((s) => s.service === service) || null;
}

export function getAllServices(): ServiceCredential[] {
  const vault = loadVault();
  return vault.services.map((s) => ({
    ...s,
    token: maskKey(s.token),
  }));
}

export function removeService(service: string): boolean {
  const vault = loadVault();
  const idx = vault.services.findIndex((s) => s.service === service);
  if (idx === -1) return false;
  vault.services.splice(idx, 1);
  saveVault(vault);
  return true;
}

// ── Agent permissions ──────────────────────────────────────────────────────

export function setAgentPermissions(agentId: string, providers: string[], services: string[]): AgentPermissions {
  const vault = loadVault();
  const existing = vault.permissions.find((p) => p.agentId === agentId);
  const perm: AgentPermissions = { agentId, providers, services };

  if (existing) {
    Object.assign(existing, perm);
  } else {
    vault.permissions.push(perm);
  }

  saveVault(vault);
  return perm;
}

export function getAgentPermissions(agentId: string): AgentPermissions | null {
  const vault = loadVault();
  return vault.permissions.find((p) => p.agentId === agentId) || null;
}

export function getAllPermissions(): AgentPermissions[] {
  const vault = loadVault();
  return vault.permissions;
}

export function removeAgentPermissions(agentId: string): boolean {
  const vault = loadVault();
  const idx = vault.permissions.findIndex((p) => p.agentId === agentId);
  if (idx === -1) return false;
  vault.permissions.splice(idx, 1);
  saveVault(vault);
  return true;
}

// ── Permission resolution ──────────────────────────────────────────────────

export function agentCanUseProvider(agentId: string, provider: string): boolean {
  const perm = getAgentPermissions(agentId);
  if (!perm) return true; // default: allow all
  return perm.providers.includes('*') || perm.providers.includes(provider);
}

export function agentCanUseService(agentId: string, service: string): boolean {
  const perm = getAgentPermissions(agentId);
  if (!perm) return true; // default: allow all
  return perm.services.includes('*') || perm.services.includes(service);
}

export function resolveAgentEnv(agentId: string): Record<string, string> {
  const vault = loadVault();
  const perm = vault.permissions.find((p) => p.agentId === agentId);
  if (!perm) return {};

  const env: Record<string, string> = {};

  for (const providerKey of perm.providers) {
    if (providerKey === '*') {
      for (const p of vault.providers) {
        env[providerToEnvVar(p.provider)] = p.apiKey;
        if (p.baseUrl) env[providerToBaseUrlEnvVar(p.provider)] = p.baseUrl;
      }
      break;
    }
    const cred = vault.providers.find((p) => p.provider === providerKey);
    if (cred) {
      env[providerToEnvVar(cred.provider)] = cred.apiKey;
      if (cred.baseUrl) env[providerToBaseUrlEnvVar(cred.provider)] = cred.baseUrl;
    }
  }

  for (const serviceKey of perm.services) {
    if (serviceKey === '*') {
      for (const s of vault.services) {
        env[serviceToEnvVar(s.service)] = s.token;
      }
      break;
    }
    const cred = vault.services.find((s) => s.service === serviceKey);
    if (cred) {
      env[serviceToEnvVar(cred.service)] = cred.token;
    }
  }

  return env;
}

// ── Utils ──────────────────────────────────────────────────────────────────

function maskKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '…' + key.slice(-4);
}

function providerToEnvVar(provider: string): string {
  const map: Record<string, string> = {
    'openai-codex': 'OPENAI_API_KEY',
    'openai': 'OPENAI_API_KEY',
    'anthropic': 'ANTHROPIC_API_KEY',
    'claude-cli': 'CLAUDE_CODE_OAUTH_TOKEN',
    'groq': 'GROQ_API_KEY',
    'github-copilot': 'GITHUB_TOKEN',
    'openrouter': 'OPENROUTER_API_KEY',
    'deepseek': 'DEEPSEEK_API_KEY',
  };
  if (map[provider]) return map[provider];
  return `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
}

function providerToBaseUrlEnvVar(provider: string): string {
  const key = provider.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return `${key}_BASE_URL`;
}

function serviceToEnvVar(service: string): string {
  const map: Record<string, string> = {
    'github': 'GITHUB_TOKEN',
    'vercel': 'VERCEL_TOKEN',
    'netlify': 'NETLIFY_AUTH_TOKEN',
    'claude-cli': 'CLAUDE_CODE_OAUTH_TOKEN',
  };
  if (map[service]) return map[service];
  return `${service.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_TOKEN`;
}

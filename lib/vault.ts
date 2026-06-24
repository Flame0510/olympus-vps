/**
 * Olympus Vault — Gestione centralizzata credenziali provider e servizi.
 * 
 * Il vault è un file JSON che contiene:
 * - providers: API key per ogni provider AI
 * - services: token per servizi esterni (GitHub, Vercel, …)
 * - permissions: quali credenziali sono assegnate a quali agenti
 */

import fs from 'fs';
import path from 'path';

const VAULT_PATH = process.env.OLYMPUS_VAULT_PATH || path.join(process.cwd(), 'vault.json');

export interface ProviderCredential {
  provider: string;      // es: 'openai-codex', 'anthropic', 'groq'
  apiKey: string;
  baseUrl?: string;      // override URL (es. per OpenRouter)
  updatedAt: number;     // timestamp ms
}

export interface ServiceCredential {
  service: string;       // es: 'github', 'vercel'
  token: string;
  user?: string;         // username associato
  updatedAt: number;
}

export interface AgentPermissions {
  agentId: string;
  providers: string[];   // lista provider consentiti, ['*'] = tutti
  services: string[];    // lista servizi consentiti, ['*'] = tutti
}

export interface VaultData {
  providers: ProviderCredential[];
  services: ServiceCredential[];
  permissions: AgentPermissions[];
}

// ── Load / save ────────────────────────────────────────────────────────────

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
  // Backup before saving
  if (fs.existsSync(VAULT_PATH)) {
    const bak = VAULT_PATH + '.bak';
    try { fs.copyFileSync(VAULT_PATH, bak); } catch {}
  }
  fs.writeFileSync(VAULT_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// ── Provider ────────────────────────────────────────────────────────────────

export function setProviderCredential(provider: string, apiKey: string, baseUrl?: string): ProviderCredential {
  const vault = loadVault();
  const existing = vault.providers.find(p => p.provider === provider);
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
  const vault = loadVault();
  return vault.providers.find(p => p.provider === provider) || null;
}

export function getAllProviders(): ProviderCredential[] {
  const vault = loadVault();
  // Non esporre le API key complete all'esterno
  return vault.providers.map(p => ({
    ...p,
    apiKey: maskKey(p.apiKey),
  }));
}

export function getProviderCredentialFull(provider: string): ProviderCredential | null {
  return getProviderCredential(provider);
}

export function removeProvider(provider: string): boolean {
  const vault = loadVault();
  const idx = vault.providers.findIndex(p => p.provider === provider);
  if (idx === -1) return false;
  vault.providers.splice(idx, 1);
  saveVault(vault);
  return true;
}

// ── Servizi ─────────────────────────────────────────────────────────────────

export function setServiceCredential(service: string, token: string, user?: string): ServiceCredential {
  const vault = loadVault();
  const existing = vault.services.find(s => s.service === service);
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
  return vault.services.find(s => s.service === service) || null;
}

export function getAllServices(): ServiceCredential[] {
  const vault = loadVault();
  return vault.services.map(s => ({
    ...s,
    token: maskKey(s.token),
  }));
}

export function removeService(service: string): boolean {
  const vault = loadVault();
  const idx = vault.services.findIndex(s => s.service === service);
  if (idx === -1) return false;
  vault.services.splice(idx, 1);
  saveVault(vault);
  return true;
}

// ── Permessi agenti ────────────────────────────────────────────────────────

export function setAgentPermissions(agentId: string, providers: string[], services: string[]): AgentPermissions {
  const vault = loadVault();
  const existing = vault.permissions.find(p => p.agentId === agentId);
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
  return vault.permissions.find(p => p.agentId === agentId) || null;
}

export function getAllPermissions(): AgentPermissions[] {
  const vault = loadVault();
  return vault.permissions;
}

export function removeAgentPermissions(agentId: string): boolean {
  const vault = loadVault();
  const idx = vault.permissions.findIndex(p => p.agentId === agentId);
  if (idx === -1) return false;
  vault.permissions.splice(idx, 1);
  saveVault(vault);
  return true;
}

// ── Risoluzione permessi ────────────────────────────────────────────────────

/**
 * Controlla se un agente ha accesso a un provider.
 */
export function agentCanUseProvider(agentId: string, provider: string): boolean {
  const perm = getAgentPermissions(agentId);
  if (!perm) return false;
  return perm.providers.includes('*') || perm.providers.includes(provider);
}

/**
 * Controlla se un agente ha accesso a un servizio.
 */
export function agentCanUseService(agentId: string, service: string): boolean {
  const perm = getAgentPermissions(agentId);
  if (!perm) return false;
  return perm.services.includes('*') || perm.services.includes(service);
}

/**
 * Risolve le env vars che un agente deve ricevere.
 */
export function resolveAgentEnv(agentId: string): Record<string, string> {
  const vault = loadVault();
  const perm = vault.permissions.find(p => p.agentId === agentId);
  if (!perm) return {};

  const env: Record<string, string> = {};

  // Provider
  for (const providerKey of perm.providers) {
    if (providerKey === '*') {
      // Dagli tutti i provider
      for (const p of vault.providers) {
        env[providerToEnvVar(p.provider)] = p.apiKey;
        if (p.baseUrl) env[providerToBaseUrlEnvVar(p.provider)] = p.baseUrl;
      }
      break;
    }
    const cred = vault.providers.find(p => p.provider === providerKey);
    if (cred) {
      env[providerToEnvVar(cred.provider)] = cred.apiKey;
      if (cred.baseUrl) env[providerToBaseUrlEnvVar(cred.provider)] = cred.baseUrl;
    }
  }

  // Servizi
  for (const serviceKey of perm.services) {
    if (serviceKey === '*') {
      for (const s of vault.services) {
        env[serviceToEnvVar(s.service)] = s.token;
      }
      break;
    }
    const cred = vault.services.find(s => s.service === serviceKey);
    if (cred) {
      env[serviceToEnvVar(cred.service)] = cred.token;
    }
  }

  return env;
}

// ── Utility ─────────────────────────────────────────────────────────────────

function maskKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '…' + key.slice(-4);
}

function providerToEnvVar(provider: string): string {
  // openai-codex → OPENAI_API_KEY, anthropic → ANTHROPIC_API_KEY, …
  const map: Record<string, string> = {
    'openai-codex': 'OPENAI_API_KEY',
    'openai': 'OPENAI_API_KEY',
    'anthropic': 'ANTHROPIC_API_KEY',
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
  };
  if (map[service]) return map[service];
  return `${service.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_TOKEN`;
}

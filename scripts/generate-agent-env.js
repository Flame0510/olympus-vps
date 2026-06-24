#!/usr/bin/env node
/**
 * Olympus Agent Env Generator
 * 
 * Genera le variabili d'ambiente per un container agente
 * basandosi sul vault di Olympus.
 * 
 * Uso:
 *   node scripts/generate-agent-env.js <agent_id>
 *   node scripts/generate-agent-env.js <agent_id> --docker  (formato docker run)
 *   node scripts/generate-agent-env.js <agent_id> --json    (formato JSON)
 * 
 * Esempio output (default):
 *   OPENAI_API_KEY=sk-...
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   GITHUB_TOKEN=ghp_...
 */

const fs = require('fs');
const path = require('path');

const VAULT_PATH = process.env.OLYMPUS_VAULT_PATH || path.join(__dirname, '..', 'vault.json');

function loadVault() {
  try {
    if (!fs.existsSync(VAULT_PATH)) {
      console.error('[env-gen] Vault non trovato:', VAULT_PATH);
      process.exit(1);
    }
    return JSON.parse(fs.readFileSync(VAULT_PATH, 'utf-8'));
  } catch (err) {
    console.error('[env-gen] Error loading vault:', err.message);
    process.exit(1);
  }
}

function providerToEnvVar(provider) {
  const map = {
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

function serviceToEnvVar(service) {
  const map = {
    'github': 'GITHUB_TOKEN',
    'vercel': 'VERCEL_TOKEN',
    'netlify': 'NETLIFY_AUTH_TOKEN',
  };
  if (map[service]) return map[service];
  return `${service.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_TOKEN`;
}

function main() {
  const args = process.argv.slice(2);
  const agentId = args[0];
  const format = args.includes('--docker') ? 'docker' : args.includes('--json') ? 'json' : 'env';

  if (!agentId) {
    console.error('Uso: node scripts/generate-agent-env.js <agent_id> [--docker|--json]');
    process.exit(1);
  }

  const vault = loadVault();
  const perm = (vault.permissions || []).find(p => p.agentId === agentId);

  if (!perm) {
    console.error(`[env-gen] Nessun permesso trovato per agente '${agentId}'.`);
    console.error(`          Usa la dashboard (Providers → Vault) per configurare i permessi.`);
    process.exit(1);
  }

  const env = {};

  // Provider vars
  for (const providerKey of perm.providers) {
    if (providerKey === '*') {
      for (const p of (vault.providers || [])) {
        env[providerToEnvVar(p.provider)] = p.apiKey;
      }
      break;
    }
    const cred = (vault.providers || []).find(p => p.provider === providerKey);
    if (cred) env[providerToEnvVar(cred.provider)] = cred.apiKey;
  }

  // Service vars
  for (const serviceKey of perm.services) {
    if (serviceKey === '*') {
      for (const s of (vault.services || [])) {
        env[serviceToEnvVar(s.service)] = s.token;
      }
      break;
    }
    const cred = (vault.services || []).find(s => s.service === serviceKey);
    if (cred) env[serviceToEnvVar(cred.service)] = cred.token;
  }

  // Always add Olympus gateway config
  env['OLYMPUS_GATEWAY_URL'] = process.env.OLYMPUS_GATEWAY_URL || 'http://olympus-control:3720';
  env['OLYMPUS_GATEWAY_TOKEN'] = process.env.OLYMPUS_GATEWAY_TOKEN || process.env.OLYMPUS_TOKEN || 'olympus2026';

  switch (format) {
    case 'docker':
      // Formato: -e KEY=VALUE -e KEY=VALUE ...
      const dockerArgs = Object.entries(env)
        .map(([k, v]) => `-e ${k}='${v}'`)
        .join(' \\\n  ');
      console.log(dockerArgs);
      break;

    case 'json':
      console.log(JSON.stringify(env, null, 2));
      break;

    case 'env':
    default:
      for (const [k, v] of Object.entries(env)) {
        console.log(`${k}=${v}`);
      }
      break;
  }
}

main();

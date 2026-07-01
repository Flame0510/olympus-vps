// Playwright E2E test: create agent via API, verify openclaw.json inside container
// Does NOT test UI — tests the API pipeline + container config outcome

import { execSync } from 'child_process';
import { test, expect } from '@playwright/test';

const baseUrl = process.env.OLYMPUS_BASE_URL || 'http://127.0.0.1:3740';
const password = process.env.OLYMPUS_PASSWORD || process.env.OLYMPUS_TOKEN;
const agentName = process.env.TEST_AGENT_NAME || 'test-e2e-agent';

function readContainerJson(container) {
  const raw = execSync(
    `docker exec ${container} node -e "const j=require('/root/.openclaw/openclaw.json'); console.log(JSON.stringify(j, null, 2))"`,
    { encoding: 'utf-8', timeout: 10000 }
  ).toString().trim();
  return JSON.parse(raw);
}

async function waitForContainer(container, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const output = execSync(
        `docker inspect --format '{{.State.Health.Status}}' ${container} 2>/dev/null || docker inspect --format '{{.State.Status}}' ${container}`,
        { encoding: 'utf-8', timeout: 5000 }
      ).toString().trim();
      if (output === 'running' || output === 'healthy') return true;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

test.use({ ignoreHTTPSErrors: true });

test('create agent via API, verify container openclaw.json is correct', async ({ request }) => {
  expect(password, 'OLYMPUS_PASSWORD/OLYMPUS_TOKEN is required').toBeTruthy();

  // ── Login ──
  const loginRes = await request.post(`${baseUrl}/api/auth/login`, { data: { password } });
  expect(loginRes.ok(), `login HTTP ${loginRes.status()}`).toBeTruthy();

  const cookie = loginRes.headers()['set-cookie'];
  expect(cookie, 'login must set cookie').toBeTruthy();

  const headers = { Cookie: cookie };

  // ── Get models from models.config.json directly ──
  const modelsConfig = JSON.parse(execSync(
    `cat /home/nexus/.openclaw/workspace/olympus-vps/models.config.json`,
    { encoding: 'utf-8', timeout: 5000 }
  ).toString().trim());
  const enabledModels = modelsConfig.models.filter(m => m.enabled !== false);
  const firstModelId = enabledModels[0]?.id;
  expect(firstModelId, 'at least one enabled model').toBeTruthy();
  console.log(`Using model: ${firstModelId}`);

  // ── Delete existing agent first ──
  try {
    execSync(`docker rm -f ${agentName} 2>/dev/null; docker ps -a --filter name=${agentName} --format '{{.Names}}'`, { timeout: 5000 });
  } catch {}

  // ── Create agent via API ──
  console.log(`Creating agent ${agentName} with model ${firstModelId}...`);
  const createRes = await request.post(`${baseUrl}/api/agents/create`, {
    headers,
    data: {
      name: agentName,
      template: 'prometheus',
      model: firstModelId,
    },
  });

  const createData = await createRes.json();
  console.log(`Create response:`, JSON.stringify(createData, null, 2));
  expect(createData.success, `Create failed: ${createData.error || ''}`).toBe(true);

  // ── Wait for container to be running ──
  const running = await waitForContainer(agentName, 30000);
  expect(running, `${agentName} must be running within 30s`).toBe(true);

  // Allow sync + model ref + gateway restart to settle
  await new Promise(r => setTimeout(r, 5000));

  // ── Read openclaw.json from container ──
  let config;
  try {
    config = readContainerJson(agentName);
  } catch (e) {
    expect(true, `Failed to read container config: ${e.message}`).toBe(false);
    return;
  }

  console.log('=== openclaw.json analysis ===');
  const dumpForDebug = {
    models_providers: config.models?.providers ? Object.keys(config.models.providers) : [],
    olympus_models_ids: (config.models?.providers?.olympus?.models || []).map(m => m.id),
    agents_defaults_model: config.agents?.defaults?.model,
    agents_list0_model: config.agents?.list?.[0]?.model,
  };
  console.log(JSON.stringify(dumpForDebug, null, 2));

  // ── ASSERTIONS ──

  // 1. models.providers.olympus must exist with models
  const olympusProvider = config.models?.providers?.olympus;
  expect(olympusProvider, 'models.providers.olympus must exist').toBeTruthy();
  expect(olympusProvider.baseUrl, 'olympus baseUrl must be set').toBeTruthy();
  expect(olympusProvider.apiKey, 'olympus apiKey must be set').toBeTruthy();
  const modelIds = (olympusProvider.models || []).map(m => m.id);
  expect(modelIds.length, 'at least one model in olympus provider').toBeGreaterThan(0);
  console.log(`✅ models.providers.olympus has ${modelIds.length} models`);

  // 2. agents.defaults.model.primary must be well-formed: olympus/<provider>/<model>
  const defaultModel = config.agents?.defaults?.model;
  expect(defaultModel, 'agents.defaults.model must exist').toBeTruthy();
  const primary = defaultModel.primary;
  expect(primary, 'primary must start with olympus/').toMatch(/^olympus\//);
  expect(primary, 'primary must be olympus/<provider>/<model> (3 parts)')
    .toMatch(/^olympus\/[^/]+\/[^/]+$/);
  console.log(`✅ primary = ${primary}`);

  // 3. Fallbacks must be empty or absent
  const fallbacks = defaultModel.fallbacks;
  expect(fallbacks, 'fallbacks should be empty or absent').toBeFalsy();
  console.log(`✅ fallbacks not set (or empty)`);

  // 4. agents.list[0].model must match defaults
  const listModel = config.agents?.list?.[0]?.model;
  expect(listModel, 'agents.list[0].model must exist').toBeTruthy();
  expect(listModel.primary, 'list[0].primary must match default').toBe(primary);
  console.log(`✅ list[0].primary matches`);

  // 5. The primary model ID must actually exist in olympus provider models
  const expectedProviderModelId = primary.replace(/^olympus\//, '');
  expect(modelIds, `olympus provider must contain model ${expectedProviderModelId}`)
    .toContain(expectedProviderModelId);
  console.log(`✅ model ${expectedProviderModelId} present in olympus provider`);

  console.log('\n✅✅✅ ALL CHECKS PASSED ✅✅✅');
});

test.afterEach(async () => {
  // Cleanup: remove test container
  try {
    execSync(`docker rm -f ${agentName} 2>/dev/null || true`, { timeout: 10000 });
    console.log(`Cleaned up ${agentName}`);
  } catch {}
});

// E2E test: create agent via wizard, verify openclaw.json inside container
// Tests that models.providers.olympus is populated and model refs are correct

import fs from 'fs';
import { execSync } from 'child_process';
import { test, expect } from '@playwright/test';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const baseUrl = process.env.OLYMPUS_BASE_URL || 'http://127.0.0.1:3740';
const password = process.env.OLYMPUS_PASSWORD || process.env.OLYMPUS_TOKEN;
const agentName = process.env.TEST_AGENT_NAME || 'test-agent';
const templateName = process.env.TEST_AGENT_TEMPLATE || 'prometheus';

test.use({ ignoreHTTPSErrors: true });

test('create agent, verify openclaw.json has correct models and model refs', async ({ page, request }) => {
  expect(password, 'OLYMPUS_PASSWORD/OLYMPUS_TOKEN is required').toBeTruthy();

  // ── Login ──
  const loginResponse = await request.post(`${baseUrl}/api/auth/login`, {
    data: { password },
  });
  expect(loginResponse.ok(), `login HTTP ${loginResponse.status()}`).toBeTruthy();
  const cookieHeader = loginResponse.headers()['set-cookie'] ?? '';
  const tokenMatch = cookieHeader.match(/olympus_token=([^;]+)/);
  expect(tokenMatch, 'login must set olympus_token cookie').toBeTruthy();
  const olympusToken = tokenMatch[1];

  await page.context().addCookies([{
    name: 'olympus_token',
    value: olympusToken,
    url: baseUrl,
    httpOnly: true,
    sameSite: 'Lax',
  }]);

  page.on('dialog', async (dialog) => { await dialog.accept(); });

  // ── Delete existing agent if present ──
  await page.goto(`${baseUrl}/agents`, { waitUntil: 'networkidle' });
  await expect(page.getByText('AGENTS', { exact: true })).toBeVisible();

  const agentRow = page.locator('button').filter({ hasText: agentName }).first();
  if (await agentRow.count()) {
    console.log(`Deleting existing ${agentName}...`);
    await agentRow.click();
    const deleteButton = page.getByRole('button', { name: 'Delete Agent' });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();
    // Wait for container to be removed
    try {
      execSync(`docker rm -f ${agentName} 2>/dev/null || true`, { timeout: 10000 });
    } catch {}
    await page.waitForTimeout(3000);
    await page.goto(`${baseUrl}/agents`, { waitUntil: 'networkidle' });
    await expect(agentRow).toHaveCount(0, { timeout: 30000 });
  }

  // ── Create new agent via wizard ──
  console.log(`Creating ${agentName}...`);
  await page.getByRole('button', { name: '+ NEW' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create Agent' })).toBeVisible();

  await page.locator('button').filter({ hasText: templateName }).first().click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByPlaceholder('e.g. my-agent').fill(agentName);
  await page.getByRole('button', { name: 'Deploy Agent' }).click();

  await expect(page.getByText('Agent deployed')).toBeVisible({ timeout: 60000 });

  // ── Allow sync + model ref write to settle ──
  await page.waitForTimeout(5000);

  // ── Inspect openclaw.json in the container ──
  console.log(`Inspecting ${agentName} openclaw.json...`);
  let configJson;
  try {
    const raw = execSync(
      `docker exec ${agentName} node -e "const j=require('/root/.openclaw/openclaw.json'); console.log(JSON.stringify(j))"`,
      { encoding: 'utf-8', timeout: 10000 }
    ).toString().trim();
    configJson = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read container config:', e.message);
    expect(true).toBe(false); // force fail
    return;
  }

  console.log('=== openclaw.json analysis ===');

  // ─── CHECK 1: models.providers.olympus must exist with models ───
  const olympusProvider = configJson?.models?.providers?.olympus;
  expect(olympusProvider, 'models.providers.olympus must exist').toBeTruthy();
  expect(olympusProvider.baseUrl, 'olympus baseUrl must exist').toBeTruthy();
  expect(olympusProvider.apiKey, 'olympus apiKey must exist').toBeTruthy();
  const modelIds = (olympusProvider.models || []).map(m => m.id);
  expect(modelIds.length, 'at least one model in olympus provider').toBeGreaterThan(0);
  console.log(`  models.providers.olympus.models: ${JSON.stringify(modelIds)}`);

  // ─── CHECK 2: agents.defaults.model.primary must be correct ───
  const defaultModel = configJson?.agents?.defaults?.model;
  expect(defaultModel, 'agents.defaults.model must exist').toBeTruthy();
  const primary = defaultModel.primary;
  console.log(`  agents.defaults.model.primary: ${primary}`);
  // Must start with olympus/ and contain deepseek/ (the provider part)
  expect(primary, 'primary must start with olympus/').toMatch(/^olympus\//);
  expect(primary, 'primary must contain provider part').toMatch(/^olympus\/[^/]+\/.+/);
  // Must NOT have fallbacks (or if present, must be empty)
  const fallbacks = defaultModel.fallbacks || [];
  console.log(`  agents.defaults.model.fallbacks: ${JSON.stringify(fallbacks)}`);
  expect(fallbacks.length, 'fallbacks should be empty').toBe(0);

  // ─── CHECK 3: agents.list[0].model must match ───
  const listModel = configJson?.agents?.list?.[0]?.model;
  expect(listModel, 'agents.list[0].model must exist').toBeTruthy();
  expect(listModel.primary, 'list[0].primary must match default').toBe(primary);
  console.log(`  agents.list[0].model.primary: ${listModel.primary}`);

  console.log('✅ All checks passed!');
  console.log('---');
});

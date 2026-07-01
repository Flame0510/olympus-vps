import fs from 'fs';
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
const agentName = process.env.TEST_AGENT_NAME || 'prometheus';
const templateName = process.env.TEST_AGENT_TEMPLATE || 'prometheus';

test.use({ ignoreHTTPSErrors: true });

test('delete and recreate agent via wizard, then capture Control UI URL', async ({ page, request }) => {
  expect(password, 'OLYMPUS_PASSWORD/OLYMPUS_TOKEN is required').toBeTruthy();

  const loginResponse = await request.post(`${baseUrl}/api/auth/login`, {
    data: { password },
  });
  expect(loginResponse.ok(), `login HTTP ${loginResponse.status()}`).toBeTruthy();

  const cookieHeader = loginResponse.headers()['set-cookie'] ?? '';
  const tokenMatch = cookieHeader.match(/olympus_token=([^;]+)/);
  expect(tokenMatch, 'login response must set olympus_token cookie').toBeTruthy();
  const olympusToken = tokenMatch[1];

  await page.context().addCookies([{
    name: 'olympus_token',
    value: olympusToken,
    url: baseUrl,
    httpOnly: true,
    sameSite: 'Lax',
  }]);

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.goto(`${baseUrl}/agents`, { waitUntil: 'networkidle' });
  await expect(page.getByText('AGENTS', { exact: true })).toBeVisible();

  const agentRow = page.locator('button').filter({ hasText: agentName }).first();
  if (await agentRow.count()) {
    await agentRow.click();
    const deleteButton = page.getByRole('button', { name: 'Delete Agent' });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();
    await expect(agentRow).toHaveCount(0, { timeout: 30000 });
  }

  await page.getByRole('button', { name: '+ NEW' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create Agent' })).toBeVisible();

  await page.locator('button').filter({ hasText: templateName }).first().click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByPlaceholder('e.g. my-agent').fill(agentName);
  await page.getByRole('button', { name: 'Deploy Agent' }).click();

  await expect(page.getByText('Agent deployed')).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'View All Agents' }).click();

  await expect(page).toHaveURL(/\/agents$/);
  const recreatedRow = page.locator('button').filter({ hasText: agentName }).first();
  await expect(recreatedRow).toBeVisible({ timeout: 30000 });
  await recreatedRow.click();

  const controlLink = page.getByRole('link').filter({ hasText: `https://${agentName}.srv1490011.hstgr.cloud` }).first();
  await expect(controlLink).toBeVisible({ timeout: 30000 });
  const href = await controlLink.getAttribute('href');

  expect(href, 'Control UI href must be present').toBeTruthy();
  console.log(`CONTROL_UI_URL=${href}`);
});

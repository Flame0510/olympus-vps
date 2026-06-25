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

test('workspace tree renders real entries with workspace selector', async ({ page, request }) => {
  expect(password, 'OLYMPUS_PASSWORD/OLYMPUS_TOKEN is required').toBeTruthy();

  // Login first to get auth cookie
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

  // Verify workspace list API returns workspaces including vps (authenticated)
  const listResponse = await request.get(`${baseUrl}/api/workspace?action=list`, {
    headers: { cookie: `olympus_token=${olympusToken}` },
  });
  expect(listResponse.ok(), `list HTTP ${listResponse.status()}`).toBeTruthy();
  const listData = await listResponse.json();
  expect(listData.workspaces, 'workspaces array must exist').toBeTruthy();
  expect(listData.workspaces.length, 'at least one workspace').toBeGreaterThanOrEqual(1);
  const hasVps = listData.workspaces.some((w) => w.id === 'vps');
  expect(hasVps, 'vps workspace must be present').toBeTruthy();
  const hasAtlas = listData.workspaces.some((w) => w.id === 'container-openclaw-atlas');
  expect(hasAtlas, 'atlas container workspace must be present').toBeTruthy();

  const apiResponses = [];
  const consoleErrors = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/workspace')) return;
    let json = null;
    try {
      json = await response.json();
    } catch {
      // Valid for binary preview responses.
    }
    apiResponses.push({
      url: response.url(),
      status: response.status(),
      entries: Array.isArray(json?.entries) ? json.entries.length : null,
      files: Array.isArray(json?.files) ? json.files.length : null,
      error: json?.error || null,
    });
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`${baseUrl}/workspace`, { waitUntil: 'networkidle' });
  await expect(page.getByText('WORKSPACE', { exact: true })).toBeVisible();

  // Verify workspace selector exists
  const selector = page.locator('select');
  await expect(selector).toBeVisible();
  await expect(selector).toHaveValue('vps');
  await expect(selector.locator('option[value="container-openclaw-atlas"]')).toHaveCount(1);

  await expect(page.getByText('Empty workspace')).toHaveCount(0);
  await expect(page.getByText(/\.openclaw|memory|olympus-vps|AGENTS\.md|SOUL\.md/).first()).toBeVisible();

  await selector.selectOption('container-openclaw-atlas');
  await expect(page.getByText('Empty workspace')).toHaveCount(0);
  await expect(page.getByText(/AGENTS\.md|SOUL\.md|MEMORY\.md|micheletornello\.com/).first()).toBeVisible();

  const treeResponse = apiResponses.find((response) => response.url.includes('tree=1') && response.url.includes('workspace=vps'));
  const atlasTreeResponse = apiResponses.find((response) => response.url.includes('tree=1') && response.url.includes('container-openclaw-atlas'));
  console.log(JSON.stringify({ apiResponses, consoleErrors }, null, 2));
  expect(treeResponse?.status).toBe(200);
  expect(treeResponse?.entries ?? 0).toBeGreaterThan(0);
  expect(atlasTreeResponse?.status).toBe(200);
  expect(atlasTreeResponse?.entries ?? 0).toBeGreaterThan(0);

  // Verify directories sort before files at top level for vps tree
  const vpsTreeResponse = await request.get(`${baseUrl}/api/workspace?workspace=vps&tree=1`, {
    headers: { cookie: `olympus_token=${olympusToken}` },
  });
  const vpsTreeData = await vpsTreeResponse.json();
  const vpsEntries = vpsTreeData.entries;
  expect(Array.isArray(vpsEntries), 'vps tree entries must be an array').toBe(true);
  const vpsTopLevel = vpsEntries.filter(e => !e.relPath.includes('/'));
  let lastWasDir = true;
  for (const entry of vpsTopLevel) {
    if (entry.type === 'file' && lastWasDir) {
      lastWasDir = false;
    }
    if (entry.type === 'directory') {
      expect(lastWasDir, `dir ${entry.name} after file at top level in vps`).toBe(true);
    }
  }

  // Verify directories sort before files at top level for atlas tree
  const atlasTreeResponse2 = await request.get(`${baseUrl}/api/workspace?workspace=container-openclaw-atlas&tree=1`, {
    headers: { cookie: `olympus_token=${olympusToken}` },
  });
  const atlasTreeData = await atlasTreeResponse2.json();
  const atlasEntries = atlasTreeData.entries;
  expect(Array.isArray(atlasEntries), 'atlas tree entries must be an array').toBe(true);
  const atlasTopLevel = atlasEntries.filter(e => !e.relPath.includes('/'));
  lastWasDir = true;
  for (const entry of atlasTopLevel) {
    if (entry.type === 'file' && lastWasDir) {
      lastWasDir = false;
    }
    if (entry.type === 'directory') {
      expect(lastWasDir, `dir ${entry.name} after file at top level in atlas`).toBe(true);
    }
  }
});

import { chromium } from '@playwright/test';
import http from 'http';

/**
 * Playwright check: providers page, Atlas agent, DeepSeek key visibility.
 * Uses existing session cookie from login.
 */

const BASE = 'http://127.0.0.1:3740';
const PASSWORD = 'olympus2026';

function postLogin() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ password: PASSWORD });
    const req = http.request(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        const cookies = (res.headers['set-cookie'] || []).join('; ');
        const token = cookies.match(/olympus_token=([^;]+)/)?.[1];
        resolve(token ? { token, cookie: cookies } : null);
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getAgentProviders(cookie) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}/api/agent-providers`, { headers: { Cookie: cookie } }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    }).on('error', reject);
  });
}

(async () => {
  console.log('=== Provider check script ===\n');

  // 1. Login and get session cookie
  const login = await postLogin();
  if (!login) {
    console.log('FAIL: could not login');
    process.exit(1);
  }
  console.log('OK: logged in');

  // 2. Check API agent-providers returns Atlas with deepseek
  const agents = await getAgentProviders(login.cookie);
  if (!agents) {
    console.log('FAIL: /api/agent-providers returned null');
    process.exit(1);
  }
  console.log(`Found ${agents.length} agent(s):`);
  let atlasDeepseekCount = 0;
  for (const a of agents) {
    const providerNames = (a.providers || []).map(p => p.provider).join(', ');
    console.log(`  ${a.agentId}: ${providerNames || '(none)'}`);
    if (a.agentId === 'openclaw-atlas') {
      for (const p of (a.providers || [])) {
        if (p.provider === 'deepseek') atlasDeepseekCount++;
      }
    }
  }

  if (atlasDeepseekCount === 0) {
    console.log('\nWARN: deepseek NOT found in Atlas via API. UI will show it inactive.\n');
  } else {
    console.log(`\nOK: deepseek found in Atlas (${atlasDeepseekCount} entry)\n`);
  }

  // 3. Playwright: headless browser visit providers page with cookie
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  // Set the olympus_token cookie manually for the domain
  await context.addCookies([{
    name: 'olympus_token',
    value: login.token,
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  const page = await context.newPage();

  console.log('Navigating to providers page...');
  await page.goto(`${BASE}/providers`, { waitUntil: 'networkidle' });
  // Wait a moment for agent loading
  await page.waitForTimeout(2000);

  // 4. Check page has agent selector
  const selectors = await page.locator('select').count();
  console.log(`Select dropdowns found: ${selectors}`);

  // Try to select Atlas from dropdown
  const selects = page.locator('select');
  const selectCount = await selects.count();
  if (selectCount > 0) {
    // First select is usually the agent selector
    const firstSelect = selects.first();
    const options = await firstSelect.locator('option').allTextContents();
    console.log(`Agent options: ${options.join(', ')}`);

    if (options.some(o => o.includes('atlas'))) {
      console.log('OK: Atlas option found in selector');
      await firstSelect.selectOption(options.find(o => o.includes('atlas')) || options[1]);
      await page.waitForTimeout(2000);

      // Check for deepseek in visible text
      const bodyText = await page.locator('body').innerText();
      const hasDeepseek = bodyText.toLowerCase().includes('deepseek');
      console.log(`Deepseek visible on page after selecting Atlas: ${hasDeepseek ? 'YES' : 'NO'}`);

      // Look for active indicators
      const activeElements = page.locator('text=ACTIVE');
      const activeCount = await activeElements.count();
      console.log(`"ACTIVE" text occurrences: ${activeCount}`);
    } else {
      console.log('WARN: Atlas option NOT found in agent selector');
    }
  } else {
    console.log('WARN: no selector found on page');
  }

  // 5. Screenshot for visual inspection
  await page.screenshot({ path: '/tmp/providers-atlas-check.png', fullPage: false });
  console.log('Screenshot saved to /tmp/providers-atlas-check.png');

  await browser.close();
  console.log('\n=== Check complete ===');

  // Exit with status: 0 if deepseek visible, 1 if not
  const finalBody = await page.locator('body').innerText().catch(() => '');
  process.exit(finalBody.toLowerCase().includes('deepseek') && atlasDeepseekCount > 0 ? 0 : 1);
})();

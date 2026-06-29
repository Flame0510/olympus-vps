import * as fs from 'fs';
import * as path from 'path';

const KEYS_PATH = path.resolve(process.cwd(), 'data', 'provider-keys.json');

interface ProviderKeys {
  [provider: string]: string;
}

function ensureDir(): void {
  const dir = path.dirname(KEYS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readProviderKeys(): ProviderKeys {
  ensureDir();
  try {
    const raw = fs.readFileSync(KEYS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    // File doesn't exist — try to migrate from env
    const keys: ProviderKeys = {};
    if (process.env.PROVIDER_DEEPSEEK_API_KEY) keys['deepseek'] = process.env.PROVIDER_DEEPSEEK_API_KEY;
    if (process.env.PROVIDER_OPENROUTER_API_KEY) keys['openrouter'] = process.env.PROVIDER_OPENROUTER_API_KEY;
    if (Object.keys(keys).length > 0) {
      writeProviderKeys(keys);
    }
    return keys;
  }
}

export function writeProviderKeys(keys: ProviderKeys): void {
  ensureDir();
  fs.writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2), 'utf-8');
}

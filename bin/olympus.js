#!/usr/bin/env node
/**
 * Olympus CLI — Dashboard for monitoring OpenClaw agents
 *
 * Usage:
 *   olympus start             Start the server (auto-build if needed)
 *   olympus start --port 3720 Start on specific port
 *   olympus build             Manual build
 *   olympus --help            Show help
 */

const { spawn, execSync } = require('child_process');
const { existsSync } = require('fs');
const { join, dirname } = require('path');

const ROOT = join(__dirname, '..');
const NEXT_DIR = join(ROOT, '.next');
const PKG_JSON = join(ROOT, 'package.json');

let pkg;
try { pkg = require(PKG_JSON); } catch { pkg = { version: '0.0.0' }; }

function log(tag, msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [${tag}] ${msg}`);
}

function build() {
  log('BUILD', 'Building Olympus…');
  execSync('npx next build', { cwd: ROOT, stdio: 'inherit' });
  log('BUILD', 'Build complete.');
}

function start(port) {
  const p = parseInt(port, 10) || 3720;
  log('START', `Starting Olympus on port ${p}…`);
  const child = spawn('npx', ['next', 'start', '-p', String(p)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(p), NODE_ENV: 'production' },
  });
  child.on('exit', (code) => {
    log('START', `Server exited (code ${code})`);
    process.exit(code ?? 0);
  });
}

const args = process.argv.slice(2);
const cmd = args[0] || 'start';

if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
  console.log(`
Olympus v${pkg.version} — Agency Monitor Dashboard

USAGE:
  olympus start [--port <port>]   Start the server (builds if needed)
  olympus build                   Build the Next.js app
  olympus --help                  Show this help

EXAMPLES:
  olympus start                   → http://localhost:3720
  olympus start --port 8080       → http://localhost:8080
`);
  process.exit(0);
}

if (cmd === 'build') {
  if (existsSync(NEXT_DIR)) {
    log('BUILD', '.next already exists, skipping. Use --force to rebuild.');
    process.exit(0);
  }
  build();
  process.exit(0);
}

if (cmd === 'start') {
  const portIdx = args.indexOf('--port');
  const port = portIdx >= 0 ? args[portIdx + 1] : process.env.PORT || '3720';

  if (!existsSync(NEXT_DIR)) {
    log('START', 'No build found, running build first…');
    build();
  }

  start(port);
  process.exit(0);
}

console.error(`Unknown command: ${cmd}`);
console.error('Usage: olympus start [--port <port>]');
process.exit(1);

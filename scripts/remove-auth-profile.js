/**
 * Remove an auth profile from the OpenClaw SQLite database.
 * Usage: node remove-auth-profile.js <db-path> <provider-name>
 *
 * Reads the store_json from auth_profile_store, removes any profiles
 * matching the provider, and writes back.
 */
const { execSync: run } = require('child_process');

const db = process.argv[2];
const provider = process.argv[3];

if (!db || !provider) {
  process.stderr.write('Usage: node remove-auth-profile.js <db-path> <provider>\n');
  process.exit(1);
}

try {
  const row = run(
    'sqlite3 ' + JSON.stringify(db) + ' "SELECT store_json FROM auth_profile_store WHERE store_key=\'primary\'"',
    { encoding: 'utf8', timeout: 5000 }
  ).trim();

  if (!row) process.exit(0);

  const data = JSON.parse(row);
  if (!data.profiles) process.exit(0);

  let changed = false;
  for (const pid of Object.keys(data.profiles)) {
    const p = data.profiles[pid];
    if (p.provider === provider || pid.startsWith(provider + ':')) {
      delete data.profiles[pid];
      changed = true;
      process.stderr.write('Removed profile: ' + pid + '\n');
    }
  }

  if (!changed) process.exit(0);

  const newJson = JSON.stringify(data);
  // Escape single quotes for SQLite shell
  const escaped = newJson.replace(/'/g, "''");
  const updateCmd =
    'sqlite3 ' + JSON.stringify(db) +
    ' "UPDATE auth_profile_store SET store_json=\'' + escaped +
    '\', updated_at=' + Date.now() +
    ' WHERE store_key=\'primary\'"';

  run(updateCmd, { timeout: 5000 });
  process.stderr.write('Updated auth_profile_store\n');
  console.log('ok');
} catch (e) {
  process.stderr.write('Error: ' + e.message + '\n');
  process.exit(1);
}

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateBackup } from './projection-v2-backup-lib.mjs';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/validate-projection-v2-backup.mjs <backup.json>');
const backup = JSON.parse(await readFile(resolve(input), 'utf8'));
const validation = validateBackup(backup);
if (!validation.ok) {
  validation.errors.forEach((error) => console.error(`INVALID: ${error}`));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ valid: true, counts: validation.counts, sha256: backup.manifest.sha256 }));
}


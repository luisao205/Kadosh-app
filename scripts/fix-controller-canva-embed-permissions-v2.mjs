import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const target = 'scripts/fix-controller-canva-embed-permissions.mjs';
const raw = fs.readFileSync(target, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');

const oldBlock = `presets = replaceAllCounted(
  presets,
  \`  PERMISSIONS.MULTIMEDIA_PROJECT,\`,
  \`  PERMISSIONS.MULTIMEDIA_PROJECT,\\n  PERMISSIONS.CANVA_PROJECT,\`,
  'Canva en presets Multimedia',
  2
);`;

const newBlock = `presets = replaceOnce(
  presets,
  \`  PERMISSIONS.MULTIMEDIA_PROJECT,\\n  PERMISSIONS.ANNOUNCEMENTS_VIEW,\`,
  \`  PERMISSIONS.MULTIMEDIA_PROJECT,\\n  PERMISSIONS.CANVA_PROJECT,\\n  PERMISSIONS.ANNOUNCEMENTS_VIEW,\`,
  'Canva en preset Multimedia Completo'
);
presets = replaceOnce(
  presets,
  \`  [PERMISSIONS.MULTIMEDIA_PROJECT]: true,\\n  [PERMISSIONS.ANNOUNCEMENTS_VIEW]: true,\`,
  \`  [PERMISSIONS.MULTIMEDIA_PROJECT]: true,\\n  [PERMISSIONS.CANVA_PROJECT]: true,\\n  [PERMISSIONS.ANNOUNCEMENTS_VIEW]: true,\`,
  'Canva en preset Apoyo Multimedia'
);`;

if (!source.includes(oldBlock)) {
  throw new Error('No se encontró el bloque defectuoso del helper Canva; no se modificó nada.');
}

source = source.replace(oldBlock, newBlock);

const tempPath = path.join(os.tmpdir(), `kadosh-canva-permissions-${process.pid}-${Date.now()}.mjs`);
fs.writeFileSync(tempPath, source.replace(/\n/g, eol), 'utf8');

try {
  console.log('[ok] helper Canva v2: patrones de presets corregidos');
  const result = spawnSync(process.execPath, [tempPath], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log('Fix Canva v2 completado sin modificar el helper original.');
} finally {
  try { fs.unlinkSync(tempPath); } catch {}
}

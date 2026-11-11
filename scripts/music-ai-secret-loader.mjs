import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

/**
 * Resuelve la ubicacion externa privada fuera de OneDrive:
 * %LOCALAPPDATA%\Kadosh\secrets\music-ai.env
 */
export const getPrivateSecretFilePath = () => {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return resolve(localAppData, 'Kadosh', 'secrets', 'music-ai.env');
};

/**
 * Lee en memoria el archivo de secreto privado sin copiarlo al workspace ni imprimir claves.
 */
export const loadPrivateSecretVars = (customPath = null) => {
  const secretPath = customPath || getPrivateSecretFilePath();
  const vars = {};

  if (!existsSync(secretPath)) {
    return { secretPath, exists: false, hasApiKey: false, vars };
  }

  const content = readFileSync(secretPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).trim();
    }
    if (val) vars[key] = val;
  }

  return {
    secretPath,
    exists: true,
    hasApiKey: Boolean(vars.GEMINI_API_KEY || vars.GOOGLE_API_KEY),
    model: vars.GEMINI_MODEL || 'gemini-3.8-flash',
    vars,
  };
};

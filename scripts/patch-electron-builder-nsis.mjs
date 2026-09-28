import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const appBuilderLibPackage = require.resolve('app-builder-lib/package.json');
const appBuilderLibDir = path.dirname(appBuilderLibPackage);
const allowPath = path.join(appBuilderLibDir, 'templates', 'nsis', 'include', 'allowOnlyOneInstallerInstance.nsh');
const installUtilPath = path.join(appBuilderLibDir, 'templates', 'nsis', 'include', 'installUtil.nsh');
const appBuilderLibVersion = JSON.parse(readFileSync(appBuilderLibPackage, 'utf8')).version;

const fail = (message) => {
  throw new Error(`electron-builder NSIS patch: ${message}`);
};

const replaceOnce = (source, from, to, label) => {
  if (!source.includes(from)) fail(`no se encontró el bloque esperado (${label}) en app-builder-lib ${appBuilderLibVersion}`);
  return source.replace(from, to);
};

if (appBuilderLibVersion !== '26.15.3') {
  fail(`versión ${appBuilderLibVersion} no reconocida; revisar si upstream ya incluye electron-builder#10024 antes de continuar`);
}

let allowSource = readFileSync(allowPath, 'utf8');
const exactNameMarker = "$$_.Name -eq '${_FILE}'";

if (!allowSource.includes(exactNameMarker)) {
  const oldFind = "    nsExec::Exec `\"$PowerShellPath\" -C \"if ((Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')}).Count -gt 0) { exit 0 } else { exit 1 }\"`";
  const newFind = "    nsExec::Exec `\"$PowerShellPath\" -NoProfile -NonInteractive -C \"if ((Get-CimInstance -ClassName Win32_Process | ? {$$_.Name -eq '${_FILE}'}).Count -gt 0) { exit 0 } else { exit 1 }\"`";
  allowSource = replaceOnce(allowSource, oldFind, newFind, 'FIND_PROCESS exact executable name');

  const oldKill = "    nsExec::Exec `\"$PowerShellPath\" -C \"Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId $0 }\"`";
  const newKill = "    nsExec::Exec `\"$PowerShellPath\" -NoProfile -NonInteractive -C \"Get-CimInstance -ClassName Win32_Process | ? {$$_.Name -eq '${_FILE}'} | % { Stop-Process -Id $$_.ProcessId $0 }\"`";
  allowSource = replaceOnce(allowSource, oldKill, newKill, 'KILL_PROCESS exact executable name');

  writeFileSync(allowPath, allowSource, 'utf8');
}

let installUtilSource = readFileSync(installUtilPath, 'utf8');
const oldRetry = 'MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY OneMoreAttempt';
const newRetry = 'MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(uninstallFailed): $R0" /SD IDCANCEL IDRETRY OneMoreAttempt';

if (installUtilSource.includes(oldRetry)) {
  installUtilSource = installUtilSource.replace(oldRetry, newRetry);
  writeFileSync(installUtilPath, installUtilSource, 'utf8');
} else if (!installUtilSource.includes(newRetry)) {
  fail(`no se encontró el bloque esperado de uninstallOldVersion en app-builder-lib ${appBuilderLibVersion}`);
}

console.log(`electron-builder NSIS compatibility patch: OK (app-builder-lib ${appBuilderLibVersion}, exact process name)`);

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

let allowSource = readFileSync(allowPath, 'utf8');
const allowAlreadyPatched = allowSource.includes('Var /GLOBAL processPathFilter')
  && allowSource.includes('APPEND_INSTALL_LOCATION_TO_PROCESS_PATH_FILTER')
  && allowSource.includes("$$_.Path -and ($processPathFilter)");

if (!allowAlreadyPatched) {
  if (appBuilderLibVersion !== '26.15.3') {
    fail(`versión ${appBuilderLibVersion} no reconocida; revisar si upstream ya incluye #10024 antes de continuar`);
  }

  allowSource = replaceOnce(
    allowSource,
    '!ifndef nsProcess::FindProcess\n    !include "nsProcess.nsh"\n!endif\n\n',
    '!ifndef nsProcess::FindProcess\n    !include "nsProcess.nsh"\n!endif\n\n!include "WordFunc.nsh"\n\n',
    'WordFunc include'
  );

  const helpers = [
    '!macro TRIM_TRAILING_BACKSLASHES _VAR _TEMP',
    '  ${Do}',
    '    StrCpy ${_TEMP} ${_VAR} 1 -1',
    '    ${if} ${_TEMP} != "\\"',
    '      ${Break}',
    '    ${endIf}',
    '    StrCpy ${_VAR} ${_VAR} -1',
    '  ${Loop}',
    '!macroend',
    '',
    '!macro APPEND_INSTALL_LOCATION_TO_PROCESS_PATH_FILTER _ROOT_KEY',
    '  ReadRegStr $R9 ${_ROOT_KEY} "${INSTALL_REGISTRY_KEY}" InstallLocation',
    '  !insertmacro TRIM_TRAILING_BACKSLASHES $R9 $R7',
    '  ${WordReplace} $R9 \'"\' "" "+" $R7',
    '  ${if} $R9 != ""',
    '  ${andIf} $R9 == $R7',
    '    ${WordReplace} $R9 "\'" "\'\'" "+" $R7',
    '    ${if} $R7 != $R8',
    '      StrCpy $processPathFilter "$processPathFilter -or $$_.Path.StartsWith(\'$R7\\\', \'CurrentCultureIgnoreCase\')"',
    '    ${endIf}',
    '  ${endIf}',
    '!macroend',
    ''
  ].join('\n');

  allowSource = replaceOnce(
    allowSource,
    '!macro CHECK_APP_RUNNING\n',
    `${helpers}\n!macro CHECK_APP_RUNNING\n`,
    'helpers insertion'
  );

  const oldCheck = [
    '!macro CHECK_APP_RUNNING',
    '  Var /GLOBAL CmdPath',
    '  Var /GLOBAL PowerShellPath',
    '  StrCpy $CmdPath "$SYSDIR\\cmd.exe"',
    '  StrCpy $PowerShellPath "$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe"',
    '  !ifmacrodef customCheckAppRunning',
    '    !insertmacro customCheckAppRunning',
    '  !else',
    '    !insertmacro IS_POWERSHELL_AVAILABLE',
    '    !insertmacro _CHECK_APP_RUNNING',
    '  !endif',
    '!macroend'
  ].join('\n');

  const newCheck = [
    '!macro CHECK_APP_RUNNING',
    '  Var /GLOBAL CmdPath',
    '  Var /GLOBAL PowerShellPath',
    '  Var /GLOBAL processPathFilter',
    '  StrCpy $CmdPath "$SYSDIR\\cmd.exe"',
    '  StrCpy $PowerShellPath "$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe"',
    '  Push $R8',
    '  Push $R9',
    '  StrCpy $R8 $INSTDIR',
    '  !insertmacro TRIM_TRAILING_BACKSLASHES $R8 $R9',
    '  ${WordReplace} $R8 "\'" "\'\'" "+" $R8',
    '  StrCpy $processPathFilter "$$_.Path.StartsWith(\'$R8\\\', \'CurrentCultureIgnoreCase\')"',
    '  !ifndef BUILD_UNINSTALLER',
    '    Push $R7',
    '    !insertmacro APPEND_INSTALL_LOCATION_TO_PROCESS_PATH_FILTER HKCU',
    '    !insertmacro APPEND_INSTALL_LOCATION_TO_PROCESS_PATH_FILTER HKLM',
    '    Pop $R7',
    '  !endif',
    '  Pop $R9',
    '  Pop $R8',
    '  !ifmacrodef customCheckAppRunning',
    '    !insertmacro customCheckAppRunning',
    '  !else',
    '    !insertmacro IS_POWERSHELL_AVAILABLE',
    '    !insertmacro _CHECK_APP_RUNNING',
    '  !endif',
    '!macroend'
  ].join('\n');

  allowSource = replaceOnce(allowSource, oldCheck, newCheck, 'CHECK_APP_RUNNING');

  allowSource = replaceOnce(
    allowSource,
    'nsExec::Exec `"$PowerShellPath" -C "if ((Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith(\'$INSTDIR\', \'CurrentCultureIgnoreCase\')}).Count -gt 0) { exit 0 } else { exit 1 }"`',
    'nsExec::Exec `"$PowerShellPath" -C "if ((Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and ($processPathFilter)}).Count -gt 0) { exit 0 } else { exit 1 }"`',
    'FIND_PROCESS PowerShell filter'
  );

  allowSource = replaceOnce(
    allowSource,
    'nsExec::Exec `"$PowerShellPath" -C "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith(\'$INSTDIR\', \'CurrentCultureIgnoreCase\')} | % { Stop-Process -Id $$_.ProcessId $0 }"`',
    'nsExec::Exec `"$PowerShellPath" -C "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and ($processPathFilter)} | % { Stop-Process -Id $$_.ProcessId $0 }"`',
    'KILL_PROCESS PowerShell filter'
  );

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

console.log(`electron-builder NSIS compatibility patch: OK (app-builder-lib ${appBuilderLibVersion})`);

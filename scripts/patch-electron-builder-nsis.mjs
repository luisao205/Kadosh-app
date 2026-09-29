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
const compatibilityMarker = '# Kadosh compatibility: exact executable-name process matching';
const legacyCmdPathToken = '"$CmdPath"';
const directCmdPathToken = '"$SYSDIR\\cmd.exe"';

// Repair node_modules that were already patched by an older Kadosh build script.
// Without this, the marker makes the patch look complete even though the old
// macro still references $CmdPath in a scope where NSIS has not declared it.
if (allowSource.includes(compatibilityMarker) && allowSource.includes(legacyCmdPathToken)) {
  allowSource = allowSource.replaceAll(legacyCmdPathToken, directCmdPathToken);
  writeFileSync(allowPath, allowSource, 'utf8');
}

if (!allowSource.includes(compatibilityMarker)) {
  const findStart = allowSource.indexOf('!macro FIND_PROCESS _FILE _RETURN');
  const killStart = allowSource.indexOf('!macro KILL_PROCESS _FILE _FORCE');
  const checkStart = allowSource.indexOf('!macro _CHECK_APP_RUNNING');

  if (findStart < 0 || killStart < 0 || checkStart < 0 || !(findStart < killStart && killStart < checkStart)) {
    fail(`no se encontraron los macros FIND_PROCESS/KILL_PROCESS esperados en app-builder-lib ${appBuilderLibVersion}`);
  }

  const exactProcessMacros = `${compatibilityMarker}\n!macro FIND_PROCESS _FILE _RETURN\n  !ifdef INSTALL_MODE_PER_ALL_USERS\n    nsExec::Exec \`\"$SYSDIR\\cmd.exe\" /C tasklist /FI \"IMAGENAME eq \${_FILE}\" /FO CSV /NH | \"$SYSDIR\\findstr.exe\" /B /I /C:\"\\\"\${_FILE}\\\"\"\`\n    Pop \${_RETURN}\n  !else\n    nsExec::Exec \`\"$SYSDIR\\cmd.exe\" /C tasklist /FI \"USERNAME eq %USERNAME%\" /FI \"IMAGENAME eq \${_FILE}\" /FO CSV /NH | \"$SYSDIR\\findstr.exe\" /B /I /C:\"\\\"\${_FILE}\\\"\"\`\n    Pop \${_RETURN}\n  !endif\n!macroend\n\n!macro KILL_PROCESS _FILE _FORCE\n  Push $0\n  \${if} \${_FORCE} == 1\n    StrCpy $0 \"/F\"\n  \${else}\n    StrCpy $0 \"\"\n  \${endIf}\n\n  !ifdef INSTALL_MODE_PER_ALL_USERS\n    nsExec::Exec \`\"$SYSDIR\\cmd.exe\" /C taskkill $0 /IM \"\${_FILE}\" /FI \"PID ne $pid\"\`\n  !else\n    nsExec::Exec \`\"$SYSDIR\\cmd.exe\" /C taskkill $0 /IM \"\${_FILE}\" /FI \"PID ne $pid\" /FI \"USERNAME eq %USERNAME%\"\`\n  !endif\n  Pop $0\n!macroend \n\n`;

  allowSource = `${allowSource.slice(0, findStart)}${exactProcessMacros}${allowSource.slice(checkStart)}`;
  writeFileSync(allowPath, allowSource, 'utf8');
}

let installUtilSource = readFileSync(installUtilPath, 'utf8');
const oldRetry = 'MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY OneMoreAttempt';
const newRetry = 'MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(uninstallFailed): $R0" /SD IDCANCEL IDRETRY OneMoreAttempt';

if (installUtilSource.includes(oldRetry)) {
  installUtilSource = installUtilSource.replace(oldRetry, newRetry);
} else if (!installUtilSource.includes(newRetry)) {
  fail(`no se encontró el bloque esperado de uninstallOldVersion en app-builder-lib ${appBuilderLibVersion}`);
}

// Preserve DisplayVersion before the old uninstaller runs. A failing legacy
// uninstaller can remove its registry entry before returning exit code 2, so
// re-reading DisplayVersion in CheckResult is too late.
const previousVersionVar = '  Var /GLOBAL kadoshPreviousVersion';
if (!installUtilSource.includes(previousVersionVar)) {
  installUtilSource = replaceOnce(
    installUtilSource,
    '  Var /GLOBAL rootKey',
    ['  Var /GLOBAL rootKey', previousVersionVar].join('\n'),
    'cached previous version variable'
  );
}

const previousVersionRead = '  !insertmacro readReg $kadoshPreviousVersion "$rootKey" "${UNINSTALL_REGISTRY_KEY}" DisplayVersion';
if (!installUtilSource.includes(previousVersionRead)) {
  installUtilSource = replaceOnce(
    installUtilSource,
    '  Exch $rootKey',
    ['  Exch $rootKey', '', previousVersionRead].join('\n'),
    'cached previous version read'
  );
}

const legacyPreflightMarker = '# Kadosh legacy 1.1.1 migration: accept a program directory already quarantined by a previous attempt';
if (!installUtilSource.includes(legacyPreflightMarker)) {
  const oldUninstallerTempLine = '  StrCpy $uninstallerFileNameTemp "$PLUGINSDIR\\old-uninstaller.exe"';
  const legacyPreflight = [
    `  ${legacyPreflightMarker}`,
    '  ${if} $kadoshPreviousVersion == "1.1.1"',
    '    StrCpy $R3 "$installationDir.legacy-1.1.1"',
    '    IfFileExists "$R3\\*.*" 0 LegacyKadoshPreflightDone',
    '    IfFileExists "$installationDir\\*.*" LegacyKadoshPreflightDone 0',
    '    DetailPrint "Legacy Kadosh 1.1.1 program directory was already quarantined; continuing migration."',
    '    StrCpy $R0 0',
    '    ClearErrors',
    '    Return',
    '  ${endIf}',
    '  LegacyKadoshPreflightDone:',
    '',
    oldUninstallerTempLine
  ].join('\n');

  installUtilSource = replaceOnce(
    installUtilSource,
    oldUninstallerTempLine,
    legacyPreflight,
    'legacy 1.1.1 already-quarantined preflight'
  );
}

// Repair node_modules already patched by the previous preflight version.
installUtilSource = installUtilSource.replace(
  [
    '  !insertmacro readReg $R4 "$rootKey" "${UNINSTALL_REGISTRY_KEY}" DisplayVersion',
    '  ${if} $R4 == "1.1.1"'
  ].join('\n'),
  '  ${if} $kadoshPreviousVersion == "1.1.1"'
);

const legacyCheckResult = [
  '    CheckResult:',
  '      ${if} $R0 == 0',
  '        Return',
  '      ${endIf}',
  '',
  '    Sleep 1000',
  '    Goto UninstallLoop'
].join('\n');

const legacyMigrationMarker = '# Kadosh legacy 1.1.1 migration: quarantine old program directory after legacy uninstaller exit code 2';
const legacyMigrationResult = [
  '    CheckResult:',
  '      ${if} $R0 == 0',
  '        Return',
  '      ${endIf}',
  '',
  `    ${legacyMigrationMarker}`,
  '    ${if} $R0 == 2',
  '      ${if} $kadoshPreviousVersion == "1.1.1"',
  '        !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R1',
  '        ${if} $R1 != 0',
  '          StrCpy $R3 "$installationDir.legacy-1.1.1"',
  '          IfFileExists "$R3\\*.*" LegacyKadoshMigrationFailed 0',
  '          ClearErrors',
  '          Rename "$installationDir" "$R3"',
  '          IfErrors LegacyKadoshMigrationFailed LegacyKadoshMigrationSucceeded',
  '          LegacyKadoshMigrationSucceeded:',
  '            DetailPrint "Legacy Kadosh 1.1.1 program directory quarantined for safe migration."',
  '            StrCpy $R0 0',
  '            ClearErrors',
  '            Return',
  '          LegacyKadoshMigrationFailed:',
  '            DetailPrint "Legacy Kadosh migration could not quarantine: $installationDir"',
  '        ${endIf}',
  '      ${endIf}',
  '    ${endIf}',
  '',
  '    Sleep 1000',
  '    Goto UninstallLoop'
].join('\n');

if (!installUtilSource.includes(legacyMigrationMarker)) {
  installUtilSource = replaceOnce(
    installUtilSource,
    legacyCheckResult,
    legacyMigrationResult,
    'legacy 1.1.1 quarantine fallback'
  );
}

// Repair node_modules already patched by the previous fallback version.
installUtilSource = installUtilSource.replace(
  [
    '      !insertmacro readReg $R2 "$rootKey" "${UNINSTALL_REGISTRY_KEY}" DisplayVersion',
    '      ${if} $R2 == "1.1.1"'
  ].join('\n'),
  '      ${if} $kadoshPreviousVersion == "1.1.1"'
);

// Repair node_modules already patched by the migration version that did not
// reset $R0 after a successful quarantine.
const legacySuccessWithoutReset = [
  '          LegacyKadoshMigrationSucceeded:',
  '            DetailPrint "Legacy Kadosh 1.1.1 program directory quarantined for safe migration."',
  '            ClearErrors',
  '            Return'
].join('\n');
const legacySuccessWithReset = [
  '          LegacyKadoshMigrationSucceeded:',
  '            DetailPrint "Legacy Kadosh 1.1.1 program directory quarantined for safe migration."',
  '            StrCpy $R0 0',
  '            ClearErrors',
  '            Return'
].join('\n');

if (installUtilSource.includes(legacySuccessWithoutReset)) {
  installUtilSource = installUtilSource.replace(legacySuccessWithoutReset, legacySuccessWithReset);
}

writeFileSync(installUtilPath, installUtilSource, 'utf8');

console.log(`electron-builder NSIS compatibility patch: OK (app-builder-lib ${appBuilderLibVersion}, tasklist exact name + legacy 1.1.1 migration)`);

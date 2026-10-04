import fs from 'node:fs';

const packagePath = 'package.json';
const lockPath = 'package-lock.json';
const androidPath = 'android/app/build.gradle';

for (const file of [packagePath, lockPath, androidPath]) {
  if (!fs.existsSync(file)) throw new Error(`No existe ${file}`);
}

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
packageJson.version = '1.1.11';
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

const packageLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
packageLock.version = '1.1.11';
if (packageLock.packages?.['']) packageLock.packages[''].version = '1.1.11';
fs.writeFileSync(lockPath, `${JSON.stringify(packageLock, null, 2)}\n`, 'utf8');

const androidRaw = fs.readFileSync(androidPath, 'utf8');
const eol = androidRaw.includes('\r\n') ? '\r\n' : '\n';
let android = androidRaw.replace(/\r\n/g, '\n');

if (!/versionCode\s+\d+/.test(android)) throw new Error('No se encontró versionCode en Android.');
if (!/versionName\s+"[^"]+"/.test(android)) throw new Error('No se encontró versionName en Android.');

android = android.replace(/versionCode\s+\d+/, 'versionCode 13');
android = android.replace(/versionName\s+"[^"]+"/, 'versionName "1.1.11"');
fs.writeFileSync(androidPath, android.replace(/\n/g, eol), 'utf8');

console.log('Kadosh App 1.1.11 / Android versionCode 13');

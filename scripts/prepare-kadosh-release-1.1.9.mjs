import fs from 'node:fs';

const targets = [
  'package.json',
  'package-lock.json',
  'android/app/build.gradle',
];
for (const file of targets) {
  if (!fs.existsSync(file)) throw new Error('No existe ' + file);
}

const snapshots = new Map(targets.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const nextVersion = '1.1.9';

const pkg = JSON.parse(snapshots.get('package.json'));
if (pkg.version !== '1.1.8' && pkg.version !== nextVersion) {
  throw new Error('Versión inesperada en package.json: ' + pkg.version);
}
pkg.version = nextVersion;
const packageJson = JSON.stringify(pkg, null, 2) + '\n';

const lock = JSON.parse(snapshots.get('package-lock.json'));
if (lock.version !== '1.1.8' && lock.version !== nextVersion) {
  throw new Error('Versión inesperada en package-lock.json: ' + lock.version);
}
lock.version = nextVersion;
if (lock.packages?.['']) lock.packages[''].version = nextVersion;
const packageLock = JSON.stringify(lock, null, 2) + '\n';

let gradle = snapshots.get('android/app/build.gradle').replace(/\r\n/g, '\n');
const versionCodeMatch = gradle.match(/versionCode\s+(\d+)/);
const versionNameMatch = gradle.match(/versionName\s+"([^"]+)"/);
if (!versionCodeMatch || !versionNameMatch) throw new Error('No se encontraron versionCode/versionName de Android.');
const currentCode = Number(versionCodeMatch[1]);
const currentName = versionNameMatch[1];
if (![10, 11].includes(currentCode)) throw new Error('versionCode inesperado: ' + currentCode);
if (!['1.1.8', nextVersion].includes(currentName)) throw new Error('versionName inesperado: ' + currentName);
gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 11');
gradle = gradle.replace(/versionName\s+"[^"]+"/, 'versionName "' + nextVersion + '"');
const gradleEol = snapshots.get('android/app/build.gradle').includes('\r\n') ? '\r\n' : '\n';
gradle = gradle.replace(/\n/g, gradleEol);

try {
  fs.writeFileSync('package.json', packageJson, 'utf8');
  fs.writeFileSync('package-lock.json', packageLock, 'utf8');
  fs.writeFileSync('android/app/build.gradle', gradle, 'utf8');
  console.log('Release preparada: Kadosh App 1.1.9 / Android versionCode 11.');
} catch (error) {
  for (const [file, content] of snapshots) fs.writeFileSync(file, content, 'utf8');
  throw error;
}

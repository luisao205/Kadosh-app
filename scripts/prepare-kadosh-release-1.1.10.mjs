import fs from 'node:fs';

const VERSION = '1.1.10';
const ANDROID_VERSION_CODE = 12;

const readText = (path) => {
  if (!fs.existsSync(path)) throw new Error(`No existe ${path}`);
  return fs.readFileSync(path, 'utf8');
};

const writePreservingEol = (path, original, next) => {
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(path, next.replace(/\r?\n/g, eol), 'utf8');
};

const packagePath = 'package.json';
const lockPath = 'package-lock.json';
const gradlePath = 'android/app/build.gradle';

const packageRaw = readText(packagePath);
const packageJson = JSON.parse(packageRaw);
packageJson.version = VERSION;
writePreservingEol(packagePath, packageRaw, `${JSON.stringify(packageJson, null, 2)}\n`);

const lockRaw = readText(lockPath);
const lockJson = JSON.parse(lockRaw);
lockJson.version = VERSION;
if (lockJson.packages?.['']) lockJson.packages[''].version = VERSION;
writePreservingEol(lockPath, lockRaw, `${JSON.stringify(lockJson, null, 2)}\n`);

const gradleRaw = readText(gradlePath);
let gradleNext = gradleRaw
  .replace(/versionCode\s+\d+/, `versionCode ${ANDROID_VERSION_CODE}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${VERSION}"`);

if (!gradleNext.includes(`versionCode ${ANDROID_VERSION_CODE}`)) throw new Error('No se pudo actualizar Android versionCode.');
if (!gradleNext.includes(`versionName "${VERSION}"`)) throw new Error('No se pudo actualizar Android versionName.');
writePreservingEol(gradlePath, gradleRaw, gradleNext);

const packageCheck = JSON.parse(readText(packagePath));
const lockCheck = JSON.parse(readText(lockPath));
const gradleCheck = readText(gradlePath);

if (packageCheck.version !== VERSION) throw new Error('package.json no quedó en 1.1.10.');
if (lockCheck.version !== VERSION || lockCheck.packages?.['']?.version !== VERSION) throw new Error('package-lock.json no quedó en 1.1.10.');
if (!gradleCheck.includes(`versionCode ${ANDROID_VERSION_CODE}`) || !gradleCheck.includes(`versionName "${VERSION}"`)) throw new Error('Android no quedó en 1.1.10 / versionCode 12.');

console.log(`Kadosh App ${VERSION} / Android versionCode ${ANDROID_VERSION_CODE}`);

import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(process.argv[2] || process.cwd());
const read = async (relative) => fs.readFile(path.join(repo, relative), 'utf8');
const write = async (relative, content) => fs.writeFile(path.join(repo, relative), content, 'utf8');
const backup = async (relative, content) => fs.writeFile(path.join(repo, `${relative}.pre-chatgpt`), content, 'utf8');

const biblePath = 'src/utils/bibleService.js';
let bible = await read(biblePath);
await backup(biblePath, bible);
if (!bible.includes("translationId: 'local:rvc'")) {
  const needle = "const LOCAL_TRANSLATIONS = [\n  { id: 'rvr1960', translationId: 'local:rvr1960' },";
  if (!bible.includes(needle)) throw new Error('No se encontro el registro LOCAL_TRANSLATIONS esperado en bibleService.js.');
  bible = bible.replace(needle, `${needle}\n  { id: 'rvc', translationId: 'local:rvc' },`);
  await write(biblePath, bible);
  console.log('OK bibleService.js: RVC registrada.');
} else {
  console.log('SKIP bibleService.js: RVC ya estaba registrada.');
}

const mediaUtilsPath = 'src/utils/mediaUtils.js';
let mediaUtils = await read(mediaUtilsPath);
await backup(mediaUtilsPath, mediaUtils);
if (!mediaUtils.includes('getVideoThumbnailUrl')) {
  mediaUtils = `${mediaUtils.trimEnd()}\n\nexport const getVideoThumbnailUrl = (mediaOrUrl = '') => {\n  const media = typeof mediaOrUrl === 'string' ? { url: mediaOrUrl } : (mediaOrUrl || {});\n  const explicitThumbnail = String(media.thumbnailUrl || media.thumbnail_url || '').trim();\n  if (explicitThumbnail) return explicitThumbnail;\n\n  const url = String(media.url || '').trim();\n  if (!url || !isVideoMediaUrl(url)) return '';\n\n  const [baseUrl, query = ''] = url.split('?');\n  if (!baseUrl.includes('res.cloudinary.com') || !baseUrl.includes('/video/upload/')) return '';\n\n  const thumbnailBase = baseUrl\n    .replace('/video/upload/', '/video/upload/so_0,q_auto,f_jpg/')\n    .replace(/\\.(mp4|webm|mov|m4v)$/i, '.jpg');\n  return query ? \`${'${thumbnailBase}'}?${'${query}'}\` : thumbnailBase;\n};\n`;
  await write(mediaUtilsPath, mediaUtils);
  console.log('OK mediaUtils.js: miniatura Cloudinary agregada.');
} else {
  console.log('SKIP mediaUtils.js: helper ya existe.');
}

const controllerPath = 'src/components/live/ProyectorController.jsx';
let controller = await read(controllerPath);
await backup(controllerPath, controller);

const importOld = "import { isVideoMediaUrl } from '../../utils/mediaUtils';";
const importNew = "import { getVideoThumbnailUrl, isVideoMediaUrl } from '../../utils/mediaUtils';";
if (controller.includes(importOld)) controller = controller.replace(importOld, importNew);
else if (!controller.includes('getVideoThumbnailUrl')) throw new Error('No se encontro el import esperado de mediaUtils en ProyectorController.jsx.');

if (!controller.includes('thumbnailUrl: uploaded.thumbnailUrl || getVideoThumbnailUrl')) {
  const uploadRegex = /(const nuevaLib = \[\.\.\.multimediaLib, \{\s*url,\s*type: uploaded\.type \|\| fileType,\s*name: file\.name,\s*)(folder: currentFolder \|\| 'root')/m;
  if (!uploadRegex.test(controller)) throw new Error('No se encontro el bloque de guardado multimedia esperado.');
  controller = controller.replace(uploadRegex, `$1thumbnailUrl: uploaded.thumbnailUrl || getVideoThumbnailUrl({ url, type: uploaded.type || fileType }),\n          $2`);
}

const oldMobilePreview = `<div className="aspect-video bg-zinc-900">\n                    {m.type === 'video' ? <video src={m.url} className="h-full w-full object-cover opacity-70" /> : <img src={m.url} className="h-full w-full object-cover opacity-70" />}\n                  </div>`;
const newMobilePreview = `<div className="aspect-video bg-zinc-900">\n                    {m.type === 'video' && getVideoThumbnailUrl(m) ? (\n                      <img src={getVideoThumbnailUrl(m)} alt={m.name || 'Vista previa de video'} loading="lazy" decoding="async" className="h-full w-full object-cover opacity-80" />\n                    ) : m.type === 'video' ? (\n                      <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover opacity-70" />\n                    ) : (\n                      <img src={m.url} alt={m.name || 'Vista previa multimedia'} loading="lazy" decoding="async" className="h-full w-full object-cover opacity-70" />\n                    )}\n                  </div>`;
if (controller.includes(oldMobilePreview)) {
  controller = controller.replace(oldMobilePreview, newMobilePreview);
} else if (!controller.includes("alt={m.name || 'Vista previa de video'}")) {
  throw new Error('No se encontro el bloque de miniatura movil esperado. No se modifico ese bloque.');
}

await write(controllerPath, controller);
console.log('OK ProyectorController.jsx: preview movil corregida y thumbnail guardada.');

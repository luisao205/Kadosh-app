import fs from 'node:fs';

const files = {
  controller: 'src/components/live/ProyectorController.jsx',
  functionsMain: 'functions/main.js',
  resolver: 'functions/canvaLinkResolver.js',
};

const readNormalized = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return { eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') };
};

const writeNormalized = (filePath, text, eol) => {
  fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
};

const replaceOnce = (source, needle, replacement, label) => {
  if (source.includes(replacement)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return source;
  }
  const index = source.indexOf(needle);
  if (index === -1) throw new Error(`No se encontró: ${label}`);
  console.log(`[ok] ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
};

const controllerFile = readNormalized(files.controller);
let controller = controllerFile.text;
const mainFile = readNormalized(files.functionsMain);
let functionsMain = mainFile.text;

controller = replaceOnce(
  controller,
  `import { doc, getDoc, getDocs, setDoc, onSnapshot, query, collection, where, orderBy, limit, updateDoc, deleteDoc, deleteField, runTransaction, serverTimestamp } from 'firebase/firestore';\nimport { db } from '../../config/firebase';`,
  `import { doc, getDoc, getDocs, setDoc, onSnapshot, query, collection, where, orderBy, limit, updateDoc, deleteDoc, deleteField, runTransaction, serverTimestamp } from 'firebase/firestore';\nimport { httpsCallable } from 'firebase/functions';\nimport { db, functions } from '../../config/firebase';`,
  'Firebase callable para resolver canva.link'
);

controller = replaceOnce(
  controller,
  `const normalizeCanvaEmbedUrl = (value) => {\n  const candidate = extractCanvaUrlCandidate(value);\n  if (!candidate) return '';\n  try {\n    const url = new URL(candidate);\n    const host = url.hostname.toLowerCase();\n    const isCanvaHost = host === 'canva.com' || host.endsWith('.canva.com');\n    if (!isCanvaHost || !url.pathname.includes('/design/') || !url.pathname.includes('/view')) return '';\n    url.hash = '';\n    url.search = '?embed';\n    return url.toString();\n  } catch {\n    return '';\n  }\n};`,
  `const normalizeCanvaEmbedUrl = (value) => {\n  const candidate = extractCanvaUrlCandidate(value);\n  if (!candidate) return '';\n  try {\n    const url = new URL(candidate);\n    const host = url.hostname.toLowerCase();\n    const isCanvaHost = host === 'canva.com' || host.endsWith('.canva.com');\n    if (!isCanvaHost || !url.pathname.includes('/design/') || !url.pathname.includes('/view')) return '';\n    url.hash = '';\n    url.search = '?embed';\n    return url.toString();\n  } catch {\n    return '';\n  }\n};\n\nconst isCanvaShortLink = (value) => {\n  const candidate = extractCanvaUrlCandidate(value);\n  try {\n    return new URL(candidate).hostname.toLowerCase() === 'canva.link';\n  } catch {\n    return false;\n  }\n};\n\nconst resolveCanvaEmbedLink = httpsCallable(functions, 'resolveCanvaEmbedLink');`,
  'detector y callable de enlace corto Canva'
);

controller = replaceOnce(
  controller,
  `  const prepareCanvaPreview = () => {\n    const embedUrl = normalizeCanvaEmbedUrl(canvaDraft.url);\n    if (!embedUrl) {\n      setCanvaPreviewUrl('');\n      setCanvaUrlError('Pega el código de inserción de Canva o un enlace /design/.../view compatible.');\n      return '';\n    }\n    setCanvaUrlError('');\n    setCanvaPreviewUrl(embedUrl);\n    return embedUrl;\n  };\n\n  const projectCanva = async () => {\n    if (!canProjectCanva) {\n      notify('No tienes permiso para proyectar Canva.', { type: 'error' });\n      return;\n    }\n    const embedUrl = normalizeCanvaEmbedUrl(canvaDraft.url);\n    if (!embedUrl) {\n      setCanvaUrlError('Pega el código de inserción de Canva o un enlace /design/.../view compatible.');\n      notify('El enlace de Canva no es compatible para incrustar.', { type: 'error' });\n      return;\n    }\n\n    const sourceUrl = extractCanvaUrlCandidate(canvaDraft.url);`,
  `  const resolveCanvaDraft = async () => {\n    const candidate = extractCanvaUrlCandidate(canvaDraft.url);\n    const directEmbedUrl = normalizeCanvaEmbedUrl(candidate);\n    if (directEmbedUrl) return { sourceUrl: candidate, embedUrl: directEmbedUrl };\n    if (!isCanvaShortLink(candidate)) return null;\n\n    const response = await resolveCanvaEmbedLink({ url: candidate });\n    const sourceUrl = String(response?.data?.sourceUrl || '').trim();\n    const embedUrl = String(response?.data?.embedUrl || '').trim();\n    if (!sourceUrl || !embedUrl || !normalizeCanvaEmbedUrl(embedUrl)) return null;\n    return { sourceUrl, embedUrl };\n  };\n\n  const prepareCanvaPreview = async () => {\n    try {\n      const resolved = await resolveCanvaDraft();\n      if (!resolved) {\n        setCanvaPreviewUrl('');\n        setCanvaUrlError('Pega un enlace canva.link, un enlace /design/.../view o el código de inserción de Canva.');\n        return '';\n      }\n      setCanvaUrlError('');\n      setCanvaPreviewUrl(resolved.embedUrl);\n      return resolved.embedUrl;\n    } catch (error) {\n      console.error('Error resolviendo enlace Canva:', error);\n      setCanvaPreviewUrl('');\n      setCanvaUrlError('No se pudo resolver este enlace corto de Canva. Verifica que sea accesible con el enlace.');\n      return '';\n    }\n  };\n\n  const projectCanva = async () => {\n    if (!canProjectCanva) {\n      notify('No tienes permiso para proyectar Canva.', { type: 'error' });\n      return;\n    }\n\n    let resolved;\n    try {\n      resolved = await resolveCanvaDraft();\n    } catch (error) {\n      console.error('Error resolviendo enlace Canva:', error);\n      setCanvaUrlError('No se pudo resolver este enlace corto de Canva. Verifica que sea accesible con el enlace.');\n      notify('No se pudo resolver el enlace de Canva.', { type: 'error' });\n      return;\n    }\n\n    if (!resolved) {\n      setCanvaUrlError('Pega un enlace canva.link, un enlace /design/.../view o el código de inserción de Canva.');\n      notify('El enlace de Canva no es compatible para incrustar.', { type: 'error' });\n      return;\n    }\n\n    const { sourceUrl, embedUrl } = resolved;`,
  'aceptar canva.link en preview y proyección'
);

controller = replaceOnce(
  controller,
  `                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-zinc-500">Recomendado: en Canva usa Compartir → Insertar y pega aquí el código de inserción. También puedes probar un enlace /design/.../view; Kadosh lo convierte al formato embed correcto sin abrir otra pestaña.</p>`,
  `                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-zinc-500">Puedes pegar directamente el enlace corto que entrega Canva al usar Copiar enlace (canva.link/...), un enlace /design/.../view o el código de Compartir → Insertar. Kadosh resuelve el enlace corto y lo convierte al formato embed.</p>`,
  'ayuda visible para canva.link'
);

controller = replaceOnce(
  controller,
  `                        placeholder="Pega el enlace /view o el <iframe> de Compartir → Insertar"`,
  `                        placeholder="https://canva.link/... o enlace /view o <iframe> de Canva"`,
  'placeholder para enlace corto Canva'
);

functionsMain = replaceOnce(
  functionsMain,
  `Object.assign(exports, require('./permissionManagement')({ functions, admin }));`,
  `Object.assign(exports, require('./permissionManagement')({ functions, admin }));\nexports.resolveCanvaEmbedLink = require('./canvaLinkResolver')({ functions });`,
  'exportar resolver seguro de Canva'
);

const resolver = `/* global module */\n\nconst allowedCanvaHost = (hostname) => {\n  const host = String(hostname || '').toLowerCase();\n  return host === 'canva.link' || host === 'canva.com' || host.endsWith('.canva.com');\n};\n\nconst toEmbedUrl = (value) => {\n  const url = new URL(value);\n  if (!(url.hostname === 'canva.com' || url.hostname.endsWith('.canva.com'))) return '';\n  if (!url.pathname.includes('/design/') || !url.pathname.includes('/view')) return '';\n  url.hash = '';\n  url.search = '?embed';\n  return url.toString();\n};\n\nconst resolveRedirectChain = async (initialUrl) => {\n  let current = new URL(initialUrl);\n  for (let hop = 0; hop < 6; hop += 1) {\n    if (!allowedCanvaHost(current.hostname)) throw new Error('Dominio de redirección no permitido.');\n    const controller = new AbortController();\n    const timeout = setTimeout(() => controller.abort(), 7000);\n    let response;\n    try {\n      response = await fetch(current.toString(), {\n        method: 'GET',\n        redirect: 'manual',\n        signal: controller.signal,\n        headers: { 'user-agent': 'Kadosh-Canva-Resolver/1.0' },\n      });\n    } finally {\n      clearTimeout(timeout);\n    }\n\n    const location = response.headers.get('location');\n    if (response.status >= 300 && response.status < 400 && location) {\n      const next = new URL(location, current);\n      if (!allowedCanvaHost(next.hostname)) throw new Error('Canva redirigió fuera de sus dominios.');\n      current = next;\n      continue;\n    }\n\n    try { await response.body?.cancel(); } catch {}\n    return current.toString();\n  }\n  throw new Error('Demasiadas redirecciones en el enlace de Canva.');\n};\n\nmodule.exports = ({ functions }) => functions.https.onCall(async (data, context) => {\n  if (!context.auth?.uid) {\n    throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');\n  }\n\n  const raw = String(data?.url || '').trim();\n  if (!raw || raw.length > 2048) {\n    throw new functions.https.HttpsError('invalid-argument', 'Enlace de Canva inválido.');\n  }\n\n  let input;\n  try { input = new URL(raw); } catch {\n    throw new functions.https.HttpsError('invalid-argument', 'Enlace de Canva inválido.');\n  }\n\n  if (input.hostname.toLowerCase() !== 'canva.link') {\n    throw new functions.https.HttpsError('invalid-argument', 'Solo se resuelven enlaces cortos canva.link.');\n  }\n\n  try {\n    const sourceUrl = await resolveRedirectChain(input.toString());\n    const embedUrl = toEmbedUrl(sourceUrl);\n    if (!embedUrl) {\n      throw new Error('El enlace corto no terminó en una vista pública de diseño Canva.');\n    }\n    return { sourceUrl, embedUrl };\n  } catch (error) {\n    console.error('Error resolviendo canva.link:', error);\n    throw new functions.https.HttpsError('failed-precondition', 'No se pudo convertir este enlace de Canva a una presentación incrustable.');\n  }\n});\n`;

const validations = [
  [controller, `httpsCallable(functions, 'resolveCanvaEmbedLink')`, 'callable en controller'],
  [controller, `isCanvaShortLink`, 'soporte canva.link'],
  [controller, `const { sourceUrl, embedUrl } = resolved;`, 'proyección resuelta'],
  [functionsMain, `exports.resolveCanvaEmbedLink`, 'export de resolver'],
  [resolver, `input.hostname.toLowerCase() !== 'canva.link'`, 'restricción de dominio'],
  [resolver, `url.search = '?embed';`, 'formato embed'],
];
for (const [text, needle, label] of validations) {
  if (!text.includes(needle)) throw new Error(`Validación falló: ${label}`);
}

// Escribir únicamente después de que todas las transformaciones y validaciones pasen.
writeNormalized(files.controller, controller, controllerFile.eol);
writeNormalized(files.functionsMain, functionsMain, mainFile.eol);
fs.writeFileSync(files.resolver, resolver, 'utf8');

console.log('Fix Canva v3 aplicado: canva.link se resuelve de forma segura en backend (3 archivos).');

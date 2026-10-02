import fs from 'node:fs';

const files = {
  controller: 'src/components/live/ProyectorController.jsx',
  permissions: 'src/utils/permissions.js',
  presets: 'src/utils/permissionPresets.js',
  functionPermissions: 'functions/permissionManagement.js',
  rules: 'firestore.rules',
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

const replaceAllCounted = (source, needle, replacement, label, expectedMinimum = 1) => {
  if (source.includes(replacement) && !source.includes(needle)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return source;
  }
  const count = source.split(needle).length - 1;
  if (count < expectedMinimum) throw new Error(`No se encontró suficiente veces: ${label} (${count}).`);
  console.log(`[ok] ${label}: ${count} reemplazo(s)`);
  return source.split(needle).join(replacement);
};

// 1) Controller: official Canva embed input + permission guard.
const controllerFile = readNormalized(files.controller);
let controller = controllerFile.text;

controller = replaceOnce(
  controller,
  `const normalizeCanvaEmbedUrl = (value) => {\n  const raw = String(value || '').trim();\n  if (!raw) return '';\n  try {\n    const url = new URL(raw);\n    const host = url.hostname.toLowerCase();\n    const isCanvaHost = host === 'canva.com' || host.endsWith('.canva.com');\n    if (!isCanvaHost || !url.pathname.includes('/design/') || !url.pathname.includes('/view')) return '';\n    url.searchParams.set('embed', '');\n    return url.toString();\n  } catch {\n    return '';\n  }\n};`,
  `const extractCanvaUrlCandidate = (value) => {\n  const raw = String(value || '').trim();\n  if (!raw) return '';\n  const iframeMatch = raw.match(/<iframe[^>]*\\bsrc=(['\"])(.*?)\\1/i);\n  return String(iframeMatch?.[2] || raw).replace(/&amp;/g, '&').trim();\n};\n\nconst normalizeCanvaEmbedUrl = (value) => {\n  const candidate = extractCanvaUrlCandidate(value);\n  if (!candidate) return '';\n  try {\n    const url = new URL(candidate);\n    const host = url.hostname.toLowerCase();\n    const isCanvaHost = host === 'canva.com' || host.endsWith('.canva.com');\n    if (!isCanvaHost || !url.pathname.includes('/design/') || !url.pathname.includes('/view')) return '';\n    url.hash = '';\n    url.search = '?embed';\n    return url.toString();\n  } catch {\n    return '';\n  }\n};`,
  'normalización Canva: iframe o /view con ?embed exacto'
);

controller = replaceOnce(
  controller,
  `  const canQuickProject = hasPermission(user, 'bible.quickProjection');\n  const controllerScreens = [`,
  `  const canQuickProject = hasPermission(user, 'bible.quickProjection');\n  const canProjectCanva = hasPermission(user, 'canva.project');\n  const controllerScreens = [`,
  'permiso Canva en Controlador'
);

controller = replaceOnce(
  controller,
  `  const projectCanva = async () => {\n    const embedUrl = normalizeCanvaEmbedUrl(canvaDraft.url);`,
  `  const projectCanva = async () => {\n    if (!canProjectCanva) {\n      notify('No tienes permiso para proyectar Canva.', { type: 'error' });\n      return;\n    }\n    const embedUrl = normalizeCanvaEmbedUrl(canvaDraft.url);`,
  'guard de permiso al proyectar Canva'
);

controller = replaceOnce(
  controller,
  `    const sourceUrl = String(canvaDraft.url || '').trim();\n    const title = String(canvaDraft.title || '').trim() || 'Presentación Canva';`,
  `    const sourceUrl = extractCanvaUrlCandidate(canvaDraft.url);\n    const title = String(canvaDraft.title || '').trim() || 'Presentación Canva';`,
  'guardar URL Canva, no código iframe completo'
);

controller = replaceOnce(
  controller,
  `              ['bible', 'Biblia', BookOpen],\n              ['canva', 'Canva', Tv],\n              ['media', 'Multimedia', Film]`,
  `              ['bible', 'Biblia', BookOpen],\n              ...(canProjectCanva ? [['canva', 'Canva', Tv]] : []),\n              ['media', 'Multimedia', Film]`,
  'ocultar pestaña Canva sin permiso'
);

controller = replaceAllCounted(
  controller,
  `Usa un enlace público de Canva en modo ver, por ejemplo .../design/.../view.`,
  `Pega el código de inserción de Canva o un enlace /design/.../view compatible.`,
  'mensajes de enlace Canva',
  2
);

controller = replaceOnce(
  controller,
  `                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-zinc-500">Pega un enlace público de Canva en modo Ver. Kadosh lo incrusta sin abrir otra pestaña y conserva debajo el contenido que ya estaba proyectado.</p>`,
  `                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-zinc-500">Recomendado: en Canva usa Compartir → Insertar y pega aquí el código de inserción. También puedes probar un enlace /design/.../view; Kadosh lo convierte al formato embed correcto sin abrir otra pestaña.</p>`,
  'ayuda oficial para insertar Canva'
);

controller = replaceOnce(
  controller,
  `                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Enlace público de Canva</span>`,
  `                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Enlace o código de inserción de Canva</span>`,
  'etiqueta de entrada Canva'
);

controller = replaceOnce(
  controller,
  `                        placeholder="https://www.canva.com/design/.../view"`,
  `                        placeholder="Pega el enlace /view o el <iframe> de Compartir → Insertar"`,
  'placeholder Canva'
);

// 2) Client permission catalog and Admin permission UI.
const permissionsFile = readNormalized(files.permissions);
let permissions = permissionsFile.text;

permissions = replaceOnce(
  permissions,
  `  MULTIMEDIA_LIBRARY_VIEW: 'multimedia.libraryView', MULTIMEDIA_UPLOAD: 'multimedia.upload', MULTIMEDIA_EDIT: 'multimedia.edit', MULTIMEDIA_DELETE: 'multimedia.delete', MULTIMEDIA_CENTRAL_ACCESS: 'multimedia.centralAccess', MULTIMEDIA_CONTROL_OUTPUTS: 'multimedia.controlOutputs', MULTIMEDIA_PROJECT: 'multimedia.project',\n  ANNOUNCEMENTS_VIEW:`,
  `  MULTIMEDIA_LIBRARY_VIEW: 'multimedia.libraryView', MULTIMEDIA_UPLOAD: 'multimedia.upload', MULTIMEDIA_EDIT: 'multimedia.edit', MULTIMEDIA_DELETE: 'multimedia.delete', MULTIMEDIA_CENTRAL_ACCESS: 'multimedia.centralAccess', MULTIMEDIA_CONTROL_OUTPUTS: 'multimedia.controlOutputs', MULTIMEDIA_PROJECT: 'multimedia.project',\n  CANVA_PROJECT: 'canva.project',\n  ANNOUNCEMENTS_VIEW:`,
  'permiso CANVA_PROJECT'
);

permissions = replaceOnce(
  permissions,
  `  { id: 'multimedia', label: 'Multimedia', permissions: [PERMISSIONS.MULTIMEDIA_LIBRARY_VIEW, PERMISSIONS.MULTIMEDIA_UPLOAD, PERMISSIONS.MULTIMEDIA_EDIT, PERMISSIONS.MULTIMEDIA_DELETE, PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS, PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS, PERMISSIONS.MULTIMEDIA_PROJECT] },\n  { id: 'announcements',`,
  `  { id: 'multimedia', label: 'Multimedia', permissions: [PERMISSIONS.MULTIMEDIA_LIBRARY_VIEW, PERMISSIONS.MULTIMEDIA_UPLOAD, PERMISSIONS.MULTIMEDIA_EDIT, PERMISSIONS.MULTIMEDIA_DELETE, PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS, PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS, PERMISSIONS.MULTIMEDIA_PROJECT] },\n  { id: 'canva', label: 'Canva', permissions: [PERMISSIONS.CANVA_PROJECT] },\n  { id: 'announcements',`,
  'grupo Canva en Administración de permisos'
);

permissions = replaceOnce(
  permissions,
  `Object.assign(labels, {\n  'songs.manageMedia': 'Gestionar archivos de canciones',\n  'songs.archive': 'Archivar y restaurar canciones'\n});`,
  `Object.assign(labels, {\n  'songs.manageMedia': 'Gestionar archivos de canciones',\n  'songs.archive': 'Archivar y restaurar canciones',\n  'canva.project': 'Proyectar Canva'\n});`,
  'etiqueta Proyectar Canva'
);

permissions = replaceAllCounted(
  permissions,
  `PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS, PERMISSIONS.MULTIMEDIA_PROJECT),`,
  `PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS, PERMISSIONS.MULTIMEDIA_PROJECT, PERMISSIONS.CANVA_PROJECT),`,
  'Canva por defecto para admin y multimedia',
  2
);

// 3) Permission presets.
const presetsFile = readNormalized(files.presets);
let presets = presetsFile.text;
presets = replaceAllCounted(
  presets,
  `  PERMISSIONS.MULTIMEDIA_PROJECT,`,
  `  PERMISSIONS.MULTIMEDIA_PROJECT,\n  PERMISSIONS.CANVA_PROJECT,`,
  'Canva en presets Multimedia',
  2
);

// 4) Cloud Functions permission catalog.
const functionFile = readNormalized(files.functionPermissions);
let functionPermissions = functionFile.text;
functionPermissions = replaceOnce(
  functionPermissions,
  `  'multimedia.libraryView', 'multimedia.upload', 'multimedia.edit', 'multimedia.delete', 'multimedia.centralAccess', 'multimedia.controlOutputs', 'multimedia.project',\n  'announcements.view',`,
  `  'multimedia.libraryView', 'multimedia.upload', 'multimedia.edit', 'multimedia.delete', 'multimedia.centralAccess', 'multimedia.controlOutputs', 'multimedia.project',\n  'canva.project',\n  'announcements.view',`,
  'Canva en catálogo de permisos de Functions'
);

// 5) Firestore rules: authorize and validate only the new Canva projector state.
const rulesFile = readNormalized(files.rules);
let rules = rulesFile.text;

rules = replaceOnce(
  rules,
  `      return (resource.data.projectorState is map && resource.data.projectorState.contentType == 'bible'\n          && isExactBibleRestore() && hasPermission('bible.project'))\n        || (state is map && (`,
  `      return (resource.data.projectorState is map && resource.data.projectorState.contentType == 'bible'\n          && isExactBibleRestore() && hasPermission('bible.project'))\n        || (resource.data.projectorState is map && resource.data.projectorState.contentType == 'canva'\n          && isExactCanvaRestore() && hasPermission('canva.project'))\n        || (state is map && (`,
  'permiso para restaurar Canva'
);

rules = replaceOnce(
  rules,
  `          || (state.type in ['media', 'lyrics'] && state.contentType in ['media', 'lyrics'] && hasPermission('multimedia.project'))\n          || (state.type == 'announcement'`,
  `          || (state.type in ['media', 'lyrics'] && state.contentType in ['media', 'lyrics'] && hasPermission('multimedia.project'))\n          || (state.type == 'canva' && state.contentType == 'canva' && hasPermission('canva.project'))\n          || (state.type == 'announcement'`,
  'permiso para proyectar Canva'
);

rules = replaceOnce(
  rules,
  `    function validMediaProjectorState() {`,
  `    function canvaProjectionFields() {\n      return ['projectorState', 'proyectorApagado', 'proyectorLogo'];\n    }\n\n    function canvaPreviousProjectorStateIsTrusted() {\n      let state = request.resource.data.projectorState;\n      let previous = state.previousProjectorState;\n      return (resource.data.projectorState is map\n          && resource.data.projectorState.type == 'canva'\n          && resource.data.projectorState.contentType == 'canva'\n          && previous == resource.data.projectorState.previousProjectorState)\n        || (resource.data.projectorState is map\n          && resource.data.projectorState.type != 'canva'\n          && previous == resource.data.projectorState);\n    }\n\n    function validCanvaProjectorState() {\n      let state = request.resource.data.projectorState;\n      return projectorStateIs('canva', 'canva')\n        && state.keys().hasOnly([\n          'type', 'contentType', 'title', 'canva', 'previousProjectorState',\n          'sourceActor', 'actorUid', 'actorName', 'updatedAt',\n          'projectionVersion', 'projectionActionId'\n        ])\n        && state.title is string\n        && state.canva is map\n        && state.canva.keys().hasOnly(['sourceUrl', 'embedUrl'])\n        && state.canva.sourceUrl is string\n        && state.canva.embedUrl is string\n        && state.sourceActor == 'multimedia'\n        && state.actorName is string\n        && state.updatedAt is int\n        && state.projectionVersion is int\n        && state.projectionActionId is string\n        && request.resource.data.proyectorApagado == false\n        && request.resource.data.proyectorLogo == false\n        && onlyEventKeys(canvaProjectionFields())\n        && canvaPreviousProjectorStateIsTrusted();\n    }\n\n    function isExactCanvaRestore() {\n      return resource.data.projectorState is map\n        && resource.data.projectorState.type == 'canva'\n        && resource.data.projectorState.contentType == 'canva'\n        && request.resource.data.projectorState == resource.data.projectorState.previousProjectorState\n        && onlyEventKeys(['projectorState']);\n    }\n\n    function validMediaProjectorState() {`,
  'validación estricta del estado Canva'
);

rules = replaceOnce(
  rules,
  `      return (resource.data.projectorState is map && resource.data.projectorState.contentType == 'bible'\n          && isExactBibleRestore() && onlyEventKeys(bibleProjectionFields()))\n        || (state is map && (`,
  `      return (resource.data.projectorState is map && resource.data.projectorState.contentType == 'bible'\n          && isExactBibleRestore() && onlyEventKeys(bibleProjectionFields()))\n        || (resource.data.projectorState is map && resource.data.projectorState.contentType == 'canva'\n          && isExactCanvaRestore())\n        || (state is map && (`,
  'restore Canva válido en reglas'
);

rules = replaceOnce(
  rules,
  `          || (state.type == 'media' && state.contentType == 'media' && validMediaProjectorState())\n          || (state.type == 'lyrics'`,
  `          || (state.type == 'media' && state.contentType == 'media' && validMediaProjectorState())\n          || (state.type == 'canva' && state.contentType == 'canva' && validCanvaProjectorState())\n          || (state.type == 'lyrics'`,
  'estado Canva válido en reglas'
);

// Sanity checks before writing any file.
const requiredController = [
  `url.search = '?embed';`,
  `const canProjectCanva = hasPermission(user, 'canva.project');`,
  `...(canProjectCanva ? [['canva', 'Canva', Tv]] : []),`,
  `Compartir → Insertar`,
];
const requiredPermissions = [`CANVA_PROJECT: 'canva.project'`, `{ id: 'canva', label: 'Canva'`, `'canva.project': 'Proyectar Canva'`];
const requiredRules = [`hasPermission('canva.project')`, `function validCanvaProjectorState()`, `function isExactCanvaRestore()`];
for (const value of requiredController) if (!controller.includes(value)) throw new Error(`Validación controller falló: ${value}`);
for (const value of requiredPermissions) if (!permissions.includes(value)) throw new Error(`Validación permisos falló: ${value}`);
for (const value of requiredRules) if (!rules.includes(value)) throw new Error(`Validación rules falló: ${value}`);
if (!functionPermissions.includes(`'canva.project'`)) throw new Error('Validación Functions falló: canva.project');
if (!presets.includes('PERMISSIONS.CANVA_PROJECT')) throw new Error('Validación presets falló: CANVA_PROJECT');

writeNormalized(files.controller, controller, controllerFile.eol);
writeNormalized(files.permissions, permissions, permissionsFile.eol);
writeNormalized(files.presets, presets, presetsFile.eol);
writeNormalized(files.functionPermissions, functionPermissions, functionFile.eol);
writeNormalized(files.rules, rules, rulesFile.eol);

console.log('Fix Canva aplicado: embed oficial, permiso administrable y reglas Firestore (5 archivos).');

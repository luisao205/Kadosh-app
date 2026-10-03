import fs from 'node:fs';

const files = {
  permissions: 'src/utils/permissions.js',
  presets: 'src/utils/permissionPresets.js',
  rolePermissions: 'src/utils/rolePermissions.js',
  rules: 'firestore.rules',
  controller: 'src/components/live/ProyectorController.jsx',
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`No existe ${file}`);
}

const originals = new Map();
const eols = new Map();
const read = (file) => {
  const raw = fs.readFileSync(file, 'utf8');
  originals.set(file, raw);
  eols.set(file, raw.includes('\r\n') ? '\r\n' : '\n');
  return raw.replace(/\r\n/g, '\n');
};

const replaceExact = (source, before, after, label) => {
  if (source.includes(after)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return source;
  }
  if (!source.includes(before)) throw new Error(`No se encontró el bloque para ${label}`);
  console.log(`[ok] ${label}`);
  return source.replace(before, after);
};

const insertGuard = (source, signature, marker, guard, label) => {
  if (source.includes(marker)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return source;
  }
  if (!source.includes(signature)) throw new Error(`No se encontró la función para ${label}`);
  console.log(`[ok] ${label}`);
  return source.replace(signature, signature + guard);
};

let permissions = read(files.permissions);
const quickNeedle = 'PERMISSIONS.REHEARSAL_CONTROL, PERMISSIONS.BIBLE_PROJECT, PERMISSIONS.SERMONS_VIEW';
if (!permissions.includes('PERMISSIONS.BIBLE_QUICK_PROJECTION, PERMISSIONS.SERMONS_VIEW')) {
  if (!permissions.includes(quickNeedle)) throw new Error('No se encontró el bloque de defaults Biblia/Predicas.');
  permissions = permissions.replaceAll(
    quickNeedle,
    'PERMISSIONS.REHEARSAL_CONTROL, PERMISSIONS.BIBLE_PROJECT, PERMISSIONS.BIBLE_QUICK_PROJECTION, PERMISSIONS.SERMONS_VIEW'
  );
  console.log('[ok] defaults Multimedia/Admin: Biblia rápida');
} else {
  console.log('[skip] defaults Multimedia/Admin: Biblia rápida ya aplicada.');
}

let presets = read(files.presets);
presets = replaceExact(
  presets,
  '  PERMISSIONS.SETLISTS_CONTROL,\n  PERMISSIONS.SONGS_VIEW,',
  '  PERMISSIONS.SETLISTS_CONTROL,\n  PERMISSIONS.SETLISTS_MANAGE,\n  PERMISSIONS.SONGS_VIEW,',
  'preset Multimedia Completo: gestionar setlist'
);

let rolePermissions = read(files.rolePermissions);
rolePermissions = replaceExact(
  rolePermissions,
  `export const canAccessController = (user = {}) => hasAnyPermission(user, [\n  PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS,\n  PERMISSIONS.MULTIMEDIA_PROJECT,\n  PERMISSIONS.BIBLE_PROJECT,\n  PERMISSIONS.SERMONS_PROJECT\n]);`,
  `export const canAccessController = (user = {}) => hasAnyPermission(user, [\n  PERMISSIONS.SETLISTS_CONTROL,\n  PERMISSIONS.MULTIMEDIA_LIBRARY_VIEW,\n  PERMISSIONS.MULTIMEDIA_UPLOAD,\n  PERMISSIONS.MULTIMEDIA_EDIT,\n  PERMISSIONS.MULTIMEDIA_DELETE,\n  PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS,\n  PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS,\n  PERMISSIONS.MULTIMEDIA_PROJECT,\n  PERMISSIONS.BIBLE_VIEW,\n  PERMISSIONS.BIBLE_PROJECT,\n  PERMISSIONS.BIBLE_QUICK_PROJECTION,\n  PERMISSIONS.SERMONS_VIEW,\n  PERMISSIONS.SERMONS_CREATE,\n  PERMISSIONS.SERMONS_EDIT,\n  PERMISSIONS.SERMONS_PROJECT,\n  PERMISSIONS.CANVA_VIEW,\n  PERMISSIONS.CANVA_CREATE,\n  PERMISSIONS.CANVA_EDIT,\n  PERMISSIONS.CANVA_DELETE,\n  PERMISSIONS.CANVA_PROJECT\n]);`,
  'acceso al Controlador por permisos granulares'
);

let rules = read(files.rules);
const legacyBefore = `    // Legacy fallbacks keep existing users operational until an owner saves role defaults.\n    function hasLegacyPermission(permission, role) {\n      return (permission in ['events.create', 'events.edit', 'events.delete', 'songs.delete', 'multimedia.delete']\n          && role in ['dueño', 'dueno', 'admin'])\n        || (permission in ['songs.create', 'songs.editLyrics', 'songs.editChords', 'songs.editMetadata', 'songs.manageMedia', 'songs.archive', 'multimedia.libraryView', 'multimedia.upload', 'multimedia.edit', 'multimedia.project', 'multimedia.controlOutputs', 'bible.project', 'sermons.project']\n          && role in ['dueño', 'dueno', 'admin', 'multimedia'])\n        || (permission in ['announcements.view', 'announcements.create', 'announcements.edit', 'announcements.delete', 'announcements.project']\n          && role in ['dueño', 'dueno'])\n        || (permission == 'sermons.view' && role in ['dueño', 'dueno', 'multimedia', 'admin'])\n        || (permission in ['sermons.create', 'sermons.edit'] && role in ['dueño', 'dueno', 'multimedia']);\n    }`;
const legacyAfter = `    // Built-in fallbacks mirror the client defaults only when a permission has not been configured explicitly.\n    function hasLegacyPermission(permission, role) {\n      let roleKey = normalizedRoleKey(role);\n      return roleKey == 'dueno'\n        || (roleKey == 'admin' && permission in [\n          'dashboard.view', 'events.view', 'events.create', 'events.edit', 'events.delete',\n          'setlists.view', 'setlists.addSong', 'setlists.removeSong', 'setlists.reorder', 'setlists.control', 'setlists.manage',\n          'songs.view', 'songs.create', 'songs.editLyrics', 'songs.editChords', 'songs.editMetadata', 'songs.manageMedia', 'songs.archive', 'songs.delete',\n          'rehearsal.access', 'rehearsal.control', 'bible.view', 'bible.project', 'bible.quickProjection',\n          'sermons.view', 'multimedia.libraryView', 'multimedia.upload', 'multimedia.edit', 'multimedia.centralAccess', 'multimedia.controlOutputs', 'multimedia.project',\n          'canva.view', 'canva.create', 'canva.edit', 'canva.delete', 'canva.project', 'profile.editOwn'\n        ])\n        || (roleKey == 'multimedia' && permission in [\n          'dashboard.view', 'events.view',\n          'setlists.view', 'setlists.addSong', 'setlists.removeSong', 'setlists.reorder', 'setlists.control', 'setlists.manage',\n          'songs.view', 'songs.create', 'songs.editLyrics', 'songs.editChords', 'songs.editMetadata', 'songs.manageMedia', 'songs.archive',\n          'rehearsal.access', 'rehearsal.control', 'bible.view', 'bible.project', 'bible.quickProjection',\n          'sermons.view', 'sermons.create', 'sermons.edit', 'sermons.createPoint', 'sermons.createBiblePassage', 'sermons.project',\n          'multimedia.libraryView', 'multimedia.upload', 'multimedia.edit', 'multimedia.centralAccess', 'multimedia.controlOutputs', 'multimedia.project',\n          'canva.view', 'canva.create', 'canva.edit', 'canva.delete', 'canva.project', 'profile.editOwn'\n        ])\n        || (roleKey == 'musico' && permission in ['dashboard.view', 'songs.view', 'rehearsal.access', 'bible.view', 'profile.editOwn', 'events.view', 'setlists.view'])\n        || (roleKey == 'cantante' && permission in ['dashboard.view', 'songs.view', 'rehearsal.access', 'bible.view', 'profile.editOwn'])\n        || (roleKey == 'pastor' && permission in [\n          'dashboard.view', 'songs.view', 'rehearsal.access', 'bible.view', 'profile.editOwn', 'events.view', 'setlists.view', 'bible.project',\n          'sermons.view', 'sermons.create', 'sermons.edit', 'sermons.createPoint', 'sermons.createBiblePassage', 'sermons.project'\n        ])\n        || (roleKey == 'predicador' && permission in ['dashboard.view', 'songs.view', 'rehearsal.access', 'bible.view', 'profile.editOwn', 'events.view', 'setlists.view', 'sermons.view']);\n    }`;
rules = replaceExact(rules, legacyBefore, legacyAfter, 'fallback de permisos alineado con cliente');

const hasPermissionBefore = `    function hasPermission(permission) {\n      let profile = get(userPath(request.auth.uid)).data;\n      let role = profile.rol;\n      return role in ['dueño', 'dueno']\n        || (hasPermissionOverride(profile, permission)\n          ? permissionOverrideIsEnabled(profile, permission)\n          : (hasConfiguredRolePermission(role, permission) || hasLegacyPermission(permission, role)));\n    }`;
const hasPermissionAfter = `    function hasConfiguredRolePermissionEntry(role, permission) {\n      return exists(permissionConfigPath())\n        && hasConfiguredRolePermissionEntryFromDocument(role, permission);\n    }\n\n    function hasConfiguredRolePermissionEntryFromDocument(role, permission) {\n      let config = get(permissionConfigPath()).data;\n      let roleKey = normalizedRoleKey(role);\n      return 'roleDefaults' in config\n        && roleKey in config.roleDefaults\n        && permission in config.roleDefaults[roleKey];\n    }\n\n    function hasPermission(permission) {\n      let profile = get(userPath(request.auth.uid)).data;\n      let role = profile.rol;\n      return role in ['dueño', 'dueno']\n        || (hasPermissionOverride(profile, permission)\n          ? permissionOverrideIsEnabled(profile, permission)\n          : (hasConfiguredRolePermissionEntry(role, permission)\n            ? hasConfiguredRolePermission(role, permission)\n            : hasLegacyPermission(permission, role)));\n    }`;
rules = replaceExact(rules, hasPermissionBefore, hasPermissionAfter, 'reglas: false explícito y fallback solo si falta permiso');

let controller = read(files.controller);
controller = replaceExact(
  controller,
  `  const canProjectCanva = hasPermission(user, 'canva.project');\n  const canProjectMedia = hasPermission(user, 'multimedia.project');\n  const canAccessCanva = canViewCanva || canCreateCanva || canEditCanva || canDeleteCanva || canProjectCanva;`,
  `  const canProjectCanva = hasPermission(user, 'canva.project');\n  const canProjectMedia = hasPermission(user, 'multimedia.project');\n  const canControlOutputs = hasPermission(user, 'multimedia.controlOutputs');\n  const canViewMedia = hasPermission(user, 'multimedia.libraryView');\n  const canUploadMedia = hasPermission(user, 'multimedia.upload');\n  const canEditMedia = hasPermission(user, 'multimedia.edit');\n  const canDeleteMedia = hasPermission(user, 'multimedia.delete');\n  const canViewBible = hasPermission(user, 'bible.view');\n  const canProjectBible = hasPermission(user, 'bible.project');\n  const canViewPreaching = hasPermission(user, 'sermons.view');\n  const canCreatePreaching = hasPermission(user, 'sermons.create');\n  const canEditPreaching = hasPermission(user, 'sermons.edit');\n  const canProjectPreaching = hasPermission(user, 'sermons.project');\n  const canControlSongs = hasPermission(user, 'setlists.control') || canProjectMedia;\n  const canAccessCanva = canViewCanva || canCreateCanva || canEditCanva || canDeleteCanva || canProjectCanva;\n  const canAccessBibleController = canViewBible || canProjectBible || canQuickProject;\n  const canAccessPreachingController = canViewPreaching || canCreatePreaching || canEditPreaching || canProjectPreaching;\n  const canAccessMediaController = canViewMedia || canUploadMedia || canEditMedia || canDeleteMedia || canProjectMedia || canControlOutputs;`,
  'matriz de permisos del Controlador'
);

controller = replaceExact(
  controller,
  `  const canHandlePastorRequests = isOwner(user) || isMultimedia(user);\n  const canReadPastorRequests = canHandlePastorRequests || isAdmin(user);\n  const canManageBibleOutline = isOwner(user) || isAdmin(user) || isMultimedia(user);`,
  `  const canHandlePastorRequests = canProjectPreaching;\n  const canReadPastorRequests = canViewPreaching || canEditPreaching || canProjectPreaching;\n  const canManageBibleOutline = canProjectBible;`,
  'Predica/Biblia usan permisos, no nombres de rol'
);

const guard = (permissionVar, message) => `    if (!${permissionVar}) {\n      notify('${message}', { type: 'error' });\n      return;\n    }\n`;
controller = insertGuard(controller, '  const projectSlide = async (slide) => {\n', "notify('No tienes permiso para proyectar canciones.'", guard('canProjectMedia', 'No tienes permiso para proyectar canciones.'), 'proyectar Canciones');
controller = insertGuard(controller, '  const projectBiblePassage = async ({ passage, slides = [], selectedIndex = 0, outlineItemId = null }) => {\n', "notify('No tienes permiso para proyectar Biblia.'", guard('canProjectBible', 'No tienes permiso para proyectar Biblia.'), 'proyectar Biblia');
controller = insertGuard(controller, '  const projectBibleDeckSlideAt = async (targetIndex) => {\n', "notify('No tienes permiso para navegar la proyección bíblica.'", guard('canProjectBible', 'No tienes permiso para navegar la proyección bíblica.'), 'navegar Biblia');
controller = insertGuard(controller, '  const stopPublicBibleProjection = async () => {\n', "notify('No tienes permiso para retirar la proyección bíblica.'", guard('canProjectBible', 'No tienes permiso para retirar la proyección bíblica.'), 'retirar Biblia');
controller = insertGuard(controller, '  const projectMedia = async (mediaObj) => {\n', "notify('No tienes permiso para proyectar Multimedia.'", guard('canProjectMedia', 'No tienes permiso para proyectar Multimedia.'), 'proyectar Multimedia');
controller = insertGuard(controller, '  const handleUploadBackground = async (e, { applyAsBackground = false } = {}) => {\n', "notify('No tienes permiso para subir Multimedia.'", guard('canUploadMedia', 'No tienes permiso para subir Multimedia.'), 'subir Multimedia');
controller = insertGuard(controller, '  const borrarArchivo = async (e, url) => {\n', "notify('No tienes permiso para eliminar Multimedia.'", guard('canDeleteMedia', 'No tienes permiso para eliminar Multimedia.'), 'eliminar Multimedia');
controller = insertGuard(controller, '  const renombrarArchivo = async (e, url) => {\n', "notify('No tienes permiso para editar Multimedia.'", guard('canEditMedia', 'No tienes permiso para editar Multimedia.'), 'editar Multimedia');
controller = insertGuard(controller, '  const crearCarpeta = async () => {\n', "notify('No tienes permiso para crear carpetas Multimedia.'", guard('canUploadMedia', 'No tienes permiso para crear carpetas Multimedia.'), 'crear carpetas Multimedia');
controller = insertGuard(controller, '  const toggleBlackout = async () => {\n', "notify('No tienes permiso para controlar las salidas.'", guard('canControlOutputs', 'No tienes permiso para controlar las salidas.'), 'blackout');
controller = insertGuard(controller, '  const toggleTransmision = async () => {\n', "notify('No tienes permiso para cambiar el modo de transmisión.'", guard('canControlOutputs', 'No tienes permiso para cambiar el modo de transmisión.'), 'modo transmisión');
controller = insertGuard(controller, '  const toggleLogo = async () => {\n', "notify('No tienes permiso para controlar el logo.'", guard('canControlOutputs', 'No tienes permiso para controlar el logo.'), 'logo');
controller = insertGuard(controller, '  const toggleCountdown = async (active) => {\n', "notify('No tienes permiso para controlar el contador.'", guard('canControlOutputs', 'No tienes permiso para controlar el contador.'), 'contador');
controller = insertGuard(controller, '  const botonPanico = async () => {\n', "notify('No tienes permiso para usar el botón de pánico.'", guard('canControlOutputs', 'No tienes permiso para usar el botón de pánico.'), 'botón de pánico');
controller = insertGuard(controller, '  const enviarAlerta = async (overrideText = null) => {\n', "notify('No tienes permiso para enviar alertas de tarima.'", guard('canControlOutputs', 'No tienes permiso para enviar alertas de tarima.'), 'alertas tarima');
controller = insertGuard(controller, '  const enviarTicker = async () => {\n', "notify('No tienes permiso para enviar marquesinas.'", guard('canControlOutputs', 'No tienes permiso para enviar marquesinas.'), 'marquesina');
controller = insertGuard(controller, '  const stopCanvaProjection = async () => {\n', "notify('No tienes permiso para retirar Canva.'", guard('canProjectCanva', 'No tienes permiso para retirar Canva.'), 'retirar Canva');

controller = replaceExact(
  controller,
  `            {[\n              ['songs', 'Canciones', Music],\n              ['preaching', 'Predica', ShieldCheck],\n              ['bible', 'Biblia', BookOpen],\n              ...(canAccessCanva ? [['canva', 'Canva', Tv]] : []),\n              ['media', 'Multimedia', Film]\n            ].map(([mode, label, Icon]) => (`,
  `            {[\n              ...(canControlSongs ? [['songs', 'Canciones', Music]] : []),\n              ...(canAccessPreachingController ? [['preaching', 'Predica', ShieldCheck]] : []),\n              ...(canAccessBibleController ? [['bible', 'Biblia', BookOpen]] : []),\n              ...(canAccessCanva ? [['canva', 'Canva', Tv]] : []),\n              ...(canAccessMediaController ? [['media', 'Multimedia', Film]] : [])\n            ].map(([mode, label, Icon]) => (`,
  'tabs Canciones/Predica/Biblia/Canva/Multimedia según permisos'
);

controller = controller.replaceAll('disabled={isUploadingFondo}', 'disabled={isUploadingFondo || !canUploadMedia}');
controller = controller.replaceAll('disabled={!previewMedia || !hasMediaTargets(mediaTargets)}', 'disabled={!canProjectMedia || !previewMedia || !hasMediaTargets(mediaTargets)}');
controller = controller.replaceAll('disabled={!hasMediaTargets(mediaTargets)}', 'disabled={!canProjectMedia || !hasMediaTargets(mediaTargets)}');
controller = controller.replaceAll('disabled={!biblePreview}', 'disabled={!canProjectBible || !biblePreview}');
controller = controller.replaceAll(
  '<button onClick={() => projectMedia({ url: m.url, type: m.type, mode: \'foreground\', name: m.name })} className="rounded-lg bg-violet-600 px-1 py-1.5 text-[8px] font-black uppercase text-white">',
  '<button disabled={!canProjectMedia} onClick={() => projectMedia({ url: m.url, type: m.type, mode: \'foreground\', name: m.name })} className="rounded-lg bg-violet-600 px-1 py-1.5 text-[8px] font-black uppercase text-white disabled:opacity-30">'
);
controller = controller.replaceAll(
  '<button onClick={(e) => renombrarArchivo(e, m.url)} className="rounded-lg bg-zinc-800 px-1 py-1.5 text-[8px] font-black uppercase text-zinc-300">',
  '<button disabled={!canEditMedia} onClick={(e) => renombrarArchivo(e, m.url)} className="rounded-lg bg-zinc-800 px-1 py-1.5 text-[8px] font-black uppercase text-zinc-300 disabled:opacity-30">'
);
controller = controller.replaceAll(
  '<button onClick={(e) => borrarArchivo(e, m.url)} className="rounded-lg bg-red-500/10 px-1 py-1.5 text-[8px] font-black uppercase text-red-300">',
  '<button disabled={!canDeleteMedia} onClick={(e) => borrarArchivo(e, m.url)} className="rounded-lg bg-red-500/10 px-1 py-1.5 text-[8px] font-black uppercase text-red-300 disabled:opacity-30">'
);
controller = controller.replaceAll(
  '<button type="button" onClick={() => projectSavedCanva(item)} className="min-h-10 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2 text-[9px] font-black uppercase text-cyan-100 hover:bg-cyan-500/20">',
  '<button type="button" disabled={!canProjectCanva} onClick={() => projectSavedCanva(item)} className="min-h-10 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2 text-[9px] font-black uppercase text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-30">'
);

const checks = [
  [permissions, 'PERMISSIONS.BIBLE_QUICK_PROJECTION, PERMISSIONS.SERMONS_VIEW', 'defaults'],
  [presets, 'PERMISSIONS.SETLISTS_MANAGE', 'preset'],
  [rolePermissions, 'PERMISSIONS.CANVA_PROJECT', 'ruta Controlador'],
  [rules, 'hasConfiguredRolePermissionEntry', 'reglas'],
  [rules, "roleKey == 'multimedia'", 'fallback Multimedia'],
  [controller, 'const canControlOutputs', 'matriz Controlador'],
  [controller, "No tienes permiso para proyectar canciones.", 'Canciones'],
  [controller, "No tienes permiso para proyectar Biblia.", 'Biblia'],
  [controller, "No tienes permiso para proyectar Multimedia.", 'Multimedia'],
  [controller, '...(canAccessPreachingController ?', 'tabs'],
];
for (const [source, marker, label] of checks) {
  if (!source.includes(marker)) throw new Error(`Validación falló: ${label}`);
}

const outputs = new Map([
  [files.permissions, permissions],
  [files.presets, presets],
  [files.rolePermissions, rolePermissions],
  [files.rules, rules],
  [files.controller, controller],
]);

try {
  for (const [file, source] of outputs) {
    fs.writeFileSync(file, source.replace(/\n/g, eols.get(file)), 'utf8');
  }
  console.log('Blindaje aplicado: Controlador, Canciones, Predica, Biblia, Canva y Multimedia respetan permisos granulares de extremo a extremo.');
} catch (error) {
  for (const [file, raw] of originals) fs.writeFileSync(file, raw, 'utf8');
  throw error;
}

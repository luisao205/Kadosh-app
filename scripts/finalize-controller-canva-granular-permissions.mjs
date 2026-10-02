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
const writeNormalized = (filePath, text, eol) => fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
const replaceOnce = (source, needle, replacement, label) => {
  if (source.includes(replacement)) {
    console.log('[skip] ' + label + ': ya aplicado.');
    return source;
  }
  const index = source.indexOf(needle);
  if (index === -1) throw new Error('No se encontró: ' + label);
  console.log('[ok] ' + label);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
};
const replaceAllCounted = (source, needle, replacement, label, minimum = 1) => {
  const count = source.split(needle).length - 1;
  if (count < minimum) throw new Error('No se encontró suficiente veces: ' + label + ' (' + count + ').');
  console.log('[ok] ' + label + ': ' + count + ' reemplazo(s)');
  return source.split(needle).join(replacement);
};

const loaded = Object.fromEntries(Object.entries(files).map(([key, filePath]) => [key, readNormalized(filePath)]));
let controller = loaded.controller.text;
let permissions = loaded.permissions.text;
let presets = loaded.presets.text;
let functionPermissions = loaded.functionPermissions.text;
let rules = loaded.rules.text;

// -----------------------------------------------------------------------------
// Catálogo cliente: separar ver / crear / editar / eliminar / proyectar.
// -----------------------------------------------------------------------------
permissions = replaceOnce(
  permissions,
  "  CANVA_PROJECT: 'canva.project',",
  "  CANVA_VIEW: 'canva.view', CANVA_CREATE: 'canva.create', CANVA_EDIT: 'canva.edit', CANVA_DELETE: 'canva.delete', CANVA_PROJECT: 'canva.project',",
  'catálogo granular Canva'
);
permissions = replaceOnce(
  permissions,
  "  { id: 'canva', label: 'Canva', permissions: [PERMISSIONS.CANVA_PROJECT] },",
  "  { id: 'canva', label: 'Canva', permissions: [PERMISSIONS.CANVA_VIEW, PERMISSIONS.CANVA_CREATE, PERMISSIONS.CANVA_EDIT, PERMISSIONS.CANVA_DELETE, PERMISSIONS.CANVA_PROJECT] },",
  'grupo Canva granular en Administración de permisos'
);
permissions = replaceOnce(
  permissions,
  "  'canva.project': 'Proyectar Canva'",
  "  'canva.view': 'Ver biblioteca Canva',\n  'canva.create': 'Crear Canva desde enlace',\n  'canva.edit': 'Editar Canva guardado',\n  'canva.delete': 'Eliminar Canva guardado',\n  'canva.project': 'Proyectar Canva'",
  'etiquetas granulares Canva'
);
permissions = replaceAllCounted(
  permissions,
  'PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS, PERMISSIONS.MULTIMEDIA_PROJECT, PERMISSIONS.CANVA_PROJECT),',
  'PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS, PERMISSIONS.MULTIMEDIA_PROJECT, PERMISSIONS.CANVA_VIEW, PERMISSIONS.CANVA_CREATE, PERMISSIONS.CANVA_EDIT, PERMISSIONS.CANVA_DELETE, PERMISSIONS.CANVA_PROJECT),',
  'permisos Canva por defecto para admin y multimedia',
  2
);

// Preset completo: todos. Apoyo: ver + proyectar, sin tocar enlaces.
presets = replaceOnce(
  presets,
  '  PERMISSIONS.MULTIMEDIA_PROJECT,\n  PERMISSIONS.CANVA_PROJECT,\n  PERMISSIONS.ANNOUNCEMENTS_VIEW,',
  '  PERMISSIONS.MULTIMEDIA_PROJECT,\n  PERMISSIONS.CANVA_VIEW,\n  PERMISSIONS.CANVA_CREATE,\n  PERMISSIONS.CANVA_EDIT,\n  PERMISSIONS.CANVA_DELETE,\n  PERMISSIONS.CANVA_PROJECT,\n  PERMISSIONS.ANNOUNCEMENTS_VIEW,',
  'Canva completo en preset Multimedia Completo'
);
presets = replaceOnce(
  presets,
  '  [PERMISSIONS.MULTIMEDIA_PROJECT]: true,\n  [PERMISSIONS.CANVA_PROJECT]: true,\n  [PERMISSIONS.ANNOUNCEMENTS_VIEW]: true,',
  '  [PERMISSIONS.MULTIMEDIA_PROJECT]: true,\n  [PERMISSIONS.CANVA_VIEW]: true,\n  [PERMISSIONS.CANVA_PROJECT]: true,\n  [PERMISSIONS.ANNOUNCEMENTS_VIEW]: true,',
  'Canva solo ver/proyectar en preset Apoyo Multimedia'
);

// Cloud Functions debe aceptar los nuevos IDs en cambios individuales/masivos.
functionPermissions = replaceOnce(
  functionPermissions,
  "  'canva.project',",
  "  'canva.view', 'canva.create', 'canva.edit', 'canva.delete', 'canva.project',",
  'catálogo Canva granular en Functions'
);

// -----------------------------------------------------------------------------
// Controller: acceso a pestaña y acciones separadas.
// -----------------------------------------------------------------------------
controller = replaceOnce(
  controller,
  "  const canProjectCanva = hasPermission(user, 'canva.project');\n  const controllerScreens = [",
  "  const canViewCanva = hasPermission(user, 'canva.view');\n  const canCreateCanva = hasPermission(user, 'canva.create');\n  const canEditCanva = hasPermission(user, 'canva.edit');\n  const canDeleteCanva = hasPermission(user, 'canva.delete');\n  const canProjectCanva = hasPermission(user, 'canva.project');\n  const canAccessCanva = canViewCanva || canCreateCanva || canEditCanva || canDeleteCanva || canProjectCanva;\n  const controllerScreens = [",
  'flags de permisos Canva en Controlador'
);
controller = replaceOnce(
  controller,
  "    if (!canProjectCanva) {\n      setCanvaLibrary([]);\n      return undefined;\n    }",
  "    if (!canAccessCanva) {\n      setCanvaLibrary([]);\n      return undefined;\n    }",
  'lectura de biblioteca según acceso Canva'
);
controller = replaceOnce(
  controller,
  '  }, [canProjectCanva]);',
  '  }, [canAccessCanva]);',
  'dependencia de biblioteca Canva'
);
controller = replaceOnce(
  controller,
  "              ...(canProjectCanva ? [['canva', 'Canva', Tv]] : []),",
  "              ...(canAccessCanva ? [['canva', 'Canva', Tv]] : []),",
  'pestaña Canva visible para permisos Canva'
);
controller = replaceOnce(
  controller,
  "  const saveCanvaPresentation = async () => {\n    if (!canProjectCanva || isSavingCanva) return;",
  "  const saveCanvaPresentation = async () => {\n    const canSaveCanva = selectedCanvaId ? canEditCanva : canCreateCanva;\n    if (!canSaveCanva || isSavingCanva) {\n      notify(selectedCanvaId ? 'No tienes permiso para editar presentaciones Canva.' : 'No tienes permiso para crear presentaciones Canva desde enlaces.', { type: 'error' });\n      return;\n    }",
  'guardar Canva respeta crear/editar'
);
controller = replaceOnce(
  controller,
  "  const deleteCanvaPresentation = async (item) => {\n    if (!item?.id || !canProjectCanva) return;",
  "  const deleteCanvaPresentation = async (item) => {\n    if (!item?.id || !canDeleteCanva) {\n      notify('No tienes permiso para eliminar presentaciones Canva.', { type: 'error' });\n      return;\n    }",
  'eliminar Canva respeta permiso'
);
controller = replaceOnce(
  controller,
  '<button type="button" onClick={newCanvaPresentation} className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase text-zinc-300 hover:bg-white/10"><Plus size={13} className="mr-1 inline" />Nueva</button>',
  '{canCreateCanva && <button type="button" onClick={newCanvaPresentation} className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase text-zinc-300 hover:bg-white/10"><Plus size={13} className="mr-1 inline" />Nueva</button>}',
  'botón Nueva solo con permiso crear'
);
controller = replaceOnce(
  controller,
  '<button type="button" onClick={saveCanvaPresentation} disabled={isSavingCanva} className="min-h-12 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50">{isSavingCanva ? <Loader2 size={14} className="mr-2 inline animate-spin" /> : <Star size={14} className="mr-2 inline" />}{selectedCanvaId ? \'Guardar cambios\' : \'Guardar presentación\'}</button>',
  '{(selectedCanvaId ? canEditCanva : canCreateCanva) && <button type="button" onClick={saveCanvaPresentation} disabled={isSavingCanva} className="min-h-12 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50">{isSavingCanva ? <Loader2 size={14} className="mr-2 inline animate-spin" /> : <Star size={14} className="mr-2 inline" />}{selectedCanvaId ? \'Guardar cambios\' : \'Guardar presentación\'}</button>}',
  'botón Guardar según crear/editar'
);
controller = replaceOnce(
  controller,
  '<button type="button" onClick={() => selectCanvaPresentation(item)} className="min-h-10 rounded-lg border border-white/10 bg-white/5 px-2 text-[9px] font-black uppercase text-zinc-300 hover:bg-white/10"><Edit2 size={12} className="mr-1 inline" />Editar</button>',
  '<button type="button" onClick={() => selectCanvaPresentation(item)} className="min-h-10 rounded-lg border border-white/10 bg-white/5 px-2 text-[9px] font-black uppercase text-zinc-300 hover:bg-white/10">{canEditCanva ? <Edit2 size={12} className="mr-1 inline" /> : <Eye size={12} className="mr-1 inline" />}{canEditCanva ? \'Editar\' : \'Abrir\'}</button>',
  'Editar pasa a Abrir sin permiso de edición'
);
controller = replaceOnce(
  controller,
  '<button type="button" onClick={() => deleteCanvaPresentation(item)} className="min-h-10 rounded-lg border border-red-400/20 bg-red-500/10 px-2 text-[9px] font-black uppercase text-red-200 hover:bg-red-500/20"><Trash2 size={12} className="mr-1 inline" />Eliminar</button>',
  '{canDeleteCanva && <button type="button" onClick={() => deleteCanvaPresentation(item)} className="min-h-10 rounded-lg border border-red-400/20 bg-red-500/10 px-2 text-[9px] font-black uppercase text-red-200 hover:bg-red-500/20"><Trash2 size={12} className="mr-1 inline" />Eliminar</button>}',
  'botón Eliminar según permiso'
);
controller = replaceOnce(
  controller,
  '<button type="button" onClick={projectCanva} className="min-h-12 rounded-xl bg-cyan-400 px-3 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-cyan-300"><Monitor size={14} className="mr-2 inline" />Proyectar en seleccionadas</button>',
  '{canProjectCanva && <button type="button" onClick={projectCanva} className="min-h-12 rounded-xl bg-cyan-400 px-3 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-cyan-300"><Monitor size={14} className="mr-2 inline" />Proyectar en seleccionadas</button>}',
  'botón proyectar según permiso'
);

// -----------------------------------------------------------------------------
// Firestore: biblioteca Canva separa CRUD. Proyección sigue usando canva.project.
// -----------------------------------------------------------------------------
rules = replaceOnce(
  rules,
  "    match /canvaPresentations/{presentationId} {\n      allow read: if signedIn();\n      allow create, update: if hasPermission('canva.project') && validCanvaPresentationDocument();\n      allow delete: if hasPermission('canva.project');\n    }",
  "    match /canvaPresentations/{presentationId} {\n      allow read: if signedIn() && (\n        hasPermission('canva.view')\n        || hasPermission('canva.create')\n        || hasPermission('canva.edit')\n        || hasPermission('canva.delete')\n        || hasPermission('canva.project')\n      );\n      allow create: if hasPermission('canva.create') && validCanvaPresentationDocument();\n      allow update: if hasPermission('canva.edit') && validCanvaPresentationDocument();\n      allow delete: if hasPermission('canva.delete');\n    }",
  'reglas CRUD granulares para biblioteca Canva'
);

for (const [text, markers, label] of [
  [permissions, ['CANVA_VIEW', 'CANVA_CREATE', 'CANVA_EDIT', 'CANVA_DELETE', 'CANVA_PROJECT'], 'permissions.js'],
  [presets, ['PERMISSIONS.CANVA_VIEW', 'PERMISSIONS.CANVA_CREATE', 'PERMISSIONS.CANVA_PROJECT'], 'permissionPresets.js'],
  [functionPermissions, ["'canva.view'", "'canva.create'", "'canva.edit'", "'canva.delete'", "'canva.project'"], 'permissionManagement.js'],
  [controller, ['canAccessCanva', 'canCreateCanva', 'canEditCanva', 'canDeleteCanva', 'canProjectCanva'], 'ProyectorController.jsx'],
  [rules, ["hasPermission('canva.create')", "hasPermission('canva.edit')", "hasPermission('canva.delete')"], 'firestore.rules'],
]) {
  for (const marker of markers) if (!text.includes(marker)) throw new Error('Validación falló en ' + label + ': ' + marker);
}

// Escribir solo después de transformar y validar todo.
writeNormalized(files.controller, controller, loaded.controller.eol);
writeNormalized(files.permissions, permissions, loaded.permissions.eol);
writeNormalized(files.presets, presets, loaded.presets.eol);
writeNormalized(files.functionPermissions, functionPermissions, loaded.functionPermissions.eol);
writeNormalized(files.rules, rules, loaded.rules.eol);

console.log('Permisos Canva finalizados: ver, crear desde enlace, editar, eliminar y proyectar separados.');

import fs from 'node:fs';

const paths = {
  panel: 'src/components/admin/PermissionManagementPanel.jsx',
  presets: 'src/utils/permissionPresets.js',
  permissions: 'src/utils/permissions.js',
  functions: 'functions/index.js',
  rules: 'firestore.rules',
};

for (const filePath of Object.values(paths)) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${filePath}.`);
}

const snapshots = new Map(Object.values(paths).map((filePath) => [filePath, fs.readFileSync(filePath)]));
const restoreAll = () => {
  for (const [filePath, bytes] of snapshots.entries()) fs.writeFileSync(filePath, bytes);
};
const read = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return { eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') };
};
const files = Object.fromEntries(Object.entries(paths).map(([key, filePath]) => [key, read(filePath)]));
const count = (text, needle) => text.split(needle).length - 1;
const writeAll = () => {
  for (const [key, filePath] of Object.entries(paths)) {
    fs.writeFileSync(filePath, files[key].text.replace(/\n/g, files[key].eol), 'utf8');
  }
};

try {
  // 1) Paquete TOTAL operativo: proyección, edición y control completos, sin entregar administración de permisos.
  const presets = files.presets;
  if (!presets.text.includes('export const MULTIMEDIA_TOTAL_PRESET')) {
    const anchor = '// A non-destructive group preset: only these explicit overrides are applied.';
    if (!presets.text.includes(anchor)) throw new Error('No se encontró el punto de inserción de presets Multimedia.');
    const totalPreset = `// Operación TOTAL para el equipo Multimedia.\n// Incluye todo el flujo operativo y destructivo de contenido Multimedia/Canva/Anuncios,\n// proyección de canciones, Biblia y prédica. No entrega administración de roles/permisos ni Devocionales reservados.\nexport const MULTIMEDIA_TOTAL_PRESET = Object.freeze({\n  [PERMISSIONS.DASHBOARD_VIEW]: true,\n  [PERMISSIONS.EVENTS_VIEW]: true,\n  [PERMISSIONS.EVENTS_EDIT]: true,\n  [PERMISSIONS.SETLISTS_VIEW]: true,\n  [PERMISSIONS.SETLISTS_ADD_SONG]: true,\n  [PERMISSIONS.SETLISTS_REMOVE_SONG]: true,\n  [PERMISSIONS.SETLISTS_REORDER]: true,\n  [PERMISSIONS.SETLISTS_CONTROL]: true,\n  [PERMISSIONS.SETLISTS_MANAGE]: true,\n  [PERMISSIONS.SONGS_VIEW]: true,\n  [PERMISSIONS.SONGS_CREATE]: true,\n  [PERMISSIONS.SONGS_EDIT_LYRICS]: true,\n  [PERMISSIONS.SONGS_EDIT_CHORDS]: true,\n  [PERMISSIONS.SONGS_EDIT_METADATA]: true,\n  [PERMISSIONS.SONGS_MANAGE_MEDIA]: true,\n  [PERMISSIONS.SONGS_ARCHIVE]: true,\n  [PERMISSIONS.REHEARSAL_ACCESS]: true,\n  [PERMISSIONS.REHEARSAL_CONTROL]: true,\n  [PERMISSIONS.BIBLE_VIEW]: true,\n  [PERMISSIONS.BIBLE_PROJECT]: true,\n  [PERMISSIONS.BIBLE_QUICK_PROJECTION]: true,\n  [PERMISSIONS.SERMONS_VIEW]: true,\n  [PERMISSIONS.SERMONS_CREATE]: true,\n  [PERMISSIONS.SERMONS_EDIT]: true,\n  [PERMISSIONS.SERMONS_CREATE_POINT]: true,\n  [PERMISSIONS.SERMONS_CREATE_BIBLE_PASSAGE]: true,\n  [PERMISSIONS.SERMONS_PROJECT]: true,\n  [PERMISSIONS.MULTIMEDIA_LIBRARY_VIEW]: true,\n  [PERMISSIONS.MULTIMEDIA_UPLOAD]: true,\n  [PERMISSIONS.MULTIMEDIA_EDIT]: true,\n  [PERMISSIONS.MULTIMEDIA_DELETE]: true,\n  [PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS]: true,\n  [PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS]: true,\n  [PERMISSIONS.MULTIMEDIA_PROJECT]: true,\n  [PERMISSIONS.CANVA_VIEW]: true,\n  [PERMISSIONS.CANVA_CREATE]: true,\n  [PERMISSIONS.CANVA_EDIT]: true,\n  [PERMISSIONS.CANVA_DELETE]: true,\n  [PERMISSIONS.CANVA_PROJECT]: true,\n  [PERMISSIONS.ANNOUNCEMENTS_VIEW]: true,\n  [PERMISSIONS.ANNOUNCEMENTS_CREATE]: true,\n  [PERMISSIONS.ANNOUNCEMENTS_EDIT]: true,\n  [PERMISSIONS.ANNOUNCEMENTS_DELETE]: true,\n  [PERMISSIONS.ANNOUNCEMENTS_PROJECT]: true,\n  [PERMISSIONS.TEAM_VIEW]: true,\n  [PERMISSIONS.PROFILE_EDIT_OWN]: true,\n});\n\n`;
    presets.text = presets.text.replace(anchor, totalPreset + anchor);
    console.log('[ok] paquete Multimedia TOTAL creado');
  } else {
    console.log('[skip] paquete Multimedia TOTAL: ya existe');
  }

  if (!presets.text.includes('multimediaTotal: MULTIMEDIA_TOTAL_PRESET')) {
    const before = `export const GROUP_PERMISSION_PRESETS = Object.freeze({\n  multimediaComplete: MULTIMEDIA_COMPLETE_PRESET,\n  multimediaSupport: MULTIMEDIA_SUPPORT_PRESET\n});`;
    const after = `export const GROUP_PERMISSION_PRESETS = Object.freeze({\n  multimediaTotal: MULTIMEDIA_TOTAL_PRESET,\n  multimediaComplete: MULTIMEDIA_COMPLETE_PRESET,\n  multimediaSupport: MULTIMEDIA_SUPPORT_PRESET\n});`;
    if (!presets.text.includes(before)) throw new Error('No se encontró GROUP_PERMISSION_PRESETS.');
    presets.text = presets.text.replace(before, after);
  }

  // 2) Administración de permisos: un botón hace TODO como Dueño:
  // guarda el paquete TOTAL para el rol Multimedia y limpia excepciones individuales de ese rol.
  const panel = files.panel;
  const importBefore = `import { GROUP_PERMISSION_PRESETS, MULTIMEDIA_COMPLETE_PRESET } from '../../utils/permissionPresets';`;
  const importAfter = `import { GROUP_PERMISSION_PRESETS, MULTIMEDIA_COMPLETE_PRESET, MULTIMEDIA_TOTAL_PRESET } from '../../utils/permissionPresets';`;
  if (!panel.text.includes(importAfter)) {
    if (!panel.text.includes(importBefore)) throw new Error('No se encontró import de presets en Administración de permisos.');
    panel.text = panel.text.replace(importBefore, importAfter);
  }

  const stateAnchor = `  const [multimediaPresetReady, setMultimediaPresetReady] = useState(false);`;
  const stateWithTotal = `${stateAnchor}\n  const [isApplyingMultimediaTotal, setIsApplyingMultimediaTotal] = useState(false);`;
  if (!panel.text.includes('isApplyingMultimediaTotal')) {
    if (!panel.text.includes(stateAnchor)) throw new Error('No se encontró estado de preset Multimedia.');
    panel.text = panel.text.replace(stateAnchor, stateWithTotal);
  }

  const actionAnchor = `  const applyMultimediaPreset = () => { setRole('multimedia'); setDraftDefaults({ ...MULTIMEDIA_COMPLETE_PRESET }); setMultimediaPresetReady(true); };`;
  if (!panel.text.includes('const applyMultimediaTotalPackage = async () =>')) {
    if (!panel.text.includes(actionAnchor)) throw new Error('No se encontró applyMultimediaPreset.');
    const action = `${actionAnchor}\n  const applyMultimediaTotalPackage = async () => {\n    const multimediaIds = nonOwners.filter((member) => getRoleKey(member) === 'multimedia').map((member) => member.id).filter(Boolean);\n    const confirmation = 'MULTIMEDIA TOTAL\\n\\nEsto dará al rol Multimedia acceso operativo completo para canciones, setlists, Biblia, prédica, Canva, multimedia, anuncios y todas las salidas. También eliminará las excepciones individuales de los integrantes con rol Multimedia para que no queden permisos antiguos bloqueando la proyección.\\n\\nNo entrega administración de roles/permisos ni Devocionales reservados.\\n\\n¿Aplicar ahora?';\n    if (!window.confirm(confirmation)) return;\n    setIsApplyingMultimediaTotal(true);\n    try {\n      await updateRolePermissionDefaults({ role: 'multimedia', roleDefaults: MULTIMEDIA_TOTAL_PRESET });\n      if (multimediaIds.length) {\n        const clearChanges = Object.fromEntries(Object.keys(MULTIMEDIA_TOTAL_PRESET).map((permission) => [permission, null]));\n        await bulkUpdateUserPermissionOverrides({ userIds: multimediaIds, changes: clearChanges });\n      }\n      setRole('multimedia');\n      setDraftDefaults({ ...getRoleDefaults('multimedia', {}), ...MULTIMEDIA_TOTAL_PRESET });\n      setMultimediaPresetReady(false);\n      notify('Multimedia TOTAL aplicado. Rol actualizado y excepciones operativas limpiadas para ' + multimediaIds.length + ' integrante(s).', { type: 'success' });\n    } catch (error) {\n      console.error(error);\n      notify('No se pudo aplicar Multimedia TOTAL. Revisa Functions y vuelve a intentar.', { type: 'error' });\n    } finally {\n      setIsApplyingMultimediaTotal(false);\n    }\n  };`;
    panel.text = panel.text.replace(actionAnchor, action);
    console.log('[ok] acción de un clic Multimedia TOTAL agregada');
  }

  const oldRoleButton = `{role === 'multimedia' ? <button type="button" onClick={applyMultimediaPreset} className="kp-button-secondary rounded-xl px-3 py-2 text-xs font-bold">Aplicar preset recomendado</button> : null}`;
  const newRoleButtons = `{role === 'multimedia' ? <div className="flex flex-wrap gap-2"><button type="button" onClick={applyMultimediaPreset} className="kp-button-secondary rounded-xl px-3 py-2 text-xs font-bold">Preset recomendado</button><button type="button" disabled={isApplyingMultimediaTotal} onClick={applyMultimediaTotalPackage} className="kp-button-primary rounded-xl px-3 py-2 text-xs font-black disabled:opacity-50">{isApplyingMultimediaTotal ? 'APLICANDO...' : 'MULTIMEDIA TOTAL'}</button></div> : null}`;
  if (!panel.text.includes(newRoleButtons)) {
    if (!panel.text.includes(oldRoleButton)) throw new Error('No se encontró el botón de preset en la pestaña Roles.');
    panel.text = panel.text.replace(oldRoleButton, newRoleButtons);
  }

  // 3) Backend: aceptar todos los permisos operativos que contiene el paquete.
  const functionsFile = files.functions;
  const sermonsBefore = `  "sermons.view", "sermons.create", "sermons.edit", "sermons.delete", "sermons.project",`;
  const sermonsAfter = `  "sermons.view", "sermons.create", "sermons.edit", "sermons.createPoint", "sermons.createBiblePassage", "sermons.delete", "sermons.project",`;
  if (!functionsFile.text.includes(sermonsAfter)) {
    if (!functionsFile.text.includes(sermonsBefore)) throw new Error('No se encontró catálogo de permisos de Prédicas en Functions.');
    functionsFile.text = functionsFile.text.replace(sermonsBefore, sermonsAfter);
  }
  const multimediaCatalog = `  "multimedia.libraryView", "multimedia.upload", "multimedia.edit", "multimedia.delete", "multimedia.centralAccess", "multimedia.controlOutputs", "multimedia.project",`;
  const canvaCatalog = `  "canva.view", "canva.create", "canva.edit", "canva.delete", "canva.project",`;
  if (!functionsFile.text.includes(canvaCatalog)) {
    if (!functionsFile.text.includes(multimediaCatalog)) throw new Error('No se encontró catálogo Multimedia en Functions.');
    functionsFile.text = functionsFile.text.replace(multimediaCatalog, `${multimediaCatalog}\n${canvaCatalog}`);
  }
  console.log('[ok] backend acepta el paquete operativo completo');

  // 4) Defaults/fallback: multimedia.delete debe existir también fuera de la configuración persistida.
  const permissions = files.permissions;
  const defaultsBefore = `PERMISSIONS.MULTIMEDIA_UPLOAD, PERMISSIONS.MULTIMEDIA_EDIT, PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS`;
  const defaultsAfter = `PERMISSIONS.MULTIMEDIA_UPLOAD, PERMISSIONS.MULTIMEDIA_EDIT, PERMISSIONS.MULTIMEDIA_DELETE, PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS`;
  if (!permissions.text.includes(defaultsAfter)) {
    const hits = count(permissions.text, defaultsBefore);
    if (hits < 2) throw new Error('No se encontraron defaults Admin/Multimedia para multimedia.delete.');
    permissions.text = permissions.text.replaceAll(defaultsBefore, defaultsAfter);
  }

  // 5) Firestore: asegurar multimedia.delete y permitir que proyectar una canción retire solo
  // la ruta ocupada sin exigir vaciar Cantantes/Músicos.
  const rules = files.rules;
  const rulesBefore = `'multimedia.libraryView', 'multimedia.upload', 'multimedia.edit', 'multimedia.centralAccess', 'multimedia.controlOutputs', 'multimedia.project'`;
  const rulesAfter = `'multimedia.libraryView', 'multimedia.upload', 'multimedia.edit', 'multimedia.delete', 'multimedia.centralAccess', 'multimedia.controlOutputs', 'multimedia.project'`;
  if (!rules.text.includes(rulesAfter)) {
    const hits = count(rules.text, rulesBefore);
    if (hits < 2) throw new Error('No se encontraron fallbacks Admin/Multimedia en Firestore.');
    rules.text = rules.text.replaceAll(rulesBefore, rulesAfter);
  }

  const handoffOld = `        && (\n          !changedEventKeys().hasAny(['canvaOutputs'])\n          || (request.resource.data.canvaOutputs is map && request.resource.data.canvaOutputs.keys().size() == 0)\n        )\n        && (\n          !changedEventKeys().hasAny(['mediaOutputs'])\n          || (request.resource.data.mediaOutputs is map && request.resource.data.mediaOutputs.keys().size() == 0)\n        )`;
  const handoffNew = `        && (\n          !changedEventKeys().hasAny(['canvaOutputs'])\n          || (request.resource.data.canvaOutputs is map && request.resource.data.canvaOutputs.keys().size() == 0)\n          || (validCanvaOutputsMap() && canvaOutputsOnlyRemove())\n        )\n        && (\n          !changedEventKeys().hasAny(['mediaOutputs'])\n          || (request.resource.data.mediaOutputs is map && request.resource.data.mediaOutputs.keys().size() == 0)\n          || (validMediaOutputsMap() && mediaOutputsOnlyRemove())\n        )`;
  if (!rules.text.includes(handoffNew)) {
    if (!rules.text.includes(handoffOld)) throw new Error('No se encontró la regla de handoff de proyección para hacerla selectiva.');
    rules.text = rules.text.replace(handoffOld, handoffNew);
    console.log('[ok] Firestore permite proyectar canción sin apagar otras salidas');
  } else {
    console.log('[skip] handoff selectivo Firestore: ya aplicado');
  }

  // Validaciones antes de escribir.
  if (!presets.text.includes('export const MULTIMEDIA_TOTAL_PRESET')) throw new Error('Falta MULTIMEDIA_TOTAL_PRESET.');
  if (!presets.text.includes('[PERMISSIONS.MULTIMEDIA_DELETE]: true')) throw new Error('Paquete TOTAL no incluye eliminar multimedia.');
  if (!presets.text.includes('[PERMISSIONS.MULTIMEDIA_PROJECT]: true')) throw new Error('Paquete TOTAL no incluye proyectar multimedia/canciones.');
  if (!presets.text.includes('[PERMISSIONS.SETLISTS_CONTROL]: true')) throw new Error('Paquete TOTAL no incluye controlar setlist.');
  if (!panel.text.includes('MULTIMEDIA TOTAL')) throw new Error('Falta botón Multimedia TOTAL en Administración de permisos.');
  if (!panel.text.includes('applyMultimediaTotalPackage')) throw new Error('Falta acción del paquete TOTAL.');
  if (!functionsFile.text.includes(canvaCatalog) || !functionsFile.text.includes('"sermons.createPoint"')) throw new Error('Catálogo de Functions incompleto.');
  if (!rules.text.includes('(validCanvaOutputsMap() && canvaOutputsOnlyRemove())')) throw new Error('Firestore no acepta handoff Canva selectivo.');
  if (!rules.text.includes('(validMediaOutputsMap() && mediaOutputsOnlyRemove())')) throw new Error('Firestore no acepta handoff Media selectivo.');

  writeAll();
  console.log('[ok] paquete MULTIMEDIA TOTAL visible en Administración de permisos');
  console.log('[ok] un clic guarda el rol y limpia excepciones operativas de usuarios Multimedia');
  console.log('[ok] canciones/setlist/Biblia/Prédica/Canva/Multimedia/Anuncios habilitados para operación');
  console.log('[ok] administración de roles/permisos y Devocionales reservados siguen fuera del paquete');
  console.log('MULTIMEDIA TOTAL V1 OK: aplicar desde Equipo → Permisos → Roles → Multimedia → MULTIMEDIA TOTAL.');
} catch (error) {
  restoreAll();
  console.error('[rollback] Se restauraron todos los archivos al estado previo de MULTIMEDIA TOTAL V1.');
  throw error;
}

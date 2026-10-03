import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const derivedBlock = `  const canHandlePastorRequests = canProjectPreaching;\n  const canReadPastorRequests = canViewPreaching || canEditPreaching || canProjectPreaching;\n  const canManageBibleOutline = canProjectBible;\n`;
const preachingAnchor = `  const canProjectPreaching = hasPermission(user, 'sermons.project');\n`;
const correctBlock = `${preachingAnchor}${derivedBlock}`;

if (source.includes(correctBlock)) {
  console.log('[skip] orden de permisos del Controlador: ya corregido.');
} else {
  if (!source.includes(derivedBlock)) {
    throw new Error('No se encontró el bloque derivado de permisos que causa la pantalla negra.');
  }
  if (!source.includes(preachingAnchor)) {
    throw new Error('No se encontró el permiso base sermons.project.');
  }

  source = source.replace(derivedBlock, '');
  source = source.replace(preachingAnchor, correctBlock);
  console.log('[ok] corregido orden de inicialización de permisos del Controlador');
}

const declarations = [
  "const canProjectBible = hasPermission(user, 'bible.project');",
  "const canViewPreaching = hasPermission(user, 'sermons.view');",
  "const canEditPreaching = hasPermission(user, 'sermons.edit');",
  "const canProjectPreaching = hasPermission(user, 'sermons.project');",
  'const canHandlePastorRequests = canProjectPreaching;',
  'const canReadPastorRequests = canViewPreaching || canEditPreaching || canProjectPreaching;',
  'const canManageBibleOutline = canProjectBible;'
];
for (const declaration of declarations) {
  if (!source.includes(declaration)) throw new Error(`Falta declaración esperada: ${declaration}`);
}

const idxProjectBible = source.indexOf("const canProjectBible = hasPermission(user, 'bible.project');");
const idxViewPreaching = source.indexOf("const canViewPreaching = hasPermission(user, 'sermons.view');");
const idxEditPreaching = source.indexOf("const canEditPreaching = hasPermission(user, 'sermons.edit');");
const idxProjectPreaching = source.indexOf("const canProjectPreaching = hasPermission(user, 'sermons.project');");
const idxHandlePastor = source.indexOf('const canHandlePastorRequests = canProjectPreaching;');
const idxReadPastor = source.indexOf('const canReadPastorRequests = canViewPreaching || canEditPreaching || canProjectPreaching;');
const idxBibleOutline = source.indexOf('const canManageBibleOutline = canProjectBible;');

if (!(idxProjectPreaching < idxHandlePastor)) throw new Error('Validación falló: canProjectPreaching sigue usándose antes de declararse.');
if (!(idxViewPreaching < idxReadPastor && idxEditPreaching < idxReadPastor && idxProjectPreaching < idxReadPastor)) throw new Error('Validación falló: permisos de prédica siguen usándose antes de declararse.');
if (!(idxProjectBible < idxBibleOutline)) throw new Error('Validación falló: canProjectBible sigue usándose antes de declararse.');

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('Fix crítico aplicado: el Controlador ya no evalúa permisos antes de inicializarlos.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}

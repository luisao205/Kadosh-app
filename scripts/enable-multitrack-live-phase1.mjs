import fs from 'node:fs';

const appPath = 'src/App.jsx';
const setlistPath = 'src/components/admin/SetlistViewer.jsx';

const read = (path) => fs.readFileSync(path, 'utf8');
const detectEol = (text) => text.includes('\r\n') ? '\r\n' : '\n';

const replaceOnce = (text, needle, replacement, label) => {
  const first = text.indexOf(needle);
  if (first === -1) throw new Error(`No se encontró el marcador: ${label}`);
  if (text.indexOf(needle, first + needle.length) !== -1) throw new Error(`Marcador duplicado: ${label}`);
  return text.slice(0, first) + replacement + text.slice(first + needle.length);
};

const originalApp = read(appPath);
const originalSetlist = read(setlistPath);
let nextApp = originalApp;
let nextSetlist = originalSetlist;

if (!nextApp.includes("import MultitrackLive from './components/live/MultitrackLive';")) {
  nextApp = replaceOnce(
    nextApp,
    "import MultimediaHub from './components/live/MultimediaHub';",
    "import MultimediaHub from './components/live/MultimediaHub';\nimport MultitrackLive from './components/live/MultitrackLive';",
    'import MultitrackLive'
  );
}

if (!nextApp.includes('path="/multitrack-live/:eventoId"')) {
  const routeMarker = '        {/* Ruta del Modo Culto (Pantalla Completa, SIN Layout) */}';
  const routeBlock = `        {/* Multitrack Live - motor independiente del modo ensayo */}\n        <Route path="/multitrack-live/:eventoId" element={<ProtectedLiveRoute allowed={canViewEventsAndSetlists(user)} message="Tu rol no tiene acceso a Multitrack Live."><MultitrackLive user={user} /></ProtectedLiveRoute>} />\n        \n`;
  nextApp = replaceOnce(nextApp, routeMarker, routeBlock + routeMarker, 'ruta Multitrack Live');
}

if (!nextSetlist.includes('Radio } from \'lucide-react\';') && !nextSetlist.includes(', Radio } from \'lucide-react\';')) {
  nextSetlist = replaceOnce(
    nextSetlist,
    'Volume2, VolumeX, Cake, Edit3 } from \'lucide-react\';',
    'Volume2, VolumeX, Cake, Edit3, Radio } from \'lucide-react\';',
    'icono Radio en SetlistViewer'
  );
}

if (!nextSetlist.includes('Multitrack Live</button>') && !nextSetlist.includes('> Multitrack Live')) {
  const eol = detectEol(nextSetlist);
  const marker = '          {playlist.length > 0 && (';
  const buttonBlock = [
    '          {playlist.some(song => (Array.isArray(song?.multitracks) && song.multitracks.some(track => track?.url)) || song?.audioUrl) && (',
    '            <button onClick={() => navigate(`/multitrack-live/${id}`)} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 text-white rounded-xl hover:bg-sky-500 font-bold text-sm shadow-sm transition-colors active:scale-95 w-full sm:w-max">',
    '              <Radio size={16} /> Multitrack Live',
    '            </button>',
    '          )}',
    '',
  ].join(eol);
  nextSetlist = replaceOnce(nextSetlist, marker, buttonBlock + marker, 'botón Multitrack Live');
}

// No escribimos nada hasta validar que ambas transformaciones quedaron completas.
const appReady = nextApp.includes("import MultitrackLive from './components/live/MultitrackLive';") && nextApp.includes('path="/multitrack-live/:eventoId"');
const setlistReady = nextSetlist.includes('Radio } from \'lucide-react\';') && nextSetlist.includes('Multitrack Live');
if (!appReady || !setlistReady) throw new Error('Validación final fallida; no se escribió ningún archivo.');

fs.writeFileSync(appPath, nextApp, 'utf8');
fs.writeFileSync(setlistPath, nextSetlist, 'utf8');
console.log('Multitrack Live Fase 1 integrado en App + SetlistViewer.');

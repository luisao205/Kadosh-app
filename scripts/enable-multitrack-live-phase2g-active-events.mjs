import fs from 'node:fs';

const filePath = 'src/components/admin/MultitrackLiveManagement.jsx';
const original = fs.readFileSync(filePath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let text = original.replace(/\r\n/g, '\n');

const replaceOnce = (source, needle, replacement, label) => {
  const first = source.indexOf(needle);
  if (first === -1) throw new Error(`No se encontró: ${label}`);
  if (source.indexOf(needle, first + needle.length) !== -1) throw new Error(`Marcador duplicado: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

if (!text.includes('ChevronDown')) {
  text = replaceOnce(
    text,
    '  SlidersHorizontal,\n} from \'lucide-react\';',
    '  SlidersHorizontal,\n  ChevronDown,\n  ChevronUp,\n} from \'lucide-react\';',
    'iconos archivo de setlists'
  );
}

if (!text.includes('const [showArchivedEvents, setShowArchivedEvents]')) {
  text = replaceOnce(
    text,
    '  const [prepareResults, setPrepareResults] = useState({});',
    '  const [prepareResults, setPrepareResults] = useState({});\n  const [showArchivedEvents, setShowArchivedEvents] = useState(false);',
    'estado eventos anteriores'
  );
}

if (!text.includes('const activeEventCards = useMemo')) {
  const marker = '  useEffect(() => {\n    if (activeTab !== \'setlists\'';
  const insert = [
    '  const activeEventCards = useMemo(() => visibleEventCards.filter(({ event }) => (',
    "    !event?.completado && event?.estado !== 'cancelado'",
    '  )), [visibleEventCards]);',
    '',
    '  const archivedEventCards = useMemo(() => visibleEventCards.filter(({ event }) => (',
    "    Boolean(event?.completado) || event?.estado === 'cancelado'",
    '  )), [visibleEventCards]);',
    '',
    '  const displayedEventCards = useMemo(() => (',
    '    showArchivedEvents ? [...activeEventCards, ...archivedEventCards] : activeEventCards',
    '  ), [activeEventCards, archivedEventCards, showArchivedEvents]);',
    '',
  ].join('\n');
  text = replaceOnce(text, marker, insert + marker, 'grupos activos y anteriores');
}

const oldCounts = [
  '  const setlistCounts = useMemo(() => ({',
  '    total: eventCards.length,',
  '    ready: eventCards.filter((card) => card.readyForLive).length,',
  '    pending: eventCards.filter((card) => card.totalSongs > 0 && !card.readyForLive).length,',
  '  }), [eventCards]);'
].join('\n');

if (text.includes(oldCounts)) {
  const newCounts = [
    '  const setlistCounts = useMemo(() => ({',
    '    total: activeEventCards.length,',
    '    ready: activeEventCards.filter((card) => card.readyForLive).length,',
    '    pending: activeEventCards.filter((card) => card.totalSongs > 0 && !card.readyForLive).length,',
    '  }), [activeEventCards]);'
  ].join('\n');
  text = replaceOnce(text, oldCounts, newCounts, 'contadores de setlists activos');
}

if (!text.includes('Eventos anteriores / cerrados')) {
  const marker = '          {loadingEvents || loadingSongs ? (';
  const archiveBar = [
    '          {!loadingEvents && !loadingSongs && archivedEventCards.length > 0 && (',
    '            <button',
    '              type="button"',
    '              onClick={() => setShowArchivedEvents((previous) => !previous)}',
    '              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"',
    '            >',
    '              <div className="min-w-0">',
    '                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Eventos anteriores / cerrados</p>',
    '                <p className="mt-1 text-[10px] font-semibold text-zinc-600">{archivedEventCards.length} oculto{archivedEventCards.length === 1 ? \'\' : \'s\'} · finalizados o cancelados</p>',
    '              </div>',
    '              <div className="flex shrink-0 items-center gap-2 text-[10px] font-black uppercase tracking-wide text-zinc-500">',
    "                {showArchivedEvents ? 'Ocultar' : 'Mostrar'}",
    '                {showArchivedEvents ? <ChevronUp size={16} /> : <ChevronDown size={16} />}',
    '              </div>',
    '            </button>',
    '          )}',
    '',
  ].join('\n');
  text = replaceOnce(text, marker, archiveBar + marker, 'barra de eventos anteriores');
}

text = text.replace('          ) : visibleEventCards.length === 0 ? (', '          ) : displayedEventCards.length === 0 ? (');
text = text.replace('              <p className="mt-3 text-sm font-black text-zinc-400">No hay setlists que coincidan.</p>', '              <p className="mt-3 text-sm font-black text-zinc-400">No hay setlists activos que coincidan.</p>');
text = text.replace('              {visibleEventCards.map((card) => {', '              {displayedEventCards.map((card) => {');

if (!text.includes("const isArchived = Boolean(event.completado) || event.estado === 'cancelado';")) {
  text = replaceOnce(
    text,
    '                const mapPending = Math.max(0, totalSongs - readyMaps);',
    [
      '                const mapPending = Math.max(0, totalSongs - readyMaps);',
      "                const isArchived = Boolean(event.completado) || event.estado === 'cancelado';",
      "                const archivedLabel = event.estado === 'cancelado' ? 'Cancelado' : 'Finalizado';"
    ].join('\n'),
    'estado visual archivado'
  );
}

const oldCardClass = "                  <div key={event.id} className={`rounded-3xl border p-4 md:p-5 ${readyForLive ? 'border-emerald-400/25 bg-emerald-400/[0.045]' : 'border-white/10 bg-white/[0.03]'}`}>";
if (text.includes(oldCardClass)) {
  const newCardClass = "                  <div key={event.id} className={`rounded-3xl border p-4 md:p-5 ${isArchived ? 'border-white/8 bg-black/15 opacity-75 hover:opacity-100' : readyForLive ? 'border-emerald-400/25 bg-emerald-400/[0.045]' : 'border-white/10 bg-white/[0.03]'}`}>";
  text = replaceOnce(text, oldCardClass, newCardClass, 'estilo tarjeta archivada');
}

const oldBadge = [
  "                          <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${readyForLive ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-300'}`}>",
  "                            {readyForLive ? 'Listo para Live' : totalSongs === 0 ? 'Sin canciones' : 'Falta preparar'}",
  '                          </span>'
].join('\n');

if (text.includes(oldBadge)) {
  const newBadge = [
    "                          <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${isArchived ? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400' : readyForLive ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-300'}`}>",
    "                            {isArchived ? archivedLabel : readyForLive ? 'Listo para Live' : totalSongs === 0 ? 'Sin canciones' : 'Falta preparar'}",
    '                          </span>'
  ].join('\n');
  text = replaceOnce(text, oldBadge, newBadge, 'badge archivado');
}

text = text.replace('              <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-zinc-600">Setlists</p>', '              <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-zinc-600">Activos</p>');

const required = [
  'ChevronDown',
  'showArchivedEvents',
  'const activeEventCards = useMemo',
  'const archivedEventCards = useMemo',
  'const displayedEventCards = useMemo',
  'Eventos anteriores / cerrados',
  "const isArchived = Boolean(event.completado) || event.estado === 'cancelado';",
  'Activos</p>',
];

for (const marker of required) {
  if (!text.includes(marker)) throw new Error(`Validación final fallida: ${marker}`);
}

fs.writeFileSync(filePath, text.replace(/\n/g, eol), 'utf8');
console.log('Multitrack Live Fase 2G ajustada: activos visibles y eventos anteriores colapsados.');

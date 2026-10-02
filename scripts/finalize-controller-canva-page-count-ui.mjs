import fs from 'node:fs';

const target = 'src/components/live/ProyectorController.jsx';
const raw = fs.readFileSync(target, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');

const replaceOnce = (text, needle, replacement, label) => {
  if (text.includes(replacement)) {
    console.log('[skip] ' + label + ': ya aplicado.');
    return text;
  }
  const index = text.indexOf(needle);
  if (index === -1) throw new Error('No se encontró: ' + label);
  console.log('[ok] ' + label);
  return text.slice(0, index) + replacement + text.slice(index + needle.length);
};

const replaceAllCounted = (text, needle, replacement, label, expectedMinimum = 1) => {
  const count = text.split(needle).length - 1;
  if (count < expectedMinimum) throw new Error('No se encontró suficiente veces: ' + label + ' (' + count + ').');
  console.log('[ok] ' + label + ': ' + count + ' reemplazo(s)');
  return text.split(needle).join(replacement);
};

const replaceBetween = (text, startMarker, endMarker, replacement, label) => {
  const start = text.indexOf(startMarker);
  if (start === -1) throw new Error('No se encontró inicio: ' + label);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error('No se encontró fin: ' + label);
  console.log('[ok] ' + label);
  return text.slice(0, start) + replacement + text.slice(end);
};

source = replaceOnce(
  source,
  "  const [canvaPageCount, setCanvaPageCount] = useState(1);",
  "  const [canvaPageCount, setCanvaPageCount] = useState(0);",
  'total Canva inicia sin configurar'
);

source = replaceOnce(
  source,
  "    setCanvaPageCount(1);\n    setCanvaPageWindowStart(1);",
  "    setCanvaPageCount(0);\n    setCanvaPageWindowStart(1);",
  'nueva presentación sin total ficticio'
);

source = replaceAllCounted(
  source,
  "setCanvaPageCount(Math.max(1, Math.min(500, Math.floor(Number(item.pageCount) || 1))));",
  "setCanvaPageCount(Number(item.pageCount) >= 1 ? Math.max(1, Math.min(500, Math.floor(Number(item.pageCount)))) : 0);",
  'cargar total real o sin configurar',
  2
);

source = replaceOnce(
  source,
  "    setIsSavingCanva(true);\n    try {",
  "    const safeConfiguredPageCount = Math.floor(Number(canvaPageCount) || 0);\n    if (safeConfiguredPageCount < 1 || safeConfiguredPageCount > 500) {\n      setCanvaUrlError('Indica la cantidad real de páginas de Canva (1 a 500) antes de guardar.');\n      return;\n    }\n\n    setIsSavingCanva(true);\n    try {",
  'validar total antes de guardar Canva'
);

source = replaceOnce(
  source,
  "                          value={canvaPageCount}\n                          onChange={(event) => {\n                            const nextCount = Math.max(1, Math.min(500, Math.floor(Number(event.target.value) || 1)));\n                            setCanvaPageCount(nextCount);\n                            if (canvaPage > nextCount) setCanvaPage(nextCount);\n                            setCanvaPageWindowStart((current) => Math.min(current, (Math.floor((nextCount - 1) / 10) * 10) + 1));\n                          }}",
  "                          value={canvaPageCount || ''}\n                          placeholder=\"Ej. 56\"\n                          onChange={(event) => {\n                            const rawCount = event.target.value;\n                            if (rawCount === '') {\n                              setCanvaPageCount(0);\n                              setCanvaPageWindowStart(1);\n                              setCanvaUrlError('');\n                              return;\n                            }\n                            const nextCount = Math.max(1, Math.min(500, Math.floor(Number(rawCount) || 1)));\n                            setCanvaPageCount(nextCount);\n                            if (canvaPage > nextCount) setCanvaPage(nextCount);\n                            setCanvaPageWindowStart((current) => Math.min(current, (Math.floor((nextCount - 1) / 10) * 10) + 1));\n                            setCanvaUrlError('');\n                          }}",
  'input de total admite estado sin configurar'
);

source = replaceOnce(
  source,
  "  const canvaSafePageCount = Math.max(1, Math.min(500, Math.floor(Number(canvaPageCount) || 1)));",
  "  const canvaHasConfiguredPageCount = Number(canvaPageCount) >= 1;\n  const canvaSafePageCount = canvaHasConfiguredPageCount\n    ? Math.max(1, Math.min(500, Math.floor(Number(canvaPageCount))))\n    : 1;",
  'estado explícito de total configurado'
);

const pageGrid = String.raw`                      <div className="border-b border-white/10 bg-zinc-950/90 p-2 sm:p-3">
                        {canvaHasConfiguredPageCount ? (
                          <>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-300">Páginas {canvaSafeWindowStart}-{canvaPageBlockEnd} de {canvaSafePageCount}</p>
                                <p className="mt-0.5 text-[9px] font-bold text-zinc-600">Actual: {canvaPage}</p>
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => changeCanvaPage(canvaPage - 1)} disabled={canvaPage <= 1} className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30">← Anterior</button>
                                <button type="button" onClick={() => changeCanvaPage(canvaPage + 1)} disabled={canvaPage >= canvaSafePageCount} className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30">Siguiente →</button>
                              </div>
                            </div>

                            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                              {canvaVisiblePages.map((pageNumber) => (
                                <button
                                  key={pageNumber}
                                  type="button"
                                  onClick={() => changeCanvaPage(pageNumber)}
                                  className={'min-h-11 rounded-xl border text-xs font-black transition-colors ' + (canvaPage === pageNumber ? 'border-cyan-200 bg-cyan-400 text-zinc-950 shadow-lg shadow-cyan-500/10' : 'border-white/10 bg-white/5 text-zinc-200 hover:border-cyan-400/30 hover:bg-cyan-500/10')}
                                >
                                  {pageNumber}
                                </button>
                              ))}
                            </div>

                            {(canvaSafeWindowStart > 1 || canvaPageBlockEnd < canvaSafePageCount) && (
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <button
                                  type="button"
                                  disabled={canvaSafeWindowStart <= 1}
                                  onClick={() => setCanvaPageWindowStart(Math.max(1, canvaSafeWindowStart - 10))}
                                  className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase text-zinc-300 disabled:cursor-not-allowed disabled:opacity-25"
                                >
                                  ← {Math.max(1, canvaSafeWindowStart - 10)}-{canvaSafeWindowStart - 1}
                                </button>
                                <button
                                  type="button"
                                  disabled={canvaPageBlockEnd >= canvaSafePageCount}
                                  onClick={() => setCanvaPageWindowStart(canvaSafeWindowStart + 10)}
                                  className="min-h-10 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 text-[9px] font-black uppercase text-cyan-100 disabled:cursor-not-allowed disabled:opacity-25"
                                >
                                  {canvaPageBlockEnd + 1}-{Math.min(canvaPageBlockEnd + 10, canvaSafePageCount)} →
                                </button>
                              </div>
                            )}
                            <p className="mt-2 text-center text-[9px] font-bold text-zinc-600">Los números de Kadosh sincronizan todas las salidas que muestran esta presentación.</p>
                          </>
                        ) : (
                          <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-center">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">Total de páginas sin configurar</p>
                            <p className="mt-1 text-[9px] font-bold leading-relaxed text-amber-100/70">Indica arriba cuántas páginas tiene esta presentación y pulsa Guardar cambios. Después aparecerán los botones 1–10, 11–20, etc.</p>
                          </div>
                        )}
                      </div>
`;
source = replaceBetween(
  source,
  '                      <div className="border-b border-white/10 bg-zinc-950/90 p-2 sm:p-3">',
  '                      <div className="aspect-video w-full bg-black">',
  pageGrid,
  'selector Canva distingue total configurado'
);

source = replaceOnce(
  source,
  "<p className=\"mt-1 text-[9px] font-bold text-zinc-500\">{Math.max(1, Number(item.pageCount) || 1)} página(s)</p>",
  "<p className=\"mt-1 text-[9px] font-bold text-zinc-500\">{Number(item.pageCount) >= 1 ? (Math.floor(Number(item.pageCount)) + ' página(s)') : 'Total de páginas sin configurar'}</p>",
  'tarjetas no fingen una página'
);

const required = [
  'const [canvaPageCount, setCanvaPageCount] = useState(0);',
  'canvaHasConfiguredPageCount',
  'Total de páginas sin configurar',
  'Indica la cantidad real de páginas de Canva',
  "placeholder=\"Ej. 56\"",
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error('Validación interna falló: ' + marker);
}

fs.writeFileSync(target, source.replace(/\n/g, eol), 'utf8');
console.log('Canva finalizado: total de páginas explícito, selector 1-10 confiable y biblioteca sin valores ficticios.');

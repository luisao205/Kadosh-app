import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Loader2, Search, X } from 'lucide-react';
import {
  getBooks,
  getChapter,
  getChapters,
  getPassage,
  getPreferredTranslationId,
  getTranslations,
  searchText,
  setPreferredTranslationId,
  splitPassageIntoSlides
} from '../../utils/bibleService';

const emptyResult = null;

const BiblePicker = ({
  open = true,
  onClose,
  onUse,
  onProject,
  title = 'Biblia Kadosh',
  mode = 'project'
}) => {
  const [translations, setTranslations] = useState({ available: [], future: [] });
  const [translationId, setTranslationId] = useState(getPreferredTranslationId());
  const [books, setBooks] = useState([]);
  const [bookCode, setBookCode] = useState('JHN');
  const [chapters, setChapters] = useState([]);
  const [chapter, setChapter] = useState(3);
  const [verse, setVerse] = useState(16);
  const [referenceQuery, setReferenceQuery] = useState('Juan 3:16');
  const [textQuery, setTextQuery] = useState('');
  const [textResults, setTextResults] = useState([]);
  const [result, setResult] = useState(emptyResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedTranslation = useMemo(
    () => translations.available.find(item => item.translationId === translationId) || translations.available[0] || null,
    [translationId, translations.available]
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    getTranslations().then(data => {
      if (!active) return;
      setTranslations(data);
      const preferred = getPreferredTranslationId();
      const exists = data.available.some(item => item.translationId === preferred);
      setTranslationId(exists ? preferred : 'local:rv1909');
    }).catch(() => setError('No se pudieron cargar las traducciones.'));
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open || !translationId) return;
    let active = true;
    getBooks(translationId).then(items => {
      if (!active) return;
      setBooks(items);
      if (items.length && !items.some(item => item.code === bookCode)) setBookCode(items[0].code);
    }).catch(() => setBooks([]));
    setPreferredTranslationId(translationId);
    return () => { active = false; };
  }, [bookCode, open, translationId]);

  useEffect(() => {
    if (!open || !bookCode || !translationId) return;
    let active = true;
    getChapters(bookCode, translationId).then(items => {
      if (!active) return;
      setChapters(items);
      if (items.length && !items.includes(Number(chapter))) setChapter(items[0]);
    }).catch(() => setChapters([]));
    return () => { active = false; };
  }, [bookCode, chapter, open, translationId]);

  const runReferenceSearch = async (value = referenceQuery) => {
    setLoading(true);
    setError('');
    try {
      const passage = await getPassage({ reference: value, translationId });
      setResult(passage);
      setBookCode(passage.bookCode);
      setChapter(passage.chapter);
      setVerse(passage.verses?.[0]?.number || 1);
    } catch (err) {
      setResult(null);
      setError(err.message || 'No se pudo buscar la referencia.');
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedVerse = async () => {
    setLoading(true);
    setError('');
    try {
      const book = books.find(item => item.code === bookCode);
      const passage = await getPassage({ reference: `${book?.name || bookCode} ${chapter}:${verse}`, translationId });
      setResult(passage);
      setReferenceQuery(passage.reference);
    } catch (err) {
      setResult(null);
      setError(err.message || 'No se pudo cargar el versiculo.');
    } finally {
      setLoading(false);
    }
  };

  const runTextSearch = async () => {
    setLoading(true);
    setError('');
    try {
      const items = await searchText({ query: textQuery, translationId, limit: 18 });
      setTextResults(items);
      if (items.length === 0) setError('No se encontraron coincidencias en RV1909.');
    } catch (err) {
      setTextResults([]);
      setError(err.message || 'No se pudo buscar por palabras.');
    } finally {
      setLoading(false);
    }
  };

  const handleUse = () => {
    if (!result) return;
    onUse?.(result);
  };

  const handleProject = () => {
    if (!result) return;
    onProject?.({ passage: result, slides: splitPassageIntoSlides(result) });
  };

  if (!open) return null;

  const content = (
    <div className="grid max-h-[86vh] min-h-0 gap-4 overflow-hidden lg:grid-cols-[0.75fr_1.25fr]">
      <section className="min-h-0 overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950/60 p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-300">Traduccion</p>
            <h3 className="text-xl font-black text-white">{title}</h3>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-300 hover:bg-white/10">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="space-y-3">
          <select value={translationId} onChange={e => setTranslationId(e.target.value)} className="kp-input w-full rounded-2xl px-4 py-3 text-sm">
            {translations.available.map(item => (
              <option key={item.translationId} value={item.translationId} className="bg-zinc-900">
                {item.abbreviation} - {item.offline ? 'Offline' : 'Online'}
              </option>
            ))}
          </select>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Proximamente</p>
            <div className="grid gap-2">
              {translations.future.map(item => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 opacity-55">
                  <span className="text-xs font-black text-zinc-300">{item.abbreviation}</span>
                  <span className="text-[10px] font-bold uppercase text-zinc-500">{item.reason}</span>
                </div>
              ))}
            </div>
          </div>

          <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); runReferenceSearch(); }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Buscar referencia</p>
            <div className="flex gap-2">
              <input value={referenceQuery} onChange={e => setReferenceQuery(e.target.value)} className="kp-input min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm" placeholder="Juan 3:16" />
              <button type="submit" disabled={loading} className="kp-button-primary rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50">
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
              </button>
            </div>
          </form>

          <div className="grid gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Navegacion</p>
            <select value={bookCode} onChange={e => setBookCode(e.target.value)} className="kp-input rounded-2xl px-4 py-3 text-sm">
              {books.map(item => <option key={item.code} value={item.code} className="bg-zinc-900">{item.name}</option>)}
            </select>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <select value={chapter} onChange={e => setChapter(Number(e.target.value))} className="kp-input rounded-2xl px-3 py-3 text-sm">
                {chapters.map(item => <option key={item} value={item} className="bg-zinc-900">{item}</option>)}
              </select>
              <input type="number" min="1" value={verse} onChange={e => setVerse(Number(e.target.value) || 1)} className="kp-input rounded-2xl px-3 py-3 text-sm" />
              <button type="button" onClick={loadSelectedVerse} disabled={loading} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-50">Ver</button>
            </div>
          </div>

          <div className="grid gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Buscar por palabras</p>
            <div className="flex gap-2">
              <input value={textQuery} onChange={e => setTextQuery(e.target.value)} className="kp-input min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm" placeholder="gracia" />
              <button type="button" onClick={runTextSearch} disabled={loading || !textQuery.trim()} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-50">Buscar</button>
            </div>
            {textResults.length > 0 && (
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {textResults.map(item => (
                  <button key={item.passageId} type="button" onClick={() => { setReferenceQuery(item.reference); runReferenceSearch(item.reference); }} className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10">
                    <p className="text-xs font-black text-white">{item.reference}</p>
                    <p className="line-clamp-2 text-[11px] font-semibold text-zinc-400">{item.text}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="min-h-0 overflow-y-auto rounded-3xl border border-blue-400/20 bg-blue-500/10 p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-200">Preview</p>
            <h3 className="text-2xl font-black text-white">{result?.reference || 'Busca un pasaje'}</h3>
            <p className="mt-1 text-xs font-bold text-blue-100/70">
              {selectedTranslation ? `${selectedTranslation.abbreviation} - ${selectedTranslation.translationName}` : 'RV1909'}
            </p>
          </div>
          <BookOpen className="text-blue-200" size={24} />
        </div>

        {error && <div className="mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">{error}</div>}
        {loading && <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-center text-sm font-bold text-zinc-400">Cargando...</div>}

        {result ? (
          <div className="space-y-4">
            <div className="rounded-3xl bg-black/25 p-5">
              <p className="whitespace-pre-wrap text-xl font-black leading-relaxed text-white">{result.text}</p>
            </div>
            <p className="text-xs font-semibold text-blue-100/70">
              {result.copyright === 'Public Domain' ? 'Dominio publico - eBible.org' : result.copyright}
            </p>
            <div className="flex flex-wrap gap-2">
              {onProject && (
                <button type="button" onClick={handleProject} className="kp-button-primary inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black">
                  <Check size={16} /> Proyectar
                </button>
              )}
              {onUse && (
                <button type="button" onClick={handleUse} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-500/20">
                  Usar este pasaje
                </button>
              )}
            </div>
            {mode === 'project' && splitPassageIntoSlides(result).length > 1 && (
              <p className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs font-bold text-zinc-400">
                Este rango se dividira en {splitPassageIntoSlides(result).length} slides para mantener lectura clara.
              </p>
            )}
          </div>
        ) : !loading && (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
            <BookOpen className="mx-auto mb-3 text-zinc-600" size={42} />
            <p className="font-black text-white">RV1909 lista sin conexion.</p>
            <p className="mt-1 text-sm font-semibold text-zinc-500">Busca por referencia o navega libro, capitulo y versiculo.</p>
          </div>
        )}
      </section>
    </div>
  );

  if (!onClose) return content;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md">
      <div className="w-full max-w-6xl rounded-[2rem] border border-white/10 bg-zinc-950 p-3 shadow-2xl">
        {content}
      </div>
    </div>
  );
};

export default BiblePicker;

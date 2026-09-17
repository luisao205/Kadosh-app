import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import { DEFAULT_TRANSLATION_ID, getBooks, getChapter, getChapters, getPassage, getPreferredTranslationId, getTranslations, searchText, setPreferredTranslationId, splitPassageIntoSlides } from '../../utils/bibleService';
import { commitBibleSelectionField, createBibleSelection, normalizeBibleSelection, selectBibleVerse, updateBibleSelectionDraft } from '../../utils/bibleSelection';

const BiblePicker = ({ open = true, onClose, onUse, onProject, onPrimaryAction, primaryActionLabel = 'Proyectar Biblia', onPreviewChange, onProjectedSlideChange, preparedPreview, projectedPassageId, projectedSlideIndex, title = 'Biblia Kadosh', embedded = false }) => {
  const [translations, setTranslations] = useState({ available: [], future: [] });
  const [translationId, setTranslationId] = useState(getPreferredTranslationId());
  const [books, setBooks] = useState([]);
  const [bookCode, setBookCode] = useState('JHN');
  const [chapters, setChapters] = useState([]);
  const [chapter, setChapter] = useState(3);
  const [chapterData, setChapterData] = useState(null);
  const [verseSelection, setVerseSelection] = useState(() => createBibleSelection(16));
  const [referenceQuery, setReferenceQuery] = useState('Juan 3:16');
  const [textQuery, setTextQuery] = useState('');
  const [textResults, setTextResults] = useState([]);
  const [result, setResult] = useState(null);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedTranslation = useMemo(() => translations.available.find(item => item.translationId === translationId) || translations.available[0] || null, [translationId, translations.available]);
  const selectedBook = useMemo(() => books.find(item => item.code === bookCode) || null, [books, bookCode]);
  const slides = useMemo(() => result ? splitPassageIntoSlides(result) : [], [result]);
  const selectedSlide = slides[selectedSlideIndex] || slides[0] || null;
  const isPreparedDeckProjected = Boolean(onProjectedSlideChange && result?.passageId && result.passageId === projectedPassageId);
  const displayedSlideIndex = isPreparedDeckProjected
    ? Math.max(0, Math.min(Number(projectedSlideIndex) || 0, Math.max(slides.length - 1, 0)))
    : selectedSlideIndex;
  const verses = chapterData?.verses || [];
  const oldTestament = books.filter(book => Number(book.order) <= 39);
  const newTestament = books.filter(book => Number(book.order) >= 40);

  const publishPreview = (passage, nextIndex = 0) => {
    const nextSlides = splitPassageIntoSlides(passage);
    const safeIndex = Math.max(0, Math.min(nextIndex, Math.max(nextSlides.length - 1, 0)));
    setResult(passage);
    setSelectedSlideIndex(safeIndex);
    onPreviewChange?.({ passage, slides: nextSlides, selectedIndex: safeIndex });
  };

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    getTranslations().then((data) => {
      if (!active) return;
      setTranslations(data);
      const preferred = getPreferredTranslationId();
      setTranslationId(data.available.some(item => item.translationId === preferred) ? preferred : DEFAULT_TRANSLATION_ID);
    }).catch(() => setError('No se pudieron cargar las traducciones.'));
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open || !translationId) return undefined;
    let active = true;
    getBooks(translationId).then((items) => {
      if (!active) return;
      setBooks(items);
      if (items.length && !items.some(item => item.code === bookCode)) setBookCode(items[0].code);
    }).catch(() => setBooks([]));
    setPreferredTranslationId(translationId);
    return () => { active = false; };
  }, [bookCode, open, translationId]);

  useEffect(() => {
    if (!open || !bookCode || !translationId) return undefined;
    let active = true;
    getChapters(bookCode, translationId).then((items) => {
      if (!active) return;
      setChapters(items);
      if (items.length && !items.includes(Number(chapter))) setChapter(items[0]);
    }).catch(() => setChapters([]));
    return () => { active = false; };
  }, [bookCode, chapter, open, translationId]);

  useEffect(() => {
    if (!open || !bookCode || !chapter || !translationId) return undefined;
    let active = true;
    getChapter({ bookCode, chapter, translationId }).then((data) => {
      if (!active) return;
      setChapterData(data);
      const first = data.verses?.[0]?.number || 1;
      setVerseSelection((selection) => {
        const normalized = normalizeBibleSelection(selection, data.verses?.at(-1)?.number || first);
        const isAvailable = data.verses?.some(item => item.number === normalized.start)
          && data.verses?.some(item => item.number === normalized.end);
        return isAvailable ? createBibleSelection(normalized.start, normalized.end, selection.active) : createBibleSelection(first);
      });
    }).catch(() => setChapterData(null));
    return () => { active = false; };
  }, [bookCode, chapter, open, translationId]);

  useEffect(() => {
    const passage = preparedPreview?.passage;
    if (!open) return;
    if (!passage) {
      setResult(null);
      setSelectedSlideIndex(0);
      return;
    }

    setResult(passage);
    setSelectedSlideIndex(Math.max(0, Math.min(preparedPreview.selectedIndex || 0, Math.max((preparedPreview.slides?.length || 1) - 1, 0))));
    setBookCode(passage.bookCode);
    setChapter(passage.chapter);
    if (passage.translationId) setTranslationId(passage.translationId);
    setVerseSelection(createBibleSelection(passage.verses?.[0]?.number || 1, passage.verses?.at(-1)?.number || 1, true));
    setReferenceQuery(passage.reference || '');
  }, [open, preparedPreview?.passage?.passageId, preparedPreview?.selectedIndex]);

  const loadPassage = async (reference) => {
    setLoading(true); setError('');
    try {
      const passage = await getPassage({ reference, translationId });
      publishPreview(passage);
      setBookCode(passage.bookCode); setChapter(passage.chapter);
      setVerseSelection(createBibleSelection(passage.verses?.[0]?.number || 1, passage.verses?.at(-1)?.number || 1, true));
      setReferenceQuery(passage.reference);
    } catch (err) { setError(err.message || 'No se pudo cargar el pasaje.'); }
    finally { setLoading(false); }
  };
  const clearPreview = () => { setResult(null); setSelectedSlideIndex(0); onPreviewChange?.(null); };
  const selectBook = (book) => { clearPreview(); setBookCode(book.code); setChapter(book.chapterNumbers?.[0] || 1); setVerseSelection(createBibleSelection(1)); setShowBookPicker(false); };
  const selectChapter = (nextChapter) => { clearPreview(); setChapter(nextChapter); setVerseSelection(createBibleSelection(1)); };
  const maxVerseNumber = verses.at(-1)?.number || 1;
  const selectedRange = normalizeBibleSelection(verseSelection, maxVerseNumber);
  const selectVerse = (number) => setVerseSelection(selection => selectBibleVerse(selection, number, maxVerseNumber));
  const commitSelectionField = (field) => setVerseSelection(selection => commitBibleSelectionField(selection, field, maxVerseNumber));
  const previewRange = () => {
    if (!selectedBook) return;
    setVerseSelection(createBibleSelection(selectedRange.start, selectedRange.end, true));
    loadPassage(`${selectedBook.name} ${chapter}:${selectedRange.start}${selectedRange.start !== selectedRange.end ? `-${selectedRange.end}` : ''}`);
  };
  const chooseSlide = (index) => { setSelectedSlideIndex(index); if (result) onPreviewChange?.({ passage: result, slides, selectedIndex: index }); };
  const moveSlide = (delta) => {
    const currentIndex = isPreparedDeckProjected ? displayedSlideIndex : selectedSlideIndex;
    const nextIndex = Math.max(0, Math.min(currentIndex + delta, slides.length - 1));
    if (nextIndex === currentIndex) return;
    chooseSlide(nextIndex);
    if (isPreparedDeckProjected) onProjectedSlideChange(delta);
  };
  const rangeReference = selectedBook ? `${selectedBook.name} ${chapter}:${selectedRange.start}${selectedRange.start !== selectedRange.end ? `-${selectedRange.end}` : ''}` : '';

  if (!open) return null;
  const content = (
    <div className={`grid min-h-0 min-w-0 gap-3 overflow-visible lg:gap-4 lg:overflow-hidden lg:grid-cols-[0.8fr_1.2fr] ${(onClose || embedded) ? 'h-auto lg:h-full' : 'h-auto'}`}>
        <section className="min-h-0 min-w-0 rounded-3xl border border-white/10 bg-zinc-950/60 p-3 sm:p-4 lg:overflow-y-auto">
          <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-300">Traduccion</p><h3 className="text-xl font-black text-white">{title}</h3></div>{onClose && <button type="button" onClick={onClose} aria-label="Cerrar buscador bíblico" title="Cerrar" className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-300"><X size={16} /></button>}</div>
          <div className="space-y-3 sm:space-y-4">
          <select value={translationId} onChange={e => { clearPreview(); setTranslationId(e.target.value); }} className="kp-input w-full rounded-2xl px-4 py-3 text-sm">{translations.available.map(item => <option key={item.translationId} value={item.translationId} className="bg-zinc-900">{item.abbreviation} — {item.translationName}</option>)}</select>
          <form className="space-y-2" onSubmit={event => { event.preventDefault(); loadPassage(referenceQuery); }}><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Buscar referencia</p><div className="flex gap-2"><input value={referenceQuery} onChange={e => setReferenceQuery(e.target.value)} className="kp-input min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm" placeholder="Juan 3:16-18" /><button type="submit" disabled={loading} className="kp-button-primary rounded-2xl px-4 py-3">{loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}</button></div></form>
          <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-3"><button type="button" onClick={() => setShowBookPicker(true)} className="w-full rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-3 text-left text-sm font-black text-blue-50">Seleccionar libro <span className="float-right max-w-[55%] truncate text-blue-300">{selectedBook?.name || '...'}</span></button><div><p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Capitulo</p><div className="grid max-h-40 grid-cols-5 gap-1 overflow-y-auto pr-1 sm:grid-cols-6 lg:max-h-32 lg:grid-cols-8">{chapters.map(item => <button key={item} type="button" onClick={() => selectChapter(item)} className={`min-h-10 rounded-lg py-2 text-sm font-black ${chapter === item ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400'}`}>{item}</button>)}</div></div><div><p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Versiculos</p><div className="grid max-h-52 grid-cols-5 gap-1 overflow-y-auto pr-1 min-[420px]:grid-cols-6 sm:grid-cols-8 lg:max-h-44 lg:grid-cols-8 xl:grid-cols-10">{verses.map(item => { const isSelected = verseSelection.active && item.number >= selectedRange.start && item.number <= selectedRange.end; const isStart = isSelected && item.number === selectedRange.start; const isEnd = isSelected && item.number === selectedRange.end; return <button key={item.number} type="button" onClick={() => selectVerse(item.number)} aria-pressed={isSelected} className={`min-h-10 rounded-lg border py-2 text-sm font-black ${isStart || isEnd ? 'border-violet-200 bg-violet-600 text-white ring-2 ring-violet-300/60' : isSelected ? 'border-violet-500/30 bg-violet-500/25 text-violet-50' : 'border-transparent bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>{item.number}</button>; })}</div></div><div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2"><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Desde<input type="text" inputMode="numeric" pattern="[0-9]*" value={verseSelection.start} onChange={e => setVerseSelection(selection => updateBibleSelectionDraft(selection, 'start', e.target.value))} onBlur={() => commitSelectionField('start')} className="kp-input mt-1 w-full rounded-xl px-3 py-2 text-sm" /></label><span className="pb-2 text-zinc-500">a</span><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Hasta<input type="text" inputMode="numeric" pattern="[0-9]*" value={verseSelection.end} onChange={e => setVerseSelection(selection => updateBibleSelectionDraft(selection, 'end', e.target.value))} onBlur={() => commitSelectionField('end')} className="kp-input mt-1 w-full rounded-xl px-3 py-2 text-sm" /></label></div><p className="text-center text-xs font-black uppercase tracking-wide text-violet-200">{rangeReference}</p><button type="button" onClick={previewRange} disabled={loading || !verses.length} className="w-full rounded-xl border border-violet-400/25 bg-violet-500/10 py-2.5 text-xs font-black uppercase text-violet-100">Previsualizar rango</button></div>
          <div className="space-y-2"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Buscar por palabras</p><div className="flex gap-2"><input value={textQuery} onChange={e => setTextQuery(e.target.value)} className="kp-input min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm" placeholder="gracia" /><button type="button" onClick={async () => { setLoading(true); setError(''); try { setTextResults(await searchText({ query: textQuery, translationId, limit: 18 })); } catch (err) { setTextResults([]); setError(err.message || 'No se pudo buscar por palabras.'); } finally { setLoading(false); } }} disabled={!textQuery.trim() || loading} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black">Buscar</button></div>{textResults.map(item => <button key={item.passageId} type="button" onClick={() => loadPassage(item.reference)} className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left"><p className="text-xs font-black text-white">{item.reference}</p><p className="line-clamp-2 text-[11px] text-zinc-400">{item.text}</p></button>)}</div>
        </div>
      </section>
      <section className="min-h-0 min-w-0 rounded-3xl border border-blue-400/20 bg-blue-500/10 p-3 sm:p-4 lg:overflow-y-auto">
        <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-200">Preview</p><h3 className="text-2xl font-black text-white">{result?.reference || 'Busca un pasaje'}</h3><p className="mt-1 text-xs font-bold text-blue-100/70">{selectedTranslation ? `${selectedTranslation.abbreviation} — ${selectedTranslation.translationName}` : 'RVR1960 — Reina-Valera 1960'}</p></div><BookOpen className="text-blue-200" size={24} /></div>
        {error && <div className="mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">{error}</div>}
        {result?.warning && <div className="mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">{result.warning}</div>}
        {selectedSlide ? <div className="space-y-4">
          <div className="flex min-h-48 flex-col items-center justify-center rounded-3xl bg-black/25 p-4 text-center sm:min-h-56 sm:p-5">{selectedSlide.heading && <p className="mb-3 text-sm font-black uppercase tracking-wide text-blue-100">{selectedSlide.heading}</p>}<p className="whitespace-pre-wrap text-lg font-black leading-relaxed text-white sm:text-xl">{selectedSlide.text}</p></div>
          <button type="button" onClick={() => (onPrimaryAction || onProject)?.({ passage: result, slides, selectedIndex: selectedSlideIndex })} className="kp-button-primary inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black"><Check size={16} /> {primaryActionLabel}</button>
          <div className="flex items-center justify-between gap-3"><button type="button" onClick={() => moveSlide(-1)} disabled={displayedSlideIndex === 0} aria-label="Anterior" className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-white/10 px-3 py-3 text-xs font-black disabled:opacity-30"><ChevronLeft size={18} /> Anterior</button><span className="text-xs font-black text-blue-100">{displayedSlideIndex + 1} / {slides.length}</span><button type="button" onClick={() => moveSlide(1)} disabled={displayedSlideIndex === slides.length - 1} aria-label="Siguiente" className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-white/10 px-3 py-3 text-xs font-black disabled:opacity-30">Siguiente <ChevronRight size={18} /></button></div>
          <div className="flex gap-2 overflow-x-auto pb-1">{slides.map((slide, index) => <button key={`${slide.reference}-${index}`} type="button" onClick={() => chooseSlide(index)} className={`h-12 w-12 shrink-0 rounded-xl border text-xs font-black ${displayedSlideIndex === index ? 'border-blue-300 bg-blue-600 text-white' : 'border-white/10 bg-black/20 text-zinc-400'}`}>{index + 1}</button>)}</div>
          {onUse && <button type="button" onClick={() => onUse(result)} className="w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm font-black text-emerald-100">Usar este pasaje</button>}
        </div> : <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center"><BookOpen className="mx-auto mb-3 text-zinc-600" size={42} /><p className="font-black text-white">Selecciona un pasaje para previsualizarlo.</p></div>}
      </section>
      {showBookPicker && <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/70 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-md sm:items-center"><div className="max-h-full w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 p-4 shadow-2xl sm:p-5"><div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between border-b border-white/10 bg-zinc-950 px-4 pb-3 sm:-mx-5 sm:px-5"><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300">Biblioteca</p><h3 className="text-xl font-black text-white">Seleccionar libro</h3></div><button type="button" onClick={() => setShowBookPicker(false)} aria-label="Cerrar selector de libros" className="rounded-xl border border-white/10 p-2"><X size={18} /></button></div>{[['Antiguo Testamento', oldTestament], ['Nuevo Testamento', newTestament]].map(([heading, items]) => <section key={heading} className="mb-5"><p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">{heading}</p><div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">{items.map(book => <button key={book.code} type="button" onClick={() => selectBook(book)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left text-sm font-black text-zinc-200 hover:border-blue-400/50 hover:bg-blue-500/10">{book.name}</button>)}</div></section>)}</div></div>}
    </div>
  );
  return onClose ? <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-md sm:items-center" onClick={onClose}><div className="max-h-[calc(100dvh-max(env(safe-area-inset-top),0.75rem)-max(env(safe-area-inset-bottom),0.75rem))] w-full max-w-6xl overflow-y-auto overscroll-contain rounded-[2rem] border border-white/10 bg-zinc-950 p-3 shadow-2xl lg:h-[86vh] lg:max-h-[calc(100dvh-1.5rem)] lg:overflow-hidden" onClick={event => event.stopPropagation()}>{content}</div></div> : content;
};

export default BiblePicker;

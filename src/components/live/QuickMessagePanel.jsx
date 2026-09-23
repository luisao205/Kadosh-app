import { useEffect, useMemo, useState } from 'react';
import { Monitor, Pencil, Plus, Trash2 } from 'lucide-react';
import { QUICK_MESSAGE_COLORS, QUICK_MESSAGE_MAX_SEGMENTS, QUICK_MESSAGE_TYPES, createQuickMessage } from '../../utils/quickMessageProjectionState';
import {
  addQuickMessageHistoryEntry,
  clearQuickMessageHistory,
  createQuickMessageHistoryId,
  removeQuickMessageHistoryEntry,
  replaceQuickMessageHistoryEntry
} from '../../utils/quickMessageHistory';

const COLOR_LABELS = { white: 'Blanco', blue: 'Azul', red: 'Rojo', yellow: 'Amarillo', green: 'Verde' };
const TYPE_LABELS = { theme: 'Tema', title: 'Titulo', point: 'Punto', phrase: 'Frase', call: 'Llamado' };
const COLOR_CLASSES = { white: 'text-white', blue: 'text-sky-300', red: 'text-[#FF1F1F]', yellow: 'text-yellow-300', green: 'text-emerald-300' };
const newSegment = () => ({ text: '', color: 'white', bold: true });
const cloneSegments = (source) => Array.isArray(source) && source.length
  ? source.map((segment) => ({ text: segment.text || '', color: segment.color || 'white', bold: segment.bold !== false }))
  : [newSegment()];

const QuickMessagePanel = ({ active, history: savedHistory = [], onProject, onClear, onRemoveHistoryEntry, onClearHistory }) => {
  const [presentationType, setPresentationType] = useState('point');
  const [segments, setSegments] = useState([newSegment()]);
  const [history, setHistory] = useState([]);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [draftBeforeEditing, setDraftBeforeEditing] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const preview = useMemo(() => createQuickMessage({ presentationType, segments }), [presentationType, segments]);

  const persistHistory = (nextHistory) => {
    setHistory(nextHistory);
  };

  useEffect(() => {
    const normalized = Array.isArray(savedHistory)
      ? savedHistory.slice(0, 8).map((item) => ({ ...item, id: item.id || createQuickMessageHistoryId() }))
      : [];
    setHistory(normalized);
  }, [savedHistory]);

  const updateSegment = (index, changes) => setSegments((current) => current.map((segment, itemIndex) => itemIndex === index ? { ...segment, ...changes } : segment));
  const cancelEditing = () => {
    if (draftBeforeEditing) {
      setPresentationType(draftBeforeEditing.presentationType);
      setSegments(cloneSegments(draftBeforeEditing.segments));
    }
    setEditingEntryId(null);
    setDraftBeforeEditing(null);
    setError('');
  };
  const startEditing = (entry) => {
    setDraftBeforeEditing({ presentationType, segments: cloneSegments(segments) });
    setPresentationType(entry.presentationType || 'point');
    setSegments(cloneSegments(entry.segments));
    setEditingEntryId(entry.id);
    setError('');
  };

  const project = async (message = preview, { entryId = editingEntryId, finishEditing = Boolean(editingEntryId) } = {}) => {
    if (!message || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await onProject(message, { historyEntryId: entryId || null });
      if (Array.isArray(result?.history)) {
        persistHistory(result.history);
      } else {
        const persistedEntryId = result?.historyEntry?.id || entryId || createQuickMessageHistoryId();
        const exists = persistedEntryId && history.some((item) => item.id === persistedEntryId);
        persistHistory(exists
          ? replaceQuickMessageHistoryEntry(history, persistedEntryId, message)
          : addQuickMessageHistoryEntry(history, message, persistedEntryId));
      }
      if (finishEditing) {
        setEditingEntryId(null);
        setDraftBeforeEditing(null);
      }
    } catch {
      setError('No se pudo proyectar el punto.');
    } finally {
      setSubmitting(false);
    }
  };

  const clearProjection = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await onClear();
    } catch {
      setError('No se pudo limpiar el punto.');
    } finally {
      setSubmitting(false);
    }
  };

  const projectHistoryEntry = (entry) => {
    const message = createQuickMessage({ presentationType: entry.presentationType, segments: entry.segments });
    return project(message, { entryId: entry.id, finishEditing: false });
  };
  const removeHistoryEntry = async (entryId) => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await onRemoveHistoryEntry?.(entryId);
      persistHistory(Array.isArray(result?.history) ? result.history : removeQuickMessageHistoryEntry(history, entryId));
      if (entryId === editingEntryId) cancelEditing();
    } catch {
      setError('No se pudo eliminar el punto del historial.');
    } finally {
      setSubmitting(false);
    }
  };
  const clearHistory = async () => {
    if (submitting || !window.confirm('¿Eliminar todos los últimos puntos?')) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await onClearHistory?.();
      persistHistory(Array.isArray(result?.history) ? result.history : clearQuickMessageHistory());
      if (editingEntryId) cancelEditing();
    } catch {
      setError('No se pudo limpiar el historial.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!active) return null;
  return (
    <section className="mt-4 space-y-3 rounded-2xl border border-violet-400/25 bg-violet-500/10 p-4">
      <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-200">Puntos del mensaje</p><p className="mt-1 text-xs font-bold text-violet-100/75">Proyecta titulos, frases o puntos sin crear una predica.</p></div>
      {editingEntryId && <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2"><p className="text-xs font-black text-amber-100">Editando punto anterior</p><button type="button" onClick={cancelEditing} disabled={submitting} className="text-[10px] font-black uppercase text-amber-100 hover:text-white disabled:opacity-40">Cancelar edicion</button></div>}
      <label className="block text-xs font-bold text-violet-100">Tipo<select value={presentationType} onChange={(event) => setPresentationType(event.target.value)} className="kp-input mt-1 w-full rounded-xl p-2.5 text-sm">{QUICK_MESSAGE_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</select></label>
      <div className="space-y-2">{segments.map((segment, index) => <div key={index} className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-2 sm:grid-cols-[minmax(0,1fr)_105px_auto_auto]"><textarea value={segment.text} onChange={(event) => updateSegment(index, { text: event.target.value.slice(0, 240) })} rows={2} placeholder="Escribe un fragmento" className="kp-input min-h-16 w-full resize-y rounded-lg p-2 text-sm"/><select value={segment.color} onChange={(event) => updateSegment(index, { color: event.target.value })} className="kp-input rounded-lg p-2 text-xs">{QUICK_MESSAGE_COLORS.map((color) => <option key={color} value={color}>{COLOR_LABELS[color]}</option>)}</select><button type="button" onClick={() => updateSegment(index, { bold: !segment.bold })} className={`rounded-lg border px-3 text-sm font-black ${segment.bold ? 'border-violet-300 bg-violet-500 text-white' : 'border-white/10 text-zinc-300'}`}>B</button><button type="button" disabled={segments.length === 1} onClick={() => setSegments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg border border-red-400/20 px-2 text-red-200 disabled:opacity-30" title="Quitar fragmento"><Trash2 size={15}/></button></div>)}</div>
      <button type="button" disabled={segments.length >= QUICK_MESSAGE_MAX_SEGMENTS} onClick={() => setSegments((current) => [...current, newSegment()])} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-[10px] font-black uppercase text-violet-100 disabled:opacity-40"><Plus size={15}/>Agregar fragmento</button>
      <div className="rounded-xl border border-white/10 bg-black/35 p-4 text-center"><p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Vista previa</p><p className="whitespace-pre-wrap break-words text-xl font-black leading-tight sm:text-2xl">{segments.map((segment, index) => <span key={`${index}-${segment.text}`} className={COLOR_CLASSES[segment.color]}>{segment.text}</span>)}</p></div>
      {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={!preview || submitting} onClick={() => project()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-wide text-white hover:bg-violet-500 disabled:opacity-40"><Monitor size={16}/>{submitting ? 'Procesando' : 'Proyectar'}</button><button type="button" disabled={submitting} onClick={clearProjection} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-xs font-black uppercase tracking-wide text-white hover:bg-white/10 disabled:opacity-40">Limpiar proyector</button></div>
      {history.length > 0 && <div className="border-t border-white/10 pt-3"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-widest text-violet-200">Ultimos puntos</p><button type="button" onClick={clearHistory} className="text-[10px] font-black uppercase text-red-200 hover:text-red-100">Limpiar historial</button></div><div className="space-y-2">{history.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2"><p className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-200">{item.content}</p><button type="button" disabled={submitting} onClick={() => projectHistoryEntry(item)} className="shrink-0 text-[10px] font-black uppercase text-violet-200 hover:text-violet-100 disabled:opacity-40">Proyectar</button><button type="button" disabled={submitting} onClick={() => startEditing(item)} className="shrink-0 rounded p-1 text-amber-200 hover:bg-amber-400/15 hover:text-amber-100 disabled:opacity-40" title="Editar punto"><Pencil size={15}/></button><button type="button" disabled={submitting} onClick={() => removeHistoryEntry(item.id)} className="shrink-0 rounded p-1 text-red-200 hover:bg-red-500/15 hover:text-red-100 disabled:opacity-40" title="Eliminar punto"><Trash2 size={15}/></button></div>)}</div></div>}
    </section>
  );
};

export default QuickMessagePanel;

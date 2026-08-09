import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Heart, Image as ImageIcon, Loader2, MapPin, RotateCcw, Save, Tag, Trash2, X } from 'lucide-react';
import { normalizeMediaTags } from '../../utils/mediaLibrary';
import { getMediaUsageCount, isMediaResourceInUse } from '../../utils/mediaUsage';
import { isMediaTrashed, toDateSafe } from '../../utils/mediaTrash';
import { getMediaStatusLabel, getMediaTypeIcon, getMediaTypeLabel } from './mediaDisplay';
import MediaPreview from './MediaPreview';

const isValidUrl = (value = '') => {
  if (!String(value).trim()) return true;
  try {
    const parsed = new URL(String(value).trim());
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const formatDateTime = (value) => {
  const date = toDateSafe(value);
  if (!date) return 'No disponible';
  return date.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
};

const metadataEntries = (metadata = {}) => Object.entries(metadata || {})
  .filter(([, value]) => value !== null && value !== undefined && value !== '')
  .map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)]);

const TechnicalRow = ({ label, value, copyable = false, onCopy }) => (
  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">{label}</p>
    <div className="mt-1 flex items-start gap-2">
      <p className="min-w-0 flex-1 break-all text-xs font-semibold text-zinc-300">{value || 'No disponible'}</p>
      {copyable && value && (
        <button type="button" onClick={() => onCopy?.(value)} className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-zinc-400 hover:text-white">
          <Copy size={12} />
        </button>
      )}
    </div>
  </div>
);

const MediaEditorDialog = ({
  open,
  media,
  categories = [],
  saving = false,
  error = '',
  success = '',
  onClose,
  onSave,
  onToggleFavorite,
  onViewUsage,
  onTrash,
  onRestore,
  onDeleteForever
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [localError, setLocalError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!media || !open) return;
    setTitle(media.title || media.name || '');
    setCategory(media.category || '');
    setThumbnailUrl(media.thumbnailUrl || '');
    setTags(Array.isArray(media.tags) ? media.tags : []);
    setTagDraft('');
    setLocalError('');
    setCopied('');
  }, [media, open]);

  const changes = useMemo(() => {
    if (!media) return {};
    const next = {};
    const cleanTitle = title.trim();
    const cleanCategory = category.trim();
    const cleanThumbnail = thumbnailUrl.trim();

    if (cleanTitle && cleanTitle !== (media.title || media.name || '')) next.title = cleanTitle;
    if ((cleanCategory || null) !== (media.category || null)) next.category = cleanCategory || null;
    if ((cleanThumbnail || null) !== (media.thumbnailUrl || null)) next.thumbnailUrl = cleanThumbnail || null;
    if (JSON.stringify(tags) !== JSON.stringify(Array.isArray(media.tags) ? media.tags : [])) next.tags = tags;

    return next;
  }, [category, media, tags, thumbnailUrl, title]);

  if (!open || !media) return null;

  const Icon = getMediaTypeIcon(media.type);
  const trashed = isMediaTrashed(media);
  const usageCount = getMediaUsageCount(media);
  const hasChanges = Object.keys(changes).length > 0;

  const handleAddTag = () => {
    const normalizedDraft = normalizeMediaTags([tagDraft])[0];
    if (!normalizedDraft) return;
    const normalizedCurrent = tags.map(tag => normalizeMediaTags([tag])[0]);
    if (normalizedCurrent.includes(normalizedDraft)) {
      setTagDraft('');
      return;
    }
    setTags([...tags, tagDraft.trim()]);
    setTagDraft('');
  };

  const handleSave = () => {
    setLocalError('');
    if (!title.trim()) {
      setLocalError('El nombre del recurso no puede estar vacio.');
      return;
    }
    if (!isValidUrl(thumbnailUrl)) {
      setLocalError('La miniatura debe ser una URL http o https valida.');
      return;
    }
    if (!hasChanges) {
      setLocalError('No hay cambios para guardar.');
      return;
    }
    onSave?.(media, changes);
  };

  const handleCopy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(''), 1400);
    } catch {
      setLocalError('No se pudo copiar al portapapeles.');
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 p-3 text-white backdrop-blur-sm">
      <div className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl shadow-black">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Editar recurso</p>
            <h2 className="mt-1 truncate text-xl font-black">{media.title || media.name || 'Recurso multimedia'}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-zinc-300 disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-5">
              <MediaPreview media={{ ...media, title, thumbnailUrl: thumbnailUrl || media.thumbnailUrl }} emptyLabel="Sin preview" />

              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Informacion general</p>
                <label className="block">
                  <span className="text-xs font-black uppercase text-zinc-400">Nombre o titulo</span>
                  <input value={title} onChange={event => setTitle(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none focus:border-violet-400/60" />
                </label>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Tipo</p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-black text-zinc-200"><Icon size={15} /> {getMediaTypeLabel(media.type)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Estado</p>
                    <p className="mt-1 text-sm font-black text-zinc-200">{getMediaStatusLabel(media.status)}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Organizacion</p>
                <button
                  type="button"
                  onClick={() => onToggleFavorite?.(media)}
                  className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs font-black uppercase text-amber-100"
                >
                  <Heart size={15} fill={(media.favorite ?? false) ? 'currentColor' : 'none'} />
                  {(media.favorite ?? false) ? 'Quitar favorito' : 'Marcar favorito'}
                </button>
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-black uppercase text-zinc-400">Categoria</span>
                    <input list="media-editor-categories" value={category} onChange={event => setCategory(event.target.value)} placeholder="Escribir o seleccionar" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none focus:border-violet-400/60" />
                    <datalist id="media-editor-categories">
                      {categories.map(item => <option key={item} value={item} />)}
                    </datalist>
                    <button type="button" onClick={() => setCategory('')} className="mt-2 text-xs font-bold text-zinc-500 hover:text-zinc-300">Limpiar categoria</button>
                  </label>

                  <div>
                    <span className="text-xs font-black uppercase text-zinc-400">Etiquetas</span>
                    <div className="mt-2 flex gap-2">
                      <input value={tagDraft} onChange={event => setTagDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') handleAddTag(); }} placeholder="Agregar etiqueta" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none focus:border-violet-400/60" />
                      <button type="button" onClick={handleAddTag} className="rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase text-white"><Tag size={15} /></button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tags.map(tag => (
                        <button key={tag} type="button" onClick={() => setTags(tags.filter(item => normalizeMediaTags([item])[0] !== normalizeMediaTags([tag])[0]))} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300">
                          {tag} x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Miniatura</p>
                <label className="block">
                  <span className="text-xs font-black uppercase text-zinc-400">URL de miniatura</span>
                  <input value={thumbnailUrl} onChange={event => setThumbnailUrl(event.target.value)} placeholder="https://..." className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none focus:border-violet-400/60" />
                </label>
                <button type="button" onClick={() => setThumbnailUrl('')} className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase text-zinc-300">
                  <ImageIcon size={14} />
                  Limpiar miniatura
                </button>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Usos del recurso</p>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <p className="text-2xl font-black text-white">{usageCount}</p>
                  <p className="text-xs font-bold text-emerald-100/75">dependencias registradas</p>
                </div>
                <button type="button" onClick={() => onViewUsage?.(media)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs font-black uppercase text-emerald-100">
                  <MapPin size={14} />
                  Ver todos los usos
                </button>
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Informacion tecnica</p>
                <div className="space-y-2">
                  <TechnicalRow label="mediaId" value={media.mediaId || media.id} copyable onCopy={handleCopy} />
                  <TechnicalRow label="provider" value={media.provider} />
                  <TechnicalRow label="URL" value={media.url} copyable onCopy={handleCopy} />
                  <TechnicalRow label="cloudinaryPublicId" value={media.cloudinaryPublicId} copyable onCopy={handleCopy} />
                  <TechnicalRow label="storagePath" value={media.storagePath} copyable onCopy={handleCopy} />
                  <TechnicalRow label="nombre original" value={media.originalName || media.fileName} />
                  <TechnicalRow label="creado" value={formatDateTime(media.createdAt)} />
                  <TechnicalRow label="actualizado" value={formatDateTime(media.updatedAt)} />
                  {metadataEntries(media.metadata).map(([key, value]) => (
                    <TechnicalRow key={key} label={key} value={value} />
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-red-500/15 bg-red-500/5 p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-red-200">Acciones peligrosas</p>
                {trashed ? (
                  <div className="grid gap-2">
                    <button type="button" onClick={() => onRestore?.(media)} className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs font-black uppercase text-emerald-100">
                      <RotateCcw size={14} />
                      Restaurar
                    </button>
                    <button type="button" onClick={() => onDeleteForever?.(media)} className="flex items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs font-black uppercase text-red-100">
                      <Trash2 size={14} />
                      Eliminar definitivo
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => onTrash?.(media)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs font-black uppercase text-red-100">
                    <Trash2 size={14} />
                    Mover a papelera
                  </button>
                )}
                {isMediaResourceInUse(media) && (
                  <p className="mt-3 text-xs font-semibold leading-relaxed text-amber-100">Este recurso esta en uso; las acciones destructivas se bloquearan hasta revisar dependencias.</p>
                )}
              </section>
            </aside>
          </div>
        </div>

        {(localError || error || success || copied) && (
          <div className="border-t border-white/10 px-5 py-3 text-xs font-bold">
            <span className={localError || error ? 'text-red-200' : 'text-emerald-200'}>
              {localError || error || success || (copied ? 'Copiado al portapapeles.' : '')}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-white/10 p-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase text-zinc-300 disabled:opacity-50">Cerrar</button>
          <button type="button" onClick={handleSave} disabled={saving || !hasChanges} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-xs font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaEditorDialog;

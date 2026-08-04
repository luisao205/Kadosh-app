import React, { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { MEDIA_TYPES, createMediaReference, normalizeMediaText } from '../../utils/mediaLibrary';
import MediaPreview from './MediaPreview';
import { getMediaTypeIcon, getMediaTypeLabel } from './mediaDisplay';
import { MOCK_MEDIA_ITEMS } from './mediaMockData';

const MediaPicker = ({
  open,
  onClose,
  onSelect,
  items,
  acceptedTypes = [],
  multiple = false,
  title = 'Seleccionar multimedia',
  context = 'general',
  loading = false
}) => {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState('all');
  const [selectedItems, setSelectedItems] = useState([]);

  const sourceItems = Array.isArray(items) ? items : MOCK_MEDIA_ITEMS;
  const allowedTypes = acceptedTypes.length > 0 ? acceptedTypes : Object.values(MEDIA_TYPES);

  const filteredItems = useMemo(() => {
    const search = normalizeMediaText(query);

    return sourceItems
      .filter(item => allowedTypes.includes(item.type))
      .filter(item => activeType === 'all' || item.type === activeType)
      .filter(item => {
        if (!search) return true;
        const haystack = [
          item.title,
          item.name,
          item.category,
          item.provider,
          ...(Array.isArray(item.tags) ? item.tags : [])
        ].map(normalizeMediaText).join(' ');
        return haystack.includes(search);
      });
  }, [activeType, allowedTypes, query, sourceItems]);

  const previewItem = selectedItems[selectedItems.length - 1] || filteredItems[0] || null;
  const hasMockData = !Array.isArray(items);

  if (!open) return null;

  const isSelected = (media) => selectedItems.some(item => (item.id || item.url) === (media.id || media.url));

  const handlePick = (media) => {
    if (!multiple) {
      setSelectedItems([media]);
      return;
    }

    setSelectedItems(current => (
      current.some(item => (item.id || item.url) === (media.id || media.url))
        ? current.filter(item => (item.id || item.url) !== (media.id || media.url))
        : [...current, media]
    ));
  };

  const handleSelect = () => {
    if (!onSelect || selectedItems.length === 0) return;
    const references = selectedItems.map(createMediaReference);
    onSelect(multiple ? references : references[0]);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-3 text-white backdrop-blur-xl">
      <div className="flex h-[88dvh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl">
        <header className="flex shrink-0 flex-col gap-3 border-b border-white/10 bg-zinc-950/95 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="text-lg font-black tracking-tight text-white">{title}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
              Selector reutilizable - {context}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-2.5 text-xs font-black uppercase text-zinc-300 hover:bg-zinc-800">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSelect}
              disabled={selectedItems.length === 0}
              className="rounded-2xl bg-violet-600 px-4 py-2.5 text-xs font-black uppercase text-white shadow-lg shadow-violet-950/30 hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Seleccionar{multiple && selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}
            </button>
            <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 bg-zinc-900 p-2.5 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Cerrar selector">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_21rem]">
          <section className="flex min-h-0 flex-col border-white/10 lg:border-r">
            <div className="shrink-0 space-y-3 border-b border-white/10 p-4">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5">
                <Search size={17} className="shrink-0 text-zinc-500" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Buscar por nombre, categoria o etiqueta..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-zinc-600"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setActiveType('all')}
                  className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-widest ${
                    activeType === 'all' ? 'bg-violet-600 text-white' : 'border border-white/10 bg-zinc-900 text-zinc-400'
                  }`}
                >
                  Todos
                </button>
                {allowedTypes.map(type => {
                  const Icon = getMediaTypeIcon(type);
                  return (
                    <button
                      type="button"
                      key={type}
                      onClick={() => setActiveType(type)}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-widest ${
                        activeType === type ? 'bg-violet-600 text-white' : 'border border-white/10 bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      <Icon size={13} /> {getMediaTypeLabel(type)}
                    </button>
                  );
                })}
              </div>

              {hasMockData && (
                <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-100">
                  Datos de ejemplo. El componente esta listo para recibir recursos reales por props.
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className="h-44 animate-pulse rounded-2xl border border-white/10 bg-zinc-900" />
                  ))}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex min-h-[18rem] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-zinc-950/70 text-center">
                  <div>
                    <Search size={34} className="mx-auto mb-3 text-zinc-700" />
                    <p className="text-sm font-black text-white">No hay recursos disponibles</p>
                    <p className="mt-1 text-xs text-zinc-500">Prueba otro filtro o limpia la busqueda.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {filteredItems.map(media => {
                    const Icon = getMediaTypeIcon(media.type);
                    const selected = isSelected(media);
                    return (
                      <button
                        type="button"
                        key={media.id || media.url}
                        onClick={() => handlePick(media)}
                        className={`group overflow-hidden rounded-2xl border bg-zinc-900 text-left transition-all active:scale-[0.98] ${
                          selected ? 'border-violet-400 ring-2 ring-violet-500/30' : 'border-white/10 hover:border-violet-500/50'
                        }`}
                      >
                        <div className="relative aspect-video bg-black">
                          {media.type === MEDIA_TYPES.VIDEO ? (
                            <video src={media.url} muted playsInline className="h-full w-full object-cover opacity-70" />
                          ) : media.type === MEDIA_TYPES.IMAGE ? (
                            <img src={media.thumbnailUrl || media.url} alt={media.title} className="h-full w-full object-cover opacity-80" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-zinc-500">
                              <Icon size={34} />
                            </div>
                          )}
                          <span className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/70 p-1.5 text-white backdrop-blur">
                            <Icon size={14} />
                          </span>
                          {selected && (
                            <span className="absolute right-2 top-2 rounded-full bg-violet-600 p-1.5 text-white">
                              <Check size={14} />
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5 p-3">
                          <p className="truncate text-xs font-black text-white">{media.title || media.name || 'Recurso multimedia'}</p>
                          <p className="truncate text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            {getMediaTypeLabel(media.type)} {media.category ? `- ${media.category}` : ''}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="hidden min-h-0 overflow-y-auto p-4 lg:block">
            <MediaPreview media={previewItem} emptyLabel="Sin seleccion" />
          </aside>
        </div>
      </div>
    </div>
  );
};

export default MediaPicker;


import React, { useMemo, useState } from 'react';
import { Database, Sparkles } from 'lucide-react';
import MediaCard from '../media/MediaCard';
import MediaFilters from '../media/MediaFilters';
import MediaPicker from '../media/MediaPicker';
import MediaPreview from '../media/MediaPreview';
import MediaToolbar from '../media/MediaToolbar';
import { MOCK_MEDIA_ITEMS } from '../media/mediaMockData';
import { normalizeMediaText } from '../../utils/mediaLibrary';

const MediaCenter = () => {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState('all');
  const [selectedMedia, setSelectedMedia] = useState(MOCK_MEDIA_ITEMS[0] || null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const counts = useMemo(() => {
    const nextCounts = { all: MOCK_MEDIA_ITEMS.length };
    MOCK_MEDIA_ITEMS.forEach(item => {
      nextCounts[item.type] = (nextCounts[item.type] || 0) + 1;
    });
    return nextCounts;
  }, []);

  const filteredItems = useMemo(() => {
    const search = normalizeMediaText(query);

    return MOCK_MEDIA_ITEMS
      .filter(item => activeType === 'all' || item.type === activeType)
      .filter(item => {
        if (!search) return true;
        const haystack = [
          item.title,
          item.category,
          item.provider,
          item.status,
          ...(Array.isArray(item.tags) ? item.tags : [])
        ].map(normalizeMediaText).join(' ');
        return haystack.includes(search);
      });
  }, [activeType, query]);

  const handleDetails = (media) => setSelectedMedia(media);

  const handleSelect = (media) => {
    setSelectedMedia(media);
    setPickerOpen(true);
  };

  return (
    <div className="min-h-full overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/65 text-white shadow-2xl shadow-black/20">
      <MediaToolbar total={MOCK_MEDIA_ITEMS.length} query={query} onQueryChange={setQuery} />

      <div className="grid min-h-[calc(100dvh-12rem)] grid-cols-1 lg:grid-cols-[15rem_1fr_22rem]">
        <MediaFilters activeType={activeType} onChange={setActiveType} counts={counts} />

        <main className="min-w-0 border-white/10 p-4 lg:border-r lg:p-5">
          <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-violet-500/20 bg-violet-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-2xl bg-violet-500/15 p-2.5 text-violet-200">
                <Database size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-white">Centro de recursos preparado</p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-400">
                  Esta fase usa datos de ejemplo mientras se conecta la coleccion mediaLibrary en una fase posterior.
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-200">
              <Sparkles size={13} />
              Solo lectura
            </span>
          </div>

          {filteredItems.length === 0 ? (
            <div className="flex min-h-[22rem] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-zinc-950/70 text-center">
              <div>
                <p className="text-sm font-black text-white">No hay recursos para mostrar</p>
                <p className="mt-1 text-xs text-zinc-500">Cambia el filtro o busca otro termino.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredItems.map(media => (
                <MediaCard
                  key={media.id || media.url}
                  media={media}
                  selected={(selectedMedia?.id || selectedMedia?.url) === (media.id || media.url)}
                  onSelect={handleSelect}
                  onDetails={handleDetails}
                />
              ))}
            </div>
          )}
        </main>

        <aside className="hidden min-w-0 overflow-y-auto bg-zinc-950/40 p-5 xl:block">
          <MediaPreview media={selectedMedia} emptyLabel="Selecciona un recurso" />
        </aside>
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(media) => {
          setSelectedMedia(media);
          setPickerOpen(false);
        }}
        items={MOCK_MEDIA_ITEMS}
        title="Seleccionar recurso"
        context="media-center"
      />
    </div>
  );
};

export default MediaCenter;


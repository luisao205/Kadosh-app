import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Database, RefreshCw, Sparkles, X } from 'lucide-react';
import MediaCard from '../media/MediaCard';
import MediaFilters from '../media/MediaFilters';
import MediaPicker from '../media/MediaPicker';
import MediaPreview from '../media/MediaPreview';
import MediaToolbar from '../media/MediaToolbar';
import { normalizeMediaText } from '../../utils/mediaLibrary';
import useMediaLibrary from '../../hooks/useMediaLibrary';
import { db, auth } from '../../config/firebase';
import { syncMediaLibraryFromFirestoreSongs } from '../../utils/mediaLibraryFirestoreSync';
import {
  MEDIA_LIBRARY_ACTIONS,
  canAccessMediaLibrary,
  canPerformMediaLibraryAction
} from '../../utils/mediaLibraryPermissions';

const MediaCenter = ({ user }) => {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState('all');
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState(null);
  const [syncError, setSyncError] = useState('');
  const canAccess = canAccessMediaLibrary(user);
  const canSync = canPerformMediaLibraryAction(user, MEDIA_LIBRARY_ACTIONS.SYNC);
  const { items: mediaItems, counts, loading, error, empty } = useMediaLibrary({ enabled: canAccess });

  const activePreview = selectedMedia || mediaItems[0] || null;

  const filteredItems = useMemo(() => {
    const search = normalizeMediaText(query);

    return mediaItems
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
  }, [activeType, mediaItems, query]);

  const handleDetails = (media) => {
    setSelectedMedia(media);
    setPreviewOpen(true);
  };

  const handleSelect = (media) => {
    setSelectedMedia(media);
    setPickerOpen(true);
  };

  const handleSyncLibrary = async () => {
    if (syncing) return;

    if (!canPerformMediaLibraryAction(user, MEDIA_LIBRARY_ACTIONS.SYNC)) {
      setSyncError('Solo el dueño puede ejecutar la sincronizacion de la biblioteca.');
      return;
    }

    setSyncing(true);
    setSyncError('');
    setSyncSummary(null);

    try {
      const result = await syncMediaLibraryFromFirestoreSongs({
        firestore: db,
        userId: auth.currentUser?.uid || null
      });
      setSyncSummary({
        songs: result.stats.totalSongsScanned,
        resources: result.stats.totalUsages,
        created: result.stats.created,
        updated: result.stats.updated,
        duplicates: result.stats.duplicateGroups
      });
    } catch (err) {
      console.error('Error sincronizando mediaLibrary:', err);
      setSyncError(
        err?.code === 'permission-denied'
          ? 'No tienes permisos para sincronizar la biblioteca. Debe hacerlo un usuario dueño, admin o multimedia.'
          : 'No se pudo sincronizar la biblioteca. Revisa la conexion e intenta nuevamente.'
      );
    } finally {
      setSyncing(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center rounded-[2rem] border border-red-500/20 bg-red-500/10 p-6 text-center text-white">
        <div className="max-w-md">
          <AlertCircle size={42} className="mx-auto mb-4 text-red-200" />
          <p className="text-xl font-black">Acceso restringido</p>
          <p className="mt-2 text-sm leading-relaxed text-red-100/75">
            La Biblioteca Multimedia solo esta disponible para dueño, admin y multimedia.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/65 text-white shadow-2xl shadow-black/20">
      <MediaToolbar total={mediaItems.length} query={query} onQueryChange={setQuery} />

      <div className="grid grid-cols-1 lg:grid-cols-[15rem_1fr] xl:h-[calc(100dvh-12rem)] xl:min-h-[34rem] xl:grid-cols-[15rem_minmax(0,1fr)_22rem] xl:overflow-hidden">
        <MediaFilters activeType={activeType} onChange={setActiveType} counts={counts} />

        <main className="min-w-0 border-white/10 p-4 lg:border-r lg:p-5 xl:overflow-y-auto">
          <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-violet-500/20 bg-violet-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-2xl bg-violet-500/15 p-2.5 text-violet-200">
                <Database size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-white">Centro de recursos preparado</p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-400">
                  La biblioteca ahora lee la coleccion real mediaLibrary y se actualiza automaticamente.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-200">
                <Sparkles size={13} />
                Firestore
              </span>
              {canSync && (
                <button
                  type="button"
                  onClick={handleSyncLibrary}
                  disabled={syncing}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-400/30 bg-violet-600 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-violet-950/30 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Sincronizando...' : 'Sincronizar Biblioteca'}
                </button>
              )}
            </div>
          </div>

          {(syncSummary || syncError) && (
            <div className={`mb-4 rounded-3xl border p-4 ${
              syncError
                ? 'border-red-500/20 bg-red-500/10 text-red-100'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
            }`}>
              <div className="flex items-start gap-3">
                {syncError ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
                <div className="min-w-0">
                  <p className="text-sm font-black">
                    {syncError ? 'Sincronizacion detenida' : 'Biblioteca sincronizada'}
                  </p>
                  {syncError ? (
                    <p className="mt-1 text-xs leading-relaxed opacity-80">{syncError}</p>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-bold text-emerald-50/85 sm:grid-cols-5">
                      <span>Canciones: {syncSummary.songs}</span>
                      <span>Recursos: {syncSummary.resources}</span>
                      <span>Creados: {syncSummary.created}</span>
                      <span>Actualizados: {syncSummary.updated}</span>
                      <span>Duplicados: {syncSummary.duplicates}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-56 animate-pulse rounded-2xl border border-white/10 bg-zinc-900/80" />
              ))}
            </div>
          ) : error ? (
            <div className="flex min-h-[22rem] items-center justify-center rounded-3xl border border-red-500/20 bg-red-500/10 text-center">
              <div className="max-w-sm px-4">
                <p className="text-sm font-black text-red-100">No se pudo cargar la biblioteca</p>
                <p className="mt-1 text-xs text-red-200/70">Revisa permisos o conexion antes de continuar.</p>
              </div>
            </div>
          ) : empty ? (
            <div className="flex min-h-[22rem] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-zinc-950/70 text-center">
              <div className="max-w-sm px-4">
                <p className="text-xl font-black text-white">Aun no existen recursos multimedia.</p>
                <p className="mt-2 text-sm text-zinc-500">Cuando agregues o sincronices recursos apareceran aqui.</p>
                <button
                  type="button"
                  disabled
                  className="mt-5 rounded-2xl bg-violet-600 px-5 py-3 text-xs font-black uppercase tracking-wide text-white opacity-50"
                  title="Disponible en una fase futura"
                >
                  Agregar Multimedia
                </button>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
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
                  selected={(activePreview?.id || activePreview?.url) === (media.id || media.url)}
                  onSelect={handleSelect}
                  onDetails={handleDetails}
                />
              ))}
            </div>
          )}
        </main>

        <aside className="hidden min-w-0 overflow-hidden bg-zinc-950/40 p-5 xl:block">
          <div className="sticky top-5 max-h-[calc(100dvh-14rem)] overflow-y-auto">
            <MediaPreview media={activePreview} emptyLabel="Selecciona un recurso" />
          </div>
        </aside>
      </div>

      {previewOpen && activePreview && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/75 p-3 backdrop-blur-sm xl:hidden">
          <div className="max-h-[88dvh] w-full overflow-hidden rounded-t-[2rem] border border-white/10 bg-zinc-950 shadow-2xl shadow-black sm:mx-auto sm:max-w-2xl sm:rounded-[2rem]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">Vista Previa</p>
                <p className="truncate text-xs font-semibold text-zinc-500">{activePreview.title || 'Recurso multimedia'}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300"
                aria-label="Cerrar vista previa"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[calc(88dvh-8rem)] overflow-y-auto p-4">
              <MediaPreview media={activePreview} emptyLabel="Selecciona un recurso" />
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-white/10 p-4">
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-wide text-zinc-300"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewOpen(false);
                  handleSelect(activePreview);
                }}
                className="rounded-2xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-wide text-white"
              >
                Seleccionar
              </button>
            </div>
          </div>
        </div>
      )}

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(media) => {
          setSelectedMedia(media);
          setPickerOpen(false);
        }}
        items={mediaItems}
        loading={loading}
        title="Seleccionar recurso"
        context="media-center"
      />
    </div>
  );
};

export default MediaCenter;

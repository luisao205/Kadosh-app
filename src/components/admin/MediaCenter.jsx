import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Database, Edit3, MapPin, RefreshCw, ShieldAlert, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import MediaCard from '../media/MediaCard';
import MediaFilters from '../media/MediaFilters';
import MediaPicker from '../media/MediaPicker';
import MediaPreview from '../media/MediaPreview';
import MediaToolbar from '../media/MediaToolbar';
import MediaUsageDialog from '../media/MediaUsageDialog';
import MediaDeleteDialog from '../media/MediaDeleteDialog';
import MediaTrashView from '../media/MediaTrashView';
import MediaEditorDialog from '../media/MediaEditorDialog';
import { normalizeMediaText } from '../../utils/mediaLibrary';
import { MEDIA_LIBRARY_COLLECTION, normalizeMediaTags } from '../../utils/mediaLibrary';
import useMediaLibrary from '../../hooks/useMediaLibrary';
import { db, auth } from '../../config/firebase';
import { syncMediaLibraryFromFirestoreSongs } from '../../utils/mediaLibraryFirestoreSync';
import {
  MEDIA_LIBRARY_ACTIONS,
  canAccessMediaLibrary,
  canPerformMediaLibraryAction
} from '../../utils/mediaLibraryPermissions';
import { getMediaUsageCount, isMediaResourceInUse } from '../../utils/mediaUsage';

const MediaCenter = ({ user }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [libraryScope, setLibraryScope] = useState('all');
  const [selectedPreachingId, setSelectedPreachingId] = useState('all');
  const [selectedTags, setSelectedTags] = useState([]);
  const [usageFilter, setUsageFilter] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState('recent');
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [usageDialogMedia, setUsageDialogMedia] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState(null);
  const [syncError, setSyncError] = useState('');
  const [actionMessage, setActionMessage] = useState(null);
  const [updatingMediaIds, setUpdatingMediaIds] = useState([]);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [viewMode, setViewMode] = useState('library');
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [processingDeleteIds, setProcessingDeleteIds] = useState([]);
  const [editorMedia, setEditorMedia] = useState(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [editorSuccess, setEditorSuccess] = useState('');
  const canAccess = canAccessMediaLibrary(user);
  const canSync = canPerformMediaLibraryAction(user, MEDIA_LIBRARY_ACTIONS.SYNC);
  const { items: mediaItems, trashedItems, counts, loading, error, empty } = useMediaLibrary({ enabled: canAccess });

  const activePreview = selectedMedia || mediaItems[0] || null;

  const mediaDiagnostics = useMemo(() => {
    const normalizeUrl = (value = '') => String(value).trim().toLowerCase().split('#')[0].replace(/\/$/, '');
    const getIdentityKeys = (media = {}) => {
      const keys = [];
      if (media.cloudinaryPublicId) keys.push(`cloudinary:${media.cloudinaryPublicId}`);
      if (media.storagePath) keys.push(`storage:${media.storagePath}`);
      if (media.url) keys.push(`url:${normalizeUrl(media.url)}`);
      return keys;
    };

    const duplicateMap = new Map();
    mediaItems.forEach(media => {
      getIdentityKeys(media).forEach(key => {
        const current = duplicateMap.get(key) || [];
        current.push(media);
        duplicateMap.set(key, current);
      });
    });

    const duplicateGroups = [...duplicateMap.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([key, group]) => ({
        key,
        reason: key.startsWith('cloudinary:')
          ? 'Mismo Cloudinary public_id'
          : key.startsWith('storage:')
            ? 'Mismo Firebase Storage path'
            : 'Misma URL normalizada',
        items: group
      }));

    const duplicateResourceIds = new Set();
    duplicateGroups.forEach(group => {
      group.items.forEach(media => duplicateResourceIds.add(media.id || media.mediaId || media.url));
    });

    const unusedItems = mediaItems.filter(media => getMediaUsageCount(media) === 0);

    return {
      unusedItems,
      unusedCount: unusedItems.length,
      duplicateGroups,
      duplicateCount: duplicateResourceIds.size
    };
  }, [mediaItems]);

  useEffect(() => {
    setCategoryDraft(activePreview?.category || '');
  }, [activePreview?.id, activePreview?.mediaId, activePreview?.category]);

  useEffect(() => {
    if (!editorMedia) return;
    const editorId = editorMedia.id || editorMedia.mediaId;
    const freshMedia = [...mediaItems, ...trashedItems].find(item => (item.id || item.mediaId) === editorId);
    if (freshMedia) {
      setEditorMedia(prev => ({ ...prev, ...freshMedia }));
      return;
    }
    setEditorError('El recurso ya no esta disponible.');
  }, [editorMedia?.id, editorMedia?.mediaId, mediaItems, trashedItems]);

  const categories = useMemo(() => (
    [...new Set(mediaItems.map(item => String(item.category || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
  ), [mediaItems]);

  const preachingFolders = useMemo(() => {
    const byId = new Map();
    mediaItems.forEach(item => {
      const id = item.metadata?.preachingId;
      if (id) byId.set(id, item.metadata?.preachingTitle || id);
    });
    return [...byId.entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [mediaItems]);

  const availableTags = useMemo(() => (
    [...new Set(mediaItems.flatMap(item => Array.isArray(item.tags) ? item.tags : []).map(tag => String(tag).trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
  ), [mediaItems]);

  const filteredItems = useMemo(() => {
    const search = normalizeMediaText(query);

    const nextItems = mediaItems
      .filter(item => libraryScope === 'all' || (libraryScope === 'preaching' ? Boolean(item.metadata?.preachingId) : !item.metadata?.preachingId))
      .filter(item => selectedPreachingId === 'all' || item.metadata?.preachingId === selectedPreachingId)
      .filter(item => activeType === 'all' || item.type === activeType)
      .filter(item => !favoritesOnly || (item.favorite ?? false))
      .filter(item => {
        const usageCount = item.usageCount ?? 0;
        if (usageFilter === 'used') return usageCount > 0;
        if (usageFilter === 'unused') return usageCount <= 0;
        return true;
      })
      .filter(item => {
        const category = String(item.category || '').trim();
        if (selectedCategory === 'all') return true;
        if (selectedCategory === 'none') return !category;
        return normalizeMediaText(category) === normalizeMediaText(selectedCategory);
      })
      .filter(item => {
        if (selectedTags.length === 0) return true;
        const itemTags = Array.isArray(item.tags) ? item.tags.map(normalizeMediaText) : [];
        return selectedTags.every(tag => itemTags.includes(normalizeMediaText(tag)));
      })
      .filter(item => {
        if (!search) return true;
        const metadataValues = item.metadata && typeof item.metadata === 'object' ? Object.values(item.metadata) : [];
        const haystack = [
          item.title,
          item.fileName,
          item.originalName,
          item.name,
          item.category,
          item.provider,
          item.status,
          item.type,
          item.cloudinaryPublicId,
          item.storagePath,
          ...metadataValues,
          ...(Array.isArray(item.tags) ? item.tags : [])
        ].map(normalizeMediaText).join(' ');
        return haystack.includes(search);
      });

    return [...nextItems].sort((a, b) => {
      if (sortBy === 'used') return (b.usageCount ?? 0) - (a.usageCount ?? 0);
      if (sortBy === 'favorites') return Number(b.favorite ?? false) - Number(a.favorite ?? false)
        || String(a.title || '').localeCompare(String(b.title || ''));
      if (sortBy === 'name') return String(a.title || '').localeCompare(String(b.title || ''));
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [activeType, favoritesOnly, libraryScope, mediaItems, query, selectedCategory, selectedPreachingId, selectedTags, sortBy, usageFilter]);

  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (activeType !== 'all') chips.push({ id: 'type', label: activeType, onRemove: () => setActiveType('all') });
    if (favoritesOnly) chips.push({ id: 'favorites', label: 'Favoritos', onRemove: () => setFavoritesOnly(false) });
    if (usageFilter !== 'all') chips.push({ id: 'usage', label: usageFilter === 'used' ? 'En uso' : 'Sin uso', onRemove: () => setUsageFilter('all') });
    if (selectedCategory !== 'all') chips.push({ id: 'category', label: selectedCategory === 'none' ? 'Sin categoria' : `Categoria: ${selectedCategory}`, onRemove: () => setSelectedCategory('all') });
    selectedTags.forEach(tag => chips.push({ id: `tag-${tag}`, label: `Etiqueta: ${tag}`, onRemove: () => setSelectedTags(prev => prev.filter(item => item !== tag)) }));
    return chips;
  }, [activeType, favoritesOnly, selectedCategory, selectedTags, usageFilter]);

  const setMediaUpdating = (mediaId, value) => {
    setUpdatingMediaIds(prev => value
      ? [...new Set([...prev, mediaId])]
      : prev.filter(id => id !== mediaId)
    );
  };

  const updateMediaPartial = async (media, updates) => {
    const mediaId = media?.id || media?.mediaId;
    if (!mediaId) return;

    setMediaUpdating(mediaId, true);
    try {
      await updateDoc(doc(db, MEDIA_LIBRARY_COLLECTION, mediaId), {
        ...updates,
        updatedAt: serverTimestamp()
      });
      setSelectedMedia(prev => {
        if (!prev || (prev.id || prev.mediaId) !== mediaId) return prev;
        return { ...prev, ...updates, updatedAt: Date.now() };
      });
    } catch (err) {
      console.error('Error actualizando mediaLibrary:', err);
      setActionMessage({ type: 'error', area: 'metadata', text: 'No se pudo actualizar metadata o favorito. Revisa permisos o conexion.' });
    } finally {
      setMediaUpdating(mediaId, false);
    }
  };

  const handleEditorSave = async (media, updates) => {
    const mediaId = media?.id || media?.mediaId;
    if (!mediaId || editorSaving) return;

    setEditorSaving(true);
    setEditorError('');
    setEditorSuccess('');

    try {
      await updateDoc(doc(db, MEDIA_LIBRARY_COLLECTION, mediaId), {
        ...updates,
        updatedAt: serverTimestamp()
      });
      const localUpdatedAt = Date.now();
      setSelectedMedia(prev => {
        if (!prev || (prev.id || prev.mediaId) !== mediaId) return prev;
        return { ...prev, ...updates, updatedAt: localUpdatedAt };
      });
      setEditorMedia(prev => prev ? { ...prev, ...updates, updatedAt: localUpdatedAt } : prev);
      setEditorSuccess('Cambios guardados correctamente.');
      setActionMessage({ type: 'success', area: 'editor', text: 'Recurso actualizado correctamente.' });
    } catch (err) {
      console.error('Error guardando editor multimedia:', err);
      setEditorError('No se pudieron guardar los cambios. Revisa permisos o conexion.');
    } finally {
      setEditorSaving(false);
    }
  };

  const handleToggleFavorite = (media) => {
    const mediaId = media?.id || media?.mediaId;
    if (!mediaId || updatingMediaIds.includes(mediaId)) return;
    updateMediaPartial(media, { favorite: !(media.favorite ?? false) });
  };

  const handleSaveCategory = () => {
    if (!activePreview) return;
    updateMediaPartial(activePreview, { category: categoryDraft.trim() || null });
  };

  const handleAddTag = () => {
    if (!activePreview) return;
    const normalizedDraft = normalizeMediaTags([tagDraft])[0];
    if (!normalizedDraft) return;
    const currentTags = Array.isArray(activePreview.tags) ? activePreview.tags : [];
    const existingNormalized = currentTags.map(tag => normalizeMediaTags([tag])[0]);
    if (existingNormalized.includes(normalizedDraft)) {
      setTagDraft('');
      return;
    }
    updateMediaPartial(activePreview, { tags: [...currentTags, tagDraft.trim()] });
    setTagDraft('');
  };

  const handleRemoveTag = (tagToRemove) => {
    if (!activePreview) return;
    const target = normalizeMediaTags([tagToRemove])[0];
    const nextTags = (Array.isArray(activePreview.tags) ? activePreview.tags : [])
      .filter(tag => normalizeMediaTags([tag])[0] !== target);
    updateMediaPartial(activePreview, { tags: nextTags });
  };

  const handleToggleFilterTag = (tag) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]);
  };

  const clearFilters = () => {
    setQuery('');
    setActiveType('all');
    setSelectedCategory('all');
    setSelectedTags([]);
    setUsageFilter('all');
    setFavoritesOnly(false);
    setLibraryScope('all');
    setSelectedPreachingId('all');
    setSortBy('recent');
  };

  const handleDetails = (media) => {
    setSelectedMedia(media);
    setCategoryDraft(media?.category || '');
    setTagDraft('');
    setPreviewOpen(true);
  };

  const handleSelect = (media) => {
    setSelectedMedia(media);
    setPickerOpen(true);
  };

  const handleViewUsage = (media) => {
    setSelectedMedia(media);
    setUsageDialogMedia(media);
  };

  const handleEditMedia = (media) => {
    setSelectedMedia(media);
    setEditorMedia(media);
    setEditorError('');
    setEditorSuccess('');
  };

  const setDeleteProcessing = (mediaId, value) => {
    setProcessingDeleteIds(prev => value
      ? [...new Set([...prev, mediaId])]
      : prev.filter(id => id !== mediaId)
    );
  };

  const getDeletedBy = () => ({
    uid: auth.currentUser?.uid || user?.uid || user?.id || null,
    name: user?.nombre || user?.displayName || user?.name || auth.currentUser?.displayName || '',
    role: user?.rol || user?.role || ''
  });

  const handleRequestTrash = (media) => {
    setSelectedMedia(media);
    setDeleteDialog({ media, mode: 'trash' });
  };

  const handleRequestDeleteForever = (media) => {
    setDeleteDialog({ media, mode: 'permanent' });
  };

  const moveMediaToTrash = async (media) => {
    const mediaId = media?.id || media?.mediaId;
    if (!mediaId) return;

    if (isMediaResourceInUse(media)) {
      setDeleteDialog({ media, mode: 'trash' });
      return;
    }

    setDeleteProcessing(mediaId, true);
    try {
      await updateDoc(doc(db, MEDIA_LIBRARY_COLLECTION, mediaId), {
        deleted: true,
        status: 'trashed',
        deletedAt: serverTimestamp(),
        deletedBy: getDeletedBy(),
        updatedAt: serverTimestamp()
      });
      setActionMessage({ type: 'success', area: 'trash', text: 'Recurso movido a papelera.' });
      setDeleteDialog(null);
      setEditorMedia(null);
      if ((selectedMedia?.id || selectedMedia?.mediaId) === mediaId) {
        setSelectedMedia(null);
      }
    } catch (err) {
      console.error('Error moviendo recurso a papelera:', err);
      setActionMessage({ type: 'error', area: 'trash', text: 'No se pudo mover el recurso a papelera. Revisa permisos o conexion.' });
    } finally {
      setDeleteProcessing(mediaId, false);
    }
  };

  const restoreMedia = async (media) => {
    const mediaId = media?.id || media?.mediaId;
    if (!mediaId) return;

    setDeleteProcessing(mediaId, true);
    try {
      await updateDoc(doc(db, MEDIA_LIBRARY_COLLECTION, mediaId), {
        deleted: false,
        status: 'active',
        deletedAt: null,
        deletedBy: null,
        restoredAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setActionMessage({ type: 'success', area: 'restore', text: 'Recurso restaurado correctamente.' });
      setViewMode('library');
      setSelectedMedia({ ...media, deleted: false, status: 'active', deletedAt: null, deletedBy: null });
      setEditorMedia(prev => prev && (prev.id || prev.mediaId) === mediaId
        ? { ...prev, deleted: false, status: 'active', deletedAt: null, deletedBy: null }
        : prev
      );
    } catch (err) {
      console.error('Error restaurando recurso:', err);
      setActionMessage({ type: 'error', area: 'restore', text: 'No se pudo restaurar el recurso. Revisa permisos o conexion.' });
    } finally {
      setDeleteProcessing(mediaId, false);
    }
  };

  const deleteMediaForever = async (media) => {
    const mediaId = media?.id || media?.mediaId;
    if (!mediaId) return;

    setDeleteProcessing(mediaId, true);
    try {
      const freshSnap = await getDoc(doc(db, MEDIA_LIBRARY_COLLECTION, mediaId));
      if (!freshSnap.exists()) {
        setDeleteDialog(null);
        setActionMessage({ type: 'error', area: 'delete', text: 'El recurso ya no existe en la biblioteca.' });
        return;
      }

      const freshMedia = { id: freshSnap.id, mediaId: freshSnap.id, ...freshSnap.data() };
      if (isMediaResourceInUse(freshMedia)) {
        setDeleteDialog({ media: freshMedia, mode: 'permanent' });
        setUsageDialogMedia(freshMedia);
        setActionMessage({
          type: 'error',
          area: 'delete',
          text: `No se elimino. El recurso ahora esta siendo utilizado en ${getMediaUsageCount(freshMedia)} ${getMediaUsageCount(freshMedia) === 1 ? 'lugar' : 'lugares'}.`
        });
        return;
      }

      await deleteDoc(doc(db, MEDIA_LIBRARY_COLLECTION, mediaId));
      setDeleteDialog(null);
      setEditorMedia(null);
      setActionMessage({ type: 'success', area: 'delete', text: 'Documento eliminado definitivamente. El archivo remoto no fue modificado.' });
      if ((selectedMedia?.id || selectedMedia?.mediaId) === mediaId) {
        setSelectedMedia(null);
      }
    } catch (err) {
      console.error('Error eliminando recurso definitivo:', err);
      setActionMessage({ type: 'error', area: 'delete', text: 'No se pudo eliminar definitivamente. El archivo remoto no fue modificado.' });
    } finally {
      setDeleteProcessing(mediaId, false);
    }
  };

  const handleOpenDependency = (dependency) => {
    if (!dependency?.route) return;
    setUsageDialogMedia(null);
    setPreviewOpen(false);
    navigate(dependency.route);
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
      <MediaToolbar total={filteredItems.length} query={query} onQueryChange={setQuery} sortBy={sortBy} onSortChange={setSortBy} user={user}
        onUploaded={(media) => { setSelectedMedia(media); setActionMessage({ type: 'success', area: 'upload', text: 'Recurso agregado a Biblioteca Multimedia.' }); }}
        onUploadError={(err) => { console.error('Error subiendo a Biblioteca:', err); setActionMessage({ type: 'error', area: 'upload', text: err?.message === 'media_file_type_not_allowed' ? 'Selecciona una imagen o video compatible.' : 'No se pudo subir el recurso.' }); }} />

      <div className="grid grid-cols-1 lg:grid-cols-[15rem_1fr] xl:h-[calc(100dvh-12rem)] xl:min-h-[34rem] xl:grid-cols-[15rem_minmax(0,1fr)_22rem] xl:overflow-hidden">
        <MediaFilters
          activeType={activeType}
          onChange={setActiveType}
          counts={counts}
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          tags={availableTags}
          selectedTags={selectedTags}
          onToggleTag={handleToggleFilterTag}
          usageFilter={usageFilter}
          onUsageFilterChange={setUsageFilter}
          favoritesOnly={favoritesOnly}
          onFavoritesOnlyChange={setFavoritesOnly}
          onClearFilters={clearFilters}
          libraryScope={libraryScope}
          onLibraryScopeChange={(scope) => { setLibraryScope(scope); if (scope !== 'preaching') setSelectedPreachingId('all'); }}
          preachingFolders={preachingFolders}
          selectedPreachingId={selectedPreachingId}
          onPreachingChange={setSelectedPreachingId}
        />

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

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setViewMode('library')}
              className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-wide transition ${
                viewMode === 'library' ? 'bg-violet-600 text-white' : 'border border-white/10 bg-white/5 text-zinc-300'
              }`}
            >
              Biblioteca
            </button>
            <button
              type="button"
              onClick={() => setViewMode('trash')}
              className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-wide transition ${
                viewMode === 'trash' ? 'bg-red-600 text-white' : 'border border-white/10 bg-white/5 text-zinc-300'
              }`}
            >
              Papelera ({trashedItems.length})
            </button>
          </div>

          {viewMode === 'library' && !loading && !error && mediaItems.length > 0 && (
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Diagnostico</p>
                    <h3 className="mt-1 text-lg font-black text-white">{mediaDiagnostics.unusedCount} recursos sin uso</h3>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-50/75">
                      Candidatos a revisar. No se mueven ni eliminan automaticamente.
                    </p>
                  </div>
                  <AlertCircle size={22} className="shrink-0 text-amber-200" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUsageFilter('unused');
                    setViewMode('library');
                  }}
                  className="mt-3 rounded-2xl border border-amber-300/25 bg-black/20 px-3 py-2 text-[10px] font-black uppercase text-amber-100"
                >
                  Ver sin uso
                </button>
              </div>

              <div className="rounded-3xl border border-violet-500/20 bg-violet-500/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-200">Duplicados posibles</p>
                    <h3 className="mt-1 text-lg font-black text-white">{mediaDiagnostics.duplicateGroups.length} grupos detectados</h3>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-violet-50/75">
                      Basado en Cloudinary public_id, Storage path o URL normalizada. Solo diagnostico.
                    </p>
                  </div>
                  <Database size={22} className="shrink-0 text-violet-200" />
                </div>
                {mediaDiagnostics.duplicateGroups.length > 0 && (
                  <div className="mt-3 max-h-28 space-y-2 overflow-y-auto pr-1">
                    {mediaDiagnostics.duplicateGroups.slice(0, 4).map(group => (
                      <div key={group.key} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                        <p className="truncate text-[10px] font-black uppercase text-violet-100">{group.reason}</p>
                        <p className="text-[11px] font-semibold text-zinc-300">{group.items.length} recursos con la misma referencia</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

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

          {actionMessage && (
            <div className={`mb-4 rounded-3xl border p-4 ${
              actionMessage.type === 'error'
                ? 'border-red-500/20 bg-red-500/10 text-red-100'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {actionMessage.type === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
                  <div>
                    <p className="text-sm font-black">{actionMessage.area || 'Accion multimedia'}</p>
                    <p className="mt-1 text-xs leading-relaxed opacity-85">{actionMessage.text}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setActionMessage(null)} className="rounded-full p-1 text-current opacity-70 hover:opacity-100">
                  <X size={15} />
                </button>
              </div>
            </div>
          )}

          {activeFilterChips.length > 0 && viewMode === 'library' && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-3xl border border-white/10 bg-white/[0.03] p-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Filtros activos</span>
              {activeFilterChips.map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={chip.onRemove}
                  className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-violet-100"
                >
                  {chip.label} x
                </button>
              ))}
              <button type="button" onClick={clearFilters} className="rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white">
                Limpiar todos
              </button>
            </div>
          )}

          {viewMode === 'trash' ? (
            <MediaTrashView
              items={trashedItems}
              processingIds={processingDeleteIds}
              onRestore={restoreMedia}
              onDeleteForever={handleRequestDeleteForever}
            />
          ) : loading ? (
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
                <p className="mt-4 text-xs font-bold text-violet-200">Usa Agregar Multimedia en la barra superior para subir el primer recurso.</p>
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
                  onEdit={handleEditMedia}
                  onUsage={handleViewUsage}
                  onTrash={handleRequestTrash}
                  onToggleFavorite={handleToggleFavorite}
                  updating={updatingMediaIds.includes(media.id || media.mediaId)}
                />
              ))}
            </div>
          )}
        </main>

        <aside className="hidden min-w-0 overflow-hidden bg-zinc-950/40 p-5 xl:block">
          <div className="sticky top-5 max-h-[calc(100dvh-14rem)] overflow-y-auto">
            <MediaPreview media={activePreview} emptyLabel="Selecciona un recurso" />
            {activePreview && (
              <div className="mt-4 rounded-3xl border border-white/10 bg-zinc-950/85 p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Administracion</p>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleEditMedia(activePreview)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-500/25 bg-violet-500/10 px-3 py-2.5 text-xs font-black uppercase text-violet-100"
                  >
                    <Edit3 size={14} />
                    Editar recurso
                  </button>
                  <button
                    type="button"
                    onClick={() => handleViewUsage(activePreview)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs font-black uppercase text-emerald-100"
                  >
                    <MapPin size={14} />
                    Ver usos ({getMediaUsageCount(activePreview)})
                  </button>
                  {isMediaResourceInUse(activePreview) && (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold leading-relaxed text-amber-100">
                      <div className="mb-1 flex items-center gap-2 font-black uppercase">
                        <ShieldAlert size={14} />
                        Eliminacion bloqueada
                      </div>
                      Este recurso no se puede eliminar porque esta siendo utilizado en {getMediaUsageCount(activePreview)} {getMediaUsageCount(activePreview) === 1 ? 'lugar' : 'lugares'}.
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRequestTrash(activePreview)}
                    disabled={processingDeleteIds.includes(activePreview.id || activePreview.mediaId)}
                    className="w-full rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs font-black uppercase text-red-100 disabled:opacity-50"
                  >
                    Mover a papelera
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleFavorite(activePreview)}
                    disabled={updatingMediaIds.includes(activePreview.id || activePreview.mediaId)}
                    className="w-full rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs font-black uppercase text-amber-100 disabled:opacity-50"
                  >
                    {(activePreview.favorite ?? false) ? 'Quitar favorito' : 'Marcar favorito'}
                  </button>
                  <div className="flex gap-2">
                    <input
                      value={categoryDraft}
                      onChange={event => setCategoryDraft(event.target.value)}
                      placeholder="Categoria"
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                    <button type="button" onClick={handleSaveCategory} className="rounded-2xl bg-violet-600 px-3 py-2 text-[10px] font-black uppercase text-white">Guardar</button>
                  </div>
                  <button type="button" onClick={() => updateMediaPartial(activePreview, { category: null })} className="w-full rounded-2xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-400">Limpiar categoria</button>
                  <div className="flex gap-2">
                    <input
                      value={tagDraft}
                      onChange={event => setTagDraft(event.target.value)}
                      onKeyDown={event => { if (event.key === 'Enter') handleAddTag(); }}
                      placeholder="Agregar etiqueta"
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                    <button type="button" onClick={handleAddTag} className="rounded-2xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase text-white">Agregar</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(activePreview.tags) ? activePreview.tags : []).map(tag => (
                      <button key={tag} type="button" onClick={() => handleRemoveTag(tag)} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-black uppercase text-zinc-300">
                        {tag} x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
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
              <div className="mt-4 rounded-3xl border border-white/10 bg-zinc-950/85 p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Administracion</p>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleEditMedia(activePreview)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-500/25 bg-violet-500/10 px-3 py-2.5 text-xs font-black uppercase text-violet-100"
                  >
                    <Edit3 size={14} />
                    Editar recurso
                  </button>
                  <button
                    type="button"
                    onClick={() => handleViewUsage(activePreview)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs font-black uppercase text-emerald-100"
                  >
                    <MapPin size={14} />
                    Ver usos ({getMediaUsageCount(activePreview)})
                  </button>
                  {isMediaResourceInUse(activePreview) && (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold leading-relaxed text-amber-100">
                      <div className="mb-1 flex items-center gap-2 font-black uppercase">
                        <ShieldAlert size={14} />
                        Eliminacion bloqueada
                      </div>
                      Este recurso no se puede eliminar porque esta siendo utilizado en {getMediaUsageCount(activePreview)} {getMediaUsageCount(activePreview) === 1 ? 'lugar' : 'lugares'}.
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRequestTrash(activePreview)}
                    disabled={processingDeleteIds.includes(activePreview.id || activePreview.mediaId)}
                    className="w-full rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs font-black uppercase text-red-100 disabled:opacity-50"
                  >
                    Mover a papelera
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleFavorite(activePreview)}
                    disabled={updatingMediaIds.includes(activePreview.id || activePreview.mediaId)}
                    className="w-full rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs font-black uppercase text-amber-100 disabled:opacity-50"
                  >
                    {(activePreview.favorite ?? false) ? 'Quitar favorito' : 'Marcar favorito'}
                  </button>
                  <div className="flex gap-2">
                    <input
                      value={categoryDraft}
                      onChange={event => setCategoryDraft(event.target.value)}
                      placeholder="Categoria"
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                    <button type="button" onClick={handleSaveCategory} className="rounded-2xl bg-violet-600 px-3 py-2 text-[10px] font-black uppercase text-white">Guardar</button>
                  </div>
                  <button type="button" onClick={() => updateMediaPartial(activePreview, { category: null })} className="w-full rounded-2xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-400">Limpiar categoria</button>
                  <div className="flex gap-2">
                    <input
                      value={tagDraft}
                      onChange={event => setTagDraft(event.target.value)}
                      onKeyDown={event => { if (event.key === 'Enter') handleAddTag(); }}
                      placeholder="Agregar etiqueta"
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                    <button type="button" onClick={handleAddTag} className="rounded-2xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase text-white">Agregar</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(activePreview.tags) ? activePreview.tags : []).map(tag => (
                      <button key={tag} type="button" onClick={() => handleRemoveTag(tag)} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-black uppercase text-zinc-300">
                        {tag} x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
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

      <MediaUsageDialog
        open={Boolean(usageDialogMedia)}
        media={usageDialogMedia}
        onClose={() => setUsageDialogMedia(null)}
        onOpenDependency={handleOpenDependency}
      />

      <MediaDeleteDialog
        open={Boolean(deleteDialog)}
        media={deleteDialog?.media}
        mode={deleteDialog?.mode}
        processing={processingDeleteIds.includes(deleteDialog?.media?.id || deleteDialog?.media?.mediaId)}
        onClose={() => setDeleteDialog(null)}
        onConfirm={() => {
          if (deleteDialog?.mode === 'permanent') {
            deleteMediaForever(deleteDialog.media);
            return;
          }
          moveMediaToTrash(deleteDialog?.media);
        }}
        onViewUsage={() => {
          const media = deleteDialog?.media;
          setDeleteDialog(null);
          handleViewUsage(media);
        }}
      />

      <MediaEditorDialog
        open={Boolean(editorMedia)}
        media={editorMedia}
        categories={categories}
        saving={editorSaving}
        error={editorError}
        success={editorSuccess}
        onClose={() => setEditorMedia(null)}
        onSave={handleEditorSave}
        onToggleFavorite={handleToggleFavorite}
        onViewUsage={(media) => {
          setEditorMedia(null);
          handleViewUsage(media);
        }}
        onTrash={(media) => {
          setEditorMedia(null);
          handleRequestTrash(media);
        }}
        onRestore={restoreMedia}
        onDeleteForever={(media) => {
          setEditorMedia(null);
          handleRequestDeleteForever(media);
        }}
      />
    </div>
  );
};

export default MediaCenter;

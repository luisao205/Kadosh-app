import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc, updateDoc, addDoc, getDocs, getDoc, query, where, orderBy, limit, writeBatch } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Music, Search, Trash2, Edit, Mic2, Play, Heart, Layers, Plus, X, ChevronUp, ChevronDown, Download, Copy, Archive, RotateCcw, MoreVertical, ListPlus, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { calcularOffsetSemitonos, isValidChordToken, traducirAcorde, transponerNota } from '../../utils/musicCore';
import { isSongSectionTitle } from '../../utils/songParser';
import { getSongSearchMatch } from '../../utils/songSearch';
import { getSongQualityBadges } from '../../utils/songQuality';
import { getSongBaseKey } from '../../utils/songAssignments';
import { getSongMediaStatus } from '../../utils/songMediaStatus';
import { MEDIA_LIBRARY_COLLECTION } from '../../utils/mediaLibrary';
import { canAccessMediaLibrary } from '../../utils/mediaLibraryPermissions';
import { calculateMediaUsageFields } from '../../utils/mediaLibraryFirestoreSync';
import useMediaLibrary from '../../hooks/useMediaLibrary';
import { useFeedback } from '../ui/FeedbackProvider';

const ETIQUETAS_DISPONIBLES = ['Júbilo', 'Adoración', 'Acústico', 'Navidad', 'Ministración', 'Especial'];

const SongList = ({ user }) => {
  const { confirm: askConfirm, notify } = useFeedback();
  const [canciones, setCanciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('');
  const [lastPlayedMap, setLastPlayedMap] = useState({});
  const misFavoritos = user?.favoritos || [];
  const [mostrarSoloFavoritos, setMostrarSoloFavoritos] = useState(false);
  const [mostrarArchivadas, setMostrarArchivadas] = useState(false);
  const [songToDelete, setSongToDelete] = useState(null);
  const [deleteUsage, setDeleteUsage] = useState([]);
  const [isDeletingSong, setIsDeletingSong] = useState(false);
  const [duplicatingSongId, setDuplicatingSongId] = useState(null);
  const [openActionsSongId, setOpenActionsSongId] = useState(null);
  const navigate = useNavigate();
  const formatoAcordes = user?.preferencias?.formatoAcordes || 'american';
  const notacion = user?.preferencias?.notacion || 'sharps';
  const canReadMediaLibrary = canAccessMediaLibrary(user);
  const normalizedRole = String(user?.rol || user?.role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const canManageSetlists = ['dueno', 'admin'].includes(normalizedRole);
  const canPermanentlyDeleteSongs = ['dueno', 'admin'].includes(normalizedRole);
  const { items: mediaLibraryItems } = useMediaLibrary({ enabled: canReadMediaLibrary });
  
  // Estados para el Generador de Medleys
  const [showMedleyModal, setShowMedleyModal] = useState(false);
  const [medleySearch, setMedleySearch] = useState('');
  const [medleySongs, setMedleySongs] = useState([]);
  const [medleyKey, setMedleyKey] = useState('C');
  const [medleyBpm, setMedleyBpm] = useState('');
  const [transposeMode, setTransposeMode] = useState('UNIFIED');
  const [isSavingMedley, setIsSavingMedley] = useState(false);
  const showToast = (message, type = 'error') => notify(message, { type });

  // Escuchar la base de datos en tiempo real
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'canciones'), (snapshot) => {
      const lista = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Ordenar alfab?ticamente por título
      lista.sort((a, b) => a.titulo.localeCompare(b.titulo));
      setCanciones(lista);
      setLoading(false);
    });

    // Cargar solo eventos pasados recientes para calcular ultima vez tocada sin escuchar todo el historico.
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const hoy = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
    const eventosRecientesQuery = query(
      collection(db, 'eventos'),
      where('fecha', '<=', hoy),
      orderBy('fecha', 'desc'),
      limit(120)
    );
    const unsubEventos = onSnapshot(eventosRecientesQuery, (snap) => {
      const map = {};
      const hoy = new Date();
      snap.docs.forEach(doc => {
        const ev = doc.data();
        const eventDate = new Date(ev.fecha);
        if (eventDate <= hoy) { // Solo contar si ya pas?
          const ids = ev.setlist ? ev.setlist.filter(i => i.type === 'song').map(i => i.value) : (ev.canciones || []);
          ids.forEach(id => {
            if (!map[id] || eventDate > new Date(map[id])) {
              map[id] = ev.fecha;
            }
          });
        }
      });
      setLastPlayedMap(map);
    });

    return () => { unsubscribe(); unsubEventos(); };
  }, []);

  const handleDelete = (song) => {
    closeSongActions();
    if (!canPermanentlyDeleteSongs) {
      showToast('No tienes permiso para eliminar canciones definitivamente.', 'error');
      return;
    }
    if (!isArchivedSong(song)) {
      showToast('Solo se pueden eliminar definitivamente canciones archivadas.', 'error');
      return;
    }
    setDeleteUsage([]);
    setSongToDelete({ id: song.id, titulo: song.titulo || 'Cancion archivada' });
  };

  const addReference = (references, type, title, detail, path = '') => {
    references.push({ type, title, detail, path });
  };

  const valueMatchesSong = (value, songId) => {
    if (!value) return false;
    if (typeof value === 'string') return value === songId;
    return [value.id, value.songId, value.value, value.activeSongId].includes(songId);
  };

  const objectHasSongKey = (value, songId) => (
    value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, songId)
  );

  const containsSongReference = (value, songId) => {
    if (!value) return false;
    if (typeof value === 'string') return value === songId;
    if (Array.isArray(value)) return value.some(item => containsSongReference(item, songId));
    if (typeof value === 'object') {
      if ([value.id, value.songId, value.value, value.activeSongId].includes(songId)) return true;
      return Object.entries(value).some(([key, nestedValue]) => key === songId || containsSongReference(nestedValue, songId));
    }
    return false;
  };

  const getPermanentDeleteReferences = async (songId) => {
    const references = [];
    const [eventosSnap, usuariosSnap, mediaSnap] = await Promise.all([
      getDocs(collection(db, 'eventos')),
      getDocs(collection(db, 'usuarios')),
      getDocs(collection(db, MEDIA_LIBRARY_COLLECTION))
    ]);

    eventosSnap.docs.forEach(eventDoc => {
      const ev = eventDoc.data();
      const eventTitle = ev.titulo || ev.nombre || 'Evento sin titulo';
      const eventPath = `eventos/${eventDoc.id}`;
      const setlistHits = Array.isArray(ev.setlist)
        ? ev.setlist.filter(item => item?.type === 'song' && valueMatchesSong(item, songId)).length
        : 0;
      const cancionesHits = Array.isArray(ev.canciones)
        ? ev.canciones.filter(item => valueMatchesSong(item, songId)).length
        : 0;

      if (setlistHits > 0) addReference(references, 'Evento', eventTitle, `setlist (${setlistHits})`, eventPath);
      if (cancionesHits > 0) addReference(references, 'Evento', eventTitle, `canciones legacy (${cancionesHits})`, eventPath);
      if (objectHasSongKey(ev.cantantesPorCancion, songId) || objectHasSongKey(ev['cantantesPorCanción'], songId)) {
        addReference(references, 'Evento', eventTitle, 'asignacion de cantante', eventPath);
      }
      if (objectHasSongKey(ev.corosPorCancion, songId) || objectHasSongKey(ev['corosPorCanción'], songId)) {
        addReference(references, 'Evento', eventTitle, 'asignacion de coros', eventPath);
      }
      if (containsSongReference(ev.ensayoChecklist, songId)) {
        addReference(references, 'Evento', eventTitle, 'checklist de ensayo', eventPath);
      }
      if (ev.liveState?.activeSongId === songId) addReference(references, 'Live', eventTitle, 'liveState.activeSongId', eventPath);
      if (ev.currentSongId === songId) addReference(references, 'Live', eventTitle, 'currentSongId', eventPath);
      if (ev.proyectorSongId === songId) addReference(references, 'Live', eventTitle, 'proyectorSongId', eventPath);
    });

    usuariosSnap.docs.forEach(userDoc => {
      const usuario = userDoc.data();
      if (Array.isArray(usuario.favoritos) && usuario.favoritos.includes(songId)) {
        addReference(references, 'Usuario', usuario.nombre || userDoc.id, 'favoritos', `usuarios/${userDoc.id}`);
      }
    });

    canciones.forEach(song => {
      if (song.id === songId) return;
      if (Array.isArray(song.cancionesOrigen) && song.cancionesOrigen.includes(songId)) {
        addReference(references, 'Cancion', song.titulo || song.id, 'cancionesOrigen de medley', `canciones/${song.id}`);
      }
    });

    mediaSnap.docs.forEach(mediaDoc => {
      const media = mediaDoc.data();
      const usedBy = Array.isArray(media.usedBy) ? media.usedBy : [];
      const hits = usedBy.filter(usage => usage?.songId === songId || usage?.entityId === songId);
      if (hits.length > 0) {
        addReference(references, 'Biblioteca Multimedia', media.title || media.name || mediaDoc.id, `usedBy (${hits.length})`, `${MEDIA_LIBRARY_COLLECTION}/${mediaDoc.id}`);
      }
    });

    return references;
  };

  const confirmarEliminacion = async () => {
    if (!songToDelete || isDeletingSong) return;
    setIsDeletingSong(true);
    try {
      if (!canPermanentlyDeleteSongs) {
        showToast('No tienes permiso para eliminar canciones definitivamente.', 'error');
        return;
      }

      const songSnap = await getDoc(doc(db, 'canciones', songToDelete.id));
      if (!songSnap.exists()) {
        showToast('La cancion ya no existe.', 'error');
        setSongToDelete(null);
        return;
      }
      if (!isArchivedSong(songSnap.data())) {
        showToast('Solo se pueden eliminar definitivamente canciones archivadas.', 'error');
        setSongToDelete(null);
        return;
      }

      const referencias = await getPermanentDeleteReferences(songToDelete.id);

      if (referencias.length > 0) {
        setDeleteUsage(referencias);
        showToast(`No se puede eliminar: tiene ${referencias.length} referencia(s).`, "error");
        return;
      }

      const shouldDelete = await askConfirm({
        title: 'Eliminar definitivamente',
        message: `Esta accion no se puede deshacer. ¿Eliminar definitivamente "${songToDelete.titulo}"?`,
        confirmLabel: 'Eliminar definitivamente',
        cancelLabel: 'Cancelar',
        variant: 'danger'
      });
      if (!shouldDelete) return;

      await deleteDoc(doc(db, 'canciones', songToDelete.id));
      showToast("Cancion eliminada exitosamente.", "success");
      setSongToDelete(null);
    } catch (error) {
      console.error("Error eliminando:", error);
      showToast("Hubo un error al eliminar.", "error");
    } finally {
      setIsDeletingSong(false);
    }
  };

  const regenerateLocalResourceIds = (resources = []) => (
    Array.isArray(resources)
      ? resources.map((resource, index) => ({
          ...resource,
          id: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`
        }))
      : []
  );

  const cloneSectionMedia = (sectionMedia = {}) => {
    if (!sectionMedia || typeof sectionMedia !== 'object') return {};
    return Object.fromEntries(
      Object.entries(sectionMedia).map(([sectionKey, resources]) => [
        sectionKey,
        regenerateLocalResourceIds(resources)
      ])
    );
  };

  const prepareMediaLibraryUsageForDuplicate = async (newSongId, songTitle, copiedSectionMedia = {}) => {
    const updates = [];
    Object.entries(copiedSectionMedia || {}).forEach(([sectionKey, resources]) => {
      if (!Array.isArray(resources)) return;
      resources.forEach(resource => {
        if (!resource?.mediaId) return;
        updates.push({
          mediaId: resource.mediaId,
          usage: {
            songId: newSongId,
            songTitle,
            location: 'section',
            sectionKey,
            sectionTitle: resource.sectionTitle || sectionKey,
            resourceId: resource.id
          }
        });
      });
    });

    return Promise.all(updates.map(async ({ mediaId, usage }) => {
      const mediaRef = doc(db, MEDIA_LIBRARY_COLLECTION, mediaId);
      const mediaSnap = await getDoc(mediaRef);
      if (!mediaSnap.exists()) {
        throw new Error(`media_not_found:${mediaId}`);
      }
      const mediaData = mediaSnap.data();
      const usageFields = calculateMediaUsageFields(mediaData.usedBy, usage, 'add');
      usageFields.firstUsedAt = mediaData.firstUsedAt || usageFields.firstUsedAt;
      return { mediaRef, usageFields };
    }));
  };

  const handleDuplicateSong = async (song) => {
    if (!song || duplicatingSongId) return;
    setDuplicatingSongId(song.id);
    try {
      const songSnap = await getDoc(doc(db, 'canciones', song.id));
      if (!songSnap.exists()) {
        showToast('La cancion original ya no existe.', 'error');
        return;
      }

      const original = songSnap.data();
      const now = new Date().toISOString();
      const copiedSectionMedia = cloneSectionMedia(original.sectionMedia);
      const copiedRecursos = regenerateLocalResourceIds(original.recursos);
      const copiedMultitracks = regenerateLocalResourceIds(original.multitracks);

      const copyData = {
        ...original,
        titulo: `${original.titulo || 'Cancion'} (Copia)`,
        recursos: copiedRecursos,
        multitracks: copiedMultitracks,
        sectionMedia: copiedSectionMedia,
        fechaCreacion: now,
        fechaActualizacion: now,
        duplicadaDe: song.id,
        duplicadaPor: user?.uid || null
      };

      delete copyData.id;
      delete copyData.createdAt;
      delete copyData.updatedAt;

      const newSongRef = doc(collection(db, 'canciones'));
      const mediaUsageUpdates = await prepareMediaLibraryUsageForDuplicate(newSongRef.id, copyData.titulo, copiedSectionMedia);
      const batch = writeBatch(db);
      batch.set(newSongRef, copyData);
      mediaUsageUpdates.forEach(({ mediaRef, usageFields }) => {
        batch.update(mediaRef, usageFields);
      });
      await batch.commit();
      showToast('Cancion duplicada correctamente.', 'success');
      navigate(`/editar/${newSongRef.id}`, { state: { returnTo: '/canciones' } });
    } catch (error) {
      console.error('Error duplicando cancion:', error);
      showToast('No se pudo duplicar la cancion.', 'error');
    } finally {
      setDuplicatingSongId(null);
    }
  };

  // --- Lógica del Generador de Medleys ---
  const addToMedley = (song) => {
    if (!medleySongs.find(s => s.id === song.id)) {
      let text = (song.letraRaw || '').trim();
      if (!text.startsWith('#') && text.length > 0) text = '# Inicio\n' + text;
      const parts = text.split(/^#\s+/m).filter(p => p.trim() !== '');
      const secciones = parts.map((p, idx) => ({
        id: Date.now() + idx,
        titulo: p.split('\n')[0].trim(),
        contenido: '# ' + p,
        incluir: true
      }));
      const originalKey = song.tonoOriginal || song.tono || 'C';
      setMedleySongs([...medleySongs, { ...song, originalKey, medleyKey: originalKey, secciones }]);
    }
    setMedleySearch('');
  };

  const updateMedleySongKey = (songId, key) => {
    setMedleySongs(prev => prev.map(song => (
      song.id === songId ? { ...song, medleyKey: key } : song
    )));
  };

  const moveMedleySong = (index, direction) => {
    const newSongs = [...medleySongs];
    if (direction === 'up' && index > 0) {
      [newSongs[index - 1], newSongs[index]] = [newSongs[index], newSongs[index - 1]];
    } else if (direction === 'down' && index < newSongs.length - 1) {
      [newSongs[index + 1], newSongs[index]] = [newSongs[index], newSongs[index + 1]];
    }
    setMedleySongs(newSongs);
  };

  const toggleMedleySection = (songId, sectionId) => {
    setMedleySongs(prev => prev.map(s => {
      if (s.id === songId) {
        return {
          ...s,
          secciones: s.secciones.map(sec => sec.id === sectionId ? { ...sec, incluir: !sec.incluir } : sec)
        };
      }
      return s;
    }));
  };

  const calcularOffset = calcularOffsetSemitonos;

  const handleCreateMedley = async () => {
    if (medleySongs.length < 2) return showToast("Selecciona al menos 2 canciones para fusionar.");
    setIsSavingMedley(true);
    try {
      let combinedRaw = "";
      medleySongs.forEach(song => {
        const originalKey = song.originalKey || song.tonoOriginal || song.tono || 'C';
        const targetKey = transposeMode === 'PER_SONG'
          ? (song.medleyKey || originalKey)
          : medleyKey;
        const offset = calcularOffset(originalKey, targetKey);
        
        // Filtrar solo las secciones que el usuario dej? marcadas
        const seccionesIncluidas = song.secciones ? song.secciones.filter(s => s.incluir).map(s => s.contenido).join('\n') : song.letraRaw;
        
        // Magia: Transponer todos los acordes de la letra original al tono del Medley
        const transposedRaw = (seccionesIncluidas || '').replace(/\[([^\]]+)\]/g, (match, acorde) => {
          const token = String(acorde || '').trim();
          if (isSongSectionTitle(token) || !isValidChordToken(token)) return match;
          return `[${transponerNota(token, offset)}]`;
        });
        combinedRaw += `# --- ${song.titulo.toUpperCase()} ---\n`;
        combinedRaw += transposedRaw + "\n\n";
      });
      const newTitle = `Medley: ${medleySongs.map(s => s.titulo.split(' ')[0]).join(' / ')}`;
      const newDoc = await addDoc(collection(db, 'canciones'), {
        titulo: newTitle,
        artista: "Kadosh Medleys",
        tonoOriginal: medleyKey,
        transposeMode,
        cancionesOrigen: medleySongs.map(song => song.id),
        medleyConfig: {
          transposeMode,
          unifiedKey: medleyKey,
          songs: medleySongs.map(song => ({
            songId: song.id,
            title: song.titulo,
            originalKey: song.originalKey || song.tonoOriginal || song.tono || 'C',
            medleyKey: song.medleyKey || song.originalKey || song.tonoOriginal || song.tono || 'C'
          }))
        },
        bpm: Number(medleyBpm) || 0,
        letraRaw: combinedRaw.trim(),
        etiquetas: ['Ministración'],
        fechaCreacion: new Date().toISOString()
      });
      showToast("Medley generado exitosamente", "success");
      setShowMedleyModal(false); setMedleySongs([]); setTransposeMode('UNIFIED'); setMedleyKey('C'); setMedleyBpm('');
      navigate(`/editar/${newDoc.id}`, { state: { returnTo: '/canciones' } }); // Llevamos al usuario directo al editor para que lo afine
    } catch(e) { showToast("Error al generar el Medley."); }
    setIsSavingMedley(false);
  };

  // Respaldo General (Exportar)
  const handleExportBackup = () => {
    const dataStr = JSON.stringify(canciones, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `kadosh_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url); showToast("Respaldo descargado a tu computadora.", "success");
  };

  const toggleFavorito = async (cancionId, e) => {
    e.stopPropagation();
    const isFav = misFavoritos.includes(cancionId);
    const nuevosFavs = isFav ? misFavoritos.filter(id => id !== cancionId) : [...misFavoritos, cancionId];
    try {
      await updateDoc(doc(db, 'usuarios', user.uid), { favoritos: nuevosFavs });
    } catch (err) {
      showToast("Error al guardar en favoritos.");
    }
  };

  const isArchivedSong = (song) => song?.estado === 'archived' || song?.status === 'archived' || song?.archived === true;
  const activeSongs = canciones.filter(song => !isArchivedSong(song));
  const archivedSongs = canciones.filter(isArchivedSong);

  const getMultimediaStatusView = (song = {}) => {
    const status = getSongMediaStatus(song, mediaLibraryItems);
    const classByStatus = {
      complete: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
      'background-ready': 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
      'missing-background': 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300',
      'missing-media': 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300',
      broken: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300'
    };
    const additionalCount = status.counts.resources + status.counts.audio + status.counts.multitracks;
    const detail = status.status === 'broken'
      ? `${status.brokenReferences.length} referencias rotas`
      : status.status === 'missing-media'
        ? 'sin fondo ni recursos'
        : status.status === 'background-ready'
          ? 'sin recursos adicionales'
          : status.counts.sectionMedia > 0
            ? `${status.counts.sectionMedia} secciones - ${additionalCount} recursos`
            : `${additionalCount} recursos`;

    return {
      ...status,
      label: status.status === 'broken' ? 'Multimedia rota' : status.label,
      detail,
      className: classByStatus[status.status] || classByStatus['missing-media']
    };
  };

  const closeSongActions = () => setOpenActionsSongId(null);

  const handleAddToSetlist = (song) => {
    closeSongActions();
    if (!canManageSetlists) {
      showToast('No tienes permiso para modificar setlists.', 'error');
      return;
    }
    navigate('/eventos', { state: { songToAdd: song?.id || null } });
  };

  const handleOpenSongDetails = (song) => {
    closeSongActions();
    if (!song?.id) return;
    navigate(`/live/${song.id}`);
  };

  const handleEditSong = (song) => {
    closeSongActions();
    if (!song?.id) return;
    navigate(`/editar/${song.id}`, { state: { returnTo: '/canciones' } });
  };

  const handleToggleArchiveFromCard = (song) => {
    closeSongActions();
    if (isArchivedSong(song)) {
      handleRestoreSong(song);
    } else {
      handleArchiveSong(song);
    }
  };

  const handleArchiveSong = async (song) => {
    if (!song?.id) return;
    const shouldArchive = await askConfirm({
      title: 'Archivar cancion',
      message: `¿Archivar "${song.titulo || 'esta cancion'}"? No aparecerá en el repertorio normal, pero seguirá disponible en eventos históricos.`,
      confirmLabel: 'Archivar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!shouldArchive) return;

    try {
      await updateDoc(doc(db, 'canciones', song.id), {
        estado: 'archived',
        archived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: user?.uid || null,
        fechaActualizacion: new Date().toISOString()
      });
      showToast('Cancion archivada. Puedes restaurarla desde el filtro Archivadas.', 'success');
    } catch (error) {
      console.error('Error archivando cancion:', error);
      showToast('No se pudo archivar la cancion.', 'error');
    }
  };

  const handleRestoreSong = async (song) => {
    if (!song?.id) return;

    try {
      await updateDoc(doc(db, 'canciones', song.id), {
        estado: 'active',
        archived: false,
        archivedAt: null,
        archivedBy: null,
        restoredAt: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString()
      });
      showToast('Cancion restaurada al repertorio.', 'success');
    } catch (error) {
      console.error('Error restaurando cancion:', error);
      showToast('No se pudo restaurar la cancion.', 'error');
    }
  };

  const cancionesFiltradas = canciones.filter(c => {
    const matchArchive = mostrarArchivadas ? isArchivedSong(c) : !isArchivedSong(c);
    const matchTexto = getSongSearchMatch(c, filtro).matches;
    const matchEtiqueta = filtroEtiqueta ? c.etiquetas?.includes(filtroEtiqueta) : true;
    const matchFavorito = mostrarSoloFavoritos ? misFavoritos.includes(c.id) : true;
    return matchArchive && matchTexto && matchEtiqueta && matchFavorito;
  });
  const medleySearchResults = medleySearch.trim()
    ? activeSongs
      .map(song => ({ song, searchMatch: getSongSearchMatch(song, medleySearch) }))
      .filter(result => result.searchMatch.matches)
      .slice(0, 30)
    : [];

  const formatTiempo = (fechaIso) => {
    if (!fechaIso) return 'Nunca tocada';
    const diffDias = Math.floor((new Date() - new Date(fechaIso)) / (1000 * 60 * 60 * 24));
    if (diffDias === 0) return 'Tocada hoy';
    if (diffDias === 1) return 'Ayer';
    if (diffDias < 7) return `Hace ${diffDias} días`;
    if (diffDias < 30) return `Hace ${Math.floor(diffDias/7)} sem.`;
    return `Hace ${Math.floor(diffDias/30)} meses`;
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-zinc-950/45 p-5 md:p-6 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded-2xl">
            <Music size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Repertorio</h1>
            <p className="text-zinc-400 mt-1 text-sm font-medium">
              {activeSongs.length} canciones activas{archivedSongs.length > 0 ? ` ? ${archivedSongs.length} archivadas` : ''}.
            </p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {user?.rol !== 'musico' && (
            <button onClick={handleExportBackup} className="kp-button-secondary flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-sm transition-colors active:scale-95 w-full sm:w-max" title="Descargar Respaldo JSON">
              <Download size={16} />
            </button>
          )}
          {user?.rol !== 'musico' && (
            <button onClick={() => setShowMedleyModal(true)} className="kp-button-secondary flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors active:scale-95 w-full sm:w-max">
              <Layers size={16} /> Crear Medley
            </button>
          )}
          {user?.rol !== 'musico' && (
            <button onClick={() => navigate('/añadir')} className="kp-button-primary flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors active:scale-95 w-full sm:w-max">
              <Plus size={16} /> Añadir
            </button>
          )}
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400"><Search size={18} /></div>
            <input type="text" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="kp-input block w-full pl-10 pr-3 py-2.5 rounded-xl text-sm font-medium" placeholder="Buscar por titulo, artista o letra..." />
          </div>
        </div>
      </header>

      {/* Filtros de Etiquetas */}
      <div className="flex overflow-x-auto gap-2 mb-6 pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <button onClick={() => { setFiltroEtiqueta(''); setMostrarSoloFavoritos(false); setMostrarArchivadas(false); }} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${filtroEtiqueta === '' && !mostrarSoloFavoritos && !mostrarArchivadas ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100' : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
          Todas
        </button>
        <button onClick={() => { setFiltroEtiqueta(''); setMostrarSoloFavoritos(true); setMostrarArchivadas(false); }} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border flex items-center gap-1.5 ${mostrarSoloFavoritos ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-500/20' : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
          <Heart size={14} className={mostrarSoloFavoritos ? "fill-rose-700 text-rose-700 dark:fill-rose-500 dark:text-rose-500" : ""} /> Mis Favoritas
        </button>
        {user?.rol !== 'musico' && (
          <button onClick={() => { setFiltroEtiqueta(''); setMostrarSoloFavoritos(false); setMostrarArchivadas(true); }} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border flex items-center gap-1.5 ${mostrarArchivadas ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/20' : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
            <Archive size={14} /> Archivadas ({archivedSongs.length})
          </button>
        )}
        {ETIQUETAS_DISPONIBLES.map(tag => (
          <button key={tag} onClick={() => { setFiltroEtiqueta(tag); setMostrarSoloFavoritos(false); setMostrarArchivadas(false); }} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${filtroEtiqueta === tag && !mostrarSoloFavoritos && !mostrarArchivadas ? 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-500/20' : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
            {tag}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-zinc-500 font-medium animate-pulse">Cargando canciones...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cancionesFiltradas.map(cancion => {
            const searchMatch = getSongSearchMatch(cancion, filtro);
            const qualityBadges = getSongQualityBadges(cancion);
            const archived = isArchivedSong(cancion);
            const multimediaStatus = getMultimediaStatusView(cancion);
            const baseKey = getSongBaseKey(cancion);
            const actionsOpen = openActionsSongId === cancion.id;
            return (
            <div key={cancion.id} className="kp-card relative flex min-h-[240px] flex-col rounded-2xl p-4 transition-colors hover:border-blue-400/40 xl:group">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-lg font-black leading-tight text-zinc-900 dark:text-zinc-100">{cancion.titulo || 'Cancion sin titulo'}</h3>
                  <p className="mt-1 flex min-w-0 items-center gap-1 text-sm font-bold text-zinc-500"><Mic2 size={14} className="shrink-0"/> <span className="truncate">{cancion.artista || 'Sin artista'}</span></p>
                  {archived && (
                    <span className="mt-2 inline-flex rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-500 dark:text-amber-300">
                      Archivada
                    </span>
                  )}
                  {searchMatch.field === 'lyrics' && searchMatch.snippet && (
                    <p className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold leading-snug text-emerald-200">
                      Coincide en letra: "{searchMatch.snippet}"
                    </p>
                  )}
                  
                  {cancion.etiquetas && cancion.etiquetas.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {cancion.etiquetas.map(t => <span key={t} className="text-[9px] font-black uppercase tracking-widest bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded border border-violet-100 dark:border-violet-500/20">{t}</span>)}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {qualityBadges.map(badge => (
                      <span
                        key={`${cancion.id}-${badge.label}`}
                        className={`rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                          badge.tone === 'success'
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                            : badge.tone === 'warning'
                              ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                              : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-2 bg-amber-50 dark:bg-amber-500/10 inline-block px-2 py-0.5 rounded-md border border-amber-100 dark:border-amber-500/20">{formatTiempo(lastPlayedMap[cancion.id])}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button onClick={(e) => toggleFavorito(cancion.id, e)} className="text-zinc-300 hover:text-rose-500 transition-colors" title="Añadir a Favoritos">
                    <Heart size={20} className={misFavoritos.includes(cancion.id) ? "fill-rose-500 text-rose-500 drop-shadow-sm" : ""} />
                  </button>
                  <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-lg border border-zinc-200 dark:border-zinc-700">{traducirAcorde(baseKey, formatoAcordes, notacion)}</span>
                  <button
                    type="button"
                    onClick={() => setOpenActionsSongId(actionsOpen ? null : cancion.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:text-white xl:hidden"
                    aria-label="Abrir acciones de cancion"
                    aria-expanded={actionsOpen}
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>
              </div>
              <div className="mt-1">
                <div className={`rounded-xl border px-3 py-2 ${multimediaStatus.className}`}>
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Multimedia</p>
                  <p className="truncate text-sm font-black">{multimediaStatus.label}</p>
                  <p className="truncate text-[10px] font-bold opacity-80">{multimediaStatus.detail}</p>
                </div>
              </div>

              {actionsOpen && (
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 xl:hidden">
                  <button type="button" onClick={() => handleOpenSongDetails(cancion)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900">
                    <Eye size={16} /> Abrir
                  </button>
                  {!archived && canManageSetlists && (
                    <button type="button" onClick={() => handleAddToSetlist(cancion)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900">
                      <ListPlus size={16} /> Agregar a setlist
                    </button>
                  )}
                  {user?.rol !== 'musico' && (
                    <>
                      <button type="button" onClick={() => handleEditSong(cancion)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900">
                        <Edit size={16} /> Editar
                      </button>
                      <button type="button" onClick={() => { closeSongActions(); handleDuplicateSong(cancion); }} disabled={duplicatingSongId === cancion.id} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-900">
                        <Copy size={16} /> Duplicar
                      </button>
                      <button type="button" onClick={() => handleToggleArchiveFromCard(cancion)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900">
                        {archived ? <RotateCcw size={16} /> : <Archive size={16} />}
                        {archived ? 'Restaurar' : 'Archivar'}
                      </button>
                      {archived && canPermanentlyDeleteSongs && (
                        <button type="button" onClick={() => handleDelete(cancion)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10">
                          <Trash2 size={16} /> Eliminar definitivamente
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="mt-auto hidden items-center justify-end border-t border-zinc-100 pt-4 dark:border-zinc-800 xl:flex">
                <div className="flex gap-2">
                  {!archived && (
                    <button onClick={() => handleOpenSongDetails(cancion)} className="p-1.5 text-zinc-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg transition-colors" title="Abrir Teleprompter (En Vivo)">
                      <Play size={16} />
                    </button>
                  )}
                  
                  {user?.rol !== 'musico' && (
                    <>
                      <button onClick={() => handleEditSong(cancion)} className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors" title="Editar">
                        <Edit size={16} />
                      </button>
                      {!archived && canManageSetlists && (
                        <button onClick={() => handleAddToSetlist(cancion)} className="p-1.5 text-zinc-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 rounded-lg transition-colors" title="Agregar a setlist">
                          <ListPlus size={16} />
                        </button>
                      )}
                      <button onClick={() => handleDuplicateSong(cancion)} disabled={duplicatingSongId === cancion.id} className="p-1.5 text-zinc-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors disabled:opacity-50" title="Duplicar cancion">
                        <Copy size={16} />
                      </button>
                      {archived ? (
                        <>
                          <button onClick={() => handleRestoreSong(cancion)} className="p-1.5 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors" title="Restaurar al repertorio">
                            <RotateCcw size={16} />
                          </button>
                          {canPermanentlyDeleteSongs && (
                            <button onClick={() => handleDelete(cancion)} className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors" title="Eliminar definitivamente">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </>
                      ) : (
                        <button onClick={() => handleArchiveSong(cancion)} className="p-1.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors" title="Archivar cancion">
                          <Archive size={16} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
          })}
          
          {cancionesFiltradas.length === 0 && (
            <div className="kp-empty-state col-span-full text-center py-12 rounded-2xl">
              <p className="text-zinc-500 font-medium">No se encontraron canciones.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {songToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full mx-4 animate-in zoom-in-95">
            <h3 className="text-lg font-black text-zinc-900 mb-2">¿Eliminar cancion?</h3>
            <p className="text-zinc-500 text-sm mb-6">¿Estás seguro de que quieres eliminar <b>"{songToDelete.titulo}"</b>? Esta acción no se puede deshacer.</p>
            {deleteUsage.length > 0 && (
              <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">Cancion en uso</p>
                <p className="mt-1 text-sm font-bold text-zinc-700 dark:text-zinc-200">No se puede eliminar esta cancion porque todavia esta siendo utilizada.</p>
                <div className="mt-3 space-y-2">
                  {deleteUsage.map((reference, index) => (
                    <div
                      key={`${reference.type}-${reference.path}-${index}`}
                      className="w-full rounded-xl border border-white/10 bg-white/60 px-3 py-2 text-left text-xs font-bold text-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-200"
                    >
                      <span className="block truncate">{reference.title}</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{reference.type} - {reference.detail}</span>
                      {reference.path && <span className="block truncate text-[10px] font-medium text-zinc-400">{reference.path}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setSongToDelete(null)} className="px-4 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={confirmarEliminacion} disabled={isDeletingSong || deleteUsage.length > 0} className="px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm shadow-red-200 disabled:cursor-not-allowed disabled:opacity-50">{isDeletingSong ? 'Verificando...' : 'Verificar y eliminar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Medley */}
      {showMedleyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh] border border-zinc-200 dark:border-zinc-800">
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950 shrink-0">
              <h3 className="font-black text-zinc-900 dark:text-white flex items-center gap-2"><Layers size={20} className="text-violet-600 dark:text-violet-400"/> Generador de Medleys</h3>
              <button onClick={() => setShowMedleyModal(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"><X size={20}/></button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">1. Busca y selecciona las canciones</label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-3 text-zinc-400"/>
                  <input type="text" value={medleySearch} onChange={e => setMedleySearch(e.target.value)} placeholder="Buscar por titulo, artista, etiqueta o letra..." className="w-full pl-9 pr-3 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 bg-white dark:bg-zinc-950 dark:text-white outline-none" />
                  {medleySearch && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl max-h-48 overflow-y-auto">
                      {medleySearchResults.map(({ song: c, searchMatch }) => (
                        <button key={c.id} onClick={() => addToMedley(c)} className="w-full text-left px-4 py-2.5 hover:bg-violet-50 dark:hover:bg-violet-500/10 border-b border-zinc-100 dark:border-zinc-800 last:border-0 text-sm flex justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block font-bold text-zinc-800 dark:text-zinc-200 truncate">{c.titulo}</span>
                            <span className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 truncate">
                              {c.artista || 'Sin artista'} ? Coincidencia: {searchMatch.field === 'title' ? 'titulo' : searchMatch.field === 'artist' ? 'artista' : searchMatch.field === 'tags' ? 'etiqueta' : 'letra'}
                            </span>
                            {searchMatch.field === 'lyrics' && searchMatch.snippet && (
                              <span className="mt-0.5 block line-clamp-2 text-[10px] font-bold leading-snug text-emerald-600 dark:text-emerald-300">
                                {searchMatch.snippet}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 dark:text-zinc-400 font-bold h-fit">{c.tonoOriginal || c.tono || '?'}</span>
                        </button>
                      ))}
                      {medleySearchResults.length === 0 && (
                        <div className="px-4 py-4 text-center text-xs font-bold text-zinc-500">
                          No hay canciones que coincidan por titulo, artista, etiqueta o letra.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {medleySongs.length > 0 && (
                <div className="bg-zinc-50 dark:bg-zinc-950 rounded-2xl p-3 border border-zinc-200 dark:border-zinc-800">
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">2. Orden del Medley</label>
                  <div className="space-y-2">
                    {medleySongs.map((song, idx) => (
                      <div key={song.id} className="bg-white dark:bg-zinc-900 p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col gap-0.5">
                            <button onClick={() => moveMedleySong(idx, 'up')} disabled={idx === 0} className="text-zinc-400 hover:text-violet-600 disabled:opacity-30"><ChevronUp size={14}/></button>
                            <button onClick={() => moveMedleySong(idx, 'down')} disabled={idx === medleySongs.length - 1} className="text-zinc-400 hover:text-violet-600 disabled:opacity-30"><ChevronDown size={14}/></button>
                          </div>
                          <div className="flex-1 truncate">
                            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">{song.titulo}</p>
                            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">Tono orig: {song.originalKey || song.tonoOriginal || song.tono || '?'}</p>
                          </div>
                          <button onClick={() => setMedleySongs(medleySongs.filter(s => s.id !== song.id))} className="p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg"><Trash2 size={16}/></button>
                        </div>
                        {transposeMode === 'PER_SONG' && (
                          <div className="pl-6 grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wider text-zinc-400 mb-1">Original</label>
                              <input value={song.originalKey || song.tonoOriginal || song.tono || ''} readOnly className="w-full rounded-lg border border-zinc-200 bg-zinc-100 px-2 py-1.5 text-xs font-bold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400" />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wider text-zinc-400 mb-1">Tono en Medley</label>
                              <input value={song.medleyKey || song.originalKey || song.tonoOriginal || song.tono || ''} onChange={e => updateMedleySongKey(song.id, e.target.value)} className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-bold uppercase text-zinc-800 focus:ring-2 focus:ring-violet-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white" />
                            </div>
                          </div>
                        )}
                        {/* Selectores de Secciones */}
                        {song.secciones && song.secciones.length > 0 && (
                          <div className="flex flex-wrap gap-1 pl-6">
                            {song.secciones.map(sec => (
                              <button key={sec.id} onClick={() => toggleMedleySection(song.id, sec.id)} className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md transition-colors border ${sec.incluir ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/30' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                                {sec.titulo}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">3. Modo de Transposicion</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setTransposeMode('UNIFIED')} className={`rounded-xl border px-3 py-2 text-xs font-black transition-colors ${transposeMode === 'UNIFIED' ? 'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/20 dark:text-violet-300' : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>
                    Unificar tono
                  </button>
                  <button type="button" onClick={() => setTransposeMode('PER_SONG')} className={`rounded-xl border px-3 py-2 text-xs font-black transition-colors ${transposeMode === 'PER_SONG' ? 'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/20 dark:text-violet-300' : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>
                    Por cancion
                  </button>
                </div>
                <p className="mt-2 text-[10px] font-bold leading-snug text-zinc-500 dark:text-zinc-400">
                  {transposeMode === 'UNIFIED'
                    ? 'Todas las canciones se transponen al tono final seleccionado.'
                    : 'Cada cancion usa su propio tono del Medley; si se deja vacio usa el tono original.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">{transposeMode === 'UNIFIED' ? '4. Tono Final (Para todas)' : '4. Tono general del Medley'}</label>
                  <input type="text" value={medleyKey} onChange={e => setMedleyKey(e.target.value)} placeholder="Ej. G" className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 bg-white dark:bg-zinc-950 dark:text-white font-bold uppercase text-center" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">BPM Global</label>
                  <input type="number" value={medleyBpm} onChange={e => setMedleyBpm(e.target.value)} placeholder="Ej. 130" className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 bg-white dark:bg-zinc-950 dark:text-white font-bold text-center" />
                </div>
              </div>
              
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300 p-3 rounded-xl border border-blue-100 dark:border-blue-500/20 leading-tight">
                <b>Magia Kadosh:</b> El sistema extraera la letra de las {medleySongs.length || '...'} canciones seleccionadas y {transposeMode === 'UNIFIED' ? <b>transpondra todos sus acordes automaticamente al Tono Final ({medleyKey || '?'})</b> : <b>respetara el tono configurado para cada cancion</b>}, fusionandolas en una sola cancion.
              </p>
              <p className="hidden">
                <b>Magia Kadosh:</b> El sistema extraerá la letra de las {medleySongs.length || '...'} canciones seleccionadas, <b>transpondrá todos sus acordes automáticamente al Tono Final ({medleyKey || '?'})</b>, y las fusionará en una sola "Súper Cancion".
              </p>
            </div>

            <div className="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowMedleyModal(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors">Cancelar</button>
              <button onClick={handleCreateMedley} disabled={medleySongs.length < 2 || isSavingMedley} className="px-5 py-2.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-xl transition-colors active:scale-95 shadow-md flex items-center gap-2">
                <Layers size={16}/> {isSavingMedley ? 'Fusionando...' : 'Generar Fusión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
    </div>
  );
};
export default SongList;




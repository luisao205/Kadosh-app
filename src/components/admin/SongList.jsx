import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc, updateDoc, addDoc, getDocs, getDoc, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Music, Search, Trash2, Edit, Mic2, Play, Heart, Layers, Plus, X, ChevronUp, ChevronDown, Download, Copy, Archive, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { calcularOffsetSemitonos, traducirAcorde, transponerNota } from '../../utils/musicCore';
import { getSongSearchMatch } from '../../utils/songSearch';
import { getSongQualityBadges } from '../../utils/songQuality';
import { MEDIA_LIBRARY_COLLECTION } from '../../utils/mediaLibrary';
import { calculateMediaUsageFields } from '../../utils/mediaLibraryFirestoreSync';
import { useFeedback } from '../ui/FeedbackProvider';

const ETIQUETAS_DISPONIBLES = ['Júbilo', 'Adoración', 'Acústico', 'Navidad', 'Ministración', 'Especial'];

const SongList = ({ user }) => {
  const { confirm: askConfirm, notify } = useFeedback();
  const [canciones, setCanciónes] = useState([]);
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
  const navigate = useNavigate();
  const formatoAcordes = user?.preferencias?.formatoAcordes || 'american';
  const notacion = user?.preferencias?.notacion || 'sharps';
  
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
      setCanciónes(lista);
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

  const handleDelete = (id, titulo) => {
    setDeleteUsage([]);
    setSongToDelete({ id, titulo }); // Activa el modal
  };

  const getSongUsageInEvents = (songId, eventosList) => {
    return eventosList
      .filter(ev => {
        const setlistIds = Array.isArray(ev.setlist)
          ? ev.setlist.filter(item => item?.type === 'song').map(item => item.value || item.songId || item.id)
          : [];
        const legacyIds = Array.isArray(ev.canciones)
          ? ev.canciones.map(item => (typeof item === 'string' ? item : item?.id || item?.songId || item?.value))
          : [];
        return [...setlistIds, ...legacyIds].includes(songId);
      })
      .map(ev => ({
        id: ev.id,
        titulo: ev.titulo || ev.nombre || 'Evento sin titulo',
        fecha: ev.fecha || ev.eventDate || ev.startDate || null
      }));
  };

  const confirmarEliminacion = async () => {
    if (!songToDelete || isDeletingSong) return;
    setIsDeletingSong(true);
    try {
      const eventosSnap = await getDocs(collection(db, 'eventos'));
      const eventosActuales = eventosSnap.docs.map(eventDoc => ({ id: eventDoc.id, ...eventDoc.data() }));
      const usos = getSongUsageInEvents(songToDelete.id, eventosActuales);

      if (usos.length > 0) {
        setDeleteUsage(usos);
        showToast(`No se puede eliminar: aparece en ${usos.length} evento(s).`, "error");
        return;
      }

      await deleteDoc(doc(db, 'canciones', songToDelete.id));
      showToast("Canción eliminada exitosamente.", "success");
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

  const updateMediaLibraryUsageForDuplicate = async (newSongId, songTitle, copiedSectionMedia = {}) => {
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

    await Promise.all(updates.map(async ({ mediaId, usage }) => {
      try {
        const mediaRef = doc(db, MEDIA_LIBRARY_COLLECTION, mediaId);
        const mediaSnap = await getDoc(mediaRef);
        if (!mediaSnap.exists()) return;
        const mediaData = mediaSnap.data();
        const usageFields = calculateMediaUsageFields(mediaData.usedBy, usage, 'add');
        usageFields.firstUsedAt = mediaData.firstUsedAt || usageFields.firstUsedAt;
        await updateDoc(mediaRef, usageFields);
      } catch (error) {
        console.warn('No se pudo actualizar uso de mediaLibrary al duplicar:', mediaId, error);
      }
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
        titulo: `${original.titulo || 'Canción'} (Copia)`,
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

      const newDoc = await addDoc(collection(db, 'canciones'), copyData);
      await updateMediaLibraryUsageForDuplicate(newDoc.id, copyData.titulo, copiedSectionMedia);
      showToast('Canción duplicada correctamente.', 'success');
      navigate(`/editar/${newDoc.id}`, { state: { returnTo: '/canciones' } });
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
        const transposedRaw = (seccionesIncluidas || '').replace(/\[([^\]]+)\]/g, (match, acorde) => `[${transponerNota(acorde, offset)}]`);
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
      showToast('Canción archivada. Puedes restaurarla desde el filtro Archivadas.', 'success');
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
      showToast('Canción restaurada al repertorio.', 'success');
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
            return (
            <div key={cancion.id} className="kp-card p-5 rounded-2xl hover:border-blue-400/40 transition-colors group flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100 leading-tight">{cancion.titulo}</h3>
                  <p className="text-sm text-zinc-500 font-medium flex items-center gap-1 mt-1"><Mic2 size={14}/> {cancion.artista}</p>
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
                <div className="flex flex-col items-end gap-3">
                  <button onClick={(e) => toggleFavorito(cancion.id, e)} className="text-zinc-300 hover:text-rose-500 transition-colors" title="Añadir a Favoritos">
                    <Heart size={20} className={misFavoritos.includes(cancion.id) ? "fill-rose-500 text-rose-500 drop-shadow-sm" : ""} />
                  </button>
                  <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-lg border border-zinc-200 dark:border-zinc-700">{traducirAcorde(cancion.tonoOriginal, formatoAcordes, notacion)}</span>
                </div>
              </div>
              
              <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{cancion.bpm} BPM</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!archived && (
                    <button onClick={() => navigate(`/live/${cancion.id}`)} className="p-1.5 text-zinc-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg transition-colors" title="Abrir Teleprompter (En Vivo)">
                      <Play size={16} />
                    </button>
                  )}
                  
                  {user?.rol !== 'musico' && (
                    <>
                      <button onClick={() => navigate(`/editar/${cancion.id}`, { state: { returnTo: '/canciones' } })} className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors" title="Editar">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDuplicateSong(cancion)} disabled={duplicatingSongId === cancion.id} className="p-1.5 text-zinc-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors disabled:opacity-50" title="Duplicar cancion">
                        <Copy size={16} />
                      </button>
                      {archived ? (
                        <button onClick={() => handleRestoreSong(cancion)} className="p-1.5 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors" title="Restaurar al repertorio">
                          <RotateCcw size={16} />
                        </button>
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
            <p className="text-zinc-500 text-sm mb-6">?Estás seguro de que quieres eliminar <b>"{songToDelete.titulo}"</b>? Esta acción no se puede deshacer.</p>
            {deleteUsage.length > 0 && (
              <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">Canción en uso</p>
                <p className="mt-1 text-sm font-bold text-zinc-700 dark:text-zinc-200">Primero quitala de estos eventos:</p>
                <div className="mt-3 space-y-2">
                  {deleteUsage.map(evento => (
                    <button
                      key={evento.id}
                      type="button"
                      onClick={() => navigate(`/setlist/${evento.id}`)}
                      className="w-full rounded-xl border border-white/10 bg-white/60 px-3 py-2 text-left text-xs font-bold text-zinc-700 hover:bg-white dark:bg-zinc-950/40 dark:text-zinc-200"
                    >
                      <span className="block truncate">{evento.titulo}</span>
                      {evento.fecha && <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{evento.fecha}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setSongToDelete(null)} className="px-4 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={confirmarEliminacion} disabled={isDeletingSong || deleteUsage.length > 0} className="px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm shadow-red-200 disabled:cursor-not-allowed disabled:opacity-50">{isDeletingSong ? 'Verificando...' : 'S?, eliminar'}</button>
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
                <b>Magia Kadosh:</b> El sistema extraerá la letra de las {medleySongs.length || '...'} canciones seleccionadas, <b>transpondrá todos sus acordes automáticamente al Tono Final ({medleyKey || '?'})</b>, y las fusionará en una sola "Súper Canción".
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


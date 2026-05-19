import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Music, Search, Trash2, Edit, Mic2, Play, Heart, Layers, Plus, X, ChevronUp, ChevronDown, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { traducirAcorde, transponerNota } from '../../utils/musicCore';

const ETIQUETAS_DISPONIBLES = ['Júbilo', 'Adoración', 'Acústico', 'Navidad', 'Ministración', 'Especial'];

const SongList = ({ user }) => {
  const [canciones, setCanciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('');
  const [lastPlayedMap, setLastPlayedMap] = useState({});
  const misFavoritos = user?.favoritos || [];
  const [mostrarSoloFavoritos, setMostrarSoloFavoritos] = useState(false);
  const [toast, setToast] = useState(null);
  const [songToDelete, setSongToDelete] = useState(null);
  const navigate = useNavigate();
  const formatoAcordes = user?.preferencias?.formatoAcordes || 'american';
  
  // Estados para el Generador de Medleys
  const [showMedleyModal, setShowMedleyModal] = useState(false);
  const [medleySearch, setMedleySearch] = useState('');
  const [medleySongs, setMedleySongs] = useState([]);
  const [medleyKey, setMedleyKey] = useState('C');
  const [medleyBpm, setMedleyBpm] = useState('');
  const [isSavingMedley, setIsSavingMedley] = useState(false);

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Escuchar la base de datos en tiempo real
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'canciones'), (snapshot) => {
      const lista = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Ordenar alfabéticamente por título
      lista.sort((a, b) => a.titulo.localeCompare(b.titulo));
      setCanciones(lista);
      setLoading(false);
    });

    // Cargar historial de eventos para calcular "Última vez tocada"
    const unsubEventos = onSnapshot(collection(db, 'eventos'), (snap) => {
      const map = {};
      const hoy = new Date();
      snap.docs.forEach(doc => {
        const ev = doc.data();
        const eventDate = new Date(ev.fecha);
        if (eventDate <= hoy) { // Solo contar si ya pasó
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
    setSongToDelete({ id, titulo }); // Activa el modal
  };

  const confirmarEliminacion = async () => {
    if (!songToDelete) return;
    try {
      await deleteDoc(doc(db, 'canciones', songToDelete.id));
      showToast("Canción eliminada exitosamente.", "success");
    } catch (error) {
      console.error("Error eliminando:", error);
      showToast("Hubo un error al eliminar.", "error");
    } finally {
      setSongToDelete(null); // Cierra el modal
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
      setMedleySongs([...medleySongs, { ...song, secciones }]);
    }
    setMedleySearch('');
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

  const calcularOffset = (tonoOriginal, tonoDestino) => {
    if (!tonoOriginal || !tonoDestino) return 0;
    const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const origMatch = tonoOriginal.match(/^[A-G]#?/);
    const targetMatch = tonoDestino.match(/^[A-G]#?/);
    if (origMatch && targetMatch) {
      const origIdx = NOTAS.indexOf(origMatch[0]);
      const targetIdx = NOTAS.indexOf(targetMatch[0]);
      if (origIdx !== -1 && targetIdx !== -1) {
        let diff = targetIdx - origIdx;
        if (diff > 6) diff -= 12;
        if (diff < -5) diff += 12;
        return diff;
      }
    }
    return 0;
  };

  const handleCreateMedley = async () => {
    if (medleySongs.length < 2) return showToast("Selecciona al menos 2 canciones para fusionar.");
    setIsSavingMedley(true);
    try {
      let combinedRaw = "";
      medleySongs.forEach(song => {
        const offset = calcularOffset(song.tonoOriginal, medleyKey);
        
        // Filtrar solo las secciones que el usuario dejó marcadas
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
        bpm: Number(medleyBpm) || 0,
        letraRaw: combinedRaw.trim(),
        etiquetas: ['Ministración'],
        fechaCreacion: new Date().toISOString()
      });
      showToast("Medley generado exitosamente", "success");
      setShowMedleyModal(false); setMedleySongs([]);
      navigate(`/editar/${newDoc.id}`); // Llevamos al usuario directo al editor para que lo afine
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

  const cancionesFiltradas = canciones.filter(c => {
    const matchTexto = c.titulo.toLowerCase().includes(filtro.toLowerCase()) || c.artista.toLowerCase().includes(filtro.toLowerCase());
    const matchEtiqueta = filtroEtiqueta ? c.etiquetas?.includes(filtroEtiqueta) : true;
    const matchFavorito = mostrarSoloFavoritos ? misFavoritos.includes(c.id) : true;
    return matchTexto && matchEtiqueta && matchFavorito;
  });

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
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-2xl">
            <Music size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Repertorio</h1>
            <p className="text-zinc-500 mt-1 text-sm font-medium">{canciones.length} canciones disponibles en la nube.</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {user?.rol !== 'musico' && (
            <button onClick={handleExportBackup} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl font-bold text-sm shadow-sm transition-colors active:scale-95 w-full sm:w-max" title="Descargar Respaldo JSON">
              <Download size={16} />
            </button>
          )}
          {user?.rol !== 'musico' && (
            <button onClick={() => setShowMedleyModal(true)} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-100 text-violet-700 hover:bg-violet-200 rounded-xl font-bold text-sm shadow-sm transition-colors active:scale-95 w-full sm:w-max">
              <Layers size={16} /> Crear Medley
            </button>
          )}
          {user?.rol !== 'musico' && (
            <button onClick={() => navigate('/añadir')} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold text-sm shadow-sm transition-colors active:scale-95 w-full sm:w-max">
              <Plus size={16} /> Añadir
            </button>
          )}
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400"><Search size={18} /></div>
            <input type="text" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="block w-full pl-10 pr-3 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-900 dark:text-white text-sm font-medium shadow-sm" placeholder="Buscar canción..." />
          </div>
        </div>
      </header>

      {/* Filtros de Etiquetas */}
      <div className="flex overflow-x-auto gap-2 mb-6 pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <button onClick={() => { setFiltroEtiqueta(''); setMostrarSoloFavoritos(false); }} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${filtroEtiqueta === '' && !mostrarSoloFavoritos ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100' : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
          Todas
        </button>
        <button onClick={() => { setFiltroEtiqueta(''); setMostrarSoloFavoritos(true); }} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border flex items-center gap-1.5 ${mostrarSoloFavoritos ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-500/20' : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
          <Heart size={14} className={mostrarSoloFavoritos ? "fill-rose-700 text-rose-700 dark:fill-rose-500 dark:text-rose-500" : ""} /> Mis Favoritas
        </button>
        {ETIQUETAS_DISPONIBLES.map(tag => (
          <button key={tag} onClick={() => { setFiltroEtiqueta(tag); setMostrarSoloFavoritos(false); }} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${filtroEtiqueta === tag && !mostrarSoloFavoritos ? 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-500/20' : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
            {tag}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-zinc-500 font-medium animate-pulse">Cargando canciones...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cancionesFiltradas.map(cancion => (
            <div key={cancion.id} className="bg-white dark:bg-zinc-900 p-5 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors group flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100 leading-tight">{cancion.titulo}</h3>
                  <p className="text-sm text-zinc-500 font-medium flex items-center gap-1 mt-1"><Mic2 size={14}/> {cancion.artista}</p>
                  
                  {cancion.etiquetas && cancion.etiquetas.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {cancion.etiquetas.map(t => <span key={t} className="text-[9px] font-black uppercase tracking-widest bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded border border-violet-100 dark:border-violet-500/20">{t}</span>)}
                    </div>
                  )}
                  <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-2 bg-amber-50 dark:bg-amber-500/10 inline-block px-2 py-0.5 rounded-md border border-amber-100 dark:border-amber-500/20">🗓️ {formatTiempo(lastPlayedMap[cancion.id])}</p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <button onClick={(e) => toggleFavorito(cancion.id, e)} className="text-zinc-300 hover:text-rose-500 transition-colors" title="Añadir a Favoritos">
                    <Heart size={20} className={misFavoritos.includes(cancion.id) ? "fill-rose-500 text-rose-500 drop-shadow-sm" : ""} />
                  </button>
                  <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-lg border border-zinc-200 dark:border-zinc-700">{traducirAcorde(cancion.tonoOriginal, formatoAcordes)}</span>
                </div>
              </div>
              
              <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{cancion.bpm} BPM</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => navigate(`/live/${cancion.id}`)} className="p-1.5 text-zinc-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg transition-colors" title="Abrir Teleprompter (En Vivo)">
                    <Play size={16} />
                  </button>
                  
                  {user?.rol !== 'musico' && (
                    <>
                      <button onClick={() => navigate(`/editar/${cancion.id}`)} className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors" title="Editar">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDelete(cancion.id, cancion.titulo)} className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors" title="Eliminar"><Trash2 size={16} /></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {cancionesFiltradas.length === 0 && (
            <div className="col-span-full text-center py-12 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
              <p className="text-zinc-500 font-medium">No se encontraron canciones.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {songToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full mx-4 animate-in zoom-in-95">
            <h3 className="text-lg font-black text-zinc-900 mb-2">¿Eliminar canción?</h3>
            <p className="text-zinc-500 text-sm mb-6">¿Estás seguro de que quieres eliminar <b>"{songToDelete.titulo}"</b>? Esta acción no se puede deshacer.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setSongToDelete(null)} className="px-4 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={confirmarEliminacion} className="px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm shadow-red-200">Sí, eliminar</button>
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
                  <input type="text" value={medleySearch} onChange={e => setMedleySearch(e.target.value)} placeholder="Escribe para buscar..." className="w-full pl-9 pr-3 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 bg-white dark:bg-zinc-950 dark:text-white outline-none" />
                  {medleySearch && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl max-h-48 overflow-y-auto">
                      {canciones.filter(c => c.titulo.toLowerCase().includes(medleySearch.toLowerCase())).map(c => (
                        <button key={c.id} onClick={() => addToMedley(c)} className="w-full text-left px-4 py-2 hover:bg-violet-50 dark:hover:bg-violet-500/10 border-b border-zinc-100 dark:border-zinc-800 last:border-0 text-sm flex justify-between">
                          <span className="font-bold text-zinc-800 dark:text-zinc-200 truncate">{c.titulo}</span>
                          <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 dark:text-zinc-400 font-bold">{c.tonoOriginal}</span>
                        </button>
                      ))}
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
                            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">Tono orig: {song.tonoOriginal || '?'}</p>
                          </div>
                          <button onClick={() => setMedleySongs(medleySongs.filter(s => s.id !== song.id))} className="p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg"><Trash2 size={16}/></button>
                        </div>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">3. Tono Final (Para todas)</label>
                  <input type="text" value={medleyKey} onChange={e => setMedleyKey(e.target.value)} placeholder="Ej. G" className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 bg-white dark:bg-zinc-950 dark:text-white font-bold uppercase text-center" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">BPM Global</label>
                  <input type="number" value={medleyBpm} onChange={e => setMedleyBpm(e.target.value)} placeholder="Ej. 130" className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 bg-white dark:bg-zinc-950 dark:text-white font-bold text-center" />
                </div>
              </div>
              
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300 p-3 rounded-xl border border-blue-100 dark:border-blue-500/20 leading-tight">
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
      {toast && (
        <div className={`fixed bottom-6 right-6 p-4 rounded-xl shadow-xl text-sm font-bold animate-in slide-in-from-bottom-5 z-50 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};
export default SongList;
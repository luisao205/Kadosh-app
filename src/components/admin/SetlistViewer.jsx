import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, addDoc, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Calendar, Music, Users, ArrowLeft, Play, Mic2, Tag, FileText, Info, Printer, MessageSquare, Send, Trash2, Clock, CheckCircle2, XCircle, Clock4, Presentation, Monitor, AlertCircle, Pause, SkipBack, SkipForward, PlayCircle, X, ChevronDown } from 'lucide-react';
import { transponerNota, traducirAcorde } from '../../utils/musicCore';
import { parsearCancion } from '../../utils/songParser';

const SetlistViewer = ({ user }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [evento, setEvento] = useState(null);
  const [canciones, setCanciones] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comentario, setComentario] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState(null);

  // Estados para Reproductor Modo Ensayo (Mini Spotify)
  const [showEnsayoPlayer, setShowEnsayoPlayer] = useState(false);
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0);
  const [ensayoIsPlaying, setEnsayoIsPlaying] = useState(false);
  const [ensayoProgress, setEnsayoProgress] = useState(0);
  const [ensayoDuration, setEnsayoDuration] = useState(0);
  const ensayoAudioRef = useRef(null);
  const [showControladorMenu, setShowControladorMenu] = useState(false);

  const formatoAcordes = user?.preferencias?.formatoAcordes || 'american';

  const handleOpenScreen = (path) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) navigate(path);
    else window.open(path, '_blank');
    setShowControladorMenu(false);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Obtener Evento
        const eventoSnap = await getDoc(doc(db, 'eventos', id));
        if (!eventoSnap.exists()) {
          navigate('/eventos');
          return;
        }
        const eventoData = eventoSnap.data();
        setEvento(eventoData);

        // 2. Obtener Canciones del Evento (Extraídas del Setlist)
        const songIds = eventoData.setlist ? eventoData.setlist.filter(i => i.type === 'song').map(i => i.value) : (eventoData.canciones || []);
        const uniqueSongIds = [...new Set(songIds)];
        
        if (uniqueSongIds.length > 0) {
            const cancionesPromises = uniqueSongIds.map(songId => getDoc(doc(db, 'canciones', songId)));
            const cancionesSnaps = await Promise.all(cancionesPromises);
            setCanciones(cancionesSnaps.map(snap => ({ id: snap.id, ...snap.data() })));
        }

        // 3. Obtener Equipo Convocado
        if (eventoData.equipo && eventoData.equipo.length > 0) {
          const equipoPromises = eventoData.equipo.map(item => {
            const userId = typeof item === 'string' ? item : item.id;
            return getDoc(doc(db, 'usuarios', userId));
          });
          const equipoSnaps = await Promise.all(equipoPromises);
          setEquipo(equipoSnaps.map((snap, index) => {
            const item = eventoData.equipo[index];
            const rolAsignado = typeof item === 'string' ? null : item.rol;
            return { id: snap.id, ...snap.data(), rolAsignado };
          }));
        }
      } catch (error) {
        console.error("Error cargando setlist:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, navigate]);

  // Extraer lista de reproducción para Modo Ensayo
  const playlist = useMemo(() => {
    if (!evento) return [];
    const items = evento.setlist || (evento.canciones || []).map(id => ({ type: 'song', value: id }));
    const validSongs = [];
    items.forEach(item => {
      if (item.type === 'song') {
        const c = canciones.find(x => x.id === item.value);
        // Usar audio general, o si no hay, el primer stem/multitrack disponible
        const audio = c?.audioUrl || (c?.multitracks?.length > 0 ? c.multitracks[0].url : null);
        if (c && audio) validSongs.push({ ...c, playUrl: audio });
      }
    });
    return validSongs;
  }, [evento, canciones]);

  // Muro de Comentarios
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!comentario.trim()) return;
    
    setIsSubmittingComment(true);
    const nuevoComentario = {
      id: Date.now().toString(),
      autor: user?.nombre || 'Usuario',
      foto: user?.fotoPerfil || null,
      autorId: user?.uid,
      texto: comentario.trim(),
      fecha: new Date().toISOString()
    };

    try {
      const eventoRef = doc(db, 'eventos', id);
      const eventoSnap = await getDoc(eventoRef);
      const comentariosActuales = eventoSnap.data().comentarios || [];
      const nuevosComentarios = [...comentariosActuales, nuevoComentario];
      await updateDoc(eventoRef, { comentarios: nuevosComentarios });
      setEvento(prev => ({ ...prev, comentarios: nuevosComentarios }));
      setComentario('');
      
      // Notificar a los demás convocados
      const destinatarios = eventoSnap.data().equipo?.map(item => typeof item === 'string' ? item : item.id) || [];
      await addDoc(collection(db, 'notificaciones'), {
        titulo: `Muro de Ensayo`,
        mensaje: `${user.nombre} dice: ${comentario.trim()}`,
        destinatarios,
        emisorId: user.uid,
        fechaCreacion: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error al añadir comentario", error);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const confirmDeleteComment = async () => {
    if (!commentToDelete) return;
    try {
      const eventoRef = doc(db, 'eventos', id);
      const eventoSnap = await getDoc(eventoRef);
      const comentariosActuales = eventoSnap.data().comentarios || [];
      const nuevosComentarios = comentariosActuales.filter(c => c.id !== commentToDelete);
      await updateDoc(eventoRef, { comentarios: nuevosComentarios });
      setEvento(prev => ({ ...prev, comentarios: nuevosComentarios }));
    } catch (error) {
      console.error(error);
    } finally {
      setCommentToDelete(null);
    }
  };

  // Lógica de cálculo de transposición para imprimir los acordes correctos
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

  const responderRSVP = async (respuesta) => {
    try {
      await updateDoc(doc(db, 'eventos', id), { [`estadoAsistencia.${user.uid}`]: respuesta });
      setEvento(prev => ({ ...prev, estadoAsistencia: { ...prev.estadoAsistencia, [user.uid]: respuesta } }));
      
      let sugerenciaMsg = '';
      if (respuesta === 'rechazado') {
        const miAsignacion = equipo.find(u => u.id === user.uid);
        const miRol = miAsignacion?.rolAsignado || (user.instrumentos && user.instrumentos[0]);

        if (miRol) {
          const usuariosSnap = await getDocs(collection(db, 'usuarios'));
          const disponibles = [];
          usuariosSnap.forEach(usuarioDoc => {
            const u = usuarioDoc.data();
            // Buscamos músicos que toquen ese instrumento y que NO estén ya convocados
            if (usuarioDoc.id !== user.uid && !u.sinAcceso && u.instrumentos?.includes(miRol)) {
              const yaConvocado = equipo.some(eq => eq.id === usuarioDoc.id);
              if (!yaConvocado) disponibles.push(u.nombre.split(' ')[0]);
            }
          });

          if (disponibles.length > 0) {
            sugerenciaMsg = `\n💡 Tienes a ${disponibles.join(', ')} disponible(s) en ${miRol}.`;
          } else {
            sugerenciaMsg = `\n⚠️ No hay otros músicos registrados en ${miRol}.`;
          }
        }
      }

      await addDoc(collection(db, 'notificaciones'), {
        titulo: 'Respuesta de Convocatoria',
        mensaje: `${user.nombre} ha ${respuesta === 'confirmado' ? 'confirmado ✅' : 'rechazado ❌'} su asistencia.${sugerenciaMsg}`,
        destinatarios: ['admin', 'dueño'],
        emisorId: user.uid,
        url: `/setlist/${id}`,
        fechaCreacion: new Date().toISOString()
      });
    } catch (error) { console.error(error); }
  };

  // Controles de Reproducción Modo Ensayo
  useEffect(() => {
    if (showEnsayoPlayer && ensayoAudioRef.current) {
      ensayoAudioRef.current.play().then(() => setEnsayoIsPlaying(true)).catch(() => setEnsayoIsPlaying(false));
    }
  }, [currentTrackIdx, showEnsayoPlayer]);

  const playNextTrack = () => {
    if (currentTrackIdx < playlist.length - 1) setCurrentTrackIdx(prev => prev + 1);
    else { setEnsayoIsPlaying(false); setShowEnsayoPlayer(false); } // Cierra al terminar toda la lista
  };
  const playPrevTrack = () => {
    if (currentTrackIdx > 0) setCurrentTrackIdx(prev => prev - 1);
  };

  const formatTime = (time) => {
    if (!time || isNaN(time)) return "00:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64 text-zinc-500 font-bold animate-pulse">Cargando Setlist...</div>;
  }

  return (
    <>
    <div className="print:hidden max-w-5xl mx-auto animate-in fade-in duration-500 pb-12">
      {/* Cabecera */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl">
            <Calendar size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">{evento.titulo}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className="text-zinc-600 dark:text-zinc-300 text-sm font-bold capitalize flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-lg">
                <Clock size={14} /> Evento: {new Date(evento.fecha).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
              </span>
              {evento.fechaEnsayo && (
                <span className="text-emerald-700 dark:text-emerald-400 text-sm font-bold capitalize flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-2 py-1 rounded-lg">
                  <Clock size={14} /> Ensayo: {new Date(evento.fechaEnsayo).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {evento.tipoEvento && (
                <span className="text-violet-600 dark:text-violet-400 text-sm font-bold flex items-center gap-1 bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20 px-2 py-1 rounded-lg"><Tag size={14}/> {evento.tipoEvento}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          {playlist.length > 0 && (
            <button onClick={() => { setShowEnsayoPlayer(true); setCurrentTrackIdx(0); }} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold text-sm shadow-sm transition-colors active:scale-95 w-full sm:w-max animate-pulse">
              <PlayCircle size={16} /> Modo Ensayo
            </button>
          )}
          {(user?.rol === 'admin' || user?.rol === 'dueño' || user?.rol === 'multimedia') && (
            <div className="relative w-full sm:w-max">
              <button onClick={() => setShowControladorMenu(!showControladorMenu)} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 font-bold text-sm shadow-sm transition-colors active:scale-95 w-full sm:w-max">
                <Monitor size={16} /> Controlador <ChevronDown size={14} className={`transition-transform ${showControladorMenu ? 'rotate-180' : ''}`} />
              </button>
              {showControladorMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowControladorMenu(false)}></div>
                  <div className="absolute top-full right-0 sm:left-0 sm:right-auto mt-2 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl p-2 z-50 animate-in fade-in zoom-in-95">
                    <button onClick={() => handleOpenScreen(`/control-proyector/${id}`)} className="w-full text-left px-3 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-400 rounded-lg flex items-center gap-2 transition-colors">
                      <Monitor size={16} /> Controlador General
                    </button>
                    <button onClick={() => handleOpenScreen(`/retorno/${id}`)} className="w-full text-left px-3 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-400 rounded-lg flex items-center gap-2 transition-colors mt-1">
                      <Mic2 size={16} /> Retorno Cantantes
                    </button>
                    <button onClick={() => handleOpenScreen(`/retorno-musicos/${id}`)} className="w-full text-left px-3 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-400 rounded-lg flex items-center gap-2 transition-colors mt-1">
                      <Music size={16} /> Retorno Músicos
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <button onClick={() => handleOpenScreen(`/proyector/${id}`)} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 font-bold text-sm shadow-sm transition-colors active:scale-95 w-full sm:w-max">
            <Presentation size={16} /> Proyector
          </button>
          <button onClick={() => window.print()} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold text-sm shadow-sm transition-colors active:scale-95 w-full sm:w-max">
            <Printer size={16} /> Imprimir PDF
          </button>
          <button onClick={() => navigate('/eventos')} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 font-bold text-sm text-zinc-700 dark:text-zinc-300 shadow-sm transition-colors active:scale-95 w-full sm:w-max">
            <ArrowLeft size={16} /> Volver
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Setlist y Notas Generales */}
        <div className="lg:col-span-2 space-y-4">
          
          {evento.notas && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 shadow-sm">
              <h3 className="text-amber-800 dark:text-amber-400 font-bold text-sm flex items-center gap-1.5 mb-2"><Info size={16}/> Instrucciones del Director</h3>
              <p className="text-amber-900/80 dark:text-amber-400/80 text-sm whitespace-pre-wrap font-medium">{evento.notas}</p>
            </div>
          )}

          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2"><Music size={20} className="text-blue-600 dark:text-blue-400" /> Repertorio del Día</h2>
          
          {(!evento.setlist && canciones.length === 0) || (evento.setlist && evento.setlist.length === 0) ? (
            <p className="text-zinc-500 dark:text-zinc-400 text-sm p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800">El repertorio está vacío.</p>
          ) : (
            <div className="space-y-3">
              {(() => {
                const setlistItems = evento.setlist || (evento.canciones || []).map(id => ({ type: 'song', value: id, idLocal: id }));
                let songCounter = 1;
                
                return setlistItems.map((item, index) => {
                  if (item.type === 'note') {
                    return (
                      <div key={item.idLocal || index} className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-dashed rounded-xl p-3 flex items-center gap-3">
                        <FileText size={16} className="text-zinc-400" />
                        <span className="text-sm font-bold text-zinc-700 dark:text-zinc-400 italic">{item.value}</span>
                      </div>
                    );
                  }

                  const cancion = canciones.find(c => c.id === item.value);
                  if (!cancion) return null;
                  const currCount = songCounter++;
                  
                  let tonoFinal = cancion.tonoOriginal;
                  const cantanteAsignado = evento.cantantesPorCancion?.[cancion.id];
                  if (cantanteAsignado && cancion.tonosAlternativos) {
                    const opciones = cancion.tonosAlternativos.split(',');
                    const opcionMatch = opciones.find(opt => opt.trim().toLowerCase().startsWith(cantanteAsignado.toLowerCase() + ':'));
                    if (opcionMatch) tonoFinal = opcionMatch.split(':')[1].trim();
                  }

                  return (
                    <div key={item.idLocal || index} className="bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex items-center justify-between group hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors">
                      <div className="flex items-center gap-4 overflow-hidden">
                        <div className="w-8 h-8 shrink-0 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center font-black text-sm">{currCount}</div>
                        <div className="truncate">
                          <h3 className="font-bold text-zinc-900 dark:text-zinc-100 flex flex-wrap items-center gap-2">
                            <span className="truncate">{cancion.titulo}</span>
                            {evento.cantantesPorCancion?.[cancion.id] && <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-100 dark:border-rose-500/20 tracking-wide uppercase">{evento.cantantesPorCancion[cancion.id]}</span>}
                          </h3>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5"><Mic2 size={12}/> <span className="truncate">{cancion.artista}</span></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right hidden sm:block">
                          <span className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded uppercase">{traducirAcorde(tonoFinal || 'C', formatoAcordes)}</span>
                          <span className="block text-[10px] font-bold text-zinc-400 mt-1">{cancion.bpm} BPM</span>
                        </div>
                        <button onClick={() => { const cantante = evento.cantantesPorCancion?.[cancion.id] || ''; navigate(`/live/${cancion.id}?evento=${id}${cantante ? `&cantante=${encodeURIComponent(cantante)}` : ''}`); }} className="p-3 bg-green-100 text-green-700 hover:bg-green-600 hover:text-white rounded-xl transition-all shadow-sm active:scale-95" title="Abrir Teleprompter">
                          <Play size={18} className="ml-0.5" />
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>

        {/* Equipo Convocado */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2"><Users size={20} className="text-indigo-600 dark:text-indigo-400" /> Equipo Convocado</h2>
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800">
            {equipo.length === 0 ? <p className="text-zinc-500 dark:text-zinc-400 text-sm">Nadie ha sido convocado aún.</p> : (
              <div className="space-y-3">
                {equipo.map((u, index) => {
                  const estadoRSVP = evento.estadoAsistencia?.[u.id] || 'pendiente';
                  let rsvpIcon = <Clock4 size={14} className="text-amber-500" title="Pendiente" />;
                  if (estadoRSVP === 'confirmado') rsvpIcon = <CheckCircle2 size={14} className="text-green-500" title="Confirmado" />;
                  if (estadoRSVP === 'rechazado') rsvpIcon = <XCircle size={14} className="text-red-500" title="Rechazado" />;
                  return (
                  <div key={`${u.id}-${index}`} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                    <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center font-black text-sm uppercase">{u.nombre.charAt(0)}</div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100 leading-tight">{u.nombre}</p>
                        {u.id === user?.uid ? (
                          <button 
                            onClick={() => responderRSVP(estadoRSVP === 'confirmado' ? 'rechazado' : 'confirmado')}
                            className="hover:scale-110 transition-transform cursor-pointer"
                            title="Haz clic para cambiar tu respuesta"
                          >
                            {rsvpIcon}
                          </button>
                        ) : ( rsvpIcon )}
                      </div>
                      <p className="text-[10px] text-zinc-500 font-medium mt-0.5 uppercase">
                        {u.rolAsignado ? (
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-500/20">Asignado: {u.rolAsignado}</span>
                        ) : (
                          u.instrumentos?.join(', ') || 'Sin instrumento asignado'
                        )}
                      </p>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </div>
        </div>

        {/* Comentarios del Ensayo */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2"><MessageSquare size={20} className="text-amber-500" /> Muro del Evento</h2>
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col">
            
            <div className="space-y-4 mb-4 max-h-[300px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden">
              {!evento.comentarios || evento.comentarios.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400 text-sm text-center py-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">No hay avisos aún. ¡Escribe algo para el equipo!</p>
              ) : (
                evento.comentarios.map(c => (
                  <div key={c.id} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-3 border border-zinc-100 dark:border-zinc-800 relative group">
                    <div className="flex items-center gap-2 mb-1">
                      {c.foto ? (
                        <img src={c.foto} alt="Avatar" className="w-5 h-5 rounded-full object-cover shadow-sm" />
                      ) : (
                        <div className="w-5 h-5 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center font-bold text-[10px] uppercase">{c.autor.charAt(0)}</div>
                      )}
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{c.autor}</span>
                      <span className="text-[10px] text-zinc-400 font-medium">{new Date(c.fecha).toLocaleDateString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-sm text-zinc-800 dark:text-zinc-200 ml-7 leading-tight">{c.texto}</p>
                    
                     {(user?.rol === 'admin' || user?.rol === 'dueño' || user?.uid === c.autorId) && (
                      <button onClick={() => setCommentToDelete(c.id)} className="absolute top-2 right-2 text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddComment} className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
              <input type="text" value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Escribe un aviso para el equipo..." className="flex-1 px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 dark:text-white border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
              <button type="submit" disabled={isSubmittingComment || !comentario.trim()} className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl transition-colors active:scale-95 shadow-sm">
                <Send size={18} className="ml-0.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>

    {/* VISTA DE IMPRESIÓN (Generación Automática del Documento Físico) */}
    <div className="hidden print:block bg-white text-black font-sans">
       {/* PÁGINA 1: RESUMEN DE HOJA DE RUTA */}
      <div className="break-after-page">
        {/* Cabecera Principal */}
        <div className="text-center mb-8 border-b-4 border-black pb-6">
          <h1 className="text-5xl font-black uppercase tracking-tighter mb-2">{evento.titulo}</h1>
          <p className="text-xl font-bold text-gray-700">
            {new Date(evento.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {evento.tipoEvento && ` • ${evento.tipoEvento}`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-12">
          {/* Columna Izquierda: Instrucciones y Equipo */}
          <div>
            {evento.notas && (
              <div className="mb-8 p-5 border-2 border-black rounded-2xl bg-gray-50">
                <h3 className="font-black text-lg uppercase tracking-widest border-b-2 border-gray-300 pb-2 mb-3">Instrucciones del Director</h3>
                <p className="whitespace-pre-wrap text-sm font-medium">{evento.notas}</p>
              </div>
            )}

            <div className="mb-8">
              <h3 className="font-black text-lg uppercase tracking-widest border-b-2 border-black pb-2 mb-3">Equipo Convocado</h3>
              {equipo.length === 0 ? <p className="text-sm italic text-gray-500">Sin equipo asignado.</p> : (
                <ul className="space-y-2">
                  {equipo.map((u, i) => (
                    <li key={i} className="text-sm flex justify-between items-center border-b border-gray-200 pb-1">
                      <span className="font-bold">{u.nombre}</span>
                      <span className="text-xs font-bold bg-gray-200 px-2 py-0.5 rounded uppercase tracking-wider">{u.rolAsignado || u.instrumentos?.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {evento.comentarios && evento.comentarios.length > 0 && (
              <div>
                <h3 className="font-black text-lg uppercase tracking-widest border-b-2 border-black pb-2 mb-3">Muro del Evento</h3>
                <div className="space-y-3">
                  {evento.comentarios.map(c => (
                    <div key={c.id} className="p-3 border border-gray-300 rounded-xl bg-gray-50">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">{c.autor}:</p>
                      <p className="text-sm font-medium leading-snug">{c.texto}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Columna Derecha: Orden de Canciones (Setlist) */}
          <div>
            <h3 className="font-black text-lg uppercase tracking-widest border-b-2 border-black pb-2 mb-4">Orden del Repertorio</h3>
            <div className="space-y-4">
              {(() => {
                const setlistItems = evento.setlist || (evento.canciones || []).map(id => ({ type: 'song', value: id }));
                let count = 1;
                return setlistItems.map((item, idx) => {
                  if (item.type === 'note') {
                    return (
                      <div key={idx} className="p-3 border-2 border-dashed border-gray-400 rounded-xl text-center bg-gray-50">
                        <span className="font-bold italic text-gray-600">{item.value}</span>
                      </div>
                    );
                  } else {
                    const cancion = canciones.find(c => c.id === item.value);
                    if (!cancion) return null;
                    
                    let tonoFinal = cancion.tonoOriginal;
                    const cantanteAsignado = evento.cantantesPorCancion?.[cancion.id];
                    if (cantanteAsignado && cancion.tonosAlternativos) {
                      const opciones = cancion.tonosAlternativos.split(',');
                      const opcionMatch = opciones.find(opt => opt.trim().toLowerCase().startsWith(cantanteAsignado.toLowerCase() + ':'));
                      if (opcionMatch) tonoFinal = opcionMatch.split(':')[1].trim();
                    }

                    return (
                      <div key={idx} className="flex justify-between items-center p-3 border border-gray-300 rounded-xl shadow-sm">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm font-black shrink-0">{count++}</span>
                          <div>
                            <p className="font-black text-base leading-tight">{cancion.titulo}</p>
                            {cantanteAsignado && <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">Voz: {cantanteAsignado}</p>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-black text-xl border-2 border-black px-2 py-0.5 rounded-lg inline-block">{traducirAcorde(tonoFinal || 'C', formatoAcordes)}</span>
                        </div>
                      </div>
                    );
                  }
                });
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Hojas de Canciones Formateadas */}
      <div>
        {(() => {
          const setlistItems = evento.setlist || (evento.canciones || []).map(id => ({ type: 'song', value: id }));
           let printSongCounter = 1;
          return setlistItems.filter(i => i.type === 'song').map((item, idx) => {
            const cancion = canciones.find(c => c.id === item.value);
            if (!cancion) return null;

            let offset = 0;
            let tonoFinal = cancion.tonoOriginal;
            const cantanteAsignado = evento.cantantesPorCancion?.[cancion.id];
            if (cantanteAsignado && cancion.tonosAlternativos) {
              const opciones = cancion.tonosAlternativos.split(',');
              const opcionMatch = opciones.find(opt => opt.trim().toLowerCase().startsWith(cantanteAsignado.toLowerCase() + ':'));
              if (opcionMatch) {
                tonoFinal = opcionMatch.split(':')[1].trim();
                offset = calcularOffset(cancion.tonoOriginal, tonoFinal);
              }
            }

            const seccionesParsed = parsearCancion(cancion.letraRaw);
            const currCount = printSongCounter++;

            return (
              <div key={idx} className="break-after-page mb-12">
                <div className="mb-6 pb-2 border-b-2 border-black flex justify-between items-end">
                  <div>
                    <h2 className="text-4xl font-black uppercase tracking-tight leading-none mb-2">{currCount}. {cancion.titulo}</h2>
                    <p className="text-lg font-bold text-gray-600 uppercase tracking-widest">{cancion.artista}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-black border-4 border-black px-3 py-1 rounded-xl inline-block mb-1">{traducirAcorde(tonoFinal || 'C', formatoAcordes)}</span>
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">{cancion.bpm} BPM {cantanteAsignado ? `• Voz: ${cantanteAsignado}` : ''}</p>
                  </div>
                </div>
                <div className="columns-2 gap-12 text-sm font-medium">
                  {seccionesParsed.map((seccion, sIdx) => (
                    <div key={sIdx} className="break-inside-avoid mb-6">
                      <span className="font-bold text-black border-2 border-black px-2 py-0.5 rounded-lg text-xs uppercase tracking-wider inline-block mb-3">{seccion.titulo}</span>
                      {seccion.lineas.map((linea, lIdx) => (
                        <div key={lIdx} className="flex flex-wrap items-end gap-x-1.5 gap-y-4 mt-2 leading-tight">
                          {linea.map((palabra, pIdx) => (
                            <div key={pIdx} className="flex items-end whitespace-nowrap">
                              {palabra.map((silaba, sIdx) => (
                                <div key={sIdx} className="flex flex-col justify-end items-start">
                                  <span className="font-black text-black text-[1.1em] min-h-[1.25rem] flex items-end mb-0.5">{silaba.acorde ? traducirAcorde(transponerNota(silaba.acorde, offset), formatoAcordes) : ""}</span>
                                  <span>{silaba.texto}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          });
        })()}
      </div>

  {/* Modal Confirmar Eliminación de Comentario */}
  {commentToDelete && (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 animate-in fade-in print:hidden">
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-xl max-w-sm w-full mx-4 animate-in zoom-in-95 border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-2 flex items-center gap-2"><AlertCircle size={20} className="text-red-500"/> ¿Borrar aviso?</h3>
        <p className="text-zinc-500 text-sm mb-6">¿Estás seguro de que quieres eliminar este comentario del muro?</p>
        <div className="flex gap-3 justify-end">
              <button onClick={() => setCommentToDelete(null)} className="px-4 py-2.5 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">Cancelar</button>
              <button onClick={confirmDeleteComment} className="px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm shadow-red-200">Sí, borrar</button>
        </div>
      </div>
    </div>
  )}

  {/* Modal de RSVP Automático si el usuario está pendiente */}
  {evento?.estadoAsistencia?.[user?.uid] === 'pendiente' && (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in print:hidden">
      <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-2xl max-w-md w-full mx-4 animate-in zoom-in-95 text-center border border-zinc-200 dark:border-zinc-800">
        <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle size={32}/></div>
         <h3 className="text-2xl font-black text-zinc-900 dark:text-white mb-2">Has sido convocado</h3>
        <p className="text-zinc-500 text-sm mb-8 font-medium">Fuiste agregado al equipo para este evento. Por favor, confirma tu asistencia para que el líder sepa que cuenta contigo.</p>
        
        <div className="flex flex-col gap-3">
          <button onClick={() => responderRSVP('confirmado')} className="w-full py-3.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-colors active:scale-95 shadow-md shadow-green-200">
            <CheckCircle2 size={18} /> Sí, confirmo asistencia
          </button>
            <button onClick={() => responderRSVP('rechazado')} className="w-full py-3.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 text-zinc-600 dark:text-zinc-300 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors active:scale-95">
            <XCircle size={18} /> No podré asistir
          </button>
        </div>
      </div>
    </div>
  )}

  {/* Reproductor Modo Ensayo (Mini Spotify) Flotante */}
  {showEnsayoPlayer && playlist.length > 0 && (
    <div className="fixed bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 w-[95%] max-w-sm bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 animate-in slide-in-from-bottom-10 flex flex-col text-white print:hidden">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 overflow-hidden pr-4">
          <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <PlayCircle size={12}/> Reproduciendo Ensayo ({currentTrackIdx + 1}/{playlist.length})
          </p>
          <h4 className="font-bold text-base truncate">{playlist[currentTrackIdx].titulo}</h4>
          <p className="text-xs text-zinc-400 truncate">{playlist[currentTrackIdx].artista}</p>
        </div>
        <button onClick={() => { setShowEnsayoPlayer(false); if(ensayoAudioRef.current) ensayoAudioRef.current.pause(); setEnsayoIsPlaying(false); }} className="text-zinc-500 hover:text-white p-1.5 bg-zinc-800 rounded-full transition-colors shrink-0 active:scale-95">
          <X size={16}/>
        </button>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <span className="text-[10px] font-mono text-zinc-500 w-8 text-right">{formatTime(ensayoProgress)}</span>
        <input type="range" min="0" max={ensayoDuration || 100} value={ensayoProgress} onChange={(e) => { const val = Number(e.target.value); if(ensayoAudioRef.current) ensayoAudioRef.current.currentTime = val; setEnsayoProgress(val); }} className="flex-1 h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-emerald-400 transition-all" />
        <span className="text-[10px] font-mono text-zinc-500 w-8">{formatTime(ensayoDuration)}</span>
      </div>

      <div className="flex items-center justify-center gap-8">
        <button onClick={playPrevTrack} disabled={currentTrackIdx === 0} className="text-zinc-400 hover:text-white disabled:opacity-30 transition-colors active:scale-95">
          <SkipBack size={24} fill="currentColor" />
        </button>
        <button onClick={() => { if (ensayoAudioRef.current) { if (ensayoIsPlaying) ensayoAudioRef.current.pause(); else ensayoAudioRef.current.play(); setEnsayoIsPlaying(!ensayoIsPlaying); } }} className="w-14 h-14 flex items-center justify-center bg-white text-black hover:bg-zinc-200 rounded-full transition-transform active:scale-95 shadow-lg">
          {ensayoIsPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
        </button>
        <button onClick={playNextTrack} disabled={currentTrackIdx === playlist.length - 1} className="text-zinc-400 hover:text-white disabled:opacity-30 transition-colors active:scale-95">
          <SkipForward size={24} fill="currentColor" />
        </button>
      </div>
      <audio ref={ensayoAudioRef} src={playlist[currentTrackIdx].playUrl} onTimeUpdate={(e) => setEnsayoProgress(e.target.currentTime)} onLoadedMetadata={(e) => setEnsayoDuration(e.target.duration)} onEnded={playNextTrack} className="hidden" />
    </div>
  )}
    </div>
    </>
  );
};
export default SetlistViewer;
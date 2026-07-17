import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Calendar, Music, Users, Save, Trash2, Clock, CheckSquare, AlertCircle, GripVertical, Plus, FileText, AlignLeft, X, Tag, Share2, Copy, Search, Edit3, CheckCircle, RotateCcw, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { traducirAcorde } from '../../utils/musicCore';
import { formatEventDate, formatEventTime, parseAppDate } from '../../utils/dateUtils';
import { getSongSearchMatch } from '../../utils/songSearch';

const PLANTILLA_NOTAS = `👗 Vestimenta: 
⏰ Llegada: 
🎛️ Prueba de Sonido: 
🙏 Oración previa: 

📌 Detalles adicionales:
- `;

const EventManagement = ({ user }) => {
  const navigate = useNavigate();
  const [eventos, setEventos] = useState([]);
  const [canciones, setCanciones] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);

  // Formulario
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState('');
  const [fechaEnsayo, setFechaEnsayo] = useState('');
  const [tipoEvento, setTipoEvento] = useState('Servicio Dominical');
  const [notasGenerales, setNotasGenerales] = useState(PLANTILLA_NOTAS);
  const [setlist, setSetlist] = useState([]); // Estructura: [{ idLocal, type: 'song'|'note', value }]
  const [textoNota, setTextoNota] = useState('');
  const [equipoSeleccionado, setEquipoSeleccionado] = useState([]);
  const [cantantesPorCancion, setCantantesPorCancion] = useState({});
  const [corosPorCancion, setCorosPorCancion] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [showMobileForm, setShowMobileForm] = useState(false);
  
  // Nuevos estados para Fase 1
  const [editingEventId, setEditingEventId] = useState(null);
  const [estadoAsistenciaActual, setEstadoAsistenciaActual] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [toast, setToast] = useState(null);
  const [eventToDelete, setEventToDelete] = useState(null);
  const formatoAcordes = user?.preferencias?.formatoAcordes || 'american';
  const [lastPlayedMap, setLastPlayedMap] = useState({});
  const notacion = user?.preferencias?.notacion || 'sharps';
  const [showCompletados, setShowCompletados] = useState(false);
  
  const [plantillas, setPlantillas] = useState([]);
  const [showPlantillasMenu, setShowPlantillasMenu] = useState(false);
  const [showSavePlantillaModal, setShowSavePlantillaModal] = useState(false);
  const [nuevaPlantillaName, setNuevaPlantillaName] = useState('');

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Cargar datos en tiempo real (Eventos, Canciones y Usuarios)
  useEffect(() => {
    const unsubEventos = onSnapshot(collection(db, 'eventos'), (snap) => {
      let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => {
        const dateA = parseAppDate(a.fecha);
        const dateB = parseAppDate(b.fecha);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
      }); // Ordenar por fecha
      setEventos(data);

      // Calcular la última vez que se tocó cada canción (Idea 4: Anti-Repetición)
      const map = {};
      const hoy = new Date();
      data.forEach(ev => {
        const eventDate = parseAppDate(ev.fecha);
        if (!eventDate) return;
        if (eventDate <= hoy) { // Solo evaluamos eventos que ya pasaron
          const ids = ev.setlist ? ev.setlist.filter(i => i.type === 'song').map(i => i.value) : (ev.canciones || []);
          ids.forEach(id => {
            const lastDate = parseAppDate(map[id]);
            if (!lastDate || eventDate > lastDate) {
              map[id] = ev.fecha;
            }
          });
        }
      });
      setLastPlayedMap(map);
      setLoading(false);
    });

    const unsubCanciones = onSnapshot(collection(db, 'canciones'), (snap) => {
      let data = snap.docs.map(doc => {
        const song = doc.data();
        return { id: doc.id, ...song, tono: song.tonoOriginal || song.tono };
      });
      data.sort((a, b) => a.titulo.localeCompare(b.titulo));
      setCanciones(data);
    });

    const unsubUsuarios = onSnapshot(collection(db, 'usuarios'), (snap) => {
      let data = snap.docs.map(doc => ({ id: doc.id, nombre: doc.data().nombre, instrumentos: doc.data().instrumentos }));
      setUsuarios(data);
    });

    const unsubPlantillas = onSnapshot(collection(db, 'plantillasEquipo'), (snap) => {
      setPlantillas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubEventos(); unsubCanciones(); unsubUsuarios(); unsubPlantillas(); };
  }, []);

  const toggleEquipo = (id, rol) => {
    setEquipoSeleccionado(prev => {
      const isSelected = prev.some(item => 
        (typeof item === 'string' && item === id) || 
        (item.id === id && item.rol === rol)
      );
      
      if (isSelected) {
        return prev.filter(item => typeof item === 'string' ? item !== id : !(item.id === id && item.rol === rol));
      } else {
        const cleanPrev = prev.filter(item => typeof item === 'string' ? item !== id : true);
        return [...cleanPrev, { id, rol }];
      }
    });
  };

  const addToSetlist = (type, value) => {
    if (type === 'note' && !value.trim()) return;
    setSetlist(prev => [...prev, { idLocal: Date.now().toString() + Math.random(), type, value }]);
    if (type === 'note') setTextoNota('');
  };

  const removeFromSetlist = (idLocal) => {
    setSetlist(prev => prev.filter(item => item.idLocal !== idLocal));
  };

  // Lógica Drag & Drop
  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('dragIndex', index);
  };
  const handleDrop = (e, index) => {
    const dragIndex = Number(e.dataTransfer.getData('dragIndex'));
    const newSetlist = [...setlist];
    const [draggedItem] = newSetlist.splice(dragIndex, 1);
    newSetlist.splice(index, 0, draggedItem);
    setSetlist(newSetlist);
  };

  const handleAsignarCantante = (songId, nombreCantante) => {
    setCantantesPorCancion(prev => {
      const newCantantes = { ...prev, [songId]: nombreCantante };
      const prevCantante = prev[songId];

      setEquipoSeleccionado(prevEquipo => {
        let updated = [...prevEquipo];

        // Agregar nuevo cantante automáticamente
        if (nombreCantante) {
          const usuarioCantante = usuarios.find(u => u.nombre === nombreCantante);
          if (usuarioCantante) {
            const yaConvocado = updated.some(item => (typeof item === 'string' && item === usuarioCantante.id) || (item.id === usuarioCantante.id && item.rol === 'Voz Principal'));
            if (!yaConvocado) updated.push({ id: usuarioCantante.id, rol: 'Voz Principal' });
          }
        }

        // Revisar si el cantante anterior ya NO tiene canciones asignadas
        if (prevCantante && prevCantante !== nombreCantante) {
          const stillAssigned = Object.values(newCantantes).includes(prevCantante);
          if (!stillAssigned) {
            const usuarioPrev = usuarios.find(u => u.nombre === prevCantante);
            if (usuarioPrev) {
              // Remover SOLO el rol de "Voz Principal", no tocar si toca otro instrumento
              updated = updated.filter(item => !(typeof item !== 'string' && item.id === usuarioPrev.id && item.rol === 'Voz Principal'));
            }
          }
        }
        return updated;
      });

      return newCantantes;
    });
  };

  const handleCrearEvento = async (e) => {
    e.preventDefault();
    if (!titulo || !fecha) {
      showToast("El título y la fecha son obligatorios.");
      return;
    }

    setIsSaving(true);
    try {
      const estadoAsistencia = { ...estadoAsistenciaActual };
      
      // Mantenemos la respuesta de los que ya estaban, los nuevos inician pendientes
      equipoSeleccionado.forEach(item => {
        const uid = typeof item === 'string' ? item : item.id;
        if (!estadoAsistencia[uid]) estadoAsistencia[uid] = 'pendiente';
      });

      const eventData = {
        titulo,
        fecha,
        fechaEnsayo,
        tipoEvento,
        notas: notasGenerales,
        setlist,
        canciones: setlist.filter(i => i.type === 'song').map(i => i.value),
        equipo: equipoSeleccionado,
        estadoAsistencia,
        cantantesPorCancion,
        corosPorCancion,
      };

      let eventIdParaNotif = editingEventId;

      if (editingEventId) {
        eventData.fechaActualizacion = new Date().toISOString();
        await updateDoc(doc(db, 'eventos', editingEventId), eventData);
      } else {
        eventData.creadoPor = user.nombre;
        eventData.fechaCreacion = new Date().toISOString();
        const newDoc = await addDoc(collection(db, 'eventos'), eventData);
        eventIdParaNotif = newDoc.id;
      }

      if (equipoSeleccionado.length > 0) {
        // 1. IDs de músicos convocados
        const idsConvocados = equipoSeleccionado.map(item => typeof item === 'string' ? item : item.id);
        
        // 2. IDs de Admins y Dueños (para que siempre estén enterados)
        const adminsIds = usuarios
          .filter(u => u.rol === 'admin' || u.rol === 'dueño')
          .map(u => u.id);

        const destinatariosFinales = [...new Set([...idsConvocados, ...adminsIds])];

        await addDoc(collection(db, 'notificaciones'), {
          titulo: editingEventId ? '✏️ Evento Actualizado' : '🎸 Nueva Convocatoria',
          mensaje: editingEventId ? `El evento "${titulo}" ha sido modificado. Revisa los cambios.` : `Has sido convocado para: ${titulo}. Entra a la app para confirmar.`,
          destinatarios: destinatariosFinales,
          emisorId: user?.uid,
          url: `/setlist/${eventIdParaNotif}`,
          fechaCreacion: new Date().toISOString()
        });
      }

      showToast(editingEventId ? "¡Evento actualizado exitosamente!" : "¡Evento programado exitosamente!", "success");
      cancelEdit();
      setShowMobileForm(false);
    } catch (error) {
      console.error(error);
      showToast("Hubo un error al guardar el evento.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = (id, tituloEvento) => {
    setEventToDelete({ id, tituloEvento });
  };

  const confirmarEliminacion = async () => {
    if (!eventToDelete) return;
    try {
      await deleteDoc(doc(db, 'eventos', eventToDelete.id));
      await addDoc(collection(db, 'notificaciones'), {
        titulo: '🚨 Evento Cancelado',
        mensaje: `El evento "${eventToDelete.tituloEvento}" ha sido cancelado por el administrador.`,
        destinatarios: ['all'],
        emisorId: user?.uid,
        fechaCreacion: new Date().toISOString()
      });
      showToast("Evento cancelado.", "success");
    } catch (error) {
      showToast("Error al cancelar el evento.");
    } finally {
      setEventToDelete(null);
    }
  };

  // Compartir por WhatsApp
  const handleShareWhatsApp = (evento) => {
    let mensaje = `🎵 *${evento.titulo}*\n`;
    const fechaEvento = formatEventDate(evento.fecha, { weekday: 'short', day: 'numeric', month: 'short' });
    const horaEvento = formatEventTime(evento.fecha);
    mensaje += `📅 *Evento:* ${fechaEvento}${horaEvento ? ` - ${horaEvento}` : ''}\n`;
    if (evento.fechaEnsayo) {
      const fechaEnsayoTexto = formatEventDate(evento.fechaEnsayo, { weekday: 'short', day: 'numeric', month: 'short' });
      const horaEnsayoTexto = formatEventTime(evento.fechaEnsayo);
      mensaje += `🎸 *Ensayo:* ${fechaEnsayoTexto}${horaEnsayoTexto ? ` - ${horaEnsayoTexto}` : ''}\n`;
    }
    
    if (evento.equipo && evento.equipo.length > 0) {
      const equipoNombres = evento.equipo.map(item => {
        const userId = typeof item === 'string' ? item : item.id;
        const rol = typeof item === 'string' ? null : item.rol;
        const user = usuarios.find(u => u.id === userId);
        if (!user) return null;
        return `${user.nombre}${rol ? ` (${rol})` : ''}`;
      }).filter(Boolean);
      if (equipoNombres.length > 0) mensaje += `\n🎸 *Equipo:* ${equipoNombres.join(', ')}\n`;
    }

    mensaje += `\n📋 *Repertorio:*\n`;
    
    const setlistItems = evento.setlist || (evento.canciones || []).map(id => ({ type: 'song', value: id }));
    let songCount = 1;
    setlistItems.forEach(item => {
      if (item.type === 'note') {
        mensaje += `🔹 _${item.value}_\n`;
      } else {
        const cancion = canciones.find(c => c.id === item.value);
        if (cancion) {
          const cantante = evento.cantantesPorCancion?.[cancion.id];
          const coros = evento.corosPorCancion?.[cancion.id];
          let linea = `${songCount}. ${cancion.titulo} (${traducirAcorde(cancion.tonoOriginal || 'C', formatoAcordes, notacion)})`;
          if (cantante) linea += ` - Voz: ${cantante.split(' ')[0]}`;
          if (coros && coros.length > 0) linea += ` - Coros: ${coros.map(c => c.split(' ')[0]).join(', ')}`;
          mensaje += linea + '\n';
          songCount++;
        }
      }
    });
    mensaje += `\n📲 *Abre el Setlist aquí:* https://kadosh-app-iddbv.vercel.app/setlist/${evento.id}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(mensaje)}`, '_blank');
  };

  // Alternar Estado de Completado
  const toggleCompletado = async (evento) => {
    if (evento.completado) {
      // Calcular días pasados desde la fecha del evento
      const eventDate = parseAppDate(evento.fecha);
      if (!eventDate) {
        showToast("No se puede reabrir un evento sin fecha válida.");
        return;
      }
      const diasPasados = (new Date() - eventDate) / (1000 * 60 * 60 * 24);
      if (diasPasados > 3) {
        showToast("No se puede reabrir un evento que pasó hace más de 3 días.");
        return;
      }
    }

    try {
      await updateDoc(doc(db, 'eventos', evento.id), { completado: !evento.completado });
      showToast(evento.completado ? "Evento reabierto." : "Evento marcado como completado.", "success");
    } catch (error) {
      showToast("Error al actualizar estado.");
    }
  };

  // Lógica de Plantillas de Equipo
  const handleGuardarPlantilla = async () => {
    if (!nuevaPlantillaName.trim()) return showToast("El nombre de la plantilla es obligatorio.");
    if (equipoSeleccionado.length === 0) return showToast("Selecciona al menos un músico para guardar.");
    try {
      await addDoc(collection(db, 'plantillasEquipo'), { nombre: nuevaPlantillaName.trim(), equipo: equipoSeleccionado, creadoPor: user.uid });
      showToast("Plantilla guardada exitosamente.", "success");
      setShowSavePlantillaModal(false);
      setNuevaPlantillaName('');
      setShowPlantillasMenu(false);
    } catch(e) { showToast("Error al guardar plantilla."); }
  };

  const cargarPlantilla = (plantilla) => {
    setEquipoSeleccionado(plantilla.equipo);
    setShowPlantillasMenu(false);
    showToast(`Plantilla "${plantilla.nombre}" cargada.`, "success");
  };

  const eliminarPlantilla = async (id, e) => {
    e.stopPropagation();
    try { await deleteDoc(doc(db, 'plantillasEquipo', id)); } catch(e) {}
  };

  // Editar Evento Existente
  const handleEditEvent = (evento) => {
    setEditingEventId(evento.id);
    setTitulo(evento.titulo || '');
    setFecha(evento.fecha || '');
    setFechaEnsayo(evento.fechaEnsayo || '');
    setTipoEvento(evento.tipoEvento || 'Servicio Dominical');
    setNotasGenerales(evento.notas || '');
    setSetlist(evento.setlist || (evento.canciones || []).map(id => ({ idLocal: Date.now().toString() + Math.random(), type: 'song', value: id })));
    setCantantesPorCancion(evento.cantantesPorCancion || {});
    setCorosPorCancion(evento.corosPorCancion || {});
    setEquipoSeleccionado(evento.equipo || []);
    setEstadoAsistenciaActual(evento.estadoAsistencia || {});
    setShowMobileForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingEventId(null); setTitulo(''); setFecha(''); setFechaEnsayo(''); setSetlist([]); setNotasGenerales(PLANTILLA_NOTAS); setEquipoSeleccionado([]); setCantantesPorCancion({}); setCorosPorCancion({}); setEstadoAsistenciaActual({});
    setShowMobileForm(false);
  };

  // Duplicar Evento
  const handleDuplicarEvento = (evento) => {
    setTitulo(`${evento.titulo} (Copia)`);
    setTipoEvento(evento.tipoEvento || 'Servicio Dominical');
    setNotasGenerales(evento.notas || '');
    const oldSetlist = evento.setlist || (evento.canciones || []).map(id => ({ type: 'song', value: id }));
    setSetlist(oldSetlist.map(item => ({ ...item, idLocal: Date.now().toString() + Math.random() })));
    setCantantesPorCancion(evento.cantantesPorCancion || {});
    setCorosPorCancion(evento.corosPorCancion || {});
    setEquipoSeleccionado(evento.equipo || []);
    setFecha(''); setFechaEnsayo('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast("Setlist copiado. Ajusta la fecha y guarda.", "success");
  };

  // Agrupar músicos por instrumento para la convocatoria inteligente
  const equipoAgrupado = usuarios.reduce((acc, user) => {
    const instrumentos = user.instrumentos?.length > 0 ? user.instrumentos : ['Otros'];
    instrumentos.forEach(inst => {
      if (!acc[inst]) acc[inst] = [];
      acc[inst].push(user);
    });
    return acc;
  }, {});

  // Extraer las canciones únicas del setlist para asignar cantantes
  const uniqueSongsInSetlist = [...new Set(setlist.filter(i => i.type === 'song').map(i => i.value))];
  const setlistSearchResults = searchTerm.trim()
    ? canciones
      .map(song => ({ song, searchMatch: getSongSearchMatch(song, searchTerm) }))
      .filter(result => result.searchMatch.matches)
      .slice(0, 25)
    : [];

  const esAdmin = ['admin', 'dueño'].includes(user?.rol);

  const eventosPendientes = eventos.filter(e => !e.completado);
  const eventosCompletados = eventos.filter(e => e.completado).reverse(); // Los más recientes completados arriba

  // Componente interno para evitar código duplicado de la tarjeta
  const renderEventoCard = (evento) => {
    const fechaTexto = formatEventDate(evento.fecha, { weekday: 'short', day: 'numeric', month: 'short' });
    const horaTexto = formatEventTime(evento.fecha);
    const eventDate = parseAppDate(evento.fecha);
    const now = new Date();
    const isLiveCandidate = eventDate && !evento.completado && Math.abs(now - eventDate) < 6 * 60 * 60 * 1000;
    const statusLabel = evento.completado ? 'Finalizado' : !eventDate ? 'Sin fecha' : isLiveCandidate ? 'En vivo' : 'Próximo';
    const statusClass = evento.completado
      ? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
      : !eventDate
        ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
        : isLiveCandidate
          ? 'kp-live-badge'
          : 'bg-blue-500/10 text-blue-300 border-blue-500/25';

    return (
    <div key={evento.id} className={`kp-card p-5 md:p-6 rounded-3xl transition-all flex flex-col md:flex-row gap-4 justify-between items-start md:items-center group hover:border-rose-400/35 ${evento.completado ? 'opacity-70 saturate-50 hover:saturate-100 hover:opacity-100' : ''}`}>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`${statusClass} border text-xs font-black uppercase px-2.5 py-1 rounded-lg tracking-wider`}>
            {statusLabel}
          </span>
          <span className={`${evento.completado ? 'bg-zinc-500/10 text-zinc-400' : 'bg-rose-500/10 text-rose-300'} text-xs font-black uppercase px-2.5 py-1 rounded-lg tracking-wider`}>
            {fechaTexto || 'Fecha sin definir'}
          </span>
          {horaTexto && <span className="text-zinc-400 text-sm font-bold">{horaTexto}</span>}
        </div>
        <h3 className={`text-xl font-black ${evento.completado ? 'text-zinc-600 dark:text-zinc-500 line-through decoration-zinc-300 dark:decoration-zinc-600' : 'text-zinc-900 dark:text-zinc-100'}`}>{evento.titulo}</h3>
        {evento.tipoEvento && (
          <span className="inline-block mt-1 text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20 px-2 py-0.5 rounded-md">
            {evento.tipoEvento}
          </span>
        )}
        <div className="flex gap-4 mt-2 text-sm font-medium text-zinc-500">
          <span className="flex items-center gap-1"><Music size={14}/> {evento.setlist ? evento.setlist.filter(i => i.type === 'song').length : (evento.canciones?.length || 0)} Canciones</span>
          <span className="flex items-center gap-1"><Users size={14}/> {evento.equipo?.length || 0} Convocados</span>
        </div>
      </div>
      <div className="flex items-center gap-2 w-full md:w-auto mt-4 md:mt-0 flex-wrap justify-end">
        <button onClick={() => navigate(`/setlist/${evento.id}`)} className="kp-button-primary flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95">
          <CheckSquare size={16} /> Abrir
        </button>
        <button onClick={() => navigate(`/control-proyector/${evento.id}`)} className="kp-button-secondary flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95">
          <Clock size={16} /> Controlador
        </button>
        {!evento.completado && <button onClick={() => handleShareWhatsApp(evento)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95" title="Compartir"><Share2 size={16} /></button>}
        {esAdmin && (
          <>
            <button onClick={() => toggleCompletado(evento)} className={`p-2.5 rounded-xl transition-colors ${evento.completado ? 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 hover:bg-amber-200 dark:hover:bg-amber-500/20' : 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 hover:bg-emerald-200 dark:hover:bg-emerald-500/20'}`} title={evento.completado ? 'Reabrir Evento' : 'Marcar como Completado'}>
              {evento.completado ? <RotateCcw size={18} /> : <CheckCircle size={18} />}
            </button>
            <button onClick={() => handleEditEvent(evento)} className="p-2.5 text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-colors" title="Editar Evento"><Edit3 size={18} /></button>
            <button onClick={() => handleDuplicarEvento(evento)} className="p-2.5 text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors" title="Duplicar Setlist"><Copy size={18} /></button>
            <button onClick={() => handleDeleteClick(evento.id, evento.titulo)} className="p-2.5 text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors" title="Eliminar"><Trash2 size={18} /></button>
          </>
        )}
      </div>
    </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
      <header className="mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 rounded-3xl border border-white/10 bg-zinc-950/45 p-5 md:p-6 backdrop-blur-sm">
        <div className="p-3 bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded-2xl w-max">
          <Calendar size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Eventos y Setlists</h1>
          <p className="text-zinc-400 mt-1 text-sm font-medium">Planifica cultos, selecciona canciones y convoca al equipo.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
        
        {/* Columna Izquierda: Formulario (Solo visible para admins) */}
        {esAdmin && (
          <div className="lg:col-span-2">
            {/* Botón de despliegue para móviles */}
            <button 
              onClick={() => setShowMobileForm(!showMobileForm)}
              className="kp-panel lg:hidden w-full mb-4 p-4 rounded-2xl flex justify-between items-center font-bold text-zinc-200 active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${editingEventId ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600'}`}>
                  {editingEventId ? <Edit3 size={18} /> : <Plus size={18} />}
                </div>
                <span>{editingEventId ? 'Editando Evento' : 'Programar Nuevo Evento'}</span>
              </div>
              {showMobileForm ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {/* Contenedor del Formulario (Visible siempre en PC, toggle en móvil) */}
            <div className={`${showMobileForm ? 'block' : 'hidden lg:block'} kp-card rounded-3xl h-fit mb-8 lg:mb-0 animate-in slide-in-from-top-2 duration-300 overflow-visible`}>
            <div className="border-b border-white/10 p-5 md:p-6">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Planificación del culto</p>
              <h2 className="mt-2 text-2xl font-black text-zinc-100 flex items-center gap-2">
                <Clock size={22} className="text-violet-300" /> {editingEventId ? 'Editar Evento' : 'Programar Evento'}
              </h2>
              <p className="mt-1 text-sm font-medium text-zinc-400">Organiza datos, repertorio y convocatoria desde un solo panel.</p>
            </div>
            <form onSubmit={handleCrearEvento} className="space-y-5 p-5 md:p-6">
              <section className="kp-panel rounded-3xl p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100">Datos del evento</h3>
                    <p className="text-xs font-medium text-zinc-500">Información principal y horarios.</p>
                  </div>
                  <span className="kp-badge rounded-full px-3 py-1 text-[10px] font-black uppercase">{tipoEvento}</span>
                </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-black uppercase tracking-wide text-zinc-400 mb-2">Nombre del Evento</label>
                  <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="kp-input w-full p-3 rounded-2xl text-sm" placeholder="Ej. Culto Dominical" required />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-black uppercase tracking-wide text-zinc-400 mb-2">Tipo de Evento</label>
                  <select value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value)} className="kp-input w-full p-3 rounded-2xl text-sm font-medium">
                    <option value="Servicio Dominical">Servicio Dominical</option>
                    <option value="Culto de Jóvenes">Culto de Jóvenes</option>
                    <option value="Ensayo General">Ensayo General</option>
                    <option value="Vigilia">Vigilia</option>
                    <option value="Concierto">Concierto</option>
                    <option value="Evento Especial">Evento Especial</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-black uppercase tracking-wide text-zinc-400 mb-2">Fecha del Evento</label>
                  <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="kp-input w-full p-3 rounded-2xl text-sm" required />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-black uppercase tracking-wide text-zinc-400 mb-2">Fecha de Ensayo</label>
                  <input type="datetime-local" value={fechaEnsayo} onChange={(e) => setFechaEnsayo(e.target.value)} className="kp-input w-full p-3 rounded-2xl text-sm" />
                </div>
              </div>
              </section>
              <section className="kp-panel rounded-3xl p-4 md:p-5">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100">Instrucciones / Notas generales</h3>
                    <p className="text-xs font-medium text-zinc-500">Vestimenta, llegada, prueba de sonido y detalles adicionales.</p>
                  </div>
                  <button type="button" onClick={() => setNotasGenerales(PLANTILLA_NOTAS)} className="kp-button-secondary inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black">
                    <RotateCcw size={14} /> Restaurar plantilla
                  </button>
                </div>
              <textarea value={notasGenerales} onChange={(e) => setNotasGenerales(e.target.value)} placeholder="Añade instrucciones del evento..." className="kp-input w-full p-4 rounded-2xl text-sm resize-y min-h-44 leading-relaxed"></textarea>
              </section>

              {/* Constructor de Setlist (Drag & Drop) */}
              <section className="kp-panel rounded-3xl p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100 flex items-center gap-2"><AlignLeft size={16} /> Constructor de Setlist</h3>
                    <p className="text-xs font-medium text-zinc-500">Agrega canciones, momentos y bloques del culto.</p>
                  </div>
                  <span className="kp-badge rounded-full px-3 py-1 text-[10px] font-black uppercase">{setlist.length} items</span>
                </div>
                
                {/* Lista Arrastrable */}
                <div className={`space-y-2 mb-4 min-h-[5rem] rounded-2xl p-3 ${setlist.length === 0 ? 'kp-empty-state flex items-center justify-center' : 'border border-white/10 bg-black/20'}`}>
                  {setlist.length === 0 && <p className="text-xs text-zinc-400 text-center py-2 italic">Añade canciones o momentos aquí...</p>}
                  {setlist.map((item, idx) => (
                    <div 
                      key={item.idLocal}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, idx)}
                      className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-2xl shadow-sm group cursor-grab active:cursor-grabbing hover:border-violet-400/30 transition-colors"                    >
                      <GripVertical size={14} className="text-zinc-300 group-hover:text-zinc-500" />
                      <div className="flex-1 flex items-center gap-2 overflow-hidden">
                        {item.type === 'song' ? (() => {
                          const c = canciones.find(c => c.id === item.value);
                          const lastPlayed = lastPlayedMap[item.value];
                          const dias = lastPlayed ? Math.floor((new Date() - new Date(lastPlayed)) / (1000 * 60 * 60 * 24)) : null;
                          const isRecent = dias !== null && dias <= 21;
                          return (
                            <><Music size={12} className="text-blue-500 shrink-0"/> 
                              <span className="text-sm font-bold text-zinc-200 truncate">{c?.titulo || 'Canción'}</span>
                              {isRecent && <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-500/20 shrink-0 shadow-sm" title="Se ha tocado hace muy poco">⚠️ {dias === 0 ? 'Hoy' : `Hace ${dias}d`}</span>}
                            </>
                          );
                        })() : (
                          <><FileText size={12} className="text-amber-500 shrink-0"/> <span className="text-sm font-medium text-zinc-300 truncate italic">{item.value}</span></>
                        )}
                      </div>
                      <button type="button" onClick={() => removeFromSetlist(item.idLocal)} className="text-zinc-300 hover:text-red-500 transition-colors"><X size={14}/></button>
                    </div>
                  ))}
                </div>

                {/* Controles para añadir */}
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400"><Search size={14} /></div>
                      <input 
                        type="text" 
                        value={searchTerm} 
                        onChange={(e) => { setSearchTerm(e.target.value); setShowDropdown(true); }} 
                        onFocus={() => setShowDropdown(true)}
                        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                        className="kp-input w-full pl-10 p-3 rounded-2xl text-sm"
                        placeholder="Buscar por titulo, artista o letra..."
                      />
                      {showDropdown && searchTerm && (
                        <div className="absolute z-10 mt-2 w-full kp-modal rounded-2xl shadow-xl max-h-64 overflow-y-auto">
                          {setlistSearchResults.map(({ song: c, searchMatch }) => {
                            const lastPlayed = lastPlayedMap[c.id];
                            const dias = lastPlayed ? Math.floor((new Date() - new Date(lastPlayed)) / (1000 * 60 * 60 * 24)) : null;
                            const isRecent = dias !== null && dias <= 21;
                            return (
                              <button key={c.id} type="button" onClick={() => { addToSetlist('song', c.id); setSearchTerm(''); setShowDropdown(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-violet-500/10 border-b border-white/5 last:border-0 flex justify-between items-start gap-3 group">
                                <div className="min-w-0 pr-2">
                                  <p className="truncate"><span className="font-bold">{c.titulo}</span> <span className="text-zinc-500">- {c.artista}</span></p>
                                  {searchMatch.field === 'lyrics' && searchMatch.snippet && (
                                    <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-snug text-emerald-300">
                                      Letra: {searchMatch.snippet}
                                    </p>
                                  )}
                                </div>
                                {isRecent && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 shrink-0" title={`Tocada hace ${dias} días`}>{dias === 0 ? 'Hoy' : `${dias}d`}</span>}
                              </button>
                            )
                          })}
                          {setlistSearchResults.length === 0 && (
                            <div className="px-4 py-5 text-center text-xs font-bold text-zinc-400">
                              No se encontraron canciones por titulo, artista o letra.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={textoNota} onChange={(e) => setTextoNota(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToSetlist('note', textoNota))} placeholder="Añadir momento (Ej. Predica)" className="kp-input flex-1 p-3 rounded-2xl text-sm" />
                    <button type="button" onClick={() => addToSetlist('note', textoNota)} className="kp-button-secondary px-4 rounded-2xl transition-colors"><Plus size={16}/></button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={() => addToSetlist('note', '🎤 BLOQUE DE EXALTACIÓN | Coros: ')} className="kp-button-secondary text-xs font-black px-3 py-2 rounded-xl transition-colors">+ Bloque Exaltación</button>
                    <button type="button" onClick={() => addToSetlist('note', '🎤 BLOQUE DE ADORACIÓN | Coros: ')} className="kp-button-secondary text-xs font-black px-3 py-2 rounded-xl transition-colors">+ Bloque Adoración</button>
                  </div>
                </div>
              </section>

              {/* Asignar Cantantes */}
              {uniqueSongsInSetlist.length > 0 && (
                <div className="pt-2 border-t border-zinc-100">
                  <label className="block text-xs font-bold text-zinc-500 mb-2">Voz Principal por Canción</label>
                  <div className="space-y-3">
                    {uniqueSongsInSetlist.map(songId => {
                      const c = canciones.find(c => c.id === songId);
                      if (!c) return null;
                      const tonosGuardados = {};
                    if (c.tonosAlternativos) {
                      c.tonosAlternativos.split(',').forEach(t => {
                        const [name, key] = t.split(':');
                        if (name) tonosGuardados[name.trim()] = (key || '').trim();
                      });
                    }
                    
                    const cantantesDisponibles = usuarios.filter(u => u.instrumentos?.includes('Voz Principal') || u.instrumentos?.includes('Coros'));
                    const selectedSinger = cantantesPorCancion[songId] || '';
                    const isSelected = selectedSinger !== '';
                    const corosAsignados = corosPorCancion[songId] || [];
                    const hasTono = isSelected && tonosGuardados[selectedSinger] !== undefined;
                    const tonoFinal = hasTono ? (tonosGuardados[selectedSinger] || c.tono) : null;
                      
                      return (
                        <div key={songId} className="flex flex-col gap-2 bg-white/5 p-3 rounded-2xl border border-white/10">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <span className="text-sm font-bold text-zinc-200 flex-1 truncate">{c.titulo}</span>
                          <select 
                            value={selectedSinger} 
                            onChange={(e) => handleAsignarCantante(songId, e.target.value)}
                            className="kp-input w-full sm:w-1/2 p-2.5 rounded-xl text-sm font-medium"
                          >
                            <option value="">¿Quién canta?</option>
                            {cantantesDisponibles.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                          </select>
                        </div>
                        
                        {isSelected && !hasTono && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-500/10 p-1.5 rounded border border-amber-100 dark:border-amber-500/20 flex items-center gap-1 mt-1">
                            <AlertCircle size={12} /> {selectedSinger} no tiene tono registrado en esta canción.
                          </p>
                          )}
                          {isSelected && hasTono && (
                          <p className="text-[10px] text-green-700 dark:text-green-400 font-bold bg-green-50 dark:bg-green-500/10 p-1.5 rounded border border-green-100 dark:border-green-500/20 flex items-center gap-1 mt-1">
                            <Music size={12} /> Tono registrado para {selectedSinger}: {traducirAcorde(tonoFinal, formatoAcordes)}
                          </p>
                        )}
                        
                        <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                          <p className="text-[10px] font-bold text-zinc-500 mb-1.5 flex items-center gap-1">🎤 Asignar Coros a esta canción:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {cantantesDisponibles.map(cor => {
                              const isCoroSelected = corosAsignados.includes(cor.nombre);
                              return (
                                <button
                                  key={`${songId}-${cor.id}-coro`}
                                  type="button"
                                  onClick={() => {
                                    setCorosPorCancion(prev => {
                                      const corosActuales = prev[songId] || [];
                                      const nuevosCoros = corosActuales.includes(cor.nombre) ? corosActuales.filter(n => n !== cor.nombre) : [...corosActuales, cor.nombre];
                                      // Convocatoria automática al equipo
                                      setEquipoSeleccionado(prevEquipo => {
                                        let updated = [...prevEquipo];
                                        if (!corosActuales.includes(cor.nombre)) {
                                          if (!updated.some(item => (typeof item === 'string' && item === cor.id) || (item.id === cor.id && item.rol === 'Coros'))) updated.push({ id: cor.id, rol: 'Coros' });
                                        }
                                        return updated;
                                      });
                                      return { ...prev, [songId]: nuevosCoros };
                                    });
                                  }}
                                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-bold transition-all border ${isCoroSelected 
                                    ? 'bg-indigo-100 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400 shadow-sm' 
                                    : 'bg-white/5 dark:bg-zinc-950/50 border-zinc-200/10 dark:border-zinc-700/50 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50/10 dark:hover:bg-zinc-800'}`}
                                >
                                  {isCoroSelected && <Check size={12} className="text-indigo-500" />}
                                  <span>{cor.nombre.split(' ')[0]}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selector de Equipo */}
              <section className="kp-panel rounded-3xl p-4 md:p-5 relative">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <label className="block text-sm font-black uppercase tracking-wider text-zinc-100">
                    <Users size={14} className="inline mr-1"/> Convocatoria ({equipoSeleccionado.length})
                  </label>
                  <button type="button" onClick={() => setShowPlantillasMenu(!showPlantillasMenu)} className="kp-button-secondary text-xs font-black px-3 py-2 rounded-xl transition-colors flex items-center justify-center gap-2">
                    <Users size={12}/> Plantillas
                  </button>
                </div>

                {/* Menú Flotante de Plantillas */}
                {showPlantillasMenu && (
                  <div className="absolute top-16 right-0 z-20 w-full sm:w-72 kp-modal rounded-2xl p-3 animate-in fade-in zoom-in-95">
                    <h4 className="text-xs font-black text-zinc-100 mb-2 border-b border-white/10 pb-2">Tus Equipos Guardados</h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto mb-2 [&::-webkit-scrollbar]:hidden">
                      {plantillas.length === 0 ? (
                        <p className="text-[10px] text-zinc-500 italic py-1">No hay plantillas guardadas.</p>
                      ) : (
                        plantillas.map(p => (
                          <div key={p.id} onClick={() => cargarPlantilla(p)} className="flex justify-between items-center p-2 hover:bg-zinc-50 rounded-lg cursor-pointer group border border-transparent hover:border-zinc-200">
                            <div className="truncate pr-2">
                              <p className="text-xs font-bold text-zinc-700 truncate">{p.nombre}</p>
                              <p className="text-[9px] text-zinc-400">{p.equipo.length} integrantes</p>
                            </div>
                            <button onClick={(e) => eliminarPlantilla(p.id, e)} className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"><Trash2 size={12}/></button>
                          </div>
                        ))
                      )}
                    </div>
                    <button type="button" onClick={() => { setShowSavePlantillaModal(true); setShowPlantillasMenu(false); }} className="w-full text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 py-2 rounded-lg transition-colors border border-indigo-100 mt-1 shadow-sm">
                      + Guardar selección actual
                    </button>
                  </div>
                )}

                <div className="max-h-80 overflow-y-auto border border-white/10 rounded-2xl bg-black/20 p-3 space-y-5">
                  {Object.entries(equipoAgrupado).map(([instrumento, musicos]) => (
                    <div key={instrumento}>
                      <h4 className="text-[10px] font-black uppercase text-violet-300 mb-2 px-1 tracking-wider">{instrumento}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {musicos.map(u => {
                          const isSelected = equipoSeleccionado.some(item => 
                            (typeof item === 'string' && item === u.id) || 
                            (item.id === u.id && item.rol === instrumento)
                          );
                          return (
                          <label key={`${u.id}-${instrumento}`} className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-colors border ${isSelected ? 'bg-violet-500/15 border-violet-400/40 text-violet-100' : 'bg-white/5 border-white/10 hover:border-white/20 text-zinc-300'}`}>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleEquipo(u.id, instrumento)} className="rounded border-zinc-500 bg-zinc-950 text-violet-500 focus:ring-violet-500" />
                            <span className="text-xs font-bold flex-1">{u.nombre}</span>
                          </label>
                        )})}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-2 border-t border-white/10 bg-zinc-950/92 p-5 backdrop-blur-md md:-mx-6 md:-mb-6 md:px-6 flex gap-3">
                {editingEventId && (
                  <button type="button" onClick={cancelEdit} className="w-1/3 flex items-center justify-center py-3 px-4 rounded-xl text-sm font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-all active:scale-95">
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={isSaving} className={`kp-button-primary flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold disabled:opacity-50 transition-all active:scale-95 ${editingEventId ? 'w-2/3' : 'w-full'}`}>
                  <Save size={18} /> {isSaving ? 'Guardando...' : (editingEventId ? 'Actualizar Cambios' : 'Agendar Evento')}
                </button>
              </div>
            </form>
          </div>
          </div>
        )}

        {/* Columna Derecha: Lista de Eventos */}
        <div className={`space-y-4 ${esAdmin ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
          <h2 className="text-lg font-black text-zinc-100 mb-4">Próximos Eventos</h2>
          {loading ? (
            <div className="text-zinc-500 text-center py-8 animate-pulse">Cargando agenda...</div>
          ) : (
            <>
              {eventosPendientes.length === 0 ? (
                <div className="kp-empty-state text-center py-12 rounded-3xl">
                  <p className="text-zinc-500 font-medium">No hay eventos pendientes.</p>
                </div>
              ) : (
                eventosPendientes.map(evento => renderEventoCard(evento))
              )}

              {eventosCompletados.length > 0 && (
                <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                  <button onClick={() => setShowCompletados(!showCompletados)} className="kp-panel flex items-center justify-between w-full p-4 rounded-2xl transition-colors text-zinc-300 font-bold active:scale-[0.99]">
                    <span className="flex items-center gap-2"><CheckCircle size={20} className="text-emerald-600"/> Historial: Eventos Completados ({eventosCompletados.length})</span>
                    {showCompletados ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                  </button>
                  {showCompletados && (
                    <div className="mt-4 space-y-4 animate-in slide-in-from-top-2">
                      {eventosCompletados.map(evento => renderEventoCard(evento))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

  {/* Modal Guardar Plantilla */}
  {showSavePlantillaModal && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in p-4">
      <div className="bg-white p-6 rounded-3xl shadow-2xl max-w-sm w-full animate-in zoom-in-95">
        <h3 className="text-lg font-black text-zinc-900 mb-2">Guardar como Plantilla</h3>
        <p className="text-zinc-500 text-sm mb-4">Se guardará a los {equipoSeleccionado.length} integrantes seleccionados bajo un nombre predefinido para usarlos en el futuro.</p>
        <input type="text" value={nuevaPlantillaName} onChange={e => setNuevaPlantillaName(e.target.value)} placeholder="Ej. Banda Dominical A" className="w-full p-3 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none mb-6 font-bold text-zinc-700" autoFocus />
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => setShowSavePlantillaModal(false)} className="px-4 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors">Cancelar</button>
          <button type="button" onClick={handleGuardarPlantilla} className="px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm active:scale-95">Guardar Equipo</button>
        </div>
      </div>
    </div>
  )}

  {/* Modal de Confirmación de Eliminación */}
  {eventToDelete && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full mx-4 animate-in zoom-in-95">
        <h3 className="text-lg font-black text-zinc-900 mb-2 flex items-center gap-2"><AlertCircle size={20} className="text-red-500"/> ¿Cancelar Evento?</h3>
        <p className="text-zinc-500 text-sm mb-6">¿Estás seguro de que quieres cancelar <b>"{eventToDelete.tituloEvento}"</b>? Esta acción notificará al equipo y no se puede deshacer.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setEventToDelete(null)} className="px-4 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors">No, mantener</button>
          <button onClick={confirmarEliminacion} className="px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm shadow-red-200">Sí, cancelar evento</button>
        </div>
      </div>
    </div>
  )}

    </div>
  );
};
export default EventManagement;

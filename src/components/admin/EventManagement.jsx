import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Calendar, Music, Users, Save, Trash2, Clock, CheckSquare, AlertCircle, GripVertical, Plus, FileText, AlignLeft, X, Tag, Share2, Copy, Search, Edit3, CheckCircle, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { traducirAcorde } from '../../utils/musicCore';

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
      data.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)); // Ordenar por fecha
      setEventos(data);

      // Calcular la última vez que se tocó cada canción (Idea 4: Anti-Repetición)
      const map = {};
      const hoy = new Date();
      data.forEach(ev => {
        const eventDate = new Date(ev.fecha);
        if (eventDate <= hoy) { // Solo evaluamos eventos que ya pasaron
          const ids = ev.setlist ? ev.setlist.filter(i => i.type === 'song').map(i => i.value) : (ev.canciones || []);
          ids.forEach(id => {
            if (!map[id] || eventDate > new Date(map[id])) {
              map[id] = ev.fecha;
            }
          });
        }
      });
      setLastPlayedMap(map);
      setLoading(false);
    });

    const unsubCanciones = onSnapshot(collection(db, 'canciones'), (snap) => {
      let data = snap.docs.map(doc => ({ id: doc.id, titulo: doc.data().titulo, artista: doc.data().artista, tono: doc.data().tonoOriginal, tonosAlternativos: doc.data().tonosAlternativos }));
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
        await addDoc(collection(db, 'notificaciones'), {
          titulo: editingEventId ? '✏️ Evento Actualizado' : '🎸 Nueva Convocatoria',
          mensaje: editingEventId ? `El evento "${titulo}" ha sido modificado. Revisa los cambios.` : `Has sido convocado para: ${titulo}. Entra a la app para confirmar.`,
          destinatarios: ['musico', 'admin', 'dueño', 'multimedia'],
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
    mensaje += `📅 *Evento:* ${new Date(evento.fecha).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })} - ${new Date(evento.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}\n`;
    if (evento.fechaEnsayo) {
      mensaje += `🎸 *Ensayo:* ${new Date(evento.fechaEnsayo).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })} - ${new Date(evento.fechaEnsayo).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}\n`;
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
      const diasPasados = (new Date() - new Date(evento.fecha)) / (1000 * 60 * 60 * 24);
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

  const esAdmin = ['admin', 'dueño'].includes(user?.rol);

  const eventosPendientes = eventos.filter(e => !e.completado);
  const eventosCompletados = eventos.filter(e => e.completado).reverse(); // Los más recientes completados arriba

  // Componente interno para evitar código duplicado de la tarjeta
  const renderEventoCard = (evento) => (
    <div key={evento.id} className={`bg-white dark:bg-zinc-900 p-5 md:p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 hover:border-rose-200 dark:hover:border-rose-500/50 transition-all flex flex-col md:flex-row gap-4 justify-between items-start md:items-center group ${evento.completado ? 'opacity-60 saturate-50 hover:saturate-100 hover:opacity-100' : ''}`}>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`${evento.completado ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400' : 'bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400'} text-xs font-black uppercase px-2.5 py-1 rounded-lg tracking-wider`}>
            {new Date(evento.fecha).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <span className="text-zinc-400 text-sm font-bold">{new Date(evento.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
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
        <button onClick={() => navigate(`/setlist/${evento.id}`)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95">
          <CheckSquare size={16} /> Abrir
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

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
      <header className="mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl w-max">
          <Calendar size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Eventos y Setlists</h1>
          <p className="text-zinc-500 mt-1 text-sm font-medium">Planifica los cultos, selecciona canciones y convoca al equipo.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Columna Izquierda: Formulario (Solo visible para admins) */}
        {esAdmin && (
          <div className="lg:col-span-1">
            {/* Botón de despliegue para móviles */}
            <button 
              onClick={() => setShowMobileForm(!showMobileForm)}
              className="lg:hidden w-full mb-4 p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center font-bold text-zinc-700 dark:text-zinc-200 shadow-sm active:scale-[0.98] transition-all"
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
            <div className={`${showMobileForm ? 'block' : 'hidden lg:block'} bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 h-fit sticky top-6 max-h-[90vh] overflow-y-auto mb-8 lg:mb-0 animate-in slide-in-from-top-2 duration-300`}>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
              <Clock size={20} className="text-rose-600" /> {editingEventId ? 'Editar Evento' : 'Programar Evento'}
            </h2>
            <form onSubmit={handleCrearEvento} className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Nombre del Evento</label>
                  <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-rose-500 dark:text-white" placeholder="Ej. Culto Dominical" required />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Tipo de Evento</label>
                  <select value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value)} className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-rose-500 font-medium dark:text-white">
                    <option value="Servicio Dominical">Servicio Dominical</option>
                    <option value="Culto de Jóvenes">Culto de Jóvenes</option>
                    <option value="Ensayo General">Ensayo General</option>
                    <option value="Vigilia">Vigilia</option>
                    <option value="Concierto">Concierto</option>
                    <option value="Evento Especial">Evento Especial</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Fecha del Evento</label>
                  <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-rose-500 dark:text-white" required />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Fecha de Ensayo (Opcional)</label>
                  <input type="datetime-local" value={fechaEnsayo} onChange={(e) => setFechaEnsayo(e.target.value)} className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-rose-500 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Instrucciones / Notas Generales</label>
              <textarea value={notasGenerales} onChange={(e) => setNotasGenerales(e.target.value)} placeholder="Añade instrucciones del evento..." className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-rose-500 resize-none h-36 dark:text-white"></textarea>
              </div>

              {/* Constructor de Setlist (Drag & Drop) */}
              <div className="pt-2 border-t border-zinc-100">
                <label className="block text-xs font-bold text-zinc-500 mb-2 flex items-center gap-1"><AlignLeft size={14} /> Constructor de Setlist</label>
                
                {/* Lista Arrastrable */}
                <div className="space-y-1.5 mb-3 min-h-[3rem] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 border-dashed rounded-xl p-2">
                  {setlist.length === 0 && <p className="text-xs text-zinc-400 text-center py-2 italic">Añade canciones o momentos aquí...</p>}
                  {setlist.map((item, idx) => (
                    <div 
                      key={item.idLocal}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, idx)}
                      className="flex items-center gap-2 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm group cursor-grab active:cursor-grabbing"                    >
                      <GripVertical size={14} className="text-zinc-300 group-hover:text-zinc-500" />
                      <div className="flex-1 flex items-center gap-2 overflow-hidden">
                        {item.type === 'song' ? (() => {
                          const c = canciones.find(c => c.id === item.value);
                          const lastPlayed = lastPlayedMap[item.value];
                          const dias = lastPlayed ? Math.floor((new Date() - new Date(lastPlayed)) / (1000 * 60 * 60 * 24)) : null;
                          const isRecent = dias !== null && dias <= 21;
                          return (
                            <><Music size={12} className="text-blue-500 shrink-0"/> 
                              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate">{c?.titulo || 'Canción'}</span>
                              {isRecent && <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-500/20 shrink-0 shadow-sm" title="Se ha tocado hace muy poco">⚠️ {dias === 0 ? 'Hoy' : `Hace ${dias}d`}</span>}
                            </>
                          );
                        })() : (
                          <><FileText size={12} className="text-amber-500 shrink-0"/> <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate italic">{item.value}</span></>
                        )}
                      </div>
                      <button type="button" onClick={() => removeFromSetlist(item.idLocal)} className="text-zinc-300 hover:text-red-500 transition-colors"><X size={14}/></button>
                    </div>
                  ))}
                </div>

                {/* Controles para añadir */}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-zinc-400"><Search size={14} /></div>
                      <input 
                        type="text" 
                        value={searchTerm} 
                        onChange={(e) => { setSearchTerm(e.target.value); setShowDropdown(true); }} 
                        onFocus={() => setShowDropdown(true)}
                        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                        className="w-full pl-8 p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-950 focus:ring-rose-500 dark:text-white outline-none"
                        placeholder="Buscar canción..."
                      />
                      {showDropdown && searchTerm && (
                        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                          {canciones.filter(c => c.titulo.toLowerCase().includes(searchTerm.toLowerCase()) || c.artista.toLowerCase().includes(searchTerm.toLowerCase())).map(c => {
                            const lastPlayed = lastPlayedMap[c.id];
                            const dias = lastPlayed ? Math.floor((new Date() - new Date(lastPlayed)) / (1000 * 60 * 60 * 24)) : null;
                            const isRecent = dias !== null && dias <= 21;
                            return (
                              <button key={c.id} type="button" onClick={() => { addToSetlist('song', c.id); setSearchTerm(''); setShowDropdown(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-rose-50 dark:hover:bg-rose-500/10 border-b border-zinc-100 dark:border-zinc-800 last:border-0 flex justify-between items-center group">
                                <div className="truncate pr-2">
                                  <span className="font-bold">{c.titulo}</span> <span className="text-zinc-500">- {c.artista}</span>
                                </div>
                                {isRecent && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 shrink-0" title={`Tocada hace ${dias} días`}>{dias === 0 ? 'Hoy' : `${dias}d`}</span>}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={textoNota} onChange={(e) => setTextoNota(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToSetlist('note', textoNota))} placeholder="Añadir momento (Ej. Predica)" className="flex-1 p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-950 focus:ring-rose-500 dark:text-white" />
                    <button type="button" onClick={() => addToSetlist('note', textoNota)} className="px-3 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"><Plus size={16}/></button>
                  </div>
                  <div className="flex gap-2 flex-wrap mt-1">
                    <button type="button" onClick={() => addToSetlist('note', '🎤 BLOQUE DE EXALTACIÓN | Coros: ')} className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 transition-colors">+ Bloque Exaltación</button>
                    <button type="button" onClick={() => addToSetlist('note', '🎤 BLOQUE DE ADORACIÓN | Coros: ')} className="text-[10px] font-bold bg-violet-50 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 px-2 py-1 rounded border border-violet-100 dark:border-violet-500/20 hover:bg-violet-100 dark:hover:bg-violet-500/30 transition-colors">+ Bloque Adoración</button>
                  </div>
                </div>
              </div>

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
                        <div key={songId} className="flex flex-col gap-1 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex-1 truncate">{c.titulo}</span>
                          <select 
                            value={selectedSinger} 
                            onChange={(e) => handleAsignarCantante(songId, e.target.value)}
                            className="w-1/2 p-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs focus:ring-rose-500 focus:border-rose-500 bg-white dark:bg-zinc-900 dark:text-white font-medium"
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
                                  key={cor.id}
                                  type="button"
                                  onClick={() => {
                                    setCorosPorCancion(prev => {
                                      const corosActuales = prev[songId] || [];
                                      const nuevosCoros = corosActuales.includes(cor.nombre) ? corosActuales.filter(n => n !== cor.nombre) : [...corosActuales, cor.nombre];
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
                                  className={`text-[10px] px-2.5 py-1 rounded-full font-bold transition-all border ${isCoroSelected ? 'bg-indigo-100 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400 shadow-sm' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                                >
                                  {cor.nombre.split(' ')[0]}
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
              <div className="pt-2 border-t border-zinc-100 relative">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold text-zinc-500">
                    <Users size={14} className="inline mr-1"/> Convocatoria ({equipoSeleccionado.length})
                  </label>
                  <button type="button" onClick={() => setShowPlantillasMenu(!showPlantillasMenu)} className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center gap-1">
                    <Users size={12}/> Plantillas
                  </button>
                </div>

                {/* Menú Flotante de Plantillas */}
                {showPlantillasMenu && (
                  <div className="absolute top-8 right-0 z-20 w-64 bg-white border border-zinc-200 shadow-xl rounded-xl p-3 animate-in fade-in zoom-in-95">
                    <h4 className="text-xs font-bold text-zinc-800 mb-2 border-b pb-1">Tus Equipos Guardados</h4>
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

                <div className="max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950 p-2 space-y-4">
                  {Object.entries(equipoAgrupado).map(([instrumento, musicos]) => (
                    <div key={instrumento}>
                      <h4 className="text-[10px] font-black uppercase text-zinc-400 mb-1 px-1 tracking-wider">{instrumento}</h4>
                      <div className="space-y-1">
                        {musicos.map(u => {
                          const isSelected = equipoSeleccionado.some(item => 
                            (typeof item === 'string' && item === u.id) || 
                            (item.id === u.id && item.rol === instrumento)
                          );
                          return (
                          <label key={`${u.id}-${instrumento}`} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors border ${isSelected ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-900 dark:text-rose-400' : 'bg-white dark:bg-zinc-900 border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300'}`}>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleEquipo(u.id, instrumento)} className="rounded text-rose-600 focus:ring-rose-500 border-zinc-300" />
                            <span className="text-xs font-bold flex-1">{u.nombre}</span>
                          </label>
                        )})}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                {editingEventId && (
                  <button type="button" onClick={cancelEdit} className="w-1/3 flex items-center justify-center py-3 px-4 rounded-xl text-sm font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-all active:scale-95">
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={isSaving} className={`flex items-center justify-center gap-2 py-3 px-6 rounded-xl shadow-md text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-all active:scale-95 ${editingEventId ? 'w-2/3' : 'w-full'}`}>
                  <Save size={18} /> {isSaving ? 'Guardando...' : (editingEventId ? 'Actualizar Cambios' : 'Agendar Evento')}
                </button>
              </div>
            </form>
          </div>
          </div>
        )}

        {/* Columna Derecha: Lista de Eventos */}
        <div className={`space-y-4 ${esAdmin ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Próximos Eventos</h2>
          {loading ? (
            <div className="text-zinc-500 text-center py-8 animate-pulse">Cargando agenda...</div>
          ) : (
            <>
              {eventosPendientes.length === 0 ? (
                <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-800/30 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
                  <p className="text-zinc-500 font-medium">No hay eventos pendientes.</p>
                </div>
              ) : (
                eventosPendientes.map(evento => renderEventoCard(evento))
              )}

              {eventosCompletados.length > 0 && (
                <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                  <button onClick={() => setShowCompletados(!showCompletados)} className="flex items-center justify-between w-full p-4 bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-2xl transition-colors text-zinc-700 dark:text-zinc-300 font-bold active:scale-[0.99]">
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
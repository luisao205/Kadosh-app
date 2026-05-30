import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useNavigate } from 'react-router-dom';
import { Monitor, Film, Layers, Play, Calendar, ExternalLink, Tv, Plus, Trash2, Settings2, X, Edit2, Loader2, Fingerprint } from 'lucide-react';

const MultimediaHub = () => {
  const navigate = useNavigate();
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para la Matriz de Salidas
  const [outputs, setOutputs] = useState({});
  const [availableScreens, setAvailableScreens] = useState([]);
  const [showManager, setShowManager] = useState(false);
  
  // Modales
  const [confirmModal, setConfirmModal] = useState({ show: false, id: null, label: '' });
  const [inputModal, setInputModal] = useState({ show: false, id: null, title: '', value: '' });

  // Escuchar configuración de salidas globales
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'eventos', 'global'), (snap) => {
      if (snap.exists()) {
        setOutputs(snap.data().outputs || {});
      }
    });
    return () => unsub();
  }, []);

  // Detectar monitores físicos
  const detectarPantallas = async () => {
    try {
      if (!window.getScreenDetails) return;
      const screenDetails = await window.getScreenDetails();
      setAvailableScreens(screenDetails.screens);
      screenDetails.onscreenschange = () => setAvailableScreens(screenDetails.screens);
    } catch (e) { console.error(e); }
  };

  const handleUpdateOutput = async (id, data) => {
    const newOutputs = { ...outputs, [id]: { ...outputs[id], ...data } };
    await setDoc(doc(db, 'eventos', 'global'), { outputs: newOutputs }, { merge: true });
  };

  const handleIdentifyOutput = async (id) => {
    const newOutputs = { ...outputs, [id]: { ...outputs[id], identifyAt: Date.now() } };
    await setDoc(doc(db, 'eventos', 'global'), { outputs: newOutputs }, { merge: true });
  };

  const crearOutput = async () => {
    const id = `out_${Date.now()}`;
    const newOutputs = { 
      ...outputs, 
      [id]: { label: `Nueva Salida ${Object.keys(outputs).length + 1}`, type: 'proyector' } 
    };
    await setDoc(doc(db, 'eventos', 'global'), { outputs: newOutputs }, { merge: true });
  };

  const eliminarOutput = async (id) => {
    const newOutputs = { ...outputs };
    delete newOutputs[id];
    await setDoc(doc(db, 'eventos', 'global'), { outputs: newOutputs }, { merge: true });
    setConfirmModal({ show: false, id: null, label: '' });
  };

  const lanzarSalida = (id) => {
    const out = outputs[id];
    if (!out) return;
    
    // Intentamos lanzar al monitor global (o proyector del evento activo si lo hubiera)
    const path = `/output/global/${id}`;
    const windowName = `output_${id}`;
    
    let features = 'width=1280,height=720,menubar=no,toolbar=no';
    
    if (out.screenId && availableScreens.length > 0) {
      const target = availableScreens.find(s => s.id === out.screenId);
      if (target) {
        features = `left=${target.availLeft},top=${target.availTop},width=${target.availWidth},height=${target.availHeight},menubar=no,toolbar=no,fullscreen=yes`;
      }
    }
    
    window.open(path, windowName, features);
  };

  useEffect(() => {
    const fetchEventos = async () => {
      try {
        const hoy = new Date().toISOString().slice(0, 10);
        const q = query(
          collection(db, 'eventos'), 
          where('fecha', '>=', hoy),
          orderBy('fecha', 'asc'),
          limit(10)
        );
        const snap = await getDocs(q);
        setEventos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchEventos();
  }, []);

  const formatFriendlyDate = (dateValue) => {
    if (!dateValue) return "Fecha pendiente";
    let d;
    if (dateValue.toDate) d = dateValue.toDate(); // Si es Timestamp de Firebase
    else d = new Date(String(dateValue).includes('T') ? dateValue : `${dateValue}T12:00:00`);
    
    if (isNaN(d.getTime())) return "Por programar";
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const handleOpenScreen = (path) => {
    window.open(path, '_blank');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-3">
            <Monitor className="text-violet-600" size={32} /> Central Multimedia
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium mt-1">Gestión de proyección, setlists y videos en vivo.</p>
        </div>
        <button 
          onClick={() => setShowManager(true)}
          className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-2xl font-black shadow-xl hover:bg-violet-500 transition-all active:scale-95"
        >
          <Tv size={20} /> GESTIONAR PANTALLAS
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Control Sin Setlist */}
        <div className="bg-gradient-to-br from-violet-600 to-indigo-700 rounded-3xl p-8 text-white shadow-2xl shadow-indigo-500/20 flex flex-col justify-between group">
          <div>
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-md">
              <Film size={32} />
            </div>
            <h2 className="text-2xl font-black mb-2">Control Solo Medios</h2>
            <p className="text-indigo-100 font-medium leading-relaxed">Proyecta videos, fondos y logos sin necesidad de cargar una canción o setlist específico.</p>
          </div>
          <button 
            onClick={() => navigate('/control-proyector/global')}
            className="mt-8 w-full py-4 bg-white text-indigo-700 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-indigo-50 transition-colors shadow-lg"
          >
            <Play size={20} /> INICIAR CONTROLADOR LIBRE
          </button>
        </div>

        {/* Control con Setlist */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 flex flex-col">
          <h2 className="text-xl font-black text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
            <Calendar className="text-emerald-500" size={24} /> Setlists Disponibles
          </h2>
          <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px] pr-2 [&::-webkit-scrollbar]:hidden">
            {loading ? (
              <p className="text-zinc-500 italic animate-pulse">Buscando eventos próximos...</p>
            ) : eventos.length === 0 ? (
              <p className="text-zinc-500 italic">No hay eventos próximos creados.</p>
            ) : eventos.map(ev => (
              <button 
                key={ev.id}
                onClick={() => navigate(`/control-proyector/${ev.id}`)}
                className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-2xl border border-zinc-100 dark:border-zinc-800 transition-all group"
              >
                <div className="text-left">
                  <p className="font-black text-zinc-800 dark:text-zinc-200 group-hover:text-violet-600 transition-colors">{ev.titulo}</p>
                  <p className="text-xs text-zinc-500 font-bold">{formatFriendlyDate(ev.fecha)}</p>
                </div>
                <Layers size={20} className="text-zinc-400 group-hover:text-violet-500" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 📺 MODAL: MATRIZ DE SALIDAS (Gestión Pro) */}
      {showManager && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-8 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-white flex items-center gap-3">
                  <Tv className="text-violet-500" size={28} /> Matriz de Salidas
                </h3>
                <p className="text-zinc-500 text-sm font-medium mt-1">Configura tus monitores físicos y el contenido que recibirán.</p>
              </div>
              <button onClick={() => setShowManager(false)} className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-2xl transition-colors"><X size={24}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="flex justify-center">
                <button onClick={detectarPantallas} className="px-6 py-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-full text-xs font-black uppercase tracking-widest hover:bg-indigo-600/30 transition-all">
                  {availableScreens.length > 0 ? `${availableScreens.length} Monitores Detectados` : 'Escanear Hardware de Video'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(outputs).map(([id, out]) => (
                  <div key={id} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5 space-y-4 hover:border-violet-500/30 transition-all group">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <input 
                          type="text" value={out.label}
                          onChange={(e) => handleUpdateOutput(id, { label: e.target.value })}
                          className="bg-transparent border-none text-lg font-black text-white p-0 focus:ring-0 w-full"
                        />
                        <div className="flex gap-2 mt-2">
                          {['proyector', 'retorno', 'musicos'].map(t => (
                            <button 
                              key={t} onClick={() => handleUpdateOutput(id, { type: t })}
                              className={`px-2 py-1 rounded-md text-[9px] font-black uppercase border ${out.type === t ? 'bg-violet-600 border-violet-500 text-white' : 'border-zinc-800 text-zinc-600'}`}
                            >
                              {t === 'proyector' ? 'Público' : t === 'retorno' ? 'Stage' : 'Banda'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => handleIdentifyOutput(id)} className="p-2 text-zinc-800 hover:text-blue-500 transition-colors" title="Identificar Pantalla"><Fingerprint size={18}/></button>
                        <button onClick={() => setConfirmModal({ show: true, id, label: out.label })} className="p-2 text-zinc-800 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest block mb-2">Monitor Destino</label>
                      <select 
                        value={out.screenId || ''}
                        onChange={(e) => handleUpdateOutput(id, { screenId: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-400 outline-none focus:border-indigo-500"
                      >
                        <option value="">Cualquier pantalla (Ventana)</option>
                        {availableScreens.map((s, idx) => (
                          <option key={s.id || idx} value={s.id}>Pantalla {idx + 1} ({s.width}x{s.height})</option>
                        ))}
                      </select>
                    </div>

                    <button 
                      onClick={() => lanzarSalida(id)}
                      className="w-full py-3 bg-zinc-800 hover:bg-white hover:text-zinc-950 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                      <ExternalLink size={14}/> Lanzar a Pantalla
                    </button>
                  </div>
                ))}

                <button 
                  onClick={crearOutput}
                  className="border-2 border-dashed border-zinc-800 rounded-3xl flex flex-col items-center justify-center p-8 text-zinc-600 hover:text-violet-500 hover:border-violet-500/50 transition-all gap-2"
                >
                  <Plus size={32} />
                  <span className="font-black text-xs uppercase">Nueva Salida Virtual</span>
                </button>
              </div>
            </div>
            <div className="p-8 border-t border-zinc-800 flex justify-end">
              <button onClick={() => setShowManager(false)} className="px-10 py-3 bg-violet-600 text-white font-black rounded-2xl hover:bg-violet-500 transition-all">GUARDAR Y SALIR</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación para eliminar Salida */}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-black text-white mb-2">¿Eliminar salida?</h3>
            <p className="text-zinc-500 text-sm mb-6">Vas a eliminar la configuración de <b>{confirmModal.label}</b>. Esta acción es permanente.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal({ show: false, id: null, label: '' })} className="flex-1 py-3 bg-zinc-800 text-zinc-300 font-bold rounded-xl">Cancelar</button>
              <button onClick={() => eliminarOutput(confirmModal.id)} className="flex-1 py-3 bg-red-600 text-white font-black rounded-xl">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultimediaHub;
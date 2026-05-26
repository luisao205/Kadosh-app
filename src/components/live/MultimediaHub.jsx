import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useNavigate } from 'react-router-dom';
import { Monitor, Film, Layers, Play, Calendar, ExternalLink } from 'lucide-react';

const MultimediaHub = () => {
  const navigate = useNavigate();
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);

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
          onClick={() => handleOpenScreen('/proyector/global')}
          className="flex items-center gap-2 px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black shadow-xl hover:scale-105 transition-all active:scale-95"
        >
          <ExternalLink size={20} /> ABRIR PROYECTOR PÚBLICO
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
                  <p className="text-xs text-zinc-500 font-bold">{new Date(ev.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
                <Layers size={20} className="text-zinc-400 group-hover:text-violet-500" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultimediaHub;
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import Proyector from './Proyector';
import StageDisplay from './StageDisplay';
import StageDisplayMusicos from './StageDisplayMusicos';
import { Loader2 } from 'lucide-react';

const OutputRouter = () => {
  const { eventoId, outputId } = useParams();
  const [type, setType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [identify, setIdentify] = useState(false);
  const [label, setLabel] = useState('');

  useEffect(() => {
    // La configuración de la matriz (qué contenido va a cada ID) es GLOBAL
    const unsub = onSnapshot(doc(db, 'eventos', 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const config = data.outputs?.[outputId];
        if (config) {
          setType(config.type);
          setLabel(config.label);
          // Activar identificación si el timestamp es de hace menos de 4 segundos
          if (config.identifyAt && (Date.now() - config.identifyAt < 4000)) {
            setIdentify(true);
          }
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, [outputId]);

  // Timer independiente para la identificación
  useEffect(() => {
    if (identify) {
      const timer = setTimeout(() => setIdentify(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [identify]);

  if (loading) return (
    <div className="h-screen bg-black flex items-center justify-center">
      <Loader2 className="text-zinc-800 animate-spin" size={48} />
    </div>
  );

  // Si no se encuentra el tipo de salida en la matriz global
  if (!type) {
    return (
      <div className="h-screen bg-black text-zinc-700 flex flex-col items-center justify-center text-center p-10 font-black uppercase tracking-tighter">
        <p className="text-4xl opacity-20 mb-4">Offline</p>
        <p className="text-xs">Esta salida no está configurada en la matriz global.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {identify && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-violet-600/95 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-300">
           <div className="text-center p-16 bg-black/40 rounded-[5rem] border-8 border-white/10 shadow-[0_0_100px_rgba(139,92,246,0.5)]">
             <h1 className="text-white text-[10vw] font-black leading-none mb-4 drop-shadow-2xl">{label}</h1>
             <p className="text-violet-200 text-2xl md:text-4xl font-black uppercase tracking-[1em] opacity-80">Identificando Salida</p>
           </div>
        </div>
      )}
      {type === 'proyector' && <Proyector />}
      {type === 'retorno' && <StageDisplay />}
      {type === 'musicos' && <StageDisplayMusicos />}
    </div>
  );
};

export default OutputRouter;
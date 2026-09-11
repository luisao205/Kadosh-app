import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import Proyector from './Proyector';
import StageDisplay from './StageDisplay';
import StageDisplayMusicos from './StageDisplayMusicos';
import PreacherDisplay from './PreacherDisplay';
import { Loader2 } from 'lucide-react';
import { OUTPUT_HEARTBEAT_INTERVAL_MS, isOutputScreenTestActive } from '../../utils/outputPresence';

const SUPPORTED_OUTPUT_TYPES = ['proyector', 'retorno', 'musicos', 'preacher'];

const OutputRouter = ({ user }) => {
  const { eventoId, outputId } = useParams();
  const [type, setType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [identify, setIdentify] = useState(false);
  const [label, setLabel] = useState('');
  const [screenTest, setScreenTest] = useState(null);
  const outputSessionId = useMemo(() => `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => {
    // La configuración de la matriz (qué contenido va a cada ID) es GLOBAL
    const unsub = onSnapshot(doc(db, 'eventos', 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const config = data.outputs?.[outputId];
        if (!config) {
          setType(null);
          setLabel('');
          setScreenTest(null);
          setLoading(false);
          return;
        }
        if (config) {
          setType(config.type || null);
          setLabel(config.label);
          setScreenTest(isOutputScreenTestActive(config) ? config.screenTest : null);
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

  useEffect(() => {
    if (!type || !SUPPORTED_OUTPUT_TYPES.includes(type) || !outputId) return undefined;

    const globalDocRef = doc(db, 'eventos', 'global');
    const writeHeartbeat = async () => {
      try {
        await updateDoc(globalDocRef, {
          [`outputs.${outputId}.lastSeenAt`]: Date.now(),
          [`outputs.${outputId}.activeSessionId`]: outputSessionId,
        });
      } catch (error) {
        console.warn('No se pudo actualizar presencia de salida:', error);
      }
    };

    writeHeartbeat();
    const interval = setInterval(writeHeartbeat, OUTPUT_HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [outputId, outputSessionId, type]);

  // Timer independiente para la identificación
  useEffect(() => {
    if (identify) {
      const timer = setTimeout(() => setIdentify(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [identify]);

  useEffect(() => {
    if (!screenTest?.until) return undefined;
    const remainingMs = Math.max(0, Number(screenTest.until) - Date.now());
    const timer = setTimeout(() => setScreenTest(null), remainingMs);
    return () => clearTimeout(timer);
  }, [screenTest?.id, screenTest?.until]);

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

  if (!SUPPORTED_OUTPUT_TYPES.includes(type)) {
    return (
      <div className="h-screen bg-black text-zinc-500 flex flex-col items-center justify-center text-center p-10 font-black uppercase tracking-tighter">
        <p className="text-3xl text-red-400/80 mb-4">Tipo de salida no soportado</p>
        <p className="text-xs text-zinc-500">Salida: {label || outputId}</p>
        <p className="mt-2 text-xs text-zinc-600">Tipo recibido: {type}</p>
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
      {screenTest && (
        <div className="fixed inset-0 z-[190] overflow-hidden bg-zinc-950 text-white flex items-center justify-center">
          <div
            className="absolute inset-0 opacity-35"
            style={{
              backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,.18) 1px, transparent 1px)',
              backgroundSize: '8vw 8vw',
            }}
          />
          <div className="absolute inset-6 border-[1.2vw] border-white/80 rounded-[3vw]" />
          <div className="absolute left-0 top-0 h-16 w-16 bg-red-500" />
          <div className="absolute right-0 top-0 h-16 w-16 bg-emerald-500" />
          <div className="absolute left-0 bottom-0 h-16 w-16 bg-blue-500" />
          <div className="absolute right-0 bottom-0 h-16 w-16 bg-amber-400" />
          <div className="relative z-10 mx-8 max-w-5xl text-center">
            <p className="text-violet-300 text-lg md:text-3xl font-black uppercase tracking-[0.65em] mb-6">Prueba de pantalla</p>
            <h1 className="text-[10vw] md:text-[8vw] font-black leading-none drop-shadow-2xl">{label || 'Salida'}</h1>
            <p className="mt-8 text-xl md:text-4xl font-black text-zinc-300 uppercase tracking-[0.2em]">ID: {outputId}</p>
            <div className="mt-10 mx-auto h-3 w-64 max-w-full rounded-full bg-gradient-to-r from-red-500 via-emerald-400 to-blue-500" />
          </div>
        </div>
      )}
      {type === 'proyector' && <Proyector eventoIdOverride={eventoId} />}
      {type === 'retorno' && <StageDisplay eventoIdOverride={eventoId} />}
      {type === 'musicos' && <StageDisplayMusicos eventoIdOverride={eventoId} />}
      {type === 'preacher' && <PreacherDisplay eventoIdOverride={eventoId} user={user} />}
    </div>
  );
};

export default OutputRouter;

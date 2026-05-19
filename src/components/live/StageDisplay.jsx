import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { AlertTriangle, ChevronRight } from 'lucide-react';

const StageDisplay = () => {
  const { eventoId } = useParams();
  const [slide, setSlide] = useState(null);
  const [nextSlide, setNextSlide] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [nextSong, setNextSong] = useState(null);
  const [showLogo, setShowLogo] = useState(false);
  const [hora, setHora] = useState(new Date());

  // Reloj en tiempo real para el director
  useEffect(() => {
    const timer = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sincronización con el Controlador de Multimedia
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'eventos', eventoId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSlide(data.proyectorSlide || null);
        setNextSlide(data.proyectorNextSlide || null);
        setAlerta(data.proyectorAlerta || null);
        setNextSong(data.proyectorNextSong || null);
        setShowLogo(data.proyectorLogo || false);
      }
    });
    return () => unsub();
  }, [eventoId]);

  return (
    <div className="fixed inset-0 bg-zinc-950 text-white flex flex-col font-sans overflow-hidden selection:bg-transparent">
      {/* Overlay para forzar horizontal en móviles */}
      <div className="hidden portrait:flex fixed inset-0 z-[100] bg-zinc-950 flex-col items-center justify-center p-8 text-center">
        <svg className="w-20 h-20 text-amber-500 mb-6 animate-pulse transform -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
        <h2 className="text-2xl font-black text-white mb-2">Gira tu teléfono</h2>
        <p className="text-zinc-400 font-medium">Para usar el monitor de retorno, coloca tu dispositivo en posición horizontal.</p>
      </div>

      {/* Fondo de Cuadrícula (Estudio TV) */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100px_100px] pointer-events-none"></div>

      {/* Header: Reloj y Estado */}
      <header className="relative z-10 flex justify-between items-end px-8 py-6 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm shrink-0 shadow-sm">
         <div className="flex flex-col">
           <span className="text-red-500 font-black tracking-[0.2em] uppercase text-sm mb-1 flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div> EN VIVO</span>
           <span className="text-zinc-400 font-bold uppercase tracking-widest text-2xl flex items-center gap-3">
             Kadosh <span className="bg-zinc-800 text-white px-3 py-1 rounded-lg text-sm shadow-inner border border-zinc-700">STAGE DISPLAY</span>
           </span>
         </div>
         <div className="text-6xl font-black text-white font-mono tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
           {hora.toLocaleTimeString('es-ES', { hour12: false })}
         </div>
      </header>

      {alerta && (
        <div className="absolute top-28 inset-x-8 z-50 bg-red-600 border-x-4 border-b-4 border-red-500 rounded-b-3xl shadow-[0_20px_50px_rgba(220,38,38,0.5)] animate-in slide-in-from-top-10 fade-in duration-500 overflow-hidden">
           <div className="absolute inset-0 opacity-20 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#000_10px,#000_20px)] pointer-events-none"></div>
           <div className="relative p-8 flex flex-col items-center justify-center text-center">
             <AlertTriangle size={60} className="mb-4 text-white drop-shadow-md animate-bounce" />
             <h2 className="text-[5.5vw] font-black uppercase tracking-tighter leading-none drop-shadow-2xl">{alerta}</h2>
           </div>
        </div>
      )}

      <main className="relative z-0 flex-1 flex flex-col justify-center items-center text-center p-4 sm:p-8 w-full overflow-hidden">
         <h2 className="text-[min(8vw,6vh)] md:text-[min(6vw,6.5vh)] lg:text-[min(5vw,6.5vh)] font-black text-yellow-400 leading-[1.15] drop-shadow-[0_5px_25px_rgba(250,204,21,0.15)] whitespace-pre-wrap max-w-[95vw]">
           {showLogo ? (
             <span className="text-zinc-600 italic font-bold">🎯 LOGO KADOSH EN PANTALLA</span>
           ) : slide ? (slide.texto.trim() === '' ? (
             <div className="flex flex-col items-center">
               <span className="text-zinc-600 italic font-bold">🎶 {slide.titulo ? slide.titulo.toUpperCase() : 'INSTRUMENTAL'}</span>
               <span className="text-[min(4vw,4vh)] text-amber-500/80 font-black tracking-widest uppercase mt-4 animate-pulse">Toda La Banda</span>
             </div>
           ) : slide.texto) : <span className="text-zinc-800">KADOSH APP</span>}
         </h2>
      </main>

      {nextSong && (
        <div className="relative z-10 bg-indigo-950/80 border-t border-indigo-900/50 px-8 py-3 shrink-0 flex justify-between items-center shadow-inner">
           <span className="text-indigo-400 font-bold uppercase tracking-widest text-sm">A continuación en el programa:</span>
           <span className="text-xl sm:text-2xl font-black text-indigo-100 truncate">{nextSong}</span>
        </div>
      )}

      <footer className="relative z-10 bg-zinc-900 border-t border-zinc-800 p-8 shrink-0 flex items-center gap-8 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
         <div className="shrink-0 flex flex-col items-center justify-center">
            <span className="text-zinc-500 font-black uppercase tracking-widest text-sm mb-2">Preparar</span>
            <div className="w-12 h-12 rounded-full border-4 border-zinc-700 flex items-center justify-center bg-zinc-800"><ChevronRight size={24} className="text-zinc-400" /></div>
         </div>
         <div className="flex-1 border-l-2 border-zinc-800 pl-8 overflow-hidden">
           <p className="text-[min(4vw,4vh)] font-bold text-zinc-300 leading-none whitespace-pre-wrap truncate">
             {nextSlide ? (nextSlide.texto.trim() === '' ? <span className="text-zinc-600 italic">🎶 {nextSlide.titulo ? nextSlide.titulo.toUpperCase() : 'INSTRUMENTAL'} (TODA LA BANDA)</span> : nextSlide.texto.replace(/\n/g, ' - ')) : <span className="text-zinc-700">---</span>}
           </p>
         </div>
      </footer>
    </div>
  );
};
export default StageDisplay;
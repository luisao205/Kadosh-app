import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { AlertTriangle, ChevronRight, ArrowLeft } from 'lucide-react';

const StageDisplay = () => {
  const { eventoId } = useParams();
  const navigate = useNavigate();
  const [slide, setSlide] = useState(null);
  const [nextSlide, setNextSlide] = useState(null);
  const [media, setMedia] = useState(null);
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
        setMedia(data.proyectorMedia || null);
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

      {/* 🎬 PREVIEW BÓVEDA */}
      {media && media.url && (
        <div className="fixed top-24 right-8 w-48 aspect-video z-50 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl">
          <div className="absolute inset-0 bg-black">
            {media.type === 'video' ? (
              <video src={media.url} autoPlay loop muted className="w-full h-full object-cover" />
            ) : (
              <img src={media.url} className="w-full h-full object-cover" />
            )}
          </div>
        </div>
      )}

      {/* Header: Reloj y Estado */}
      <header className="relative z-10 flex justify-between items-center px-3 py-2 lg:px-8 lg:py-6 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm shrink-0 shadow-sm">
         <div className="flex items-center gap-2 lg:gap-4">
           <button onClick={() => navigate(`/setlist/${eventoId}`)} className="p-2 lg:p-3 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full transition-all backdrop-blur-md" title="Volver">
             <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6" />
           </button>
           <div className="flex flex-col">
             <span className="text-red-500 font-black tracking-[0.2em] uppercase text-[10px] lg:text-sm mb-0.5 lg:mb-1 flex items-center gap-1.5 lg:gap-2"><div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-red-500 animate-pulse"></div> EN VIVO</span>
             <span className="text-zinc-400 font-bold uppercase tracking-widest text-sm lg:text-2xl flex items-center gap-2 lg:gap-3">
               Kadosh <span className="bg-zinc-800 text-white px-2 lg:px-3 py-0.5 lg:py-1 rounded-lg text-xs lg:text-sm shadow-inner border border-zinc-700">STAGE DISPLAY</span>
             </span>
           </div>
         </div>
         <div className="text-2xl lg:text-6xl font-black text-white font-mono tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
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

      <main className="relative z-0 flex-1 flex flex-col justify-center items-center text-center p-2 lg:p-8 w-full overflow-hidden">
         <h2 className="text-[16px] md:text-[18px] lg:text-[min(5vw,6.5vh)] font-black text-yellow-400 leading-[1.2] drop-shadow-[0_5px_25px_rgba(250,204,21,0.15)] whitespace-pre-wrap break-words max-w-[95vw]">
           {showLogo ? (
             <span className="text-zinc-600 italic font-bold text-lg md:text-2xl lg:text-[min(6vw,6.5vh)]">🎯 LOGO KADOSH EN PANTALLA</span>
           ) : slide ? (slide.texto.trim() === '' ? (
             <div className="flex flex-col items-center">
               <span className="text-zinc-600 italic font-bold text-lg md:text-2xl lg:text-[min(6vw,6.5vh)]">🎶 {slide.titulo ? slide.titulo.toUpperCase() : 'INSTRUMENTAL'}</span>
               <span className="text-[11px] md:text-[13px] lg:text-[min(4vw,4vh)] text-amber-500/80 font-black tracking-widest uppercase mt-4 animate-pulse">Toda La Banda</span>
             </div>
           ) : slide.texto) : <span className="text-zinc-800 text-lg md:text-2xl lg:text-[min(6vw,6.5vh)]">KADOSH APP</span>}
         </h2>
      </main>

      {nextSong && (
        <div className="relative z-10 bg-indigo-950/80 border-t border-indigo-900/50 px-3 py-1.5 lg:px-8 lg:py-3 shrink-0 flex justify-between items-center shadow-inner">
           <span className="text-indigo-400 font-bold uppercase tracking-widest text-[10px] lg:text-sm">Siguiente:</span>
           <span className="text-sm sm:text-xl lg:text-2xl font-black text-indigo-100 truncate pl-2">{nextSong}</span>
        </div>
      )}

      <footer className="relative z-10 bg-zinc-900 border-t border-zinc-800 p-2 lg:p-8 shrink-0 flex items-center gap-3 lg:gap-8 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
         <div className="shrink-0 flex flex-col items-center justify-center">
            <span className="text-zinc-500 font-black uppercase tracking-widest text-[9px] lg:text-sm mb-0.5 lg:mb-2">Preparar</span>
            <div className="w-8 h-8 lg:w-12 lg:h-12 rounded-full border-2 lg:border-4 border-zinc-700 flex items-center justify-center bg-zinc-800"><ChevronRight className="w-5 h-5 lg:w-6 lg:h-6 text-zinc-400" /></div>
         </div>
         <div className="flex-1 border-l-2 border-zinc-800 pl-3 lg:pl-8 overflow-hidden">
           <p className="text-[min(5vw,5vh)] lg:text-[min(4vw,4vh)] font-bold text-zinc-300 leading-none whitespace-pre-wrap truncate">
             {nextSlide ? (nextSlide.texto.trim() === '' ? <span className="text-zinc-600 italic">🎶 {nextSlide.titulo ? nextSlide.titulo.toUpperCase() : 'INSTRUMENTAL'} (TODA LA BANDA)</span> : nextSlide.texto.replace(/\n/g, ' - ')) : <span className="text-zinc-700">---</span>}
           </p>
         </div>
      </footer>
    </div>
  );
};
export default StageDisplay;
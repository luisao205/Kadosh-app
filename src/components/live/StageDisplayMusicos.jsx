import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { AlertTriangle, ChevronRight, Settings2 } from 'lucide-react';
import { transponerNota, traducirAcorde } from '../../utils/musicCore';

const StageDisplayMusicos = () => {
  const { eventoId } = useParams();
  const [slide, setSlide] = useState(null);
  const [nextSlide, setNextSlide] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [nextSong, setNextSong] = useState(null);
  const [showLogo, setShowLogo] = useState(false);
  const [offset, setOffset] = useState(0);
  const [formato, setFormato] = useState('american');
  const [hora, setHora] = useState(new Date());

  // Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sincronización
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'eventos', eventoId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSlide(data.proyectorSlide || null);
        setNextSlide(data.proyectorNextSlide || null);
        setAlerta(data.proyectorAlerta || null);
        setNextSong(data.proyectorNextSong || null);
        setShowLogo(data.proyectorLogo || false);
        setOffset(data.proyectorOffset || 0); // Recibimos el offset calculado por el controlador
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

      {/* Botón oculto para cambiar formato de acordes (TV) */}
      <button onClick={() => setFormato(f => f === 'american' ? 'latin' : 'american')} className="absolute bottom-4 right-4 z-50 p-2 bg-zinc-800/30 hover:bg-zinc-700 text-zinc-500 hover:text-white rounded-full transition-all">
        <Settings2 size={16}/>
      </button>

      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100px_100px] pointer-events-none"></div>

      <header className="relative z-10 flex justify-between items-end px-4 lg:px-8 py-3 lg:py-6 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm shrink-0 shadow-sm">
         <div className="flex flex-col">
           <span className="text-emerald-500 font-black tracking-[0.2em] uppercase text-[10px] lg:text-sm mb-0.5 lg:mb-1 flex items-center gap-1.5 lg:gap-2"><div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-emerald-500 animate-pulse"></div> BANDA EN VIVO</span>
           <span className="text-zinc-400 font-bold uppercase tracking-widest text-lg lg:text-2xl flex items-center gap-2 lg:gap-3">
             Retorno <span className="bg-zinc-800 text-emerald-400 px-2 lg:px-3 py-0.5 lg:py-1 rounded-lg text-xs lg:text-sm shadow-inner border border-zinc-700">MÚSICOS</span>
           </span>
         </div>
         <div className="text-3xl lg:text-6xl font-black text-white font-mono tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
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
           {showLogo ? (
             <span className="text-zinc-600 italic font-bold text-[min(6vw,6vh)]">🎯 LOGO KADOSH EN PANTALLA</span>
           ) : slide ? ((() => {
             const lineasArray = typeof slide.lineas === 'string' ? JSON.parse(slide.lineas) : slide.lineas;
             if (lineasArray && lineasArray.length > 0) {
               return (
                 <div className="flex flex-col items-center justify-center w-full max-w-[95vw]">
                    {lineasArray.map((linea, idxLinea) => (
                  <div key={idxLinea} className="flex flex-wrap justify-center items-end gap-x-4 lg:gap-x-3 gap-y-4 lg:gap-y-8 mt-4 lg:mt-6 font-medium leading-tight">
                        {linea.map((palabra, idxPalabra) => (
                          <div key={idxPalabra} className="flex items-end whitespace-nowrap gap-4 lg:gap-0">
                            {palabra.map((silaba, idxSilaba) => (
                              <div key={idxSilaba} className={`flex flex-col justify-end items-center ${!silaba.acorde ? 'hidden lg:flex' : ''}`}>
                            <span className="font-bold lg:min-h-[1.5rem] flex items-end mb-1 lg:mb-1 text-[min(5vw,6vh)] lg:text-[min(3vw,3vh)] text-blue-400">
                                  {silaba.acorde ? traducirAcorde(transponerNota(silaba.acorde, offset), formato) : ""}
                                </span>
                                <span className="hidden lg:block text-[min(5.5vw,5.5vh)] text-white drop-shadow-lg">{silaba.texto}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                 </div>
               );
             } else {
               return (
                 <div className="flex flex-col items-center">
                   <span className="text-zinc-600 italic font-bold text-[min(6vw,6vh)]">🎶 {slide.titulo ? slide.titulo.toUpperCase() : 'INSTRUMENTAL'}</span>
                   <span className="text-[min(4vw,4vh)] text-emerald-500/80 font-black tracking-widest uppercase mt-4 animate-pulse">Toda La Banda</span>
                 </div>
               );
             }
           })()) : <span className="text-zinc-800 font-black text-[min(6vw,6vh)]">KADOSH APP</span>}
      </main>

      {nextSong && (
        <div className="relative z-10 bg-emerald-950/80 border-t border-emerald-900/50 px-4 lg:px-8 py-1.5 lg:py-3 shrink-0 flex justify-between items-center shadow-inner">
           <span className="text-emerald-400 font-bold uppercase tracking-widest text-[10px] lg:text-sm">Siguiente en el programa:</span>
           <span className="text-sm sm:text-xl lg:text-2xl font-black text-emerald-100 truncate">{nextSong}</span>
        </div>
      )}

      <footer className="relative z-10 bg-zinc-900 border-t border-zinc-800 p-3 lg:p-8 shrink-0 flex items-center gap-4 lg:gap-8 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
         <div className="shrink-0 flex flex-col items-center justify-center">
            <span className="text-zinc-500 font-black uppercase tracking-widest text-[9px] lg:text-sm mb-1 lg:mb-2">Preparar</span>
            <div className="w-8 h-8 lg:w-12 lg:h-12 rounded-full border-2 lg:border-4 border-zinc-700 flex items-center justify-center bg-zinc-800"><ChevronRight className="w-4 h-4 lg:w-6 lg:h-6 text-zinc-400" /></div>
         </div>
         <div className="flex-1 border-l-2 border-zinc-800 pl-4 lg:pl-8 overflow-hidden">
           <p className="text-[min(4vw,4vh)] lg:text-[min(4vw,4vh)] font-bold text-zinc-300 leading-none whitespace-pre-wrap truncate">
             {nextSlide ? (nextSlide.texto.trim() === '' ? <span className="text-zinc-600 italic">🎶 {nextSlide.titulo ? nextSlide.titulo.toUpperCase() : 'INSTRUMENTAL'} (TODA LA BANDA)</span> : nextSlide.texto.replace(/\n/g, ' - ')) : <span className="text-zinc-700">---</span>}
           </p>
         </div>
      </footer>
    </div>
  );
};
export default StageDisplayMusicos;
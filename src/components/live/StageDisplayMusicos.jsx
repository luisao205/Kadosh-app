import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { AlertTriangle, ChevronRight, Settings2, ArrowLeft, Link2, Link2Off } from 'lucide-react';
import { transponerNota, traducirAcorde } from '../../utils/musicCore';
import { parsearCancion } from '../../utils/songParser';

const StageDisplayMusicos = () => {
  const { eventoId } = useParams();
  const navigate = useNavigate();
  const [songId, setSongId] = useState(null);
  const [slide, setSlide] = useState(null);
  const [nextSlide, setNextSlide] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [nextSong, setNextSong] = useState(null);
  const [showLogo, setShowLogo] = useState(false);
  const [offset, setOffset] = useState(0);
  const [formato, setFormato] = useState('american');
  const [notacion, setNotacion] = useState('sharps'); // Asumimos 'sharps' por defecto si no hay preferencias de usuario
  const [hora, setHora] = useState(new Date());
  
  // Estados para Modo Vistazo (Peeking)
  const [secciones, setSecciones] = useState([]);
  const [manualMode, setManualMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Cargar datos de la canción completa cuando cambie el songId
  useEffect(() => {
    if (!songId) return;
    const fetchFullSong = async () => {
      const songSnap = await getDoc(doc(db, 'canciones', songId));
      if (songSnap.exists()) {
        const data = songSnap.data();
        setSecciones(parsearCancion(data.letraRaw));
      }
    };
    fetchFullSong();
  }, [songId]);

  // Lógica de Auto-Scroll en modo Sincronizado
  useEffect(() => {
    if (!manualMode && currentIndex !== -1) {
      const element = document.getElementById(`section-${currentIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentIndex, manualMode]);

  // Detectar scroll manual para soltar la sincronía
  const handleUserScroll = () => {
    if (!manualMode) setManualMode(true);
  };

  // Sincronización
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'eventos', eventoId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSlide(data.proyectorSlide || null);
        setSongId(data.proyectorSongId || null);
        setCurrentIndex(data.proyectorSlideIndex ?? -1);
        setNextSlide(data.proyectorNextSlide || null);
        setAlerta(data.proyectorAlerta || null);
        setNextSong(data.proyectorNextSong || null);
        setShowLogo(data.proyectorLogo || false);
        setOffset(data.proyectorOffset || 0); // Recibimos el offset calculado por el controlador
        // Si el evento tiene preferencias de usuario (ej. del director), las usamos
        if (data.preferencias?.formatoAcordes) setFormato(data.preferencias.formatoAcordes);
        if (data.preferencias?.notacion) setNotacion(data.preferencias.notacion);
      }
    });
    return () => unsub();
  }, [eventoId]);

  return (
    <div className="fixed inset-0 bg-zinc-950 text-white flex flex-col font-sans overflow-hidden selection:bg-transparent" onWheel={handleUserScroll} onTouchMove={handleUserScroll}>
      {/* Botón oculto para cambiar formato de acordes (TV) */}
      <button onClick={() => setFormato(f => f === 'american' ? 'latin' : 'american')} className="absolute bottom-4 right-4 z-50 p-2 bg-zinc-800/30 hover:bg-zinc-700 text-zinc-500 hover:text-white rounded-full transition-all">
        <Settings2 size={16}/>
      </button>

      {/* Botão de Re-Sincronización (Solo aparece si el músico movió la pantalla) */}
      {manualMode && (
        <button 
          onClick={() => setManualMode(false)}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full font-black shadow-2xl animate-bounce border-2 border-white/20 active:scale-95 transition-transform"
        >
          <Link2 size={20} /> VOLVER A SINCRONÍA
        </button>
      )}

      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100px_100px] pointer-events-none"></div>

      <header className="relative z-10 flex justify-between items-center px-3 py-2 lg:px-8 lg:py-6 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm shrink-0 shadow-sm">
         <div className="flex items-center gap-2 lg:gap-4">
           <button onClick={() => navigate(`/setlist/${eventoId}`)} className="p-1.5 lg:p-3 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full transition-all backdrop-blur-md" title="Volver">
             <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6" />
           </button>
           <div className="flex flex-col">
             <span className={`${manualMode ? 'text-amber-500' : 'text-emerald-500'} font-black tracking-[0.2em] uppercase text-[10px] lg:text-sm mb-0.5 lg:mb-1 flex items-center gap-1.5 lg:gap-2`}>
               <div className={`w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full ${manualMode ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`}></div> 
               {manualMode ? 'MODO MANUAL (VISTAZO)' : 'BANDA EN VIVO'}
             </span>
             <span className="text-zinc-400 font-bold uppercase tracking-widest text-sm lg:text-2xl flex items-center gap-2 lg:gap-3">
               Retorno <span className="bg-zinc-800 text-emerald-400 px-2 lg:px-3 py-0.5 lg:py-1 rounded-lg text-xs lg:text-sm shadow-inner border border-zinc-700">MÚSICOS</span>
             </span>
           </div>
         </div>
         <div className="text-2xl lg:text-6xl font-black text-white font-mono tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
           {hora.toLocaleTimeString('es-ES', { hour12: false })}
         </div>
      </header>

      {alerta && (
        <div className="fixed inset-0 flex items-center justify-center bg-red-600/90 z-[100] animate-pulse">
          <div className="text-center p-10">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white uppercase mb-4 italic">¡ATENCIÓN MÚSICOS!</h2>
            <p className="text-5xl md:text-7xl lg:text-8xl font-black text-white drop-shadow-2xl">{alerta}</p>
          </div>
        </div>
      )}

      <main className="relative z-0 flex-1 overflow-y-auto px-1 py-4 lg:p-12 w-full [&::-webkit-scrollbar]:hidden">
           {showLogo ? (
             <div className="flex justify-center items-center h-full"><span className="text-zinc-600 italic font-bold text-[16px] md:text-[18px] lg:text-[min(6vw,6vh)]">🎯 LOGO KADOSH EN PANTALLA</span></div>
           ) : secciones.length > 0 ? (
             <div className="flex flex-col gap-12 lg:gap-20 max-w-7xl mx-auto pb-40">
               {secciones.map((sec, idx) => (
                 <div 
                  key={idx} 
                  id={`section-${idx}`}
                  className={`p-6 lg:p-10 rounded-3xl transition-all duration-500 border-2 ${currentIndex === idx ? 'bg-blue-600/10 border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.2)]' : 'bg-transparent border-transparent opacity-70'}`}
                >
                   <span className={`text-[10px] sm:text-xs md:text-sm font-black uppercase tracking-widest px-3 py-1 rounded-lg mb-4 inline-block ${currentIndex === idx ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                      {sec.titulo}
                   </span>
                   <div className="flex flex-wrap justify-center items-end gap-x-2 md:gap-x-4 gap-y-4 lg:gap-y-10">
                      {sec.lineas.map((linea, idxL) => (
                        <div key={idxL} className="flex flex-wrap justify-center items-end gap-x-2 md:gap-x-3 w-full">
                          {linea.map((palabra, idxP) => (
                            <div key={idxP} className="flex items-end whitespace-nowrap">
                              {palabra.map((silaba, idxS) => (
                                <div key={idxS} className="flex flex-col justify-end items-start">
                                  <span className={`font-bold min-h-[1.2rem] lg:min-h-[1.8rem] flex items-end mb-1 text-[14px] sm:text-[16px] md:text-[18px] lg:text-[min(3.5vw,3.5vh)] leading-none ${currentIndex === idx ? 'text-yellow-400' : 'text-zinc-500'}`}>
                                    {silaba.acorde ? traducirAcorde(transponerNota(silaba.acorde, offset), formato, notacion) : ""}
                                  </span>
                                  <span className={`text-[16px] sm:text-[18px] md:text-[22px] lg:text-[min(6vw,6vh)] font-bold drop-shadow-lg leading-none ${currentIndex === idx ? 'text-white' : 'text-zinc-400'}`}>{silaba.texto}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                   </div>
                 </div>
               ))}
             </div>
           ) : slide ? (
             <div className="flex flex-col items-center justify-center h-full">
                   <span className="text-zinc-600 italic font-bold text-[14px] md:text-[18px] lg:text-[min(6vw,6vh)]">🎶 {slide.titulo ? slide.titulo.toUpperCase() : 'INSTRUMENTAL'}</span>
                   <span className="text-[10px] md:text-[13px] lg:text-[min(4vw,4vh)] text-emerald-500/80 font-black tracking-widest uppercase mt-4 animate-pulse">Toda La Banda</span>
             </div>
           ) : (
             <div className="flex justify-center items-center h-full"><span className="text-zinc-800 font-black text-[16px] md:text-[18px] lg:text-[min(6vw,6vh)]">KADOSH APP</span></div>
           )}
      </main>

      {nextSong && (
        <div className="relative z-10 bg-emerald-950/80 border-t border-emerald-900/50 px-3 py-1.5 lg:px-8 lg:py-3 shrink-0 flex justify-between items-center shadow-inner">
           <span className="text-emerald-400 font-bold uppercase tracking-widest text-[10px] lg:text-sm">Siguiente:</span>
           <span className="text-sm sm:text-xl lg:text-2xl font-black text-emerald-100 truncate pl-2">{nextSong}</span>
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
export default StageDisplayMusicos;

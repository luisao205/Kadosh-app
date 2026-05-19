import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';

const Proyector = () => {
  const { eventoId } = useParams();
  const [slide, setSlide] = useState(null);
  const [apagar, setApagar] = useState(false);
  const [fondoUrl, setFondoUrl] = useState(null);
  const [transicion, setTransicion] = useState('fade');
  const [modoTransmision, setModoTransmision] = useState(false);
  const [showLogo, setShowLogo] = useState(false);
  const [ticker, setTicker] = useState(null);

  // Nuevos estados para la transición secuencial (Desvanecer viejo -> Aparecer nuevo)
  const [displaySlide, setDisplaySlide] = useState(null);
  const [fadeState, setFadeState] = useState('in'); // 'in' | 'out'

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'eventos', eventoId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.proyectorSlide) {
          setSlide(data.proyectorSlide);
          setFondoUrl(data.proyectorFondo || null);
          setApagar(data.proyectorApagado || false);
          setTransicion(data.proyectorTransicion || 'fade');
          setModoTransmision(data.proyectorModoTransmision || false);
          setShowLogo(data.proyectorLogo || false);
          setTicker(data.proyectorTicker || null);
        } else {
          setSlide(null);
        }
      }
    });
    return () => unsub();
  }, [eventoId]);

  // Efecto maestro para controlar la salida y entrada de la letra de forma sincronizada
  useEffect(() => {
    if (!slide) {
      setDisplaySlide(null);
      return;
    }

    if (!displaySlide || transicion === 'none') {
      setDisplaySlide(slide);
      setFadeState('in');
      return;
    }

    if (slide.texto !== displaySlide.texto) {
      // 1. Iniciar desvanecimiento de la letra vieja
      setFadeState('out');
      
      // 2. Esperar a que se desvanezca por completo (500ms)
      const timeout = setTimeout(() => {
        // 3. Cambiar la letra silenciosamente mientras está invisible y volver a aparecer (Fade In)
        setDisplaySlide(slide);
        setFadeState('in');
      }, transicion === 'fade' ? 500 : 300);

      return () => clearTimeout(timeout);
    }
  }, [slide, transicion, displaySlide]);

  if (apagar || !displaySlide) {
    return <div className="fixed inset-0 bg-black animate-in fade-in duration-700"></div>;
  }

  // Clases dinámicas basadas en el estado de transición (fadeState)
  let animationClass = '';
  if (transicion !== 'none') {
    const baseTransition = transicion === 'fade' 
      ? 'transition-all duration-[500ms] ease-in-out' 
      : 'transition-all duration-[300ms] ease-in-out';
      
    if (fadeState === 'out') {
      if (transicion === 'slide') animationClass = `${baseTransition} opacity-0 translate-y-8`;
      else if (transicion === 'zoom') animationClass = `${baseTransition} opacity-0 scale-95`;
      else animationClass = `${baseTransition} opacity-0`;
    } else {
      if (transicion === 'slide') animationClass = `${baseTransition} opacity-100 translate-y-0`;
      else if (transicion === 'zoom') animationClass = `${baseTransition} opacity-100 scale-100`;
      else animationClass = `${baseTransition} opacity-100`;
    }
  }

  return (
    <div className={`fixed inset-0 text-white flex flex-col font-sans selection:bg-transparent overflow-hidden transition-colors duration-500 ${modoTransmision ? 'bg-[#00FF00] justify-end items-start pb-12 md:pb-20' : 'bg-black items-center justify-center p-8 md:p-16'}`}>
      
      {/* Capa de Fondo (Imagen o VideoLoop) */}
      {!modoTransmision && fondoUrl && (
        <div className="absolute inset-0 z-0 pointer-events-none">
          {fondoUrl.match(/\.(mp4|webm|mov)$/i) || fondoUrl.includes('video/upload') ? (
            <video src={fondoUrl} autoPlay loop muted playsInline className="w-full h-full object-cover opacity-80" />
          ) : (
            <img src={fondoUrl} alt="Fondo" className="w-full h-full object-cover opacity-80" />
          )}
        </div>
      )}

      {/* Capa de Texto */}
      {showLogo ? (
        <div className="relative z-20 flex flex-col items-center justify-center h-full animate-in zoom-in duration-500">
          <img src="/KADOSH_APP.jpg" alt="Logo Kadosh" className="w-48 h-48 md:w-64 md:h-64 lg:w-80 lg:h-80 rounded-full shadow-[0_0_80px_rgba(255,255,255,0.2)] object-cover ring-8 ring-white/10" />
          <h1 className="mt-8 text-5xl md:text-7xl font-black tracking-tighter text-white drop-shadow-2xl">KADOSH</h1>
        </div>
      ) : (
        <div className={`relative z-10 w-full max-w-screen-2xl flex flex-col ${modoTransmision ? 'justify-end items-start pl-8 md:pl-16' : 'justify-center items-center h-full mx-auto text-center'}`}>
          <div 
            // Eliminamos la prop 'key' para que React no destruya el elemento, sino que aplique las clases de transición de CSS puro
            className={`font-black tracking-tight whitespace-pre-wrap break-words ${animationClass} ${modoTransmision ? 'bg-black/80 border-l-[12px] border-violet-600 py-4 md:py-6 pr-8 pl-6 md:pl-8 rounded-r-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] inline-block text-left text-[min(6vw,6vh)] sm:text-[min(5vw,5vh)] md:text-[min(4vw,4vh)] leading-[1.2] max-w-[90vw] lg:max-w-5xl' : 'w-full max-w-[95vw] lg:max-w-7xl px-4 md:px-8 drop-shadow-[0_0_40px_rgba(0,0,0,0.9)] text-[min(8vw,7vh)] sm:text-[min(7vw,7vh)] md:text-[min(5.5vw,7vh)] xl:text-[min(4.5vw,6.5vh)] leading-[1.25] md:leading-[1.2]'}`}
          >
            {displaySlide.texto}
          </div>
        </div>
      )}

      {/* 💡 Marquesina Pública (Ticker) */}
      {ticker && (
        <div className="absolute bottom-0 left-0 w-full bg-red-600/95 text-white py-3 md:py-4 z-50 overflow-hidden shadow-[0_-10px_30px_rgba(0,0,0,0.5)] border-t-4 border-red-500 flex items-center">
          <style>{`
            @keyframes marquee {
              0% { transform: translateX(100vw); }
              100% { transform: translateX(-100%); }
            }
            .animate-marquee {
              display: inline-block;
              white-space: nowrap;
              animation: marquee 25s linear infinite;
            }
          `}</style>
          <p className="animate-marquee text-2xl md:text-4xl font-black uppercase tracking-widest drop-shadow-md">
            {ticker}
          </p>
        </div>
      )}
    </div>
  );
};
export default Proyector;
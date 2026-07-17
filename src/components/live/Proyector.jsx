import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Minimize, RefreshCw } from 'lucide-react';
import AutoFitText from './AutoFitText';
import { isVideoMediaUrl } from '../../utils/mediaUtils';

const Proyector = ({ eventoIdOverride }) => {
  const { eventoId: routeEventoId } = useParams();
  const eventoId = eventoIdOverride || routeEventoId;
  const [slide, setSlide] = useState(null);
  const [apagar, setApagar] = useState(false);
  const [fondoUrl, setFondoUrl] = useState(null);
  const [prevFondoUrl, setPrevFondoUrl] = useState(null); // To hold the URL of the background fading out
  const [fondoTransitioning, setFondoTransitioning] = useState(false); // To trigger CSS transition
  const [transicion, setTransicion] = useState('fade'); // This is for slide transitions, not background
  const [modoTransmision, setModoTransmision] = useState(false);
  const [showLogo, setShowLogo] = useState(false);
  const [ticker, setTicker] = useState(null);
  const [media, setMedia] = useState(null); // { url, type, playing, volume, mode }
  const [countdown, setCountdown] = useState(null); // { endTimestamp, active }
  const [showControls, setShowControls] = useState(false);
  const controlsTimerRef = useRef(null);
  const videoRef = useRef(null);
  const lastFondoRef = useRef(null); // 🔄 Ref para comparar fondos sin cierres obsoletos
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Nuevos estados para la transición secuencial (Desvanecer viejo -> Aparecer nuevo)
  const [displaySlide, setDisplaySlide] = useState(null);
  const [fadeState, setFadeState] = useState('in'); // 'in' | 'out'

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'eventos', eventoId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        
        // Manejo de la transición de fondo usando el Ref
        if (data.proyectorFondo !== lastFondoRef.current) {
          setPrevFondoUrl(lastFondoRef.current); // Guarda el fondo actual como previo
          setFondoUrl(data.proyectorFondo || null); // Establece el nuevo fondo
          lastFondoRef.current = data.proyectorFondo || null;
          setFondoTransitioning(true); // Inicia la transición
          setTimeout(() => {
            setFondoTransitioning(false);
            setPrevFondoUrl(null); // Limpiar fondo previo tras la transición
          }, 500);
        } else if (data.proyectorFondo === null && lastFondoRef.current !== null) {
          // If Firestore says null but local state isn't, force clear
          setFondoUrl(null);
          lastFondoRef.current = null;
          setPrevFondoUrl(null);
          setFondoTransitioning(false);
        }

        setSlide(data.proyectorSlide || null);
        setMedia(data.proyectorMedia || null);
        setApagar(data.proyectorApagado || false);
        setTransicion(data.proyectorTransicion || 'fade');
        setModoTransmision(data.proyectorModoTransmision || false);
        setShowLogo(data.proyectorLogo || false);
        setTicker(data.proyectorTicker || null);
        setCountdown(data.proyectorCountdown || null);
      }
    });
    return () => unsub();
  }, [eventoId]);

  // Sincronización de Play/Pause y Comandos de Navegación
  useEffect(() => {
    if (!videoRef.current || !media || media.type !== 'video') return;

    // Aplicar volumen directamente desde el controlador
    // Only update volume if it's different to avoid unnecessary DOM manipulation
    // and potential issues with browser's internal volume state.
    if (videoRef.current.volume !== (media.volume ?? 1)) {
      videoRef.current.volume = media.volume ?? 1;
    }
    videoRef.current.muted = media.volume === 0; // Mute si el volumen es 0

    // Manejo de Play/Pause
    if (media.playing) videoRef.current.play().catch(e => console.warn(e));
    else videoRef.current.pause();

    // Manejo de comandos de búsqueda (Seek)
    // Only seek if the media is playing or if it's a specific seek command (not just play/pause)
    // This prevents seeking to 0 when media is paused and then played again.
    if (media.seekRequest && (media.playing || media.seekRequest.type !== 'play')) {
      const { type, time } = media.seekRequest;
      // Solo procesamos si es una petición con un timestamp nuevo para evitar bucles
      if (videoRef.current._lastSeekTime !== time) {
        videoRef.current._lastSeekTime = time;
        if (type === 'start') videoRef.current.currentTime = 0;
        if (type === 'back10') videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
        if (type === 'fwd10') videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 10);
      }
    }

    // Handle autoplay promise to detect if it was blocked
    const playPromise = videoRef.current.play();
    if (playPromise !== undefined) {
      playPromise.then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
    }
  }, [media]); // Dependencia en 'media' completo para reaccionar a todos los cambios

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
      
      // 2. Esperar a que se desvanezca por completo (250ms para más rapidez)
      const timeout = setTimeout(() => {
        // 3. Cambiar la letra silenciosamente mientras está invisible y volver a aparecer (Fade In)
        setDisplaySlide(slide);
        setFadeState('in');
      }, transicion === 'fade' ? 250 : 150);

      return () => clearTimeout(timeout);
    }
  }, [slide, transicion, displaySlide]);

  // Lógica de cuenta regresiva (Countdown)
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    if (!countdown?.active || !countdown?.endTimestamp) {
      setTimeLeft("");
      return;
    }
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = countdown.endTimestamp - now;
      if (diff <= 0) {
        setTimeLeft("00:00");
        clearInterval(interval);
      } else {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  // Lógica para activar pantalla completa automáticamente al interactuar
  useEffect(() => {
    const activarPantallaCompleta = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((e) => {
          console.warn("Pantalla completa bloqueada por el navegador hasta que interactúes.");
        });
      }
    };

    // Escuchamos el primer clic en la ventana para maximizar "solo"
    window.addEventListener('click', activarPantallaCompleta);
    return () => window.removeEventListener('click', activarPantallaCompleta);
  }, []);

  // Lógica para mostrar botones al mover el mouse
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 2000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  const salirPantallaCompleta = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((e) => console.error(e));
    }
  };

  const refrescarPagina = () => {
    window.location.reload();
  };

  // Permitir renderizar si hay video principal, aunque no haya letras
  if (apagar) return <div className="fixed inset-0 bg-black animate-in fade-in duration-700"></div>;

  // Si no hay absolutamente nada (ni fondo), mostrar standby. Si hay fondo, dejar que siga al render principal.
    // Solo mostramos Standby si REALMENTE no hay nada activo (ni fondo, ni reloj, ni media, ni letras)
  if (!displaySlide && !media?.url && !showLogo && !countdown?.active && !fondoUrl) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-zinc-900 font-black text-8xl tracking-tighter select-none opacity-20 text-center px-4">
          <span>KADOSH STANDBY</span>
        </div>
      </div>
    );
  }

  // Clases dinámicas basadas en el estado de transición (fadeState)
  let animationClass = '';
  if (transicion !== 'none') {
    const baseTransition = transicion === 'fade' 
      ? 'transition-all duration-[250ms] ease-in-out' 
      : 'transition-all duration-[150ms] ease-in-out';
      
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
    <div className={`fixed inset-0 text-white flex flex-col font-sans selection:bg-transparent overflow-hidden transition-colors duration-500 ${modoTransmision ? 'bg-[#00FF00] justify-end items-start pb-12 md:pb-20' : 'bg-black items-center justify-center p-8 md:p-16'} ${!showControls ? 'cursor-none' : ''}`}>
      
      {/* Botones de Control (Ocultos por defecto, aparecen al mover el mouse) */}
      <div className={`fixed top-4 right-4 z-[100] flex gap-2 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button 
          onClick={refrescarPagina}
          className="p-3 bg-zinc-900/80 hover:bg-zinc-800 text-white rounded-full shadow-xl border border-white/10 transition-all active:scale-95 flex items-center justify-center"
          title="Refrescar Proyector"
        >
          <RefreshCw size={20} />
        </button>
        <button 
          onClick={salirPantallaCompleta}
          className="p-3 bg-zinc-900/80 hover:bg-zinc-800 text-white rounded-full shadow-xl border border-white/10 transition-all active:scale-95 flex items-center justify-center"
          title="Salir de Pantalla Completa"
        >
          <Minimize size={20} />
        </button>
      </div>

      {/* Capa de Fondo (Imagen o VideoLoop) */}
      {!modoTransmision && (
        <div className="absolute inset-0 z-0 pointer-events-none bg-black">
          {/* Fondo Antiguo (Capa Superior desvaneciéndose) */}
          {prevFondoUrl && (
            <div className={`absolute inset-0 z-10 transition-opacity duration-500 ${fondoTransitioning ? 'opacity-0' : 'opacity-0 pointer-events-none'}`}>
              {isVideoMediaUrl(prevFondoUrl) 
                ? <video src={prevFondoUrl} autoPlay loop muted playsInline className="w-full h-full object-cover opacity-80" />
                : <img src={prevFondoUrl} alt="" className="w-full h-full object-cover opacity-80" />
              }
            </div>
          )}
          {/* Fondo Nuevo (Capa Base siempre visible) */}
          {fondoUrl && (
            <div className="absolute inset-0 z-0">
              {isVideoMediaUrl(fondoUrl) 
                ? <video src={fondoUrl} key={fondoUrl} autoPlay loop muted playsInline className="w-full h-full object-cover opacity-80" />
                : <img src={fondoUrl} key={fondoUrl} alt="" className="w-full h-full object-cover opacity-80" />
              }
            </div>
          )}
        </div>
      )}

      {/* 🎬 Capa de Video Principal (Foreground) - Tapa todo lo demás */}
      {media?.url && media.mode === 'foreground' && (
        <div key={media.url} className="absolute inset-0 z-40 bg-black animate-in fade-in duration-500 overflow-hidden block">
          {media.type === 'video' || media.url.includes('video/upload') ? (
            <video 
              ref={videoRef}
              src={media.url} 
              key={media.url}
              className="w-full h-full object-contain"
              playsInline 
              autoPlay
              muted={false}
              onPlay={() => setAutoplayBlocked(false)}
              onError={() => setAutoplayBlocked(false)} // Clear block message if error occurs
            />
          ) : <img src={media.url} className="w-full h-full object-contain" />}

          {autoplayBlocked && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white text-xl font-bold z-50">
              <p>Haz clic para reproducir el video</p>
            </div>
          )}
        </div>
      )}

      {/* ⏲️ Capa de Cuenta Regresiva (z-[100]) */}
      {timeLeft && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center animate-in zoom-in duration-500 pointer-events-none">
          {/* Fondo sutil para legibilidad */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"></div>
          <p className="text-zinc-400 font-black uppercase tracking-[0.3em] text-xl mb-4 drop-shadow-lg">Comenzamos en</p>
          <div className="text-[15vw] font-black font-mono leading-none tracking-tighter drop-shadow-[0_10px_50px_rgba(0,0,0,0.5)] relative z-10">
            <span>{timeLeft}</span>
          </div>
        </div>
      )}

      {/* Capa de Texto */}
      {showLogo ? (
        <div className="relative z-20 flex flex-col items-center justify-center h-full animate-in zoom-in duration-500">
          <img src="/KADOSH_APP.jpg" alt="Logo Kadosh" className="w-48 h-48 md:w-64 md:h-64 lg:w-80 lg:h-80 rounded-full shadow-[0_0_80px_rgba(255,255,255,0.2)] object-cover ring-8 ring-white/10" />
          <h1 className="mt-8 text-5xl md:text-7xl font-black tracking-tighter text-white drop-shadow-2xl">KADOSH</h1>
        </div>
      ) : displaySlide ? (
        <div className={`relative z-10 w-full max-w-none flex flex-col ${modoTransmision ? 'justify-end items-start pl-8 md:pl-16' : 'justify-center items-center h-full mx-auto text-center'}`}>
          <div 
            // Eliminamos la prop 'key' para que React no destruya el elemento, sino que aplique las clases de transición de CSS puro
            className={`font-black tracking-tight whitespace-pre-wrap break-words text-outline ${animationClass} ${modoTransmision ? 'bg-black/80 border-l-[12px] border-violet-600 py-4 md:py-6 pr-8 pl-6 md:pl-8 rounded-r-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] inline-block text-left text-[min(6vw,6vh)] sm:text-[min(5vw,5vh)] md:text-[min(4vw,4vh)] leading-[1.2] max-w-[90vw] lg:max-w-5xl' : 'w-full h-full flex items-center justify-center overflow-hidden drop-shadow-[0_0_60px_rgba(0,0,0,1)]'}`}
          >
            {modoTransmision ? (
              <span translate="no">{displaySlide.texto}</span>
            ) : (
              <AutoFitText
                text={displaySlide.texto}
                minFontSize={36}
                maxFontSize={240}
                safeMaxWidth="90vw"
                safeMaxHeight="78vh"
                variant="projector"
                className="font-black tracking-tight text-outline"
              />
            )}
          </div>
        </div>
      ) : null}

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
            .text-outline {
              -webkit-text-stroke: 2px black;
              paint-order: stroke fill;
            }
          `}</style>
          <p className="animate-marquee text-2xl md:text-4xl font-black uppercase tracking-widest drop-shadow-md">
            <span>{ticker}</span>
          </p>
        </div>
      )}
    </div>
  );
};
export default Proyector;

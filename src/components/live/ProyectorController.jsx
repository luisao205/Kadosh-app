import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { parsearCancion } from '../../utils/songParser';
import { Monitor, Play, PowerOff, X, ArrowLeft, Layers, Type, Eye, Image as ImageIcon, Upload, Loader2, Eraser, AlertCircle, Send, Tv, Star, Megaphone } from 'lucide-react';
import { traducirAcorde } from '../../utils/musicCore';

const ProyectorController = ({ user }) => {
  const { eventoId } = useParams();
  const navigate = useNavigate();
  const formatoAcordes = user?.preferencias?.formatoAcordes || 'american';
  
  const handleOpenScreen = (path) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) navigate(path);
    else window.open(path, '_blank');
  };
  
  const [evento, setEvento] = useState(null);
  const [canciones, setCanciones] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeSongId, setActiveSongId] = useState(null);
  const [previewSlide, setPreviewSlide] = useState(null); // { texto, titulo }
  const [liveSlide, setLiveSlide] = useState(null);
  const [isBlackout, setIsBlackout] = useState(false);
  const [modoTransmision, setModoTransmision] = useState(false);
  const [isLogoActive, setIsLogoActive] = useState(false);
  
  const [showFondosModal, setShowFondosModal] = useState(false);
  const [isUploadingFondo, setIsUploadingFondo] = useState(false);
  const [fondoActivo, setFondoActivo] = useState(null);
  const [transicionActiva, setTransicionActiva] = useState('fade');
  const [guardarEnCancion, setGuardarEnCancion] = useState(true);

  const [displayLiveSlide, setDisplayLiveSlide] = useState(null);
  const [fadeState, setFadeState] = useState('in');
  const [alertaTarima, setAlertaTarima] = useState('');
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [tickerMsg, setTickerMsg] = useState('');
  const [isSendingTicker, setIsSendingTicker] = useState(false);

  useEffect(() => {
    let unsubEvento;
    const fetchEvent = async () => {
      try {
        const eventoSnap = await getDoc(doc(db, 'eventos', eventoId));
        if (eventoSnap.exists()) {
          const evData = eventoSnap.data();
          
          // Cargar canciones
          const songIds = evData.setlist ? evData.setlist.filter(i => i.type === 'song').map(i => i.value) : (evData.canciones || []);
          const uniqueIds = [...new Set(songIds)];
          if (uniqueIds.length > 0) {
            const snaps = await Promise.all(uniqueIds.map(id => getDoc(doc(db, 'canciones', id))));
            setCanciones(snaps.map(s => ({ id: s.id, ...s.data() })));
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchEvent();

    unsubEvento = onSnapshot(doc(db, 'eventos', eventoId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setEvento(data);
        if (data.proyectorSlide) setLiveSlide(data.proyectorSlide);
        if (data.proyectorApagado !== undefined) setIsBlackout(data.proyectorApagado);
        if (data.proyectorFondo !== undefined) setFondoActivo(data.proyectorFondo);
        if (data.proyectorTransicion !== undefined) setTransicionActiva(data.proyectorTransicion);
        if (data.proyectorModoTransmision !== undefined) setModoTransmision(data.proyectorModoTransmision);
        if (data.proyectorLogo !== undefined) setIsLogoActive(data.proyectorLogo);
      }
    });

    return () => { if(unsubEvento) unsubEvento(); }
  }, [eventoId]);

  // Sincronizar la animación del proyector en la vista del controlador
  useEffect(() => {
    if (!liveSlide) {
      setDisplayLiveSlide(null);
      return;
    }
    if (!displayLiveSlide || transicionActiva === 'none') {
      setDisplayLiveSlide(liveSlide);
      setFadeState('in');
      return;
    }
    if (liveSlide.texto !== displayLiveSlide.texto) {
      setFadeState('out');
      const timeout = setTimeout(() => {
        setDisplayLiveSlide(liveSlide);
        setFadeState('in');
      }, transicionActiva === 'fade' ? 500 : 300);

      return () => clearTimeout(timeout);
    }
  }, [liveSlide, transicionActiva, displayLiveSlide]);

  const activeSong = canciones.find(c => c.id === activeSongId);
  const secciones = activeSong ? parsearCancion(activeSong.letraRaw) : [];

  // Convertir las secciones en Diapositivas (Slides)
  const slides = [];
  secciones.forEach(sec => {
    let texto = sec.lineas.map(linea => 
      linea.map(palabra => palabra.map(silaba => silaba.texto === '\u00A0' ? '' : silaba.texto).join('')).join(' ')
    ).join('\n');
    slides.push({ titulo: sec.titulo, texto: texto.trim() || ' ', lineas: sec.lineas, originalIndex: slides.length });
  });

  const handleProyectar = async (slide = previewSlide) => {
    if (!slide) return;
    
    let nextSlide = null;
    if (slide.originalIndex !== undefined && slide.originalIndex < slides.length - 1) {
      nextSlide = slides[slide.originalIndex + 1];
    }

    // Encontrar el siguiente elemento del setlist (Canción o Nota)
    let offset = 0;
    let nextSongInfo = null;
    if (evento && activeSongId) {
      const setlistItems = evento.setlist || (evento.canciones || []).map(id => ({ type: 'song', value: id }));
      const activeIdx = setlistItems.findIndex(i => i.type === 'song' && i.value === activeSongId);
      if (activeIdx !== -1 && activeIdx < setlistItems.length - 1) {
        const nextElement = setlistItems[activeIdx + 1];
        if (nextElement.type === 'note') {
          nextSongInfo = `📌 ${nextElement.value}`;
        } else {
          const nextSongObj = canciones.find(c => c.id === nextElement.value);
          if (nextSongObj) {
            let tonoFinal = nextSongObj.tonoOriginal;
            const cantante = evento.cantantesPorCancion?.[nextSongObj.id];
            if (cantante && nextSongObj.tonosAlternativos) {
              const opciones = nextSongObj.tonosAlternativos.split(',');
              const match = opciones.find(o => o.trim().toLowerCase().startsWith(cantante.toLowerCase() + ':'));
              if (match) tonoFinal = match.split(':')[1].trim();
            }
            nextSongInfo = `🎵 ${nextSongObj.titulo} (${traducirAcorde(tonoFinal || 'C', formatoAcordes)})`;
          }
        }
      }

      // Calcular la transposición actual para la Pantalla de Músicos
      const cancionActiva = canciones.find(c => c.id === activeSongId);
      const cantanteActivo = evento.cantantesPorCancion?.[activeSongId];
      if (cancionActiva && cantanteActivo && cancionActiva.tonosAlternativos) {
        const opciones = cancionActiva.tonosAlternativos.split(',');
        const match = opciones.find(o => o.trim().toLowerCase().startsWith(cantanteActivo.toLowerCase() + ':'));
        if (match) {
          const tonoDestino = match.split(':')[1].trim();
          const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
          const oMatch = cancionActiva.tonoOriginal?.match(/^[A-G]#?/);
          const tMatch = tonoDestino.match(/^[A-G]#?/);
          if (oMatch && tMatch) {
            let diff = NOTAS.indexOf(tMatch[0]) - NOTAS.indexOf(oMatch[0]);
            if (diff > 6) diff -= 12;
            if (diff < -5) diff += 12;
            offset = diff;
          }
        }
      }
    }

    try {
      await updateDoc(doc(db, 'eventos', eventoId), {
        proyectorSlide: { titulo: slide.titulo, texto: slide.texto, lineas: slide.lineas ? JSON.stringify(slide.lineas) : null },
        proyectorNextSlide: nextSlide ? { titulo: nextSlide.titulo, texto: nextSlide.texto, lineas: nextSlide.lineas ? JSON.stringify(nextSlide.lineas) : null } : null,
        proyectorNextSong: nextSongInfo,
        proyectorOffset: offset,
        proyectorLogo: false, // Quitar logo al proyectar una nueva letra
        proyectorApagado: false
      });
    } catch (e) { console.error("Error al proyectar diapositiva:", e); }
  };

  const toggleBlackout = async () => {
    try {
      await updateDoc(doc(db, 'eventos', eventoId), {
        proyectorApagado: !isBlackout
      });
    } catch (e) { console.error(e); }
  };

  const toggleTransmision = async () => {
    try {
      await updateDoc(doc(db, 'eventos', eventoId), {
        proyectorModoTransmision: !modoTransmision
      });
    } catch (e) { console.error(e); }
  };

  const toggleLogo = async () => {
    try {
      await updateDoc(doc(db, 'eventos', eventoId), {
        proyectorLogo: !isLogoActive,
        proyectorApagado: false
      });
    } catch (e) { console.error(e); }
  };

  const handleUploadCloudinary = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsUploadingFondo(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "KADOSH");

    try {
      // auto/upload soporta tanto videos como imágenes en Cloudinary
      const res = await fetch("https://api.cloudinary.com/v1_1/dgi9l8blg/auto/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      
      if (data.secure_url) {
        await updateDoc(doc(db, 'eventos', eventoId), { proyectorFondo: data.secure_url });
        
        if (activeSongId && guardarEnCancion) {
          await updateDoc(doc(db, 'canciones', activeSongId), { fondoUrl: data.secure_url });
          setCanciones(prev => prev.map(c => c.id === activeSongId ? { ...c, fondoUrl: data.secure_url } : c));
        }
      }
    } catch (err) {
      console.error("Error subiendo a Cloudinary", err);
      alert("Hubo un error subiendo el fondo.");
    } finally {
      setIsUploadingFondo(false);
      setShowFondosModal(false);
    }
  };

  const quitarFondo = async () => {
    await updateDoc(doc(db, 'eventos', eventoId), { proyectorFondo: null });
    
    if (activeSongId && guardarEnCancion) {
      await updateDoc(doc(db, 'canciones', activeSongId), { fondoUrl: null });
      setCanciones(prev => prev.map(c => c.id === activeSongId ? { ...c, fondoUrl: null } : c));
    }
    setShowFondosModal(false);
  };

  // Lógica para enviar mensajes a tarima
  const enviarAlerta = async () => {
    if (!alertaTarima.trim()) return;
    setIsSendingAlert(true);
    try {
      await updateDoc(doc(db, 'eventos', eventoId), { proyectorAlerta: alertaTarima });
      setAlertaTarima('');
      // Auto-limpiar alerta a los 10 segundos
      setTimeout(async () => {
         await updateDoc(doc(db, 'eventos', eventoId), { proyectorAlerta: null });
      }, 10000);
    } catch (e) { console.error(e); } finally { setIsSendingAlert(false); }
  };
  const limpiarAlerta = async () => {
    await updateDoc(doc(db, 'eventos', eventoId), { proyectorAlerta: null });
  };

  // Lógica para enviar Marquesina (Ticker) Público
  const enviarTicker = async () => {
    if (!tickerMsg.trim()) return;
    setIsSendingTicker(true);
    try { await updateDoc(doc(db, 'eventos', eventoId), { proyectorTicker: tickerMsg }); setTickerMsg(''); } 
    catch (e) { console.error(e); } finally { setIsSendingTicker(false); }
  };
  const limpiarTicker = async () => {
    await updateDoc(doc(db, 'eventos', eventoId), { proyectorTicker: null });
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex justify-center items-center text-zinc-500 font-bold">Cargando Controlador...</div>;

  let animationClass = '';
  if (transicionActiva !== 'none') {
    const baseTransition = transicionActiva === 'fade' 
      ? 'transition-all duration-[500ms] ease-in-out' 
      : 'transition-all duration-[300ms] ease-in-out';
      
    if (fadeState === 'out') {
      if (transicionActiva === 'slide') animationClass = `${baseTransition} opacity-0 translate-y-4`;
      else if (transicionActiva === 'zoom') animationClass = `${baseTransition} opacity-0 scale-95`;
      else animationClass = `${baseTransition} opacity-0`;
    } else {
      if (transicionActiva === 'slide') animationClass = `${baseTransition} opacity-100 translate-y-0`;
      else if (transicionActiva === 'zoom') animationClass = `${baseTransition} opacity-100 scale-100`;
      else animationClass = `${baseTransition} opacity-100`;
    }
  }

  return (
    <div className="h-screen bg-zinc-950 flex flex-col text-white font-sans overflow-hidden">
      {/* Cabecera */}
      <header className="h-16 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-3 sm:px-6 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button onClick={() => navigate(`/setlist/${eventoId}`)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="hidden sm:block truncate">
            <h1 className="font-bold text-lg flex items-center gap-2"><Monitor size={18} className="text-violet-500"/> Controlador Multimedia</h1>
            <p className="text-xs text-zinc-400 font-medium truncate">{evento?.titulo}</p>
          </div>
          <div className="sm:hidden font-bold text-sm truncate flex-1">{evento?.titulo}</div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-2 bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-700">
            <span className="text-xs text-zinc-400 font-bold">Animación:</span>
            <select 
              value={transicionActiva} 
              onChange={async (e) => { setTransicionActiva(e.target.value); await updateDoc(doc(db, 'eventos', eventoId), { proyectorTransicion: e.target.value }); }}
              className="bg-transparent text-sm font-bold text-white outline-none cursor-pointer"
            >
              <option value="fade" className="bg-zinc-900">Suave (Fade)</option>
              <option value="slide" className="bg-zinc-900">Deslizar</option>
              <option value="zoom" className="bg-zinc-900">Zoom In</option>
              <option value="none" className="bg-zinc-900">Sin Animación</option>
            </select>
          </div>
          <button onClick={toggleTransmision} className={`hidden md:flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all border ${modoTransmision ? 'bg-emerald-600 text-white border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)] animate-pulse' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'}`}>
            <Tv size={16}/> <span className="hidden sm:inline">{modoTransmision ? 'Modo OBS' : 'Transmisión'}</span>
          </button>
          <button onClick={() => setShowFondosModal(true)} className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 rounded-lg font-bold text-xs sm:text-sm transition-colors border border-indigo-500/30">
            <ImageIcon size={16}/> <span className="hidden sm:inline">Fondo</span>
          </button>
          <button onClick={toggleBlackout} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all ${isBlackout ? 'bg-red-600 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.4)]' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
            <PowerOff size={16}/> <span className="hidden sm:inline">{isBlackout ? 'Apagado' : 'Apagar'}</span>
          </button>
        </div>
      </header>

      {/* VISTA PC: 3 Columnas (Se oculta en móviles) */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Columna Izquierda: Setlist */}
        <div className="w-1/4 min-w-[250px] bg-zinc-900/50 border-r border-zinc-800 flex flex-col">
          <div className="p-4 border-b border-zinc-800 bg-zinc-900">
            <h2 className="font-bold text-sm flex items-center gap-2"><Layers size={16} className="text-blue-500"/> Setlist del Evento</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 [&::-webkit-scrollbar]:hidden">
            {(() => {
              const setlistItems = evento?.setlist || (evento?.canciones || []).map(id => ({ type: 'song', value: id, idLocal: id }));
              return setlistItems.filter(i => i.type === 'song').map((item, idx) => {
                const c = canciones.find(c => c.id === item.value);
                if (!c) return null;
                return (
                  <button 
                    key={idx} 
                    onClick={async () => { 
                      setActiveSongId(c.id); 
                      setPreviewSlide(null); 
                      if (c.fondoUrl) {
                        try { await updateDoc(doc(db, 'eventos', eventoId), { proyectorFondo: c.fondoUrl }); } catch(e) { console.error(e); }
                      }
                    }}
                    className={`w-full text-left p-3 rounded-xl transition-all border ${activeSongId === c.id ? 'bg-violet-600/10 border-violet-500/50 text-white shadow-sm' : 'border-transparent hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200'}`}
                  >
                    <p className="font-bold text-sm truncate">{idx + 1}. {c.titulo}</p>
                    <p className="text-xs opacity-70 truncate">{c.artista}</p>
                  </button>
                );
              });
            })()}
          </div>
        </div>

        {/* Columna Central: Diapositivas */}
        <div className="flex-1 bg-zinc-950 flex flex-col border-r border-zinc-800">
          <div className="p-4 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center">
            <h2 className="font-bold text-sm flex items-center gap-2"><Type size={16} className="text-amber-500"/> Diapositivas {activeSong && <span className="text-zinc-500">- {activeSong.titulo}</span>}</h2>
          </div>
          <div className="flex-1 flex flex-col p-4 bg-zinc-950/50 overflow-hidden">
            {!activeSong ? (
              <div className="h-full flex items-center justify-center text-zinc-600 font-medium">Selecciona una canción del setlist</div>
            ) : (
              <>
              <div className="flex gap-2 mb-4 shrink-0">
                <button 
                  onClick={() => handleProyectar({ titulo: 'Instrumental', texto: ' ' })}
                  className="flex-1 py-3 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded-2xl flex items-center justify-center gap-2 font-bold text-zinc-300 transition-colors shadow-sm active:scale-95"
                >
                  <Eraser size={18} className="text-zinc-400"/> Limpiar Texto
                </button>
                <button 
                  onClick={toggleLogo}
                  className={`flex-1 py-3 rounded-2xl flex items-center justify-center gap-2 font-bold transition-colors shadow-sm active:scale-95 ${isLogoActive ? 'bg-amber-600 border border-amber-500 text-white animate-pulse shadow-[0_0_15px_rgba(217,119,6,0.4)]' : 'bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-300'}`}
                >
                  <Star size={18} className={isLogoActive ? "text-amber-100" : "text-amber-500"}/> {isLogoActive ? 'Quitar Logo' : 'Mostrar Logo'}
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden grid grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                {slides.map((s, idx) => (
                  <div 
                    key={idx}
                    onClick={() => setPreviewSlide(s)}
                    onDoubleClick={() => handleProyectar(s)}
                    className={`relative cursor-pointer border rounded-2xl overflow-hidden flex flex-col h-36 transition-all transform active:scale-95 ${previewSlide?.texto === s.texto ? 'border-violet-500 ring-2 ring-violet-500/30' : 'border-zinc-700 hover:border-zinc-500'} ${liveSlide?.texto === s.texto && !isBlackout ? 'bg-zinc-800 shadow-[0_0_15px_rgba(139,92,246,0.15)]' : 'bg-zinc-900'}`}
                  >
                    <div className="px-3 py-2 bg-zinc-950/80 border-b border-zinc-800 flex justify-between items-center shrink-0">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{s.titulo}</span>
                      {liveSlide?.texto === s.texto && !isBlackout && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]" title="En vivo"></span>}
                    </div>
                    <div className="p-3 flex-1 flex items-center justify-center text-center overflow-hidden">
                      <p className="text-xs sm:text-sm font-bold text-zinc-300 line-clamp-4 leading-relaxed">
                        {s.texto.trim() === '' ? <span className="text-zinc-600 italic">🎶 Instrumental</span> : s.texto}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}
          </div>
        </div>

        {/* Columna Derecha: Vista Previa y En Vivo */}
        <div className="w-1/3 min-w-[320px] bg-zinc-900/30 flex flex-col">
          
          {/* Pre-visualización */}
          <div className="flex-1 border-b border-zinc-800 flex flex-col">
            <div className="p-3 border-b border-zinc-800 bg-zinc-900/80">
              <h2 className="font-bold text-sm flex items-center gap-2 text-zinc-400"><Eye size={16}/> Pre-proyección</h2>
            </div>
            <div className="flex-1 p-5 flex flex-col">
              <div className="flex-1 bg-black rounded-2xl border border-zinc-700 shadow-inner flex items-center justify-center p-6 text-center overflow-hidden relative">
                {previewSlide ? (
                  <>
                    {fondoActivo && (fondoActivo.match(/\.(mp4|webm|mov)$/i) || fondoActivo.includes('video/upload')) ? (
                      <video src={fondoActivo} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" />
                    ) : fondoActivo && (
                      <img src={fondoActivo} className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" />
                    )}
                    <p className="relative z-10 text-lg sm:text-xl font-black text-white leading-snug whitespace-pre-wrap drop-shadow-lg">
                      {previewSlide.texto.trim() === '' ? <span className="text-white/30 italic font-medium">🎶 Instrumental</span> : previewSlide.texto}
                    </p>
                  </>
                ) : (
                  <p className="text-zinc-700 font-bold uppercase tracking-widest text-xs">Sin Selección</p>
                )}
              </div>
              <button 
                onClick={() => handleProyectar(previewSlide)} 
                disabled={!previewSlide}
                className="mt-4 py-3.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-violet-900/20"
              >
                <Monitor size={18} /> Proyectar Diapositiva
              </button>
            </div>
          </div>

          {/* En Vivo */}
          <div className="flex-1 flex flex-col">
            <div className="p-3 border-b border-zinc-800 bg-zinc-900/80 flex justify-between items-center">
              <h2 className="font-bold text-sm flex items-center gap-2 text-red-500"><Play size={16}/> En Vivo</h2>
              {isBlackout && <span className="text-[10px] bg-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Apagado</span>}
            </div>
            <div className="flex-1 p-5">
              <div className={`relative w-full h-full rounded-2xl border-2 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col p-6 overflow-hidden transition-colors ${isBlackout ? 'border-red-900/50 bg-black items-center justify-center' : modoTransmision ? 'border-emerald-500 bg-[#00FF00] items-start justify-end pb-8' : 'border-red-600 bg-black items-center justify-center text-center'}`}>
                {isBlackout ? (
                   <p className="relative z-10 text-red-900/50 font-black uppercase tracking-widest">Pantalla en Negro</p>
                ) : displayLiveSlide ? (
                  <>
                    {!modoTransmision && fondoActivo && (fondoActivo.match(/\.(mp4|webm|mov)$/i) || fondoActivo.includes('video/upload')) ? (
                      <video src={fondoActivo} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" />
                    ) : !modoTransmision && fondoActivo && (
                      <img src={fondoActivo} className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" />
                    )}
                    <p className={`relative z-10 font-black text-white whitespace-pre-wrap ${animationClass} ${modoTransmision ? 'text-sm sm:text-base text-left bg-black/80 border-l-[6px] border-violet-600 py-3 pr-4 pl-3 rounded-r-xl shadow-xl max-w-[90%]' : 'text-lg sm:text-xl leading-snug drop-shadow-lg'}`}>
                      {displayLiveSlide.texto.trim() === '' ? <span className="text-white/30 italic font-medium">🎶 Instrumental</span> : displayLiveSlide.texto}
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative z-10 w-12 h-12 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl flex items-center justify-center transform -rotate-6 opacity-50">
                      <Monitor className="text-white w-6 h-6 transform rotate-6" />
                    </div>
                    <p className="text-zinc-700 font-bold uppercase tracking-widest text-xs">Kadosh App</p>
                  </div>
                )}
              </div>
            </div>
          </div>
           {/* PANEL MEJORADO: Avisos a Tarima y Congregación */}
          <div className="border-t border-zinc-800 bg-zinc-900 p-4 shrink-0 flex flex-col gap-4 shadow-[0_-10px_20px_rgba(0,0,0,0.3)] z-10 relative overflow-y-auto max-h-[35vh]">
            {/* Retorno a Tarima */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                 <h2 className="font-bold text-xs flex items-center gap-1.5 text-amber-500 uppercase tracking-widest"><AlertCircle size={14}/> Retorno a Tarima</h2>
                 <div className="flex gap-2">
                   <button onClick={() => handleOpenScreen(`/retorno/${eventoId}`)} className="text-zinc-400 border border-zinc-700 hover:bg-zinc-800 text-[10px] px-2 py-1 rounded font-bold transition-colors">Cantantes</button>
                   <button onClick={() => handleOpenScreen(`/retorno-musicos/${eventoId}`)} className="text-emerald-400 border border-emerald-900/50 hover:bg-emerald-900/20 text-[10px] px-2 py-1 rounded font-bold transition-colors">Músicos</button>
                 </div>
              </div>
              <div className="flex gap-2">
                <input type="text" value={alertaTarima} onChange={e => setAlertaTarima(e.target.value)} placeholder="Solo músicos..." className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none text-white placeholder:text-zinc-600 transition-all" onKeyPress={e => e.key === 'Enter' && enviarAlerta()} />
                <button onClick={enviarAlerta} disabled={isSendingAlert || !alertaTarima.trim()} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg font-bold transition-all"><Send size={16}/></button>
              </div>
              {evento?.proyectorAlerta && (
                <div className="flex items-center justify-between bg-red-600/20 border border-red-500 p-2 rounded-lg">
                  <span className="text-[10px] text-red-100 font-bold truncate">Alerta: {evento.proyectorAlerta}</span>
                  <button onClick={limpiarAlerta} className="text-white hover:bg-red-500 text-[10px] font-bold uppercase bg-red-600 px-2 py-1 rounded transition-colors shrink-0">Ocultar</button>
                </div>
              )}
            </div>
            
            {/* Marquesina Pública */}
            <div className="flex flex-col gap-2 pt-3 border-t border-zinc-800">
              <h2 className="font-bold text-xs flex items-center gap-1.5 text-blue-400 uppercase tracking-widest"><Megaphone size={14}/> Anuncio Congregación</h2>
              <div className="flex gap-2">
                <input type="text" value={tickerMsg} onChange={e => setTickerMsg(e.target.value)} placeholder="Pasará por la pantalla..." className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none text-white placeholder:text-zinc-600 transition-all" onKeyPress={e => e.key === 'Enter' && enviarTicker()} />
                <button onClick={enviarTicker} disabled={isSendingTicker || !tickerMsg.trim()} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg font-bold transition-all"><Send size={16}/></button>
              </div>
              {evento?.proyectorTicker && (
                <div className="flex items-center justify-between bg-blue-600/20 border border-blue-500 p-2 rounded-lg">
                  <span className="text-[10px] text-blue-100 font-bold truncate">Pasando: {evento.proyectorTicker}</span>
                  <button onClick={limpiarTicker} className="text-white hover:bg-blue-500 text-[10px] font-bold uppercase bg-blue-600 px-2 py-1 rounded transition-colors shrink-0">Ocultar</button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* VISTA MÓVIL (App Remota de 1 Toque - Se oculta en PC) */}
      <div className="md:hidden flex-1 flex flex-col bg-zinc-950 overflow-hidden relative">
        {/* Barra de Setlist Horizontal */}
        <div className="bg-zinc-900 border-b border-zinc-800 p-3 overflow-x-auto whitespace-nowrap flex gap-2 shrink-0 [&::-webkit-scrollbar]:hidden">
          {(() => {
            const setlistItems = evento?.setlist || (evento?.canciones || []).map(id => ({ type: 'song', value: id, idLocal: id }));
            return setlistItems.filter(i => i.type === 'song').map((item, idx) => {
              const c = canciones.find(c => c.id === item.value);
              if (!c) return null;
              return (
                <button 
                  key={idx} 
                  onClick={async () => { 
                    setActiveSongId(c.id); 
                    if (c.fondoUrl) {
                      try { await updateDoc(doc(db, 'eventos', eventoId), { proyectorFondo: c.fondoUrl }); } catch(e) { console.error(e); }
                    }
                  }}
                  className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold transition-all border shadow-sm ${activeSongId === c.id ? 'bg-violet-600 text-white border-violet-500' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}
                >
                  {idx + 1}. {c.titulo}
                </button>
              );
            });
          })()}
        </div>

        {/* Grid de Diapositivas (1 solo toque proyecta) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
          {!activeSong ? (
            <div className="h-full flex items-center justify-center text-zinc-600 font-medium text-sm text-center px-4">Desliza la barra superior y selecciona una canción para proyectar</div>
          ) : (
            <>
              <button onClick={() => handleProyectar({ titulo: 'Instrumental', texto: ' ' })} className="w-full py-3.5 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded-xl flex items-center justify-center gap-2 font-bold text-zinc-300 transition-colors shadow-sm active:scale-95">
                <Eraser size={16} className="text-zinc-400"/> Limpiar Texto (Solo Fondo)
              </button>
              
              <div className="grid grid-cols-2 gap-3">
                {slides.map((s, idx) => (
                  <div 
                    key={idx}
                    onClick={() => handleProyectar(s)}
                    className={`relative cursor-pointer border rounded-2xl overflow-hidden flex flex-col h-32 transition-all transform active:scale-95 ${liveSlide?.texto === s.texto && !isBlackout ? 'border-violet-500 ring-2 ring-violet-500/50 bg-zinc-800 shadow-[0_0_15px_rgba(139,92,246,0.15)]' : 'border-zinc-800 bg-zinc-900'}`}
                  >
                    <div className="px-2 py-1.5 bg-zinc-950/80 border-b border-zinc-800 flex justify-between items-center shrink-0">
                      <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{s.titulo}</span>
                      {liveSlide?.texto === s.texto && !isBlackout && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]"></span>}
                    </div>
                    <div className="p-2 flex-1 flex items-center justify-center text-center overflow-hidden">
                      <p className="text-[10px] sm:text-xs font-bold text-zinc-300 line-clamp-4 leading-snug">
                        {s.texto.trim() === '' ? <span className="text-zinc-600 italic">🎶 Instrumental</span> : s.texto}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Barra Flotante Inferior de Estado (Móvil) */}
        <div className="absolute bottom-0 left-0 w-full bg-zinc-950 border-t border-zinc-800 p-4 flex items-center gap-3 z-20 pb-6 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
           <div className={`w-3 h-3 rounded-full shrink-0 ${isBlackout ? 'bg-zinc-600' : 'bg-red-500 animate-pulse'}`}></div>
           <div className="flex-1 truncate">
             <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">En Pantalla</p>
             <p className="text-xs font-bold text-white truncate">
               {isBlackout ? 'Pantalla en negro (Apagada)' : (liveSlide?.texto?.trim() ? liveSlide.texto.replace(/\n/g, ' - ') : '🎶 Instrumental (Solo fondo)')}
             </p>
           </div>
        </div>
      </div>

      {/* Modal para Subir/Seleccionar Fondos */}
      {showFondosModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-white flex items-center gap-2"><ImageIcon size={20} className="text-indigo-400"/> Imagen o Video de Fondo</h3>
              <button onClick={() => setShowFondosModal(false)} className="text-zinc-500 hover:text-white"><X size={20}/></button>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 text-center">
                <p className="text-xs text-zinc-400 mb-4">Sube un video MP4 (Motion Background) o una imagen JPG/PNG. Se almacenará de forma óptima en <b>Cloudinary</b>.</p>
                
                <label className={`w-full py-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${isUploadingFondo ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-indigo-500'}`}>
                  {isUploadingFondo ? <Loader2 size={24} className="text-indigo-500 animate-spin" /> : <Upload size={24} className="text-zinc-400" />}
                  <span className="text-sm font-bold text-zinc-300">{isUploadingFondo ? 'Subiendo archivo...' : 'Seleccionar Archivo'}</span>
                  <input type="file" accept="video/mp4, video/webm, image/jpeg, image/png" className="hidden" disabled={isUploadingFondo} onChange={handleUploadCloudinary} />
                </label>
              </div>

              {activeSongId && (
                <label className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-xl cursor-pointer border border-zinc-700/50 hover:bg-zinc-800 transition-colors">
                  <input type="checkbox" checked={guardarEnCancion} onChange={e => setGuardarEnCancion(e.target.checked)} className="w-5 h-5 rounded text-indigo-500 focus:ring-indigo-500 bg-zinc-900 border-zinc-700" />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white leading-none mb-1">Guardar en la canción</span>
                    <span className="text-[10px] text-zinc-400 leading-tight">Este fondo se pondrá automáticamente la próxima vez que toques "{activeSong?.titulo}".</span>
                  </div>
                </label>
              )}

              {fondoActivo && (
                <button onClick={quitarFondo} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl font-bold text-sm transition-colors border border-red-500/20">
                  Quitar Fondo (Pantalla Negra)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default ProyectorController;
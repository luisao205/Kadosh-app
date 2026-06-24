import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, onSnapshot, addDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../config/firebase';
import { Save, ArrowLeft, Edit3, AlertCircle, Play, Pause, Volume2, Volume1, VolumeX, X, Library, Video, Link as LinkIcon, FileText as FileIcon, Upload, Trash2, SlidersHorizontal, Headphones, Monitor } from 'lucide-react';
import { detectarTonoDesdeAcordes, traducirAcorde } from '../../utils/musicCore';

const ETIQUETAS_DISPONIBLES = ['Júbilo', 'Adoración', 'Acústico', 'Navidad', 'Ministración', 'Especial'];
const INSTRUMENTOS_RECURSOS = ['General', 'Voz Principal', 'Coros', 'Batería', 'Piano', 'Bajo', 'Guitarra Acústica', 'Guitarra Eléctrica', 'Percusión'];
const TONOS_DISPONIBLES = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
const CUE_PRESETS = ['Subida', 'Entra batería', 'Solo voces', 'Todos juntos', 'Corte', 'Baja dinámica', 'Repetir coro', 'Final suave'];

const normalizeKey = (value, fallback = 'C') => {
  const clean = String(value || '').trim();
  const match = TONOS_DISPONIBLES.find(t => t.toLowerCase() === clean.toLowerCase());
  return match || clean || fallback;
};

const EditSong = ({ user }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [titulo, setTitulo] = useState('');
  const [artista, setArtista] = useState('');
  const [bpm, setBpm] = useState('');
  const [tono, setTono] = useState('');
  const [etiquetas, setEtiquetas] = useState([]);
  const [recursos, setRecursos] = useState([]); // [{id, titulo, tipo: 'youtube'|'link'|'pdf', url, instrumento}]
  const [nuevoRecurso, setNuevoRecurso] = useState({ titulo: '', url: '', tipo: 'youtube', instrumento: 'General' });
  const [multitracks, setMultitracks] = useState([]); // [{id, nombre, url, fileName}]
  const [nombreStem, setNombreStem] = useState('Click');
  const [stemsNuevosCount, setStemsNuevosCount] = useState(0);
  const [customStemName, setCustomStemName] = useState(''); // Nuevo estado para nombre personalizado
  const [cantantesDisponibles, setCantantesDisponibles] = useState([]);
  const [tonosCantantes, setTonosCantantes] = useState({});
  const [letraRaw, setLetraRaw] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [fondoUrl, setFondoUrl] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [showSingerModal, setShowSingerModal] = useState(false);
  const [toast, setToast] = useState(null);

  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  const formatoAcordes = user?.preferencias?.formatoAcordes || 'american';
  const notacion = user?.preferencias?.notacion || 'sharps';
  const detectedKey = useMemo(() => detectarTonoDesdeAcordes(letraRaw), [letraRaw]);

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Cargar cantantes desde el equipo
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'usuarios'), (snap) => {
      const users = snap.docs.map(doc => doc.data());
      const singers = users.filter(u => u.instrumentos?.includes('Voz Principal') || u.instrumentos?.includes('Coros'));
      setCantantesDisponibles(singers.map(s => s.nombre));
    });
    return () => unsub();
  }, []);

  // Cargar los datos de la canción al abrir la pantalla
  useEffect(() => {
    const fetchSong = async () => {
      try {
        const docRef = doc(db, 'canciones', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTitulo(data.titulo || '');
          setArtista(data.artista || '');
          setBpm(data.bpm || '');
          setTono(data.tonoOriginal || '');
          setEtiquetas(data.etiquetas || []);
          setMultitracks(data.multitracks || []);
          setRecursos(data.recursos || []);
          setLetraRaw(data.letraRaw || '');
          setAudioUrl(data.audioUrl || '');
          setYoutubeUrl(data.youtubeUrl || '');
          setFondoUrl(data.fondoUrl || '');

          if (data.tonosAlternativos) {
            const parsed = {};
            data.tonosAlternativos.split(',').forEach(item => {
              const [name, key] = item.split(':');
              if (name) parsed[name.trim()] = (key || '').trim();
            });
            setTonosCantantes(parsed);
          }
        } else {
          showToast("La canción no existe");
          setTimeout(() => navigate('/canciones'), 1500);
        }
      } catch (error) {
        console.error("Error al cargar la canción:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSong();
  }, [id, navigate]);

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };
  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };
  const handleSeek = (e) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };
  const formatTime = (time) => {
    if (!time || isNaN(time)) return "00:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) audioRef.current.volume = newVolume;
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
      if (audioRef.current) audioRef.current.muted = false;
    }
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    if (audioRef.current) audioRef.current.muted = newMutedState;
  };

  const insertarEtiqueta = (etiqueta) => {
    setLetraRaw(prev => prev + (prev ? '\n\n' : '') + `# ${etiqueta}\n`);
  };

  const insertarIndicacion = (indicacion = 'Escribir indicación') => {
    setLetraRaw(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + `{cue: ${indicacion}}\n`);
  };

  const handleAddRecurso = () => {
    if (!nuevoRecurso.titulo || !nuevoRecurso.url) {
      showToast("Título y URL son obligatorios para el recurso.");
      return;
    }
    setRecursos([...recursos, { ...nuevoRecurso, id: Date.now().toString() }]);
    setNuevoRecurso({ titulo: '', url: '', tipo: 'youtube', instrumento: 'General' });
    
    // Notificación por Instrumento
    addDoc(collection(db, 'notificaciones'), {
      titulo: `Recurso de ${nuevoRecurso.instrumento || 'General'}`,
      mensaje: `Se añadió un nuevo recurso en la canción "${titulo}".`,
      destinatarios: nuevoRecurso.instrumento === 'General' ? ['all'] : [nuevoRecurso.instrumento],
      emisorId: user?.uid,
      fechaCreacion: new Date().toISOString()
    }).catch(e => console.error(e));
  };

  const removeRecurso = (id) => {
    setRecursos(recursos.filter(r => r.id !== id));
  };

  const handleUploadPDF = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast("Subiendo PDF...", "info");
    setIsSaving(true);
    try {
      const storage = getStorage();
      const pdfRef = ref(storage, `partituras/${Date.now()}_${file.name}`);
      await uploadBytes(pdfRef, file);
      const url = await getDownloadURL(pdfRef);
      setRecursos([...recursos, { id: Date.now().toString(), tipo: 'pdf', url, titulo: file.name, instrumento: 'General' }]);
      showToast("¡PDF adjuntado exitosamente!", "success");
      addDoc(collection(db, 'notificaciones'), {
        titulo: `Partitura PDF Añadida`,
        mensaje: `Se subió un PDF para la canción "${titulo}".`,
        destinatarios: ['all'],
        emisorId: user?.uid,
        fechaCreacion: new Date().toISOString()
      }).catch(e => console.error(e));
    } catch (err) {
      showToast("Error al subir el PDF.");
    } finally {
      setIsSaving(false);
    }
  };

  // Subir Pista Individual (Stem)
  const handleUploadStem = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Determinar el nombre final de la pista
    const finalStemName = nombreStem === 'Otro' ? customStemName.trim() : nombreStem;
    if (!finalStemName || finalStemName === 'Otro') { 
      showToast("Por favor, ingresa un nombre para la pista.", "error");
      return;
    }
    showToast(`Subiendo pista: ${finalStemName}...`, "info");
    setIsSaving(true);
    try {
      const storage = getStorage();
      const stemRef = ref(storage, `multitracks/${Date.now()}_${file.name}`);
      await uploadBytes(stemRef, file); // Sube el archivo
      const url = await getDownloadURL(stemRef); // Obtiene la URL
      setMultitracks([...multitracks, { id: Date.now().toString(), nombre: finalStemName, url, fileName: file.name }]);
      setStemsNuevosCount(prev => prev + 1);
      showToast(`¡Pista de ${finalStemName} subida!`, "success");
      setCustomStemName(''); // Limpiar el nombre personalizado después de subir
      setNombreStem('Click'); // Restablecer a la opción predeterminada
    } catch (err) {
      showToast("Error al subir la pista.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeStem = (id) => {
    setMultitracks(multitracks.filter(m => m.id !== id));
  };

  const handleUploadFondo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast("Subiendo fondo de proyección...", "info");
    setIsSaving(true);
    try {
      const storage = getStorage();
      const fondoRef = ref(storage, `fondos/${Date.now()}_${file.name}`);
      await uploadBytes(fondoRef, file);
      const url = await getDownloadURL(fondoRef);
      setFondoUrl(url);
      showToast("¡Fondo de proyector subido exitosamente!", "success");
    } catch (err) {
      showToast("Error al subir el fondo.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!titulo || !letraRaw) {
      showToast("El título y la letra son obligatorios.");
      return;
    }

    setIsSaving(true);
    try {
      let newAudioUrl = audioUrl;
      
      if (audioFile) {
        showToast("Subiendo nueva pista...", "info");
        const storage = getStorage();
        const audioRef = ref(storage, `pistas/${Date.now()}_${audioFile.name}`);
        await uploadBytes(audioRef, audioFile);
        newAudioUrl = await getDownloadURL(audioRef);
      }

      const tonoNormalizado = normalizeKey(tono);
      const tonosAlternativosStr = Object.entries(tonosCantantes)
        .map(([name, key]) => `${name}: ${normalizeKey(key, tonoNormalizado)}`)
        .join(', ');

      const docRef = doc(db, 'canciones', id);
      await updateDoc(docRef, {
        titulo,
        artista,
        tonoOriginal: tonoNormalizado,
        etiquetas,
        multitracks,
        recursos,
        tonosAlternativos: tonosAlternativosStr,
        bpm: Number(bpm) || 0,
        letraRaw,
        audioUrl: newAudioUrl,
        youtubeUrl,
        fondoUrl,
        fechaActualizacion: new Date().toISOString()
      });

      if (stemsNuevosCount > 0) {
        await addDoc(collection(db, 'notificaciones'), {
          titulo: `🎶 Pistas Actualizadas: ${titulo}`,
          mensaje: `Se han añadido ${stemsNuevosCount} pistas/secuencias nuevas a esta canción.`,
          destinatarios: ['all'],
          emisorId: user?.uid,
          fechaCreacion: new Date().toISOString()
        });
      }

      showToast("¡Canción actualizada exitosamente!", "success");
      setTimeout(() => navigate('/canciones'), 1500); // Volver al repertorio tras leer el mensaje
    } catch (error) {
      console.error("Error al actualizar en Firebase:", error);
      showToast("Error al actualizar la canción.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSingerTone = (cantante) => {
    setTonosCantantes(prev => {
      const next = { ...prev };
      if (next[cantante] !== undefined) delete next[cantante];
      else next[cantante] = '';
      return next;
    });
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64 text-zinc-500 font-bold animate-pulse">Cargando canción...</div>;
  }

  if (user?.rol === 'musico') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-zinc-900">Acceso Denegado</h2>
        <p className="text-zinc-500 mt-2">Los músicos no tienen permisos para editar canciones.</p>
      </div>
    );
  }

  // Juntamos los cantantes activos con los que ya estaban guardados por si alguno se eliminó del equipo
  const allSingers = Array.from(new Set([...cantantesDisponibles, ...Object.keys(tonosCantantes)]));

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-500">
      <header className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-zinc-950/45 p-5 md:p-6 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-2xl">
            <Edit3 size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Editar Canción</h1>
          <p className="text-zinc-400 mt-1 text-sm font-medium">Gestiona contenido, tonos, pistas de audio y recursos de ensayo.</p>
          </div>
        </div>
        <button onClick={() => navigate('/canciones')} className="kp-button-secondary flex w-full md:w-auto justify-center items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors active:scale-95">
          <ArrowLeft size={16} />
          Volver al Repertorio
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Metadatos */}
        <div className="kp-card p-6 rounded-3xl h-fit grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Título de la Canción</label>
              <input type="text" value={titulo} onChange={(e)=>setTitulo(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Artista / Banda</label>
              <input type="text" value={artista} onChange={(e)=>setArtista(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm" />
            </div>
            <div className="col-span-1">
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Tono Original</label>
              <select value={TONOS_DISPONIBLES.includes(tono) ? tono : ''} onChange={(e)=>setTono(e.target.value || tono)} className="kp-input w-full p-2.5 rounded-xl text-sm font-bold">
                {!TONOS_DISPONIBLES.includes(tono) && <option value="">{tono || 'Seleccionar'}</option>}
                {TONOS_DISPONIBLES.map(key => <option key={key} value={key}>{key}</option>)}
              </select>
              {detectedKey && detectedKey.tono !== normalizeKey(tono) && (
                <div className="mt-2 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-2 text-xs text-emerald-800 dark:text-emerald-200">
                  <p className="font-bold">
                    Tono detectado: <span className="font-black">{traducirAcorde(detectedKey.tono, formatoAcordes, notacion)}</span>
                    {detectedKey.ambiguo ? ' (probable)' : ''}
                  </p>
                  <button type="button" onClick={() => setTono(detectedKey.tono)} className="mt-1 text-[11px] font-black uppercase text-emerald-700 dark:text-emerald-300 underline underline-offset-2">
                    Usar como tono original
                  </button>
                </div>
              )}
            </div>
            <div className="col-span-1">
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1 flex justify-between items-end">
                <span>Tonos por Cantante</span>
                <button type="button" onClick={() => setShowSingerModal(true)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 font-bold text-[10px] bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-500/20 transition-colors">Administrar</button>
              </label>
              <div className="border border-zinc-200 dark:border-zinc-800 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 min-h-[2.75rem]">
                {Object.keys(tonosCantantes).length === 0 ? (
                  <p className="text-[10px] text-zinc-400 italic">Ningún cantante asignado.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(tonosCantantes).map(([cantante, key]) => (
                      <span key={cantante} className="text-[10px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-1 rounded-md font-bold flex items-center gap-1 shadow-sm">
                        {cantante} <span className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1 rounded">{traducirAcorde(key || tono || '?', formatoAcordes)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="col-span-1">
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">BPM</label>
              <input type="number" value={bpm} onChange={(e)=>setBpm(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Etiquetas (Filtros de Repertorio)</label>
              <div className="flex flex-wrap gap-2">
                {ETIQUETAS_DISPONIBLES.map(tag => (
                  <button key={tag} type="button" onClick={() => setEtiquetas(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-colors ${etiquetas.includes(tag) ? 'bg-violet-100 dark:bg-violet-500/20 border-violet-300 dark:border-violet-500/30 text-violet-700 dark:text-violet-400' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-2">
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Pista o Secuencia de Audio (MP3)</label>
              {audioUrl && (
                <div className="mb-4 flex items-center gap-3 bg-zinc-900 dark:bg-zinc-950 border border-zinc-800 py-2 px-3 rounded-2xl w-full shadow-inner">
                  <button type="button" onClick={toggleAudio} className="w-10 h-10 flex items-center justify-center bg-white hover:bg-zinc-200 text-zinc-900 rounded-xl shadow-md transition-all active:scale-95 shrink-0">
                    {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                  </button>
                  <div className="flex-1 flex items-center gap-3 px-1">
                    <span className="text-xs font-mono text-zinc-400 w-10 text-right">{formatTime(currentTime)}</span>
                    <input type="range" min="0" max={duration || 100} value={currentTime} onChange={handleSeek} className="flex-1 h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-zinc-200 [&::-webkit-slider-thumb]:transition-colors" />
                    <span className="text-xs font-mono text-zinc-500 w-10">{formatTime(duration)}</span>
                  </div>
                  
                  {/* Control de Volumen */}
                  <div className="flex items-center gap-2 border-l border-zinc-800 pl-3">
                    <button type="button" onClick={toggleMute} className="text-zinc-400 hover:text-white transition-colors" title={isMuted ? "Quitar silencio" : "Silenciar"}>
                      {isMuted || volume === 0 ? <VolumeX size={18} /> : volume < 0.5 ? <Volume1 size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume} onChange={handleVolumeChange} className="hidden sm:block w-16 h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-zinc-200 [&::-webkit-slider-thumb]:transition-colors" title="Volumen" />
                  </div>

                  <audio ref={audioRef} src={audioUrl} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={(e) => setDuration(e.target.duration)} onEnded={() => setIsPlaying(false)} onCanPlay={(e) => { e.target.volume = volume; e.target.muted = isMuted; }} className="hidden" />
                </div>
              )}
              <input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files[0])} className="kp-input w-full p-2 rounded-xl text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-amber-500/10 file:text-amber-300 hover:file:bg-amber-500/20 transition-all cursor-pointer" />
            </div>
            
            {/* NUEVO PANEL: MULTITRACKS / STEMS */}
            <div className="col-span-2 pt-4 mt-2 border-t border-zinc-100 dark:border-zinc-800">
              <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-indigo-500"/> Pistas Multitrack (In-Ears / Secuencias)
              </label>
              
              <div className="space-y-2 mb-4">
                {multitracks.length === 0 && <p className="text-xs text-zinc-400 italic bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 text-center">No hay pistas separadas agregadas.</p>}
                {multitracks.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"><Headphones size={16}/></div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{m.nombre}</p>
                        <p className="text-[10px] font-bold text-zinc-500 truncate">{m.fileName}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeStem(m.id)} className="p-2 text-zinc-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                  </div>
                ))}
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-2 items-center">
                <select value={nombreStem} onChange={e => { setNombreStem(e.target.value); setCustomStemName(''); }} className="w-full sm:w-1/3 text-xs p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-zinc-900 dark:text-white font-bold text-zinc-700 dark:text-zinc-300">
                  <option value="Click" className="bg-white dark:bg-zinc-900">🥁 Click (Metrónomo)</option>
                  <option value="Guía" className="bg-white dark:bg-zinc-900">🗣️ Guía (Voz Directora)</option>
                  <option value="Batería" className="bg-white dark:bg-zinc-900">🥁 Batería</option>
                  <option value="Bajo" className="bg-white dark:bg-zinc-900">🎸 Bajo</option>
                  <option value="Secuencia" className="bg-white dark:bg-zinc-900">🎹 Secuencia / Synths</option>
                  <option value="Coros" className="bg-white dark:bg-zinc-900">🎤 Coros</option>
                  <option value="Otro" className="bg-white dark:bg-zinc-900">📝 Otro (Escribir nombre)</option>
                </select>
                {nombreStem === 'Otro' && (
                  <input
                    type="text"
                    value={customStemName}
                    onChange={e => setCustomStemName(e.target.value)}
                    placeholder="Nombre de la pista (ej. Trombón 2)"
                    className="w-full sm:flex-1 text-xs p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-zinc-900 dark:text-white font-bold text-zinc-700 dark:text-zinc-300"
                  />
                )}
                <label className="w-full sm:flex-1 text-xs font-bold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 py-2.5 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-500/30 transition-colors flex justify-center items-center gap-2 cursor-pointer shadow-sm">
                  <Upload size={14} /> Subir Pista (MP3/WAV)
                  <input type="file" accept="audio/*" className="hidden" onChange={handleUploadStem} disabled={isSaving} />
                </label>
              </div>
            </div>

            {/* NUEVO PANEL: FONDO DE PROYECCIÓN */}
            <div className="col-span-2 pt-4 mt-2 border-t border-zinc-100 dark:border-zinc-800">
              <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
                <Monitor size={18} className="text-emerald-500"/> Fondo de Proyección Automático
              </label>
              <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col gap-3">
                {fondoUrl && (
                  <div className="relative w-full h-36 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
                    {fondoUrl.match(/\.(mp4|webm|mov)$/i) || fondoUrl.includes('video/upload') ? (
                      <video src={fondoUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                    ) : (
                      <img src={fondoUrl} alt="Fondo" className="w-full h-full object-cover" />
                    )}
                    <button type="button" onClick={() => setFondoUrl('')} className="absolute top-2 right-2 p-2 bg-red-600/90 hover:bg-red-600 text-white rounded-lg shadow-md transition-colors active:scale-95">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="url" value={fondoUrl} onChange={e => setFondoUrl(e.target.value)} placeholder="Pegar URL (ej. Cloudinary/YouTube...)" className="flex-1 text-xs p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-zinc-900 dark:text-white" />
                  <label className="text-xs font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-4 py-2.5 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-500/30 transition-colors flex justify-center items-center gap-2 cursor-pointer shadow-sm shrink-0">
                    <Upload size={14} /> Subir Archivo
                    <input type="file" accept="image/*,video/*" className="hidden" onChange={handleUploadFondo} disabled={isSaving} />
                  </label>
                </div>
              </div>
            </div>

            {/* NUEVO PANEL: RECURSOS DE ENSAYO */}
            <div className="col-span-2 pt-4 mt-2 border-t border-zinc-100 dark:border-zinc-800">
              <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2"><Library size={18} className="text-blue-500"/> Recursos de Ensayo (Videos, Partituras)</label>
              
              {/* Lista de Recursos */}
              <div className="space-y-2 mb-4">
                {recursos.length === 0 && <p className="text-xs text-zinc-400 italic bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 text-center">No hay tutoriales ni partituras agregadas.</p>}
                {recursos.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`p-2 rounded-lg ${r.tipo === 'youtube' ? 'bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400' : r.tipo === 'pdf' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-500 dark:text-amber-400' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400'}`}>
                        {r.tipo === 'youtube' ? <Video size={16}/> : r.tipo === 'pdf' ? <FileIcon size={16}/> : <LinkIcon size={16}/>}
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{r.titulo}</p>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{r.instrumento}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeRecurso(r.id)} className="p-2 text-zinc-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                  </div>
                ))}
              </div>

              {/* Añadir Recurso */}
              <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Título (Ej. Intro Guitarra)" value={nuevoRecurso.titulo} onChange={e => setNuevoRecurso({...nuevoRecurso, titulo: e.target.value})} className="col-span-2 text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-900 dark:text-white" />
                  <input type="url" placeholder="Link (YouTube, TikTok...)" value={nuevoRecurso.url} onChange={e => setNuevoRecurso({...nuevoRecurso, url: e.target.value})} className="col-span-2 text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-900 dark:text-white" />
                  <select value={nuevoRecurso.instrumento} onChange={e => setNuevoRecurso({...nuevoRecurso, instrumento: e.target.value})} className="text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-900 dark:text-white">
                    {INSTRUMENTOS_RECURSOS.map(inst => <option key={inst} value={inst} className="bg-white dark:bg-zinc-900">{inst}</option>)}
                  </select>
                  <select value={nuevoRecurso.tipo} onChange={e => setNuevoRecurso({...nuevoRecurso, tipo: e.target.value})} className="text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-900 dark:text-white">
                    <option value="youtube" className="bg-white dark:bg-zinc-900">YouTube Embed</option>
                    <option value="link" className="bg-white dark:bg-zinc-900">TikTok / Insta / Externo</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleAddRecurso} className="flex-1 text-xs font-bold bg-zinc-800 dark:bg-zinc-700 text-white py-2 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors">Añadir Enlace</button>
                  <label className="flex-1 text-xs font-bold bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 py-2 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-colors flex justify-center items-center gap-1 cursor-pointer">
                    <Upload size={14} /> Subir PDF
                    <input type="file" accept=".pdf" className="hidden" onChange={handleUploadPDF} />
                  </label>
                </div>
              </div>
            </div>

            <div className="col-span-2 pt-4 mt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button onClick={handleSave} disabled={isSaving} className="kp-button-primary w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold disabled:opacity-50 transition-all active:scale-95">
                <Save size={18} />
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
        </div>

        {/* Editor de Letra */}
        <div className="kp-card p-6 rounded-3xl flex flex-col h-[430px] md:h-[640px]">
          <div className="mb-3">
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex justify-between items-center">
              <span>Estructura de la Canción</span>
              <div className="flex items-center gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowExample(!showExample)}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-semibold underline decoration-blue-300 dark:decoration-blue-500/50 underline-offset-2 transition-colors"
                >
                  {showExample ? 'Ocultar ejemplo' : 'Ver ejemplo'}
                </button>
                <span className="text-zinc-400 font-normal text-xs hidden sm:inline">Usa formato americano [C], [F#m]</span>
              </div>
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {['Intro', 'Verso 1', 'Verso 2', 'Pre-Coro', 'Pre-Coro 2', 'Coro', 'Puente', 'Instrumental', 'Espontáneo'].map(tag => (
                <button key={tag} type="button" onClick={() => insertarEtiqueta(tag)} className="px-3 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors active:scale-95">
                  + {tag}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {CUE_PRESETS.map(cue => (
                <button key={cue} type="button" onClick={() => insertarIndicacion(cue)} className="px-3 py-1 text-xs font-bold bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg border border-violet-200 transition-colors active:scale-95">
                  * {cue}
                </button>
              ))}
            </div>
            
            {showExample && (
              <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-700 dark:text-slate-300 animate-in fade-in slide-in-from-top-1 mb-2">
                <p className="font-bold text-slate-900 dark:text-white mb-2 font-sans">Así debe estructurarse tu texto:</p>
                # Verso 1<br/>
                [G]Esta es la primera [D]línea<br/>
                [Em]Y los acordes van [C]pegados<br/><br/>
                # Coro<br/>
                [G]Canto con a[D]legría
              </div>
            )}
          </div>
          <textarea 
            value={letraRaw} 
            onChange={(e) => setLetraRaw(e.target.value)} 
            className="kp-input flex-1 w-full p-4 rounded-2xl text-sm font-mono whitespace-pre-wrap resize-none"
          ></textarea>
        </div>
      </div>

      {/* Modal de Cantantes */}
      {showSingerModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800">
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950">
              <h3 className="font-bold text-zinc-900 dark:text-white">Asignar Tonos por Cantante</h3>
              <button type="button" onClick={() => setShowSingerModal(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"><X size={20}/></button>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto bg-white dark:bg-zinc-900">
              {allSingers.length === 0 ? (
                <p className="text-xs text-zinc-500 italic text-center py-4">No hay integrantes con el rol de Voz Principal o Coros.</p>
              ) : (
                allSingers.map(cantante => {
                  const isSelected = tonosCantantes[cantante] !== undefined;
                  return (
                    <div key={cantante} onClick={() => toggleSingerTone(cantante)} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors cursor-pointer ${isSelected ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
                      <label className="flex items-center gap-2 flex-1 cursor-pointer">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSingerTone(cantante)} onClick={(e) => e.stopPropagation()} className="rounded text-blue-600 focus:ring-blue-500 border-zinc-300" />
                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate">{cantante}</span>
                      </label>
                      {isSelected && (
                        <input type="text" placeholder="Tono" value={tonosCantantes[cantante] || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => setTonosCantantes({...tonosCantantes, [cantante]: e.target.value})} className="w-16 p-1 border border-zinc-200 dark:border-zinc-700 rounded text-xs focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-zinc-950 dark:text-white text-center font-bold uppercase" maxLength={3} title="Tono para este cantante" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex justify-end">
              <button type="button" onClick={() => setShowSingerModal(false)} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all active:scale-95">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 p-4 rounded-xl shadow-xl text-sm font-bold animate-in slide-in-from-bottom-5 z-50 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default EditSong;

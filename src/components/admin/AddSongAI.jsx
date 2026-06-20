import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Search, Save, AlertCircle, X, Download, Wand2, Eye, Scissors, Pilcrow } from 'lucide-react';
import { buscarSugerenciasIA, buscarMetadatosIA } from '../../utils/geminiApi';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../config/firebase';
import { traducirAcorde } from '../../utils/musicCore';
import { parsearCancion } from '../../utils/songParser';

const TONOS_DISPONIBLES = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
const SECTION_NAMES = ['Intro', 'Verso', 'Verse', 'Coro', 'Chorus', 'Puente', 'Bridge', 'Final', 'Outro', 'Instrumental', 'Espontáneo', 'Espontaneo'];
const CHORD_REGEX = /^[A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?(?:\d{0,2})?(?:[#b]?\d{0,2})?(?:\/[A-G][#b]?)?$/;
const SECTION_TITLE_REGEX = /^\s*(intro|verso|verse|coro|chorus|puente|bridge|final|outro|instrumental|espont[aá]neo)(?:\s+\d+|\s*[:.-])?\s*$/i;

const normalizeKey = (value, fallback = 'C') => {
  const clean = String(value || '').trim();
  const match = TONOS_DISPONIBLES.find(t => t.toLowerCase() === clean.toLowerCase());
  return match || clean || fallback;
};

const isSectionTitle = (value) => SECTION_TITLE_REGEX.test(String(value || '').trim());

const limpiarTextoCancion = (value) => String(value || '')
  .replace(/\r\n?/g, '\n')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/\u00a0/g, ' ')
  .replace(/[ \t]+$/gm, '')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const detectarSeccionesTexto = (value) => {
  const lines = String(value || '').split(/\r?\n/);
  let hasSection = false;
  const processed = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      hasSection = true;
      return line;
    }
    const bracketMatch = trimmed.match(/^\[(.*?)\]$/);
    if (bracketMatch && isSectionTitle(bracketMatch[1])) {
      hasSection = true;
      return `# ${bracketMatch[1].trim()}`;
    }
    const match = isSectionTitle(trimmed);
    if (!match) return line;
    hasSection = true;
    const title = trimmed.replace(/[:.-]\s*$/, '');
    return `# ${title}`;
  });
  return { text: processed.join('\n').trim(), hasSection };
};

const AddSongAI = ({ user }) => {
  const [busqueda, setBusqueda] = useState('');
  const [letraGenerada, setLetraGenerada] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [sugerencias, setSugerencias] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [artista, setArtista] = useState('');
  const [bpm, setBpm] = useState('');
  const [tono, setTono] = useState('C');
  const [cantantesDisponibles, setCantantesDisponibles] = useState([]);
  const [tonosCantantes, setTonosCantantes] = useState({});
  const [audioFile, setAudioFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [showSingerModal, setShowSingerModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const notacion = user?.preferencias?.notacion || 'sharps';
  const [chordProText, setChordProText] = useState('');

  const parsedPreview = useMemo(() => parsearCancion(letraGenerada), [letraGenerada]);
  const chordWarnings = useMemo(() => {
    const matches = [...String(letraGenerada || '').matchAll(/\[([^\]]+)\]/g)];
    return matches
      .map(match => match[1].trim())
      .filter(chord => chord && !isSectionTitle(chord) && !CHORD_REGEX.test(chord))
      .slice(0, 8);
  }, [letraGenerada]);

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'usuarios'), (snap) => {
      const users = snap.docs.map(doc => doc.data());
      const singers = users.filter(u => u.instrumentos?.includes('Voz Principal') || u.instrumentos?.includes('Coros'));
      setCantantesDisponibles(singers.map(s => s.nombre));
    });
    return () => unsub();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!busqueda) return;
    
    setIsSearching(true);
    setSugerencias([]);
    try {
      const resultados = await buscarSugerenciasIA(busqueda);
      setSugerencias(resultados);
      if (resultados.length === 0) {
        showToast("No se encontraron opciones. Intenta ser más específico.");
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "Hubo un error buscando opciones.");
    } finally {
      setIsSearching(false);
    }
  };

  const seleccionarCancion = async (tituloSeleccionado, artistaSeleccionado) => {
    setIsSearching(true);
    setSugerencias([]); // Ocultar lista
    setTitulo(tituloSeleccionado);
    setArtista(artistaSeleccionado);
    setLetraGenerada(''); // Limpiar el lienzo para ti
    
    try {
      const metadatos = await buscarMetadatosIA(tituloSeleccionado, artistaSeleccionado);
      if (metadatos.tono) setTono(normalizeKey(metadatos.tono));
      if (metadatos.bpm) setBpm(metadatos.bpm);
    } catch (error) {
      console.error(error);
      // Si el error es por límite de Google, avisamos y restauramos la opción
      if (error.message && error.message.includes('Límite')) {
        showToast(error.message);
        setSugerencias([{ titulo: tituloSeleccionado, artista: artistaSeleccionado }]);
      } else {
        console.warn("No se pudo obtener el BPM automáticamente. Puedes ingresarlo manual.");
      }
    } finally {
      setIsSearching(false);
    }
  };

  const insertarEtiqueta = (etiqueta) => {
    setLetraGenerada(prev => prev + (prev ? '\n\n' : '') + `# ${etiqueta}\n`);
  };

  // Convertir texto pegado estilo ChordPro
  const handleImportChordPro = () => {
    let t = chordProText;
    if (!t.trim()) return showToast("Pega algún texto primero.");
    
    const titleMatch = t.match(/\{title:\s*(.*?)\}/i) || t.match(/\{t:\s*(.*?)\}/i);
    if (titleMatch) setTitulo(titleMatch[1]);
    
    const artistMatch = t.match(/\{artist:\s*(.*?)\}/i) || t.match(/\{su:\s*(.*?)\}/i);
    if (artistMatch) setArtista(artistMatch[1]);
    
    const keyMatch = t.match(/\{key:\s*(.*?)\}/i);
    if (keyMatch) setTono(normalizeKey(keyMatch[1]));
    
    // Detección automática de acordes sin corchetes (si el usuario pega texto crudo)
    // Si no detectamos corchetes [], intentamos procesar línea por línea
    if (!t.includes('[') && !t.includes('{')) {
      const lines = t.split('\n');
      const processedLines = lines.map((line, index) => {
        // Expresión regular para detectar una línea que solo tiene acordes americanos
        const chordLineRegex = /^\s*([A-G][#b]?(m|maj|dim|aug|sus|add|2|4|5|6|7|9|11|13)*(\/[A-G][#b]?)?\s*)+$/;
        if (chordLineRegex.test(line)) {
           // Convertir línea de acordes "C  D  G" a "[C]  [D]  [G]"
           return line.replace(/([A-G][#b]?(m|maj|dim|aug|sus|add|2|4|5|6|7|9|11|13)*(\/[A-G][#b]?)?)/g, '[$1]');
        }
        return line;
      });
      t = processedLines.join('\n');
      
      if (processedLines.length < lines.length) {
        showToast("Se detectaron acordes sin formato. Se recomienda usar corchetes [C] para mayor precisión.", "info");
      }
    }

    t = t.replace(/\{c:\s*(.*?)\}/gi, '\n# $1\n').replace(/\{comment:\s*(.*?)\}/gi, '\n# $1\n').replace(/\{.*?\}/g, '');
    
    setLetraGenerada(t.trim());
    setShowImportModal(false); setChordProText('');
    showToast("Texto importado. Revisa y formatea si es necesario.", "success");
  };

  const handleSave = async () => {
    if (!titulo || !letraGenerada) {
      showToast("Por favor, ingresa al menos un título y la letra de la canción.");
      return;
    }

    setIsSaving(true);
    try {
      let audioUrl = null;
      
      if (audioFile) {
        showToast("Subiendo pista de audio...", "info");
        const storage = getStorage();
        const audioRef = ref(storage, `pistas/${Date.now()}_${audioFile.name}`);
        await uploadBytes(audioRef, audioFile);
        audioUrl = await getDownloadURL(audioRef);
      }

      // Procesar solo a los cantantes a los que se les asignó un tono
      const tonoNormalizado = normalizeKey(tono);
      const tonosAlternativos = Object.entries(tonosCantantes)
        .map(([name, key]) => `${name}: ${normalizeKey(key, tonoNormalizado)}`)
        .join(', ');

      await addDoc(collection(db, "canciones"), {
        titulo,
        artista,
        tonoOriginal: tonoNormalizado,
        tonosAlternativos: tonosAlternativos,
        bpm: Number(bpm) || 0,
        letraRaw: letraGenerada,
        audioUrl,
        youtubeUrl,
        fechaCreacion: new Date().toISOString()
      });
      
      // Notificación Global
      await addDoc(collection(db, 'notificaciones'), {
        titulo: '🎵 Canción Nueva',
        mensaje: `Se ha añadido "${titulo}" al repertorio general.`,
        destinatarios: ['all'],
        emisorId: user?.uid,
        fechaCreacion: new Date().toISOString()
      });
      showToast(`¡Canción "${titulo}" guardada exitosamente en Kadosh App!`, "success");
      setTitulo(''); setArtista(''); setTono('C'); setTonosCantantes({}); setBpm(''); setLetraGenerada(''); setBusqueda(''); setAudioFile(null); setYoutubeUrl('');
    } catch (error) {
      console.error("Error guardando en Firebase:", error);
      showToast("Hubo un error al guardar la canción. Verifica tu conexión a Firebase.");
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

  const handleCleanFormat = () => {
    const cleaned = limpiarTextoCancion(letraGenerada);
    if (!cleaned) return;
    const hasHeavyCleanup = /\n{3,}|[“”‘’\u00a0]|\r/.test(letraGenerada);
    if (hasHeavyCleanup && !window.confirm('Esto limpiará espacios excesivos y caracteres pegados, manteniendo máximo una línea vacía entre bloques. ¿Continuar?')) return;
    setLetraGenerada(cleaned);
    showToast('Formato limpiado. Revisa la vista previa antes de guardar.', 'success');
  };

  const handleDetectSections = () => {
    const result = detectarSeccionesTexto(letraGenerada);
    if (!result.text) return;
    setLetraGenerada(result.hasSection && !result.text.startsWith('#') ? `# Inicio\n${result.text}` : result.text);
    showToast(result.hasSection ? 'Secciones detectadas.' : 'No se encontraron secciones claras.', result.hasSection ? 'success' : 'info');
  };

  const insertBlankLine = () => {
    setLetraGenerada(prev => `${prev}${prev.endsWith('\n') || !prev ? '' : '\n'}\n`);
  };

  if (user?.rol === 'musico') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-zinc-900">Acceso Denegado</h2>
        <p className="text-zinc-500 mt-2">Los músicos no tienen permisos para añadir canciones.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-500">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded-2xl shrink-0">
          <Sparkles size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Añadir Canción</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm font-medium">Añade canciones manualmente o usa el generador IA.</p>
        </div>
        </div>
        <button onClick={() => setShowImportModal(true)} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-bold text-sm shadow-sm hover:bg-zinc-800 dark:hover:bg-white transition-colors">
          <Download size={16}/> Importar Texto (ChordPro)
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Columna Izquierda: Búsqueda y Metadatos */}
        <div className="space-y-6">
          <div className="relative bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {/* BLOQUEO VISUAL: "En Producción" SOLO PARA LA IA */}
            <div className="absolute inset-0 z-50 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-[2px] flex items-center justify-center border border-zinc-200/50 dark:border-zinc-800/50">
              <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 text-center max-w-[250px] mx-4 animate-in zoom-in-95">
                <Sparkles size={24} className="text-blue-500 mx-auto mb-2 opacity-80" />
                <h2 className="text-sm font-black text-zinc-900 dark:text-white mb-1">IA en Producción</h2>
                <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">El buscador IA estará disponible en la próxima versión.</p>
              </div>
            </div>
            <div className="opacity-40 pointer-events-none select-none">
            <form onSubmit={handleSearch}>
              <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">¿Qué canción necesitas?</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400"><Search size={18} /></div>
                  <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="block w-full pl-10 pr-3 py-3 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 dark:bg-zinc-950 dark:text-white text-sm font-medium" placeholder="Ej. Miel San Marcos - Increíble" required />
                </div>
                <button type="submit" disabled={isSearching} className="flex items-center gap-2 py-3 px-6 rounded-xl shadow-md text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 disabled:opacity-70 transition-all active:scale-95">
                  {isSearching ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
            </form>

            {/* Lista de Sugerencias */}
            {sugerencias.length > 0 && (
              <div className="mt-4 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm animate-in slide-in-from-top-2">
                <div className="bg-zinc-50 dark:bg-zinc-950 px-4 py-2 text-xs font-bold text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                  Resultados encontrados (Selecciona uno):
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 max-h-48 overflow-y-auto">
                  {sugerencias.map((sug, idx) => (
                    <li key={idx}>
                      <button 
                        type="button"
                        onClick={() => seleccionarCancion(sug.titulo, sug.artista)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-500/10 focus:bg-blue-50 dark:focus:bg-blue-500/10 transition-colors flex items-center justify-between group"
                      >
                        <div>
                          <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{sug.titulo}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">{sug.artista}</p>
                        </div>
                        <Sparkles size={16} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {!import.meta.env.VITE_GEMINI_API_KEY && (
              <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 rounded-xl text-xs font-medium border border-amber-200 dark:border-amber-800/50">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p>Estás en Modo Prueba (Mock). Para extraer canciones reales, debes configurar la variable <code>VITE_GEMINI_API_KEY</code>.</p>
              </div>
            )}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div className="col-span-2">
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Título de la Canción</label>
                <input type="text" value={titulo} onChange={(e)=>setTitulo(e.target.value)} className="w-full p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 dark:text-white focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-500" />
             </div>
             <div className="col-span-2">
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Artista / Banda</label>
                <input type="text" value={artista} onChange={(e)=>setArtista(e.target.value)} className="w-full p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 dark:text-white focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-500" />
             </div>
             <div className="col-span-1">
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Tono Original</label>
                <select value={TONOS_DISPONIBLES.includes(tono) ? tono : ''} onChange={(e)=>setTono(e.target.value || tono)} className="w-full p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 dark:text-white focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-500 font-bold">
                  {!TONOS_DISPONIBLES.includes(tono) && <option value="">{tono || 'Seleccionar'}</option>}
                  {TONOS_DISPONIBLES.map(key => <option key={key} value={key}>{key}</option>)}
                </select>
             </div>
             <div className="col-span-1">
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1 flex justify-between items-end">
                  <span>Tonos por Cantante</span>
                  <button type="button" onClick={() => setShowSingerModal(true)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 font-bold text-[10px] bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-500/20 transition-colors">Administrar</button>
                </label>
                <div className="border border-zinc-200 dark:border-zinc-800 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 min-h-[2.5rem]">
                  {Object.keys(tonosCantantes).length === 0 ? (
                    <p className="text-[10px] text-zinc-400 italic">Ningún cantante asignado.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(tonosCantantes).map(([cantante, key]) => (
                        <span key={cantante} className="text-[10px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-1 rounded-md font-bold flex items-center gap-1 shadow-sm">
                          {cantante} <span className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1 rounded">{traducirAcorde(key || tono || '?', user?.preferencias?.formatoAcordes, notacion)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
             </div>
             <div className="col-span-1">
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">BPM</label>
                <input type="number" value={bpm} onChange={(e)=>setBpm(e.target.value)} className="w-full p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 dark:text-white focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-500" placeholder="Ej. 120" />
             </div>
             <div className="col-span-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-2">
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Pista o Secuencia de Audio (MP3)</label>
                <input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files[0])} className="w-full p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 dark:text-white focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 dark:file:bg-blue-500/10 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-500/20 transition-all cursor-pointer" />
             </div>
             <div className="col-span-2 mt-1">
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">O pega un Enlace de YouTube</label>
                <input type="url" value={youtubeUrl} onChange={(e)=>setYoutubeUrl(e.target.value)} className="w-full p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 dark:text-white focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-500" placeholder="https://www.youtube.com/watch?v=..." />
             </div>
          </div>
        </div>

        {/* Columna Derecha: Resultado y Editor */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col h-[400px] md:h-[600px]">
          <div className="mb-3">
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex justify-between items-center">
              <span>Editor de Letra y Acordes</span>
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
              {['Intro', 'Verso 1', 'Verso 2', 'Coro', 'Puente', 'Instrumental', 'Espontáneo'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => insertarEtiqueta(tag)}
                  className="px-3 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors active:scale-95"
                >
                  + {tag}
                </button>
              ))}
              <button type="button" onClick={insertBlankLine} className="px-3 py-1 text-xs font-bold bg-zinc-100 text-zinc-700 hover:bg-zinc-200 rounded-lg border border-zinc-200 transition-colors active:scale-95 flex items-center gap-1">
                <Pilcrow size={12}/> Separar bloque
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              <button type="button" onClick={handleCleanFormat} disabled={!letraGenerada.trim()} className="px-3 py-1.5 text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors disabled:opacity-50 flex items-center gap-1">
                <Scissors size={13}/> Limpiar formato
              </button>
              <button type="button" onClick={handleDetectSections} disabled={!letraGenerada.trim()} className="px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors disabled:opacity-50 flex items-center gap-1">
                <Wand2 size={13}/> Detectar secciones
              </button>
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
            value={letraGenerada} 
            onChange={(e) => setLetraGenerada(e.target.value)} 
            className="flex-1 w-full p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 bg-zinc-50 dark:bg-zinc-950 dark:text-white text-sm font-mono whitespace-pre-wrap resize-none"
            placeholder="Pega aquí la letra y haz clic en los botones de arriba para agregar las secciones..."
          ></textarea>
          {chordWarnings.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-black mb-1 flex items-center gap-1"><AlertCircle size={14}/> Revisa estos acordes:</p>
              <div className="flex flex-wrap gap-1.5">
                {chordWarnings.map(chord => <span key={chord} className="font-mono font-bold bg-white/70 border border-amber-200 rounded px-1.5 py-0.5">[{chord}]</span>)}
              </div>
            </div>
          )}

          <button 
            onClick={handleSave}
            disabled={!letraGenerada || isSaving}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl shadow-md text-sm font-bold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 transition-all active:scale-95"
          >
            <Save size={18} />
            {isSaving ? 'Guardando...' : 'Guardar Canción'}
          </button>
        </div>
      </div>

      <section className="mt-8 bg-white dark:bg-zinc-900 p-5 md:p-6 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-black text-zinc-900 dark:text-white flex items-center gap-2"><Eye size={16} className="text-blue-600"/> Vista previa para músicos</h2>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{parsedPreview.length} secciones</span>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 max-h-[420px] overflow-y-auto">
          <div className="mb-5">
            <p className="text-xl font-black text-zinc-900 dark:text-white">{titulo || 'Título sin definir'}</p>
            <p className="text-sm font-bold text-zinc-500">{artista || 'Artista sin definir'} · Tono {traducirAcorde(normalizeKey(tono), user?.preferencias?.formatoAcordes, notacion)}</p>
          </div>
          {parsedPreview.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">La vista previa aparecerá cuando escribas letra o acordes.</p>
          ) : (
            <div className="space-y-6">
              {parsedPreview.map((seccion, idx) => (
                <div key={`${seccion.titulo}-${idx}`}>
                  <span className="inline-block mb-3 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 border border-blue-200">{seccion.titulo}</span>
                  <div className="space-y-2 font-medium text-zinc-800 dark:text-zinc-100">
                    {seccion.lineas.map((linea, lineIdx) => (
                      linea.length === 0 ? (
                        <div key={lineIdx} className="h-4" />
                      ) : (
                        <div key={lineIdx} className="flex flex-wrap items-end gap-x-2 gap-y-3">
                          {linea.map((palabra, palabraIdx) => (
                            <div key={palabraIdx} className="flex items-end whitespace-nowrap">
                              {palabra.map((silaba, silabaIdx) => (
                                <div key={silabaIdx} className="flex flex-col items-start">
                                  <span className="min-h-[1rem] text-[0.75rem] font-black text-blue-600">{silaba.acorde ? traducirAcorde(silaba.acorde, user?.preferencias?.formatoAcordes, notacion) : ''}</span>
                                  <span>{silaba.texto}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Modal Importar ChordPro */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950"><h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Download size={18}/> Importar Canción</h3><button onClick={() => setShowImportModal(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"><X size={20}/></button></div>
            <div className="p-4 flex-1">
              <p className="text-xs text-zinc-500 mb-3">Pega aquí canciones desde internet que tengan los acordes entre corchetes <code>[G]</code> o etiquetas <code>&#123;title: ...&#125;</code>. El sistema lo adaptará a tu editor.</p>
              <textarea value={chordProText} onChange={e => setChordProText(e.target.value)} className="w-full h-48 p-3 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono bg-zinc-50 dark:bg-zinc-950 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"></textarea>
            </div>
            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex justify-end">
              <button onClick={handleImportChordPro} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all active:scale-95 shadow-sm">Importar y Rellenar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cantantes */}
      {showSingerModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800">
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950">
              <h3 className="font-bold text-zinc-900 dark:text-white">Asignar Tonos por Cantante</h3>
              <button type="button" onClick={() => setShowSingerModal(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"><X size={20}/></button>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto bg-white dark:bg-zinc-900">
              {cantantesDisponibles.length === 0 ? (
                <p className="text-xs text-zinc-500 italic text-center py-4">No hay integrantes con el rol de Voz Principal o Coros.</p>
              ) : (
                cantantesDisponibles.map(cantante => {
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

export default AddSongAI;

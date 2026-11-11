import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import {
  Sparkles,
  Send,
  Copy,
  PlusCircle,
  RotateCcw,
  SlidersHorizontal,
  Tv,
  Music,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Info,
  Video,
  FileText,
  RefreshCw,
  ArrowRight,
  Cpu,
  MessageSquare
} from 'lucide-react';
import { functions } from '../../config/firebase';
import { useFeedback } from '../ui/FeedbackProvider';
import { isOwnerUser, hasPermission, PERMISSIONS } from '../../utils/permissions';
import {
  convertPlainTextToKadosh,
  extractMusicalMetadataFromText,
  extractPureKadoshContent,
  validateKadoshSyntax,
  transposeKey,
  normalizeKey
} from '../../utils/musicConverter';
import { parsearCancion, getSectionPages } from '../../utils/songParser';
import { PROJECTION_STYLE_PRESETS } from '../../utils/projectionStyle';
import OfficialChatsWorkspace from './OfficialChatsWorkspace';

const QUICK_PROMPTS = [
  'Organiza esta canción para KADOSH con cifrado americano',
  'El puente se repite 3 veces',
  'Respeta tono real Ab, forma G y capo 1',
  'No me cambies la tonalidad',
  'Divide el coro en pantallas más cortas',
  'Corrige los acordes mal alineados',
  'Deja solamente el verso 1 y el coro',
  'Prepara este popurrí / medley'
];

const processMusicAICallable = httpsCallable(functions, 'processMusicAI');
// En el lanzamiento Web inicial solo se muestran Chats oficiales y Conversor local sin IA.
// La modalidad API integrada queda preservada en código y oculta hasta autorización separada.
const IS_API_ASSISTANT_ENABLED = import.meta.env.VITE_MUSIC_AI_API_MODE_ENABLED === 'true';

const MusicAI = ({ user }) => {
  const navigate = useNavigate();
  const { notify } = useFeedback();

  // Selector de modalidad: 'official_chats' (principal) | 'api_assistant' (opcional) | 'local_converter'
  const [modality, setModality] = useState('official_chats');

  // Estados del formulario musical
  const [titulo, setTitulo] = useState('');
  const [artista, setArtista] = useState('');
  const [tonalidad, setTonalidad] = useState('');
  const [formaAcordes, setFormaAcordes] = useState('');
  const [capo, setCapo] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  // Estados de la conversación (modalidad API opcional)
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      source: 'system',
      text: '¡Hola! Soy **KADOSH Music AI**. Pega la letra y acordes de tu canción, indícame un video de YouTube de referencia o escríbeme lo que necesitas (repeticiones, tonalidad, capo, división de pantallas). Entregaré la canción lista para proyección y ensayo.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [engineStatus, setEngineStatus] = useState('ready'); // 'gemini_connected' | 'local_deterministic' | 'quota_or_error' | 'ready'
  const [engineDetail, setEngineDetail] = useState(null);

  // Estados del borrador musical
  const [currentDraft, setCurrentDraft] = useState('');
  const [draftHistory, setDraftHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'slides' | 'chords'
  const [selectedPreset, setSelectedPreset] = useState('clean');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const additionalInstructionsRef = useRef(null);

  // Comprobar si proviene de Crear/Editar canción con un borrador guardado
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('kadosh_music_ai_draft');
      if (stored) {
        sessionStorage.removeItem('kadosh_music_ai_draft');
        const d = JSON.parse(stored);
        if (d.titulo) setTitulo(d.titulo);
        if (d.artista) setArtista(d.artista);
        if (d.tono) setTonalidad(d.tono);
        if (d.letraRaw) {
          setRawText(d.letraRaw);
          setCurrentDraft(d.letraRaw);
          setDraftHistory([{ draft: d.letraRaw, note: 'Importado desde editor' }]);
        }
        if (d.youtubeUrl) setYoutubeUrl(d.youtubeUrl);
        notify('Datos de la canción cargados en KADOSH Music AI.', { type: 'info' });
      }
    } catch (e) {
      console.warn('Error recuperando borrador inicial:', e);
    }
  }, []);

  // Auto-scroll chat al nuevo mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // Extraer ID de YouTube para vista previa embebida
  const youtubeVideoId = useMemo(() => {
    if (!youtubeUrl) return null;
    const match = youtubeUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    return match ? match[1] : null;
  }, [youtubeUrl]);

  // Validación de sintaxis en tiempo real del borrador
  const syntaxValidation = useMemo(() => {
    return validateKadoshSyntax(currentDraft);
  }, [currentDraft]);

  // Secciones y Diapositivas parseadas del borrador
  const parsedSections = useMemo(() => {
    return parsearCancion(currentDraft);
  }, [currentDraft]);

  // Generar lista plana de diapositivas para la vista previa coherente con Projection V2.1
  const slidesList = useMemo(() => {
    const slides = [];
    parsedSections.forEach((section) => {
      const pages = getSectionPages(section);
      pages.forEach((page) => {
        const lines = (page.lineas || [])
          .map((line) => line.map((word) => word.map((token) => (token.texto === '\u00A0' ? '' : token.texto)).join('')).join(' ').trim())
          .filter(Boolean);
        slides.push({
          sectionTitle: `${page.title}${page.pageCount > 1 ? ` (${page.pageIndex + 1}/${page.pageCount})` : ''}`,
          repetition: page.repetition === true,
          repeatCount: page.repeatCount ?? 1,
          lines: lines.length > 0 ? lines : ['(Sección instrumental o sin texto)'],
        });
      });
    });
    return slides;
  }, [parsedSections]);

  // Función para ejecutar conversión local determinista
  const handleExecuteLocal = (promptNote = '') => {
    const sourceText = currentDraft || rawText;
    if (!sourceText.trim()) {
      notify('Pega primero la letra y los acordes en el área de texto.', { type: 'warning' });
      return;
    }

    const localResult = convertPlainTextToKadosh(sourceText);
    const meta = extractMusicalMetadataFromText(sourceText);
    if (meta.titulo && !titulo) setTitulo(meta.titulo);
    if (meta.artista && !artista) setArtista(meta.artista);
    if (meta.youtubeUrl && !youtubeUrl) setYoutubeUrl(meta.youtubeUrl);

    if (localResult) {
      setCurrentDraft(localResult);
      setDraftHistory((prev) => [
        ...prev,
        { draft: localResult, note: promptNote || 'Motor Determinista Local', timestamp: new Date() }
      ]);
    }

    setEngineStatus('local_deterministic');
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        role: 'assistant',
        text: `Procesado mediante el motor determinista local de KADOSH.\n\n- Acordes posicionados entre corchetes sobre la sílaba correspondiente.\n- Secciones estructuradas con formato KADOSH.\n- Separación de diapositivas conforme a V2.1.\n\n*(Generado localmente sin conexión a Gemini).*`,
        kadoshContent: localResult,
        source: 'deterministic_engine',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    setActiveTab('editor');
    notify('Canción convertida con el motor local.', { type: 'success' });
  };

  // Función para enviar mensaje a la IA / motor
  const handleSendMessage = async (customText = null) => {
    const promptToSend = (typeof customText === 'string' ? customText : currentPrompt).trim();
    if (!promptToSend && !rawText.trim() && !currentDraft.trim()) {
      notify('Ingresa una instrucción o pega la letra de la canción.', { type: 'warning' });
      return;
    }

    const userMsg = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text: promptToSend || 'Por favor organiza y estructura esta canción para KADOSH.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setCurrentPrompt('');
    setIsProcessing(true);

    try {
      // 1. Llamar a la Cloud Function protegida
      const response = await processMusicAICallable({
        prompt: promptToSend,
        rawSong: currentDraft || rawText,
        youtubeUrl,
        history: messages.map((m) => ({ role: m.role, text: m.text }))
      });

      const data = response?.data;
      if (data && data.ok) {
        const kadoshText = data.kadoshContent || extractPureKadoshContent(data.message);

        // Actualizar borrador y agregar al historial
        if (kadoshText) {
          setCurrentDraft(kadoshText);
          setDraftHistory((prev) => [
            ...prev,
            { draft: kadoshText, note: promptToSend || 'Reorganización con IA', timestamp: new Date() }
          ]);
        }

        // Si se extrajeron metadatos musicales (Tono, Capo, Artista)
        if (data.metadata) {
          if (data.metadata.titulo && !titulo) setTitulo(data.metadata.titulo);
          if (data.metadata.artista && !artista) setArtista(data.metadata.artista);
        }

        if (data.source === 'gemini') {
          setEngineStatus('gemini_connected');
          setEngineDetail({ model: data.model, youtubeAnalysis: data.youtubeAnalysis });
        } else {
          setEngineStatus('local_deterministic');
          setEngineDetail({ model: data.model, youtubeAnalysis: data.youtubeAnalysis });
        }

        // Mensaje de respuesta
        const assistantMsg = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: data.message || 'He preparado la canción según las indicaciones.',
          kadoshContent: kadoshText,
          source: data.source,
          model: data.model,
          youtubeAnalysis: data.youtubeAnalysis,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setActiveTab('editor');
      } else if (data && !data.ok) {
        // La API retornó error estructurado (clave filtrada, 403, 429 cuota agotada)
        setEngineStatus('quota_or_error');
        setEngineDetail({ error: data.error, model: data.model, status: data.status });

        const errorMsg = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `⚠️ **Error de Gemini API (${data.model || 'gemini-3.8-flash'})**:\n${data.error || 'La clave de API no está disponible o la cuota se agotó.'}\n\nPuedes procesar tu canción con el **Motor Determinista Local** haciendo clic abajo:`,
          source: 'gemini_error',
          error: data.error,
          canRunLocal: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages((prev) => [...prev, errorMsg]);
        notify(data.error || 'Error en respuesta de Gemini API', { type: 'error' });
      } else {
        throw new Error(data?.error || 'No se recibió respuesta válida del motor musical.');
      }
    } catch (err) {
      console.warn('Error en llamada a Functions:', err);
      setEngineStatus('quota_or_error');
      setEngineDetail({ error: err.message });

      const errorMsg = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        text: `⚠️ **Error al conectar con Gemini**: ${err.message || 'Error de conexión'}.\n\nPuedes continuar trabajando con el **Motor Determinista Local**:`,
        source: 'gemini_error',
        error: err.message,
        canRunLocal: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, errorMsg]);
      notify('Fallo de conexión con el asistente.', { type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Convertir texto pegado inmediatamente con el conversor determinista
  const handleAutoConvertRaw = () => {
    if (!rawText.trim()) {
      notify('Pega primero la letra y los acordes en el área de texto.', { type: 'warning' });
      return;
    }
    const converted = convertPlainTextToKadosh(rawText);
    const meta = extractMusicalMetadataFromText(rawText);
    if (meta.titulo && !titulo) setTitulo(meta.titulo);
    if (meta.artista && !artista) setArtista(meta.artista);
    if (meta.youtubeUrl && !youtubeUrl) setYoutubeUrl(meta.youtubeUrl);

    setCurrentDraft(converted);
    setDraftHistory((prev) => [
      ...prev,
      { draft: converted, note: 'Conversión inicial con Motor Determinista Local', timestamp: new Date() }
    ]);

    setEngineStatus('local_deterministic');
    setMessages((prev) => [
      ...prev,
      {
        id: `conv-${Date.now()}`,
        role: 'assistant',
        source: 'deterministic_engine',
        text: 'He fusionado los acordes sobre la letra en corchetes `[C]`, normalizado los encabezados y separado las diapositivas mediante el motor determinista local. Puedes revisarla o darme más instrucciones.',
        kadoshContent: converted,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    notify('Canción convertida al estándar KADOSH PROJECTION V2.1.', { type: 'success' });
    setActiveTab('editor');
  };

  // Acción: Copiar exclusivamente el bloque KADOSH
  const handleCopyKadosh = async () => {
    const textToCopy = extractPureKadoshContent(currentDraft);
    if (!textToCopy) {
      notify('No hay contenido para copiar.', { type: 'warning' });
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      notify('¡Letra y acordes copiados al portapapeles en formato KADOSH!', { type: 'success' });
    } catch (err) {
      console.error(err);
      notify('No se pudo copiar automáticamente. Selecciona el texto manualmente.', { type: 'error' });
    }
  };

  // Acción: Deshacer / volver a versión anterior
  const handleUndoDraft = () => {
    if (draftHistory.length <= 1) {
      notify('No hay versiones anteriores en esta sesión.', { type: 'info' });
      return;
    }
    const previous = draftHistory[draftHistory.length - 2];
    setCurrentDraft(previous.draft);
    setDraftHistory((prev) => prev.slice(0, -1));
    notify(`Borrador restaurado a: "${previous.note}"`, { type: 'success' });
  };

  // Acción: Importar resultado procesado desde chats oficiales (Gemini o ChatGPT)
  const handleImportExternalResult = (imported) => {
    if (!imported?.kadoshContent) return;

    setCurrentDraft(imported.kadoshContent);
    setDraftHistory((prev) => [
      ...prev,
      {
        draft: imported.kadoshContent,
        note: 'Importado desde chat oficial',
        timestamp: new Date()
      }
    ]);

    const meta = imported.metadata || {};
    if (meta.titulo && !titulo) setTitulo(meta.titulo);
    if (meta.artista && !artista) setArtista(meta.artista);
    if (meta.tono && !tonalidad) setTonalidad(meta.tono);
    if (meta.forma && !formaAcordes) setFormaAcordes(meta.forma);
    if (meta.capo !== null && meta.capo !== undefined && String(capo) === '') {
      setCapo(String(meta.capo));
    }
    if (meta.youtubeUrl && !youtubeUrl) setYoutubeUrl(meta.youtubeUrl);

    setActiveTab('editor');
  };

  // Acción: Continuar preparando la canción (copia borrador actualizado al formulario de preparación)
  const handleContinuePreparing = () => {
    if (currentDraft.trim()) {
      setRawText(currentDraft);
    }
    if (modality === 'api_assistant') {
      chatInputRef.current?.focus();
    } else {
      additionalInstructionsRef.current?.focus();
    }
    notify('Borrador actualizado en el panel de preparación para continuar editando o cambiar de asistente.', { type: 'info' });
  };

  // Acción: Crear canción con este resultado (sin guardado automático)
  const handleCreateSong = () => {
    const pureLyrics = extractPureKadoshContent(currentDraft);
    if (!pureLyrics) {
      notify('Prepara o convierte la canción antes de enviarla a Crear Canción.', { type: 'warning' });
      return;
    }

    if (!hasPermission(user, PERMISSIONS.SONGS_CREATE)) {
      notify('No tienes permiso para crear canciones en el repertorio. Puedes copiar el resultado para compartirlo con el equipo.', { type: 'warning', duration: 7000 });
      return;
    }

    // Extraer metadatos inferidos si aún no se han rellenado
    const meta = extractMusicalMetadataFromText(pureLyrics);
    const resolvedTono =
      (tonalidad && normalizeKey(tonalidad))
      || meta.tono
      || (formaAcordes && capo !== '' ? transposeKey(normalizeKey(formaAcordes), Number(capo) || 0) : '')
      || (formaAcordes ? normalizeKey(formaAcordes) : '')
      || 'C';

    try {
      sessionStorage.setItem('kadosh_music_ai_draft', JSON.stringify({
        titulo: titulo || meta.titulo || '',
        artista: artista || meta.artista || '',
        tono: resolvedTono,
        bpm: meta.bpm || '',
        letraRaw: pureLyrics,
        youtubeUrl: youtubeUrl || meta.youtubeUrl || '',
        projectionStyle: { preset: selectedPreset, motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' }
      }));
    } catch (e) {
      console.warn('Error guardando en sessionStorage:', e);
    }

    navigate('/añadir');
  };

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          ENCABEZADO KADOSH MUSIC AI
      ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black text-white">KADOSH Music AI</h1>
                <span className="rounded-full border border-violet-500/30 bg-violet-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase text-violet-300">
                  V2.1 · Gemini & ChatGPT
                </span>
              </div>
              <p className="text-xs font-semibold text-zinc-400">
                Prepara letras, acordes y canciones usando tus chats oficiales de Gemini y ChatGPT o el conversor local
              </p>
            </div>
          </div>
        </div>

        {isOwnerUser(user) && (
          <button
            type="button"
            onClick={() => navigate('/equipo')}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/80 px-3.5 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <SlidersHorizontal size={14} /> Gestionar autorizaciones
          </button>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SELECTOR DE MODALIDADES
      ────────────────────────────────────────────────────────────── */}
      <div className={`grid grid-cols-1 gap-2 rounded-2xl border border-white/10 bg-zinc-950/70 p-2 ${IS_API_ASSISTANT_ENABLED ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <button
          type="button"
          onClick={() => setModality('official_chats')}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-left transition-colors ${
            modality === 'official_chats'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
              : 'bg-white/5 text-zinc-300 hover:bg-white/10'
          }`}
        >
          <MessageSquare size={16} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-wider">Chats oficiales</div>
            <div className="text-[10px] opacity-80 truncate">Gemini y ChatGPT (Modalidad principal)</div>
          </div>
        </button>

        {IS_API_ASSISTANT_ENABLED && (
          <button
            type="button"
            onClick={() => setModality('api_assistant')}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-left transition-colors ${
              modality === 'api_assistant'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'bg-white/5 text-zinc-300 hover:bg-white/10'
            }`}
          >
            <Sparkles size={16} className="shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-wider">Asistente integrado (API)</div>
              <div className="text-[10px] opacity-80 truncate">Opcional · Gemini API directo</div>
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={() => setModality('local_converter')}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-left transition-colors ${
            modality === 'local_converter'
              ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/25'
              : 'bg-white/5 text-zinc-300 hover:bg-white/10'
          }`}
        >
          <Cpu size={16} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-wider">Conversor local sin IA</div>
            <div className="text-[10px] opacity-80 truncate">Motor determinista KADOSH V2.1</div>
          </div>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          FORMULARIO DE PREPARACIÓN MUSICAL & YOUTUBE
      ────────────────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-white/10 bg-zinc-950/50 p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
              Título de la canción (Opcional)
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Cuan Grande es Dios"
              className="kp-input w-full rounded-xl p-2.5 text-xs font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
              Artista / Autor (Opcional)
            </label>
            <input
              type="text"
              value={artista}
              onChange={(e) => setArtista(e.target.value)}
              placeholder="Ej. En Espiritu y En Verdad"
              className="kp-input w-full rounded-xl p-2.5 text-xs font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1 flex items-center gap-1.5">
              <Video size={13} className="text-red-400" /> Enlace de YouTube de referencia
            </label>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="kp-input w-full rounded-xl p-2.5 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
              Tonalidad real
            </label>
            <input
              type="text"
              value={tonalidad}
              onChange={(e) => setTonalidad(e.target.value)}
              placeholder="Ej. Ab, G"
              className="kp-input w-full rounded-xl p-2 text-xs font-bold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
              Forma de acordes
            </label>
            <input
              type="text"
              value={formaAcordes}
              onChange={(e) => setFormaAcordes(e.target.value)}
              placeholder="Ej. G"
              className="kp-input w-full rounded-xl p-2 text-xs font-bold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
              Capo
            </label>
            <input
              type="number"
              min="0"
              max="11"
              value={capo}
              onChange={(e) => setCapo(e.target.value)}
              placeholder="Ej. 1"
              className="kp-input w-full rounded-xl p-2 text-xs font-bold"
            />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
              Indicaciones musicales adicionales
            </label>
            <input
              ref={additionalInstructionsRef}
              type="text"
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              placeholder="Ej. Repite el puente 3 veces, mantén forma G con capo 1..."
              className="kp-input w-full rounded-xl p-2 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Reproductor embebido de YouTube si existe enlace válido */}
      {youtubeVideoId && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3.5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-red-300 flex items-center gap-1.5">
              <Video size={14} /> Video de referencia para estructura y tono
            </span>
            <span className="text-[10px] text-zinc-400">
              Referencia oficial · No scraping ni descargas no autorizadas
            </span>
          </div>
          <div className="relative aspect-video max-h-56 w-full max-w-xl mx-auto overflow-hidden rounded-xl border border-white/10 shadow-lg">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}`}
              title="Referencia de YouTube"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          LAYOUT PRINCIPAL: PREPARACIÓN/CHATS (IZQUIERDA) + ESTUDIO (DERECHA)
      ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Columna Izquierda */}
        <div className="space-y-4 lg:col-span-5">
          {/* Área de letra y acordes originales (siempre accesible en chats oficiales/local o antes del borrador en API) */}
          {(modality !== 'api_assistant' || !currentDraft) && (
            <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                  <FileText size={14} /> Letra y acordes originales
                </span>
                <button
                  type="button"
                  onClick={handleAutoConvertRaw}
                  className="text-xs font-black text-violet-400 hover:text-violet-300 underline underline-offset-2"
                >
                  Convertir directamente
                </button>
              </div>
              <textarea
                rows={modality === 'official_chats' ? 6 : 7}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Pega aquí la letra con acordes de cualquier fuente..."
                className="kp-input w-full rounded-2xl p-3 font-mono text-xs leading-relaxed"
              />
              {modality === 'local_converter' && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleAutoConvertRaw}
                    className="w-full py-2.5 text-xs font-black uppercase rounded-xl flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white transition-colors"
                  >
                    <Cpu size={14} /> Convertir sin IA al formato KADOSH
                  </button>
                </div>
              )}
              {modality === 'api_assistant' && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleAutoConvertRaw}
                    className="kp-button-primary flex-1 py-2.5 text-xs font-black uppercase rounded-xl flex items-center justify-center gap-2"
                  >
                    <Sparkles size={14} /> Analizar y estructurar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MODALIDAD PRINCIPAL: CHATS OFICIALES (GEMINI & CHATGPT) */}
          {modality === 'official_chats' && (
            <OfficialChatsWorkspace
              user={user}
              titulo={titulo}
              artista={artista}
              tonalidad={tonalidad}
              formaAcordes={formaAcordes}
              capo={capo}
              youtubeUrl={youtubeUrl}
              rawText={rawText}
              currentDraft={currentDraft}
              additionalInstructions={additionalInstructions}
              onImportResult={handleImportExternalResult}
              notify={notify}
            />
          )}

          {/* MODALIDAD SECUNDARIA: CONVERSOR LOCAL DETALLADO */}
          {modality === 'local_converter' && (
            <div className="rounded-3xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-2 text-xs text-zinc-300">
              <div className="flex items-center gap-2 font-black uppercase text-sky-300">
                <Cpu size={14} /> Conversor Local Determinista (Sin IA)
              </div>
              <p className="leading-relaxed text-zinc-400">
                Convierte acordes colocados sobre líneas de letra al estándar inline <code className="text-sky-300">[C]</code>, normaliza encabezados <code className="text-sky-300"># Intro / # Verso / # Coro</code> y divide diapositivas sin consumir cuotas externas.
              </p>
            </div>
          )}

          {/* MODALIDAD OPCIONAL: ASISTENTE INTEGRADO MEDIANTE GEMINI API */}
          {IS_API_ASSISTANT_ENABLED && modality === 'api_assistant' && (
            <div className="flex flex-col h-[520px] rounded-3xl border border-white/10 bg-zinc-950/70 p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <div className="flex items-center gap-2">
                {engineStatus === 'gemini_connected' ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
                      Modo Gemini Conectado ({engineDetail?.model || 'gemini-3.8-flash'})
                    </span>
                  </>
                ) : engineStatus === 'quota_or_error' ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    <span className="text-xs font-black uppercase tracking-wider text-red-300">
                      Error de API / Cuota Agotada
                    </span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-sky-400" />
                    <span className="text-xs font-black uppercase tracking-wider text-sky-300">
                      Modo Conversor Local (Determinista)
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {(engineStatus === 'quota_or_error' || engineStatus === 'ready') && (
                  <button
                    type="button"
                    onClick={() => handleExecuteLocal('Conversión manual local')}
                    className="text-[10px] bg-sky-500/15 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-lg hover:bg-sky-500/30 transition-colors flex items-center gap-1 font-bold"
                  >
                    <Cpu size={10} /> Usar Local
                  </button>
                )}
                <span className="text-[10px] text-zinc-500 font-bold">KADOSH V2.1</span>
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl p-3.5 leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-violet-600 text-white rounded-tr-none'
                        : msg.source === 'gemini_error'
                        ? 'bg-red-950/40 border border-red-500/40 text-red-200 rounded-tl-none'
                        : msg.source === 'gemini'
                        ? 'bg-zinc-900 border border-violet-500/30 text-zinc-200 rounded-tl-none'
                        : 'bg-zinc-900 border border-white/10 text-zinc-200 rounded-tl-none'
                    }`}
                  >
                    {/* Badges del mensaje */}
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        {msg.source === 'gemini' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/20 px-2 py-0.5 text-[10px] font-black text-violet-300 border border-violet-500/30">
                            <Sparkles size={10} /> {msg.model || 'Gemini 3.8 Flash'}
                          </span>
                        ) : msg.source === 'deterministic_engine' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/20 px-2 py-0.5 text-[10px] font-black text-sky-300 border border-sky-500/30">
                            <Cpu size={10} /> Motor Determinista Local
                          </span>
                        ) : msg.source === 'gemini_error' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-red-500/20 px-2 py-0.5 text-[10px] font-black text-red-300 border border-red-500/30">
                            <AlertTriangle size={10} /> Error de Gemini API
                          </span>
                        ) : null}

                        {msg.youtubeAnalysis?.verified && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-300 border border-emerald-500/30">
                            <Video size={10} /> Video Verificado (Gemini Video Understanding)
                          </span>
                        )}

                        {msg.youtubeAnalysis?.mode === 'text_reference_fallback' && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-300 border border-amber-500/30">
                            <Video size={10} /> Ref. YouTube (Manual / Sin Video Directo)
                          </span>
                        )}
                      </div>
                    )}

                    <p className="whitespace-pre-wrap">{msg.text}</p>

                    {msg.canRunLocal && (
                      <div className="mt-3 pt-2.5 border-t border-red-500/20 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setModality('official_chats')}
                          className="text-xs font-black bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <MessageSquare size={12} /> Continuar en Chats Oficiales
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExecuteLocal(rawText || currentDraft)}
                          className="text-xs font-black bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Cpu size={12} /> Convertir con Motor Determinista Local
                        </button>
                      </div>
                    )}

                    {msg.kadoshContent && (
                      <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-violet-300">Borrador actualizado</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentDraft(msg.kadoshContent);
                            setActiveTab('editor');
                          }}
                          className="text-[10px] font-black text-white underline underline-offset-2 flex items-center gap-1"
                        >
                          Ver borrador <ArrowRight size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="mt-1 text-[9px] text-zinc-500 px-1">{msg.timestamp}</span>
                </div>
              ))}
              {isProcessing && (
                <div className="flex items-center gap-2 text-violet-400 text-xs font-bold py-2">
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Gemini está procesando la música...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Prompts Rápidos Sugeridos */}
            <div className="mt-2 pt-2 border-t border-white/10">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1.5">Instrucciones rápidas:</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleSendMessage(prompt)}
                    className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-violet-600 hover:text-white transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Input de Mensaje */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="mt-3 flex items-center gap-2"
            >
              <input
                ref={chatInputRef}
                type="text"
                value={currentPrompt}
                onChange={(e) => setCurrentPrompt(e.target.value)}
                placeholder="Escribe una instrucción (ej. 'Repite el puente 3 veces')..."
                className="kp-input flex-1 rounded-xl p-2.5 text-xs font-medium"
                disabled={isProcessing}
              />
              <button
                type="submit"
                disabled={isProcessing || !currentPrompt.trim()}
                className="kp-button-primary p-2.5 rounded-xl disabled:opacity-50 transition-colors"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
          )}
        </div>

        {/* Columna Derecha: Estudio KADOSH (Editor, Diapositivas, Acordes) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-4">
            {/* Pestañas de Vista */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setActiveTab('editor')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase transition-colors ${
                    activeTab === 'editor' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <FileText size={13} /> Editor KADOSH
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('slides')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase transition-colors ${
                    activeTab === 'slides' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Tv size={13} /> Diapositivas ({slidesList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('chords')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase transition-colors ${
                    activeTab === 'chords' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Music size={13} /> Músicos (Acordes)
                </button>
              </div>

              {/* Indicadores de Validación */}
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[11px] font-bold text-zinc-400">
                  {syntaxValidation.stats.sections} secciones · {syntaxValidation.stats.chords} acordes
                  {syntaxValidation.stats.repeats > 0 ? ` · ${syntaxValidation.stats.repeats} repeticiones` : ''}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                    syntaxValidation.valid
                      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {syntaxValidation.valid ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                  {syntaxValidation.valid ? 'V2.1 Válido' : 'Revisar'}
                </span>
              </div>
            </div>

            {/* TAB 1: Editor de Texto KADOSH */}
            {activeTab === 'editor' && (
              <div className="mt-4 space-y-3">
                <textarea
                  rows={15}
                  value={currentDraft}
                  onChange={(e) => setCurrentDraft(e.target.value)}
                  placeholder="# Intro&#10;[G] [D] [Em] [C]&#10;&#10;# Verso 1&#10;Tu [G]fidelidad es [D]grande"
                  className="kp-input w-full rounded-2xl p-4 font-mono text-xs leading-relaxed"
                />

                {syntaxValidation.issues.length > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-bold text-amber-200">
                    <ul className="list-disc pl-4 space-y-1">
                      {syntaxValidation.issues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Vista Previa de Diapositivas (Proyector) */}
            {activeTab === 'slides' && (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-400">
                    Diapositiva {currentSlideIndex + 1} de {slidesList.length || 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-zinc-400">Preset:</label>
                    <select
                      value={selectedPreset}
                      onChange={(e) => setSelectedPreset(e.target.value)}
                      className="kp-input rounded-lg px-2 py-1 text-xs font-bold"
                    >
                      {Object.entries(PROJECTION_STYLE_PRESETS).map(([k, p]) => (
                        <option key={k} value={k}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Pantalla Simulada del Proyector */}
                <div className="relative aspect-video w-full rounded-2xl border border-white/10 bg-zinc-950 p-6 flex flex-col justify-center items-center text-center shadow-2xl overflow-hidden">
                  {slidesList[currentSlideIndex] ? (
                    <div className={`projection-preset-${selectedPreset} space-y-2 max-w-xl`}>
                      <p className="text-[10px] font-black uppercase tracking-widest text-violet-400 opacity-70">
                        {slidesList[currentSlideIndex].sectionTitle}
                        {slidesList[currentSlideIndex].repeatCount >= 2 ? ` · ${slidesList[currentSlideIndex].repeatCount}x` : ''}
                      </p>
                      {slidesList[currentSlideIndex].lines.map((line, lIdx) => (
                        <p key={lIdx} className="text-xl md:text-2xl font-black text-white leading-snug">
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-zinc-500 font-bold text-sm">No hay diapositivas generadas</p>
                  )}
                </div>

                {/* Controles de diapositiva */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={currentSlideIndex === 0}
                    onClick={() => setCurrentSlideIndex((prev) => Math.max(0, prev - 1))}
                    className="kp-button-secondary rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-xs font-bold text-zinc-500">
                    Navega para simular la proyección
                  </span>
                  <button
                    type="button"
                    disabled={currentSlideIndex >= slidesList.length - 1}
                    onClick={() => setCurrentSlideIndex((prev) => Math.min(slidesList.length - 1, prev + 1))}
                    className="kp-button-secondary rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: Acordes para Músicos */}
            {activeTab === 'chords' && (
              <div className="mt-4 space-y-4 max-h-[460px] overflow-y-auto pr-2">
                {parsedSections.map((section, sIdx) => (
                  <div key={sIdx} className="rounded-2xl border border-white/10 bg-black/40 p-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-violet-400 mb-2">
                      # {section.titulo}
                    </h4>
                    <div className="space-y-3 font-mono text-xs">
                      {(section.lineas || []).map((line, lIdx) => {
                        if (!line || line.length === 0) return <div key={lIdx} className="h-2" />;
                        return (
                          <div key={lIdx} className="flex flex-wrap items-end gap-x-2 gap-y-1">
                            {line.map((word, wIdx) => (
                              <div key={wIdx} className="inline-flex flex-col">
                                <span className="font-bold text-emerald-400 text-[11px] h-4">
                                  {word.map((t) => t.acorde || '').join(' ') || '\u00A0'}
                                </span>
                                <span className="text-zinc-200">
                                  {word.map((t) => t.texto).join('')}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Barra de Acciones Principales */}
            <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyKadosh}
                  className="kp-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase transition-colors"
                  title="Copia exclusivamente el bloque compatible con KADOSH"
                >
                  <Copy size={14} /> Copiar bloque KADOSH
                </button>
                <button
                  type="button"
                  disabled={draftHistory.length <= 1}
                  onClick={handleUndoDraft}
                  className="kp-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-400 hover:text-white disabled:opacity-40"
                  title="Revertir a la versión anterior"
                >
                  <RotateCcw size={14} /> Deshacer cambios
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleContinuePreparing}
                  className="kp-button-secondary rounded-xl px-3.5 py-2.5 text-xs font-bold text-zinc-300"
                >
                  Continuar preparando la canción
                </button>
                <button
                  type="button"
                  onClick={handleCreateSong}
                  className="kp-button-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase shadow-lg shadow-violet-600/30"
                  title="Abre el formulario oficial de Crear Canción con estos datos precargados"
                >
                  <PlusCircle size={15} /> Crear canción con este resultado
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MusicAI;

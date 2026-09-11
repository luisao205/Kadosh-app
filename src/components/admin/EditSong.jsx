import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, onSnapshot, addDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../config/firebase';
import { Save, ArrowLeft, Edit3, AlertCircle, X } from 'lucide-react';
import { detectarTonoDesdeAcordes } from '../../utils/musicCore';
import { uploadToCloudinary } from '../../utils/cloudinaryUpload';
import { getSectionKey, parsearCancion } from '../../utils/songParser';
import { MEDIA_LIBRARY_COLLECTION, MEDIA_PROVIDERS, createMediaReference, detectMediaProvider, detectMediaTypeFromUrl } from '../../utils/mediaLibrary';
import { calculateMediaUsageFields, createOrReuseMediaLibraryResource } from '../../utils/mediaLibraryFirestoreSync';
import { getSongQualityBadges } from '../../utils/songQuality';
import { parseSingerTones } from '../../utils/songAssignments';
import SectionMediaManager from './SectionMediaManager';
import SongMetadataForm from './SongMetadataForm';
import SongResourcesPanel from './SongResourcesPanel';
import { useFeedback } from '../ui/FeedbackProvider';

const ETIQUETAS_DISPONIBLES = ['Júbilo', 'Adoración', 'Acústico', 'Navidad', 'Ministración', 'Especial'];
const INSTRUMENTOS_RECURSOS = ['General', 'Voz Principal', 'Coros', 'Batería', 'Piano', 'Bajo', 'Guitarra Acústica', 'Guitarra Eléctrica', 'Percusión'];
const TONOS_DISPONIBLES = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
const CUE_PRESETS = ['Subida', 'Entra batería', 'Solo voces', 'Todos juntos', 'Corte', 'Baja dinámica', 'Repetir coro', 'Final suave'];

const normalizeKey = (value, fallback = 'C') => {
  const clean = String(value || '').trim();
  const match = TONOS_DISPONIBLES.find(t => t.toLowerCase() === clean.toLowerCase());
  return match || clean || fallback;
};


const sortObjectKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = sortObjectKeys(value[key]);
    return acc;
  }, {});
};

const normalizeEditableSongState = (state = {}) => ({
  titulo: String(state.titulo || '').trim(),
  artista: String(state.artista || '').trim(),
  bpm: Number(state.bpm) || 0,
  tonoOriginal: normalizeKey(state.tonoOriginal || state.tono || ''),
  etiquetas: Array.isArray(state.etiquetas) ? [...state.etiquetas] : [],
  recursos: sortObjectKeys(Array.isArray(state.recursos) ? state.recursos : []),
  multitracks: sortObjectKeys(Array.isArray(state.multitracks) ? state.multitracks : []),
  sectionMedia: sortObjectKeys(state.sectionMedia && typeof state.sectionMedia === 'object' ? state.sectionMedia : {}),
  tonosCantantes: sortObjectKeys(state.tonosCantantes && typeof state.tonosCantantes === 'object' ? state.tonosCantantes : {}),
  letraRaw: String(state.letraRaw || ''),
  audioUrl: String(state.audioUrl || ''),
  audioFile: state.audioFile ? {
    name: state.audioFile.name || '',
    size: state.audioFile.size || 0,
    type: state.audioFile.type || ''
  } : null,
  youtubeUrl: String(state.youtubeUrl || ''),
  fondoUrl: String(state.fondoUrl || ''),
  fondoMediaId: String(state.fondoMediaId || '')
});

const stringifySongState = (state) => JSON.stringify(normalizeEditableSongState(state));

const EditSong = ({ user }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || '/canciones';
  const { notify } = useFeedback();

  const [titulo, setTitulo] = useState('');
  const [artista, setArtista] = useState('');
  const [bpm, setBpm] = useState('');
  const [tono, setTono] = useState('');
  const [etiquetas, setEtiquetas] = useState([]);
  const [recursos, setRecursos] = useState([]); // [{id, titulo, tipo: 'youtube'|'link'|'pdf', url, instrumento}]
  const [nuevoRecurso, setNuevoRecurso] = useState({ titulo: '', url: '', tipo: 'youtube', instrumento: 'General' });
  const [sectionMedia, setSectionMedia] = useState({});
  const [sectionMediaDrafts, setSectionMediaDrafts] = useState({});
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
  const [fondoMediaId, setFondoMediaId] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [showSingerModal, setShowSingerModal] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [isSavingAndExiting, setIsSavingAndExiting] = useState(false);


  const audioRef = useRef(null);
  const initialSongStateRef = useRef(null);
  const pendingMediaUsageRef = useRef([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  const formatoAcordes = user?.preferencias?.formatoAcordes || 'american';
  const notacion = user?.preferencias?.notacion || 'sharps';
  const detectedKey = useMemo(() => detectarTonoDesdeAcordes(letraRaw), [letraRaw]);
  const parsedSections = useMemo(() => parsearCancion(letraRaw), [letraRaw]);
  const currentEditableState = useMemo(() => ({
    titulo,
    artista,
    bpm,
    tonoOriginal: tono,
    etiquetas,
    recursos,
    multitracks,
    sectionMedia,
    tonosCantantes,
    letraRaw,
    audioUrl,
    audioFile,
    youtubeUrl,
    fondoUrl,
    fondoMediaId
  }), [titulo, artista, bpm, tono, etiquetas, recursos, multitracks, sectionMedia, tonosCantantes, letraRaw, audioUrl, audioFile, youtubeUrl, fondoUrl, fondoMediaId]);
  const currentEditableSnapshot = useMemo(() => stringifySongState(currentEditableState), [currentEditableState]);
  const isDirty = Boolean(initialSongStateRef.current && initialSongStateRef.current !== currentEditableSnapshot);
  const showToast = (message, type = 'error') => notify(message, { type });

  // Cargar cantantes desde el equipo
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'usuarios'), (snap) => {
      const users = snap.docs.map(doc => doc.data());
      const singers = users.filter(u => u.instrumentos?.includes('Voz Principal') || u.instrumentos?.includes('Coros'));
      setCantantesDisponibles(singers.map(s => s.nombre));
    });
    return () => unsub();
  }, []);

  // Cargar los datos de la cancion al abrir la pantalla
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
          setSectionMedia(data.sectionMedia || {});
          pendingMediaUsageRef.current = [];
          setLetraRaw(data.letraRaw || '');
          setAudioUrl(data.audioUrl || '');
          setYoutubeUrl(data.youtubeUrl || '');
          setFondoUrl(data.fondoUrl || '');
          setFondoMediaId(data.fondoMediaId || '');

          if (data.tonosAlternativos || data.tonosPorCantante) {
            const parsed = parseSingerTones(data.tonosPorCantante || data.tonosAlternativos);
            setTonosCantantes(parsed);
            initialSongStateRef.current = stringifySongState({
              titulo: data.titulo || '',
              artista: data.artista || '',
              bpm: data.bpm || '',
              tonoOriginal: data.tonoOriginal || '',
              etiquetas: data.etiquetas || [],
              multitracks: data.multitracks || [],
              recursos: data.recursos || [],
              sectionMedia: data.sectionMedia || {},
              tonosCantantes: parsed,
              letraRaw: data.letraRaw || '',
              audioUrl: data.audioUrl || '',
              audioFile: null,
              youtubeUrl: data.youtubeUrl || '',
              fondoUrl: data.fondoUrl || '',
              fondoMediaId: data.fondoMediaId || ''
            });
          } else {
            initialSongStateRef.current = stringifySongState({
              titulo: data.titulo || '',
              artista: data.artista || '',
              bpm: data.bpm || '',
              tonoOriginal: data.tonoOriginal || '',
              etiquetas: data.etiquetas || [],
              multitracks: data.multitracks || [],
              recursos: data.recursos || [],
              sectionMedia: data.sectionMedia || {},
              tonosCantantes: {},
              letraRaw: data.letraRaw || '',
              audioUrl: data.audioUrl || '',
              audioFile: null,
              youtubeUrl: data.youtubeUrl || '',
              fondoUrl: data.fondoUrl || '',
              fondoMediaId: data.fondoMediaId || ''
            });
          }
        } else {
          showToast("La cancion no existe");
          setTimeout(() => navigate(returnTo), 1500);
        }
      } catch (error) {
        console.error("Error al cargar la cancion:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSong();
  }, [id, navigate]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

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
      mensaje: `Se añadió un nuevo recurso en la cancion "${titulo}".`,
      destinatarios: nuevoRecurso.instrumento === 'General' ? ['all'] : [nuevoRecurso.instrumento],
      emisorId: user?.uid,
      fechaCreacion: new Date().toISOString()
    }).catch(e => console.error(e));
  };

  const removeRecurso = (id) => {
    setRecursos(recursos.filter(r => r.id !== id));
  };

  const getSectionDraft = (sectionKey) => sectionMediaDrafts[sectionKey] || { title: '', type: 'link', url: '' };

  const updateSectionDraft = (sectionKey, updates) => {
    setSectionMediaDrafts(prev => ({
      ...prev,
      [sectionKey]: { ...getSectionDraft(sectionKey), ...updates }
    }));
  };

  const buildSectionMediaUsage = (sectionKey, sectionTitle) => ({
    songId: id,
    songTitle: titulo || 'Cancion sin titulo',
    location: 'section',
    sectionKey,
    sectionTitle: sectionTitle || sectionKey
  });

  const queueMediaLibraryUsage = (mediaResource, usage, action = 'add') => {
    const mediaId = mediaResource?.mediaId || mediaResource?.id;
    if (!mediaId || mediaResource?.source !== 'library') return;

    pendingMediaUsageRef.current = [
      ...pendingMediaUsageRef.current,
      {
        mediaResource: {
          ...mediaResource,
          id: mediaId,
          mediaId,
          source: 'library'
        },
        usage,
        action
      }
    ];
  };

  const updateMediaLibraryUsage = async (mediaResource, usage, action = 'add') => {
    const mediaId = mediaResource?.mediaId || mediaResource?.id;
    if (!mediaId || mediaResource?.source !== 'library') return;

    try {
      const mediaRef = doc(db, MEDIA_LIBRARY_COLLECTION, mediaId);
      const mediaSnap = await getDoc(mediaRef);
      if (!mediaSnap.exists()) {
        throw new Error(`media_not_found:${mediaId}`);
      }

      const data = mediaSnap.data() || {};
      const usageFields = calculateMediaUsageFields(data.usedBy, usage, action);

      await updateDoc(mediaRef, {
        ...usageFields,
        firstUsedAt: data.firstUsedAt || usageFields.firstUsedAt
      });
    } catch (error) {
      console.error('Error actualizando uso de mediaLibrary:', error);
      showToast('No se pudo actualizar el uso en Biblioteca Multimedia.');
      throw error;
    }
  };

  const createSectionMediaReference = (media, usageDelta = 0, existingId = null) => ({
    ...createMediaReference(media),
    id: existingId || `library_${media.mediaId || media.id || Date.now()}_${Date.now()}`,
    mediaId: media.mediaId || media.id || null,
    title: media.title || media.name || 'Recurso multimedia',
    source: 'library',
    usageCount: (Number.isFinite(media.usageCount) ? media.usageCount : 0) + usageDelta,
    usedBy: Array.isArray(media.usedBy) ? media.usedBy : [],
    createdAt: new Date().toISOString()
  });

  const createPendingSectionMediaReference = (resource, sectionTitle = '') => ({
    id: `pending_library_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    mediaId: null,
    title: resource.title || 'Recurso multimedia',
    name: resource.title || 'Recurso multimedia',
    type: resource.type || 'link',
    url: resource.url || '',
    thumbnailUrl: resource.thumbnailUrl || '',
    provider: resource.provider || detectMediaProvider(resource.url),
    source: 'pending-library',
    usageCount: 0,
    usedBy: [],
    sectionTitle,
    pendingLibraryResource: resource,
    createdAt: new Date().toISOString()
  });

  const resolvePendingSectionMediaForSave = async (currentSectionMedia = {}) => {
    const resolvedSectionMedia = {};
    const usageChanges = [];

    for (const [sectionKey, resources] of Object.entries(currentSectionMedia || {})) {
      resolvedSectionMedia[sectionKey] = [];

      for (const resource of (Array.isArray(resources) ? resources : [])) {
        if (resource?.source !== 'pending-library' || !resource.pendingLibraryResource) {
          resolvedSectionMedia[sectionKey].push(resource);
          continue;
        }

        const usage = buildSectionMediaUsage(sectionKey, resource.sectionTitle || sectionKey);
        const { media } = await createOrReuseMediaLibraryResource(resource.pendingLibraryResource, {
          firestore: db,
          now: Date.now(),
          userId: user?.uid || null
        });
        const resolvedResource = createSectionMediaReference({
          ...media,
          id: media.id,
          mediaId: media.mediaId || media.id
        }, 0, resource.id);

        resolvedSectionMedia[sectionKey].push(resolvedResource);
        usageChanges.push({
          mediaResource: { ...resolvedResource, id: resolvedResource.mediaId },
          usage,
          action: 'add'
        });
      }
    }

    return { resolvedSectionMedia, usageChanges };
  };

  const flushPendingMediaUsage = async (extraChanges = []) => {
    const changes = [...pendingMediaUsageRef.current, ...extraChanges];
    if (!changes.length) return;

    for (const change of changes) {
      await updateMediaLibraryUsage(change.mediaResource, change.usage, change.action);
    }

    pendingMediaUsageRef.current = [];
  };

  const handleSelectLibrarySectionMedia = async ({ sectionKey, sectionTitle, replaceResourceId = null, media }) => {
    if (!sectionKey || !media) return;

    const usage = buildSectionMediaUsage(sectionKey, sectionTitle);
    const nextResource = createSectionMediaReference(media, 1);
    const previousResource = replaceResourceId
      ? (sectionMedia[sectionKey] || []).find(resource => resource.id === replaceResourceId)
      : null;

    setSectionMedia(prev => ({
      ...prev,
      [sectionKey]: replaceResourceId
        ? (prev[sectionKey] || []).map(resource => resource.id === replaceResourceId ? nextResource : resource)
        : [...(prev[sectionKey] || []), nextResource]
    }));

    if (previousResource?.mediaId) {
      queueMediaLibraryUsage(previousResource, usage, 'remove');
    }
    queueMediaLibraryUsage({ ...nextResource, id: nextResource.mediaId }, usage, 'add');

    showToast('Recurso de Biblioteca asignado a la seccion.', 'success');
  };

  const addSectionMediaResource = async (sectionKey, sectionTitle = sectionKey) => {
    const draft = getSectionDraft(sectionKey);
    if (!draft.title || !draft.url) {
      showToast("Título y URL son obligatorios para el recurso de seccion.");
      return;
    }

    showToast("Preparando URL para Biblioteca...", "info");
    setIsSaving(true);
    try {
      const url = draft.url.trim();
      const mediaType = draft.type && draft.type !== 'link' ? draft.type : detectMediaTypeFromUrl(url);
      const resource = createPendingSectionMediaReference({
        title: draft.title.trim(),
        type: mediaType,
        url,
        thumbnailUrl: '',
        provider: detectMediaProvider(url),
        source: 'url',
        category: 'Secciones',
        metadata: {
          mimeType: null,
          thumbnail: null
        }
      }, sectionTitle);

      setSectionMedia(prev => ({
        ...prev,
        [sectionKey]: [...(prev[sectionKey] || []), resource]
      }));
      setSectionMediaDrafts(prev => ({ ...prev, [sectionKey]: { title: '', type: 'link', url: '' } }));
      showToast("URL preparada. Se guardará en Biblioteca al guardar la cancion.", "success");
    } catch (error) {
      console.error("Error agregando URL a mediaLibrary:", error);
      showToast("Error al agregar la URL a Biblioteca Multimedia.");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadSectionMediaResource = async (sectionKey, file, sectionTitle = sectionKey) => {
    if (!file) return;
    const draft = getSectionDraft(sectionKey);
    const fileType = file.type?.startsWith('video/')
      ? 'video'
      : file.type?.startsWith('audio/')
        ? 'audio'
        : file.type === 'application/pdf'
          ? 'pdf'
          : file.type?.startsWith('image/')
            ? 'image'
            : 'link';

    showToast("Subiendo recurso de seccion...", "info");
    setIsSaving(true);
    try {
      const uploaded = await uploadToCloudinary(file, 'kadosh/section-media');
      const mediaTitle = (draft.title || file.name).trim();
      const resource = createPendingSectionMediaReference({
        title: mediaTitle,
        type: fileType,
        url: uploaded.url,
        thumbnailUrl: uploaded.thumbnailUrl || '',
        provider: MEDIA_PROVIDERS.CLOUDINARY,
        source: 'upload',
        folder: 'kadosh/section-media',
        category: 'Secciones',
        cloudinaryPublicId: uploaded.publicId,
        cloudinaryResourceType: uploaded.type,
        metadata: {
          size: uploaded.bytes || file.size || null,
          mimeType: file.type || null,
          width: uploaded.width || null,
          height: uploaded.height || null,
          duration: uploaded.duration || null,
          thumbnail: uploaded.thumbnailUrl || null
        }
      }, sectionTitle);

      setSectionMedia(prev => ({
        ...prev,
        [sectionKey]: [...(prev[sectionKey] || []), resource]
      }));
      setSectionMediaDrafts(prev => ({ ...prev, [sectionKey]: { title: '', type: 'link', url: '' } }));
      showToast("Recurso subido y preparado. Se guardará en Biblioteca al guardar la cancion.", "success");
    } catch (err) {
      console.error("Error subiendo recurso de seccion:", err);
      showToast("Error al subir el recurso de seccion.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateSectionMediaResource = (sectionKey, resourceId, updates) => {
    setSectionMedia(prev => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).map(resource => (
        resource.id === resourceId ? { ...resource, ...updates } : resource
      ))
    }));
  };

  const removeSectionMediaResource = async (sectionKey, resourceId, sectionTitle = sectionKey) => {
    const resourceToRemove = (sectionMedia[sectionKey] || []).find(resource => resource.id === resourceId);
    setSectionMedia(prev => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).filter(resource => resource.id !== resourceId)
    }));

    if (resourceToRemove?.mediaId) {
      queueMediaLibraryUsage(resourceToRemove, buildSectionMediaUsage(sectionKey, sectionTitle), 'remove');
    }
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
        mensaje: `Se subió un PDF para la cancion "${titulo}".`,
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

  const handleFondoUrlChange = (value) => {
    setFondoUrl(value);
    setFondoMediaId('');
  };

  const handleUploadFondo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast("Subiendo fondo de proyección...", "info");
    setIsSaving(true);
    try {
      const uploaded = await uploadToCloudinary(file, 'kadosh/song-backgrounds');
      const { media } = await createOrReuseMediaLibraryResource({
        title: file.name || (titulo ? `Fondo - ${titulo}` : 'Fondo de cancion'),
        type: uploaded.type || (file.type?.startsWith('video/') ? 'video' : 'image'),
        url: uploaded.url,
        thumbnailUrl: uploaded.thumbnailUrl || '',
        provider: MEDIA_PROVIDERS.CLOUDINARY,
        source: 'song_background',
        folder: 'kadosh/song-backgrounds',
        category: 'Fondos',
        cloudinaryPublicId: uploaded.publicId,
        cloudinaryResourceType: uploaded.type,
        metadata: {
          size: uploaded.bytes || file.size || null,
          mimeType: file.type || null,
          width: uploaded.width || null,
          height: uploaded.height || null,
          duration: uploaded.duration || null,
          thumbnail: uploaded.thumbnailUrl || null
        }
      }, {
        firestore: db,
        now: Date.now(),
        userId: user?.uid || null
      });
      setFondoUrl(uploaded.url);
      setFondoMediaId(media.mediaId || media.id || '');
      showToast("¡Fondo de proyector subido y registrado en Biblioteca!", "success");
    } catch (err) {
      console.error("Error subiendo fondo:", err);
      showToast("Error al subir el fondo.");
    } finally {
      setIsSaving(false);
      e.target.value = '';
    }
  };

  const requestExit = () => {
    if (isDirty) {
      setShowUnsavedModal(true);
      return;
    }
    navigate(returnTo);
  };

  const handleSave = async ({ navigateOnSuccess = true } = {}) => {
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

      const {
        resolvedSectionMedia,
        usageChanges: resolvedMediaUsageChanges
      } = await resolvePendingSectionMediaForSave(sectionMedia);

      const docRef = doc(db, 'canciones', id);
      const savedData = {
        titulo,
        artista,
        tonoOriginal: tonoNormalizado,
        etiquetas,
        multitracks,
        recursos,
        sectionMedia: resolvedSectionMedia,
        tonosAlternativos: tonosAlternativosStr,
        bpm: Number(bpm) || 0,
        letraRaw,
        audioUrl: newAudioUrl,
        youtubeUrl,
        fondoUrl,
        fondoMediaId: fondoMediaId || null,
        fechaActualizacion: new Date().toISOString()
      };
      await updateDoc(docRef, savedData);
      try {
        await flushPendingMediaUsage(resolvedMediaUsageChanges);
      } catch (usageError) {
        console.error('La canción fue guardada, pero falló la sincronización de uso multimedia:', usageError);
        showToast("La canción se guardó, pero no se pudo actualizar Biblioteca Multimedia. Vuelve a guardar para reintentar.");
        return false;
      }

      if (stemsNuevosCount > 0) {
        await addDoc(collection(db, 'notificaciones'), {
          titulo: `🎶 Pistas Actualizadas: ${titulo}`,
          mensaje: `Se han añadido ${stemsNuevosCount} pistas/secuencias nuevas a esta cancion.`,
          destinatarios: ['all'],
          emisorId: user?.uid,
          fechaCreacion: new Date().toISOString()
        });
      }

      setAudioUrl(newAudioUrl);
      setAudioFile(null);
      setSectionMedia(resolvedSectionMedia);
      setStemsNuevosCount(0);
      initialSongStateRef.current = stringifySongState({
        ...savedData,
        tonosCantantes,
        audioFile: null
      });

      showToast("¡Cancion actualizada exitosamente!", "success");
      if (navigateOnSuccess) {
        setTimeout(() => navigate(returnTo), 1500); // Volver al origen tras leer el mensaje
      }
      return true;
    } catch (error) {
      console.error("Error al actualizar en Firebase:", error);
      showToast("Error al actualizar la cancion.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndExit = async () => {
    if (isSaving || isSavingAndExiting) return;
    setIsSavingAndExiting(true);
    try {
      const saved = await handleSave({ navigateOnSuccess: true });
      if (saved === true) setShowUnsavedModal(false);
    } finally {
      setIsSavingAndExiting(false);
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
    return <div className="flex justify-center items-center h-64 text-zinc-500 font-bold animate-pulse">Cargando cancion...</div>;
  }

  if (user?.rol === 'musico') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-zinc-900">Acceso Denegado</h2>
        <p className="text-zinc-500 mt-2">Los musicos no tienen permisos para editar canciones.</p>
      </div>
    );
  }

  // Juntamos los cantantes activos con los que ya estaban guardados por si alguno se eliminó del equipo
  const allSingers = Array.from(new Set([...cantantesDisponibles, ...Object.keys(tonosCantantes)]));
  const qualityBadges = getSongQualityBadges({
    titulo,
    tonoOriginal: tono,
    letraRaw,
    recursos,
    sectionMedia,
    fondoUrl
  });

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-500">
      <header className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-zinc-950/45 p-5 md:p-6 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-2xl">
            <Edit3 size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Editar Cancion</h1>
          <p className="text-zinc-400 mt-1 text-sm font-medium">Gestiona contenido, tonos, pistas de audio y recursos de ensayo.</p>
          </div>
        </div>
        <button onClick={requestExit} className="kp-button-secondary flex w-full md:w-auto justify-center items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors active:scale-95">
          <ArrowLeft size={16} />
          Volver
        </button>
      </header>

      <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border p-4 ${
        isDirty
          ? 'border-amber-500/25 bg-amber-500/10 text-amber-100'
          : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
      }`}>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em]">
            {isDirty ? 'Cambios sin guardar' : 'Todos los cambios guardados'}
          </p>
          <p className="mt-1 text-xs font-semibold opacity-80">
            {isDirty
              ? 'Guarda antes de salir para no perder los cambios de esta cancion.'
              : 'El contenido actual coincide con la ultima version guardada.'}
          </p>
        </div>
        {isDirty && (
          <button
            type="button"
            onClick={() => handleSave({ navigateOnSuccess: false })}
            disabled={isSaving}
            className="rounded-2xl bg-amber-500 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Guardando...' : 'Guardar ahora'}
          </button>
        )}
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-2 rounded-3xl border border-white/10 bg-zinc-950/35 p-4">
        <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Estado de calidad</span>
        {qualityBadges.map(badge => (
          <span
            key={badge.label}
            className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
              badge.tone === 'success'
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                : badge.tone === 'warning'
                  ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                  : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400'
            }`}
          >
            {badge.label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Metadatos */}
        <div className="kp-card p-6 rounded-3xl h-fit grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SongMetadataForm
              titulo={titulo}
              onTituloChange={setTitulo}
              artista={artista}
              onArtistaChange={setArtista}
              tono={tono}
              onTonoChange={setTono}
              bpm={bpm}
              onBpmChange={setBpm}
              etiquetas={etiquetas}
              onToggleEtiqueta={(tag) => setEtiquetas(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
              tonosCantantes={tonosCantantes}
              onOpenSingerModal={() => setShowSingerModal(true)}
              tonosDisponibles={TONOS_DISPONIBLES}
              etiquetasDisponibles={ETIQUETAS_DISPONIBLES}
              detectedKey={detectedKey}
              normalizeKey={normalizeKey}
              formatoAcordes={formatoAcordes}
              notacion={notacion}
            />

            <SongResourcesPanel
              audioUrl={audioUrl}
              audioRef={audioRef}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              volume={volume}
              isMuted={isMuted}
              onToggleAudio={toggleAudio}
              onSeek={handleSeek}
              onVolumeChange={handleVolumeChange}
              onToggleMute={toggleMute}
              onAudioFileChange={(e) => setAudioFile(e.target.files[0])}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => setDuration(e.target.duration)}
              onAudioEnded={() => setIsPlaying(false)}
              multitracks={multitracks}
              nombreStem={nombreStem}
              onNombreStemChange={setNombreStem}
              customStemName={customStemName}
              onCustomStemNameChange={setCustomStemName}
              onUploadStem={handleUploadStem}
              onRemoveStem={removeStem}
              fondoUrl={fondoUrl}
              onFondoUrlChange={handleFondoUrlChange}
              onUploadFondo={handleUploadFondo}
              recursos={recursos}
              nuevoRecurso={nuevoRecurso}
              onNuevoRecursoChange={setNuevoRecurso}
              onAddRecurso={handleAddRecurso}
              onUploadPDF={handleUploadPDF}
              onRemoveRecurso={removeRecurso}
              instrumentosRecursos={INSTRUMENTOS_RECURSOS}
              isSaving={isSaving}
              formatTime={formatTime}
            />

            <SectionMediaManager
              sections={parsedSections}
              sectionMedia={sectionMedia}
              isSaving={isSaving}
              getSectionKey={getSectionKey}
              getSectionDraft={getSectionDraft}
              updateSectionDraft={updateSectionDraft}
              onSelectLibraryResource={handleSelectLibrarySectionMedia}
              onAddUrlResource={addSectionMediaResource}
              onUploadResource={uploadSectionMediaResource}
              onUpdateResource={updateSectionMediaResource}
              onRemoveResource={removeSectionMediaResource}
            />

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
              <span>Estructura de la Cancion</span>
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

      {showUnsavedModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 p-6 text-white shadow-2xl">
            <div className="mb-5 flex items-start gap-3">
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-amber-200">
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black">Cambios sin guardar</h3>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-zinc-400">
                  Hay cambios en esta cancion que todavia no se han guardado.
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setShowUnsavedModal(false)}
                className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-xs font-black uppercase text-zinc-300 hover:bg-zinc-800"
              >
                Seguir editando
              </button>
              <button
                type="button"
                onClick={() => navigate(returnTo)}
                className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs font-black uppercase text-red-100 hover:bg-red-500/20"
              >
                Salir sin guardar
              </button>
              <button
                type="button"
                onClick={handleSaveAndExit}
                disabled={isSaving || isSavingAndExiting}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingAndExiting ? 'Guardando...' : 'Guardar y salir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}

    </div>
  );
};

export default EditSong;


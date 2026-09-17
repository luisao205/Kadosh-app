import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { ArrowDown, ArrowUp, BookOpen, Calendar, CheckCircle2, Eye, FileText, Image as ImageIcon, Lock, MessageSquare, Plus, Save, Search, User, Video, X } from 'lucide-react';
import { db } from '../../config/firebase';
import { ACCOUNT_STATUSES, normalizeAccountStatus } from '../../utils/accountStatus';
import { canCreatePreaching, canManageAnyPreaching, canUsePreachingMedia, isAdmin, isMultimedia, isOwner, isPastor, isPreacherLegacy, normalizeRole } from '../../utils/rolePermissions';
import { formatEventDate } from '../../utils/dateUtils';
import { useNavigationGuard } from '../../utils/navigationGuard';
import { MEDIA_LIBRARY_COLLECTION, MEDIA_TYPES } from '../../utils/mediaLibrary';
import { calculateMediaUsageFields } from '../../utils/mediaLibraryFirestoreSync';
import { useFeedback } from '../ui/FeedbackProvider';
import BiblePicker from '../bible/BiblePicker';
import MediaPicker from '../media/MediaPicker';
import MediaLibraryUploadButton from '../media/MediaLibraryUploadButton';
import { MEDIA_LIBRARY_ACTIONS, canPerformMediaLibraryAction } from '../../utils/mediaLibraryPermissions';
import { getMediaTypeLabel } from '../media/mediaDisplay';
import { splitPassageIntoSlides } from '../../utils/bibleService';
import useMediaLibrary from '../../hooks/useMediaLibrary';

const EXTERNAL_PREACHER_VALUE = '__external__';

const PREACHING_STATUSES = [
  { value: 'draft', label: 'Borrador', className: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20' },
  { value: 'ready', label: 'Lista', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  { value: 'live', label: 'En vivo', className: 'bg-red-500/10 text-red-300 border-red-500/20' },
  { value: 'finished', label: 'Finalizada', className: 'bg-blue-500/10 text-blue-300 border-blue-500/20' }
];

const BLOCK_TYPES = {
  point: { label: 'Punto', icon: FileText },
  subpoint: { label: 'Subpunto', icon: MessageSquare },
  verse: { label: 'Versiculo', icon: BookOpen },
  note: { label: 'Nota', icon: Lock },
  mediaInstruction: { label: 'Multimedia', icon: Video }
};

const NOTE_VISIBILITY = [
  { value: 'shared', label: 'Compartida' },
  { value: 'preacher_only', label: 'Solo Pastor' }
];

const emptyForm = {
  title: '',
  topic: '',
  preacherId: '',
  preacherName: '',
  preacherType: '',
  eventId: '',
  mainReference: '',
  targetDurationMinutes: '',
  status: 'draft',
  blocks: []
};

const normalizeText = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const getStatusMeta = (status) => PREACHING_STATUSES.find(item => item.value === status) || PREACHING_STATUSES[0];
const getUserName = (user = {}) => user.nombre || user.displayName || user.email || 'Usuario';

const createBlock = (type) => {
  const base = {
    id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    order: 0
  };

  if (type === 'point') return { ...base, title: '', content: '' };
  if (type === 'subpoint') return { ...base, title: '', content: '' };
  if (type === 'verse') return { ...base, reference: '', translation: 'RVR1960', text: '', bibleId: '', passageId: '' };
  if (type === 'note') return { ...base, visibility: 'shared', content: '' };
  return { ...base, instruction: '' };
};

const sanitizeBlocks = (blocks = []) => (Array.isArray(blocks) ? blocks : []).map((block, index) => {
  const next = {
    ...block,
    id: block.id || `block_${Date.now()}_${index}`,
    order: index
  };
  if (next.type === 'note' && next.visibility === 'preacher_only') {
    delete next.content;
  }
  return next;
});

const hasPrivateNoteBlocks = (blocks = []) => blocks.some(block => block.type === 'note' && block.visibility === 'preacher_only');

const normalizePrivateNotes = (notes = {}) => Object.keys(notes || {})
  .sort()
  .reduce((acc, blockId) => {
    acc[blockId] = { content: notes?.[blockId]?.content || '' };
    return acc;
  }, {});

const buildDirtySnapshot = (form, privateNotes) => JSON.stringify({
  form: {
    title: form.title || '',
    topic: form.topic || '',
    preacherId: form.preacherId || '',
    preacherName: form.preacherName || '',
    preacherType: form.preacherType || '',
    eventId: form.eventId || '',
    mainReference: form.mainReference || '',
    targetDurationMinutes: form.targetDurationMinutes || '',
    status: form.status || 'draft',
    blocks: sanitizeBlocks(form.blocks || [])
  },
  privateNotes: normalizePrivateNotes(privateNotes)
});

const buildPrivateNotesWrite = ({ sharedBlocks, privateNotes, preachingId, user }) => {
  const privateBlockIds = new Set(
    sharedBlocks
      .filter(block => block.type === 'note' && block.visibility === 'preacher_only')
      .map(block => block.id)
  );
  const notes = {};
  privateBlockIds.forEach(blockId => {
    const content = privateNotes?.[blockId]?.content || '';
    notes[blockId] = { content, updatedAt: Date.now() };
  });
  return {
    ref: doc(db, 'predicas', preachingId, 'private', 'preacher'),
    notes,
    data: {
      notes,
      preacherId: user.uid,
      updatedAt: serverTimestamp()
    }
  };
};

const createPreachingMediaReference = (media = {}) => ({
  mediaId: media.mediaId || media.id || null,
  title: media.title || media.name || 'Recurso multimedia',
  mediaType: media.type || MEDIA_TYPES.LINK,
  thumbnailUrl: media.thumbnailUrl || '',
  provider: media.provider || '',
  source: 'library'
});

const getMediaInstructionRefs = (blocks = []) => (Array.isArray(blocks) ? blocks : [])
  .filter(block => block?.type === 'mediaInstruction' && block.mediaId)
  .map(block => ({
    blockId: block.id,
    resourceId: block.id,
    mediaId: block.mediaId,
    title: block.title || 'Recurso multimedia',
    mediaType: block.mediaType || MEDIA_TYPES.LINK
  }));

const buildPreachingMediaUsage = ({ preachingId, preachingTitle, mediaRef }) => ({
  entityType: 'preaching',
  entityId: preachingId,
  predicaId: preachingId,
  predicaTitle: preachingTitle || 'Predica sin titulo',
  location: 'preaching-outline',
  blockId: mediaRef.blockId,
  resourceId: mediaRef.resourceId || mediaRef.blockId,
  blockTitle: mediaRef.title || 'Bloque multimedia'
});

const buildPreachingMediaUsageChanges = ({ initialRefs = [], currentRefs = [], preachingId, preachingTitle }) => {
  const currentByBlock = new Map(currentRefs.map(ref => [ref.blockId, ref]));
  const initialByBlock = new Map(initialRefs.map(ref => [ref.blockId, ref]));
  const changes = [];

  initialRefs.forEach(initialRef => {
    const currentRef = currentByBlock.get(initialRef.blockId);
    if (!currentRef || currentRef.mediaId !== initialRef.mediaId) {
      changes.push({
        mediaId: initialRef.mediaId,
        usage: buildPreachingMediaUsage({ preachingId, preachingTitle, mediaRef: initialRef }),
        action: 'remove'
      });
    }
  });

  currentRefs.forEach(currentRef => {
    const initialRef = initialByBlock.get(currentRef.blockId);
    if (!initialRef || initialRef.mediaId !== currentRef.mediaId) {
      changes.push({
        mediaId: currentRef.mediaId,
        usage: buildPreachingMediaUsage({ preachingId, preachingTitle, mediaRef: currentRef }),
        action: 'add'
      });
    }
  });

  return changes;
};

const PreachingManagement = ({ user }) => {
  const navigate = useNavigate();
  const { notify, confirm } = useFeedback();
  const { registerNavigationGuard } = useNavigationGuard();
  const [preachings, setPreachings] = useState([]);
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [mineOnly, setMineOnly] = useState(isPastor(user) || isPreacherLegacy(user));
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [privateNotes, setPrivateNotes] = useState({});
  const [biblePickerBlockId, setBiblePickerBlockId] = useState(null);
  const [mediaPickerBlockId, setMediaPickerBlockId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState(() => buildDirtySnapshot(emptyForm, {}));
  const [initialMediaRefs, setInitialMediaRefs] = useState([]);

  const role = normalizeRole(user?.rol || user?.role);
  const canManageShared = canManageAnyPreaching(user);
  const canCreate = canCreatePreaching(user);
  const isReadOnlyAdmin = isAdmin(user);
  const isAssignedPastor = isPastor(user) && form.preacherType === 'user' && form.preacherId === user?.uid;
  const canEditShared = canManageShared || isAssignedPastor;
  const canEditCurrent = canEditShared && !isReadOnlyAdmin;
  const canUseMediaInPreaching = canUsePreachingMedia(user, form);
  const canUploadMediaLibrary = canPerformMediaLibraryAction(user, MEDIA_LIBRARY_ACTIONS.ADD);
  const { items: preachingMediaItems, loading: preachingMediaLoading } = useMediaLibrary({ enabled: canUseMediaInPreaching, activeOnly: true });
  const isLimitedPreachingMediaUser = canUseMediaInPreaching && !canManageShared;
  const canUsePrivateNotes = isAssignedPastor;
  const canManageEventAssociation = isOwner(user);
  const currentSnapshot = useMemo(() => buildDirtySnapshot(form, privateNotes), [form, privateNotes]);
  const isDirty = canEditCurrent && currentSnapshot !== initialSnapshot;

  const confirmDiscardChanges = useCallback(async () => {
    if (!isDirty) return true;
    return confirm({
      title: 'Cambios sin guardar',
      message: 'Tienes cambios sin guardar en esta predica. Si sales ahora, se perderan.',
      confirmLabel: 'Salir sin guardar',
      cancelLabel: 'Seguir editando',
      variant: 'danger'
    });
  }, [confirm, isDirty]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return undefined;
    return registerNavigationGuard(confirmDiscardChanges);
  }, [confirmDiscardChanges, isDirty, registerNavigationGuard]);

  const getPreachingEvent = (preaching) => events.find(item => item.id === preaching?.eventId) || null;

  const openPreachingView = async (preaching, event) => {
    if (!preaching?.id) return;
    if (!(await confirmDiscardChanges())) return;
    navigate(`/predicador/${event?.id || preaching.id}`);
  };

  const startOrContinuePreaching = async (preaching, event) => {
    if (!event?.id) {
      notify('Esta predica no tiene evento asociado. Puedes abrirla en modo ensayo.', { type: 'warning' });
      return;
    }
    if (!isPastor(user) || preaching.preacherType !== 'user' || preaching.preacherId !== user?.uid) {
      notify('Solo el Pastor asignado puede iniciar esta predica.', { type: 'warning' });
      return;
    }
    if (!(await confirmDiscardChanges())) return;
    navigate(`/predicador/${event.id}`, { state: { intent: 'startPreaching' } });
  };

  useEffect(() => {
    const canReadAll = isOwner(user) || isMultimedia(user) || isAdmin(user);
    const preachingsQuery = canReadAll
      ? collection(db, 'predicas')
      : query(collection(db, 'predicas'), where('preacherId', '==', user?.uid || '__none__'));

    const unsubPreachings = onSnapshot(preachingsQuery, (snap) => {
      const data = snap.docs.map(item => ({ id: item.id, ...item.data() }));
      data.sort((a, b) => {
        const bTime = b.updatedAt?.toMillis?.() || new Date(b.updatedAt || b.createdAt || 0).getTime();
        const aTime = a.updatedAt?.toMillis?.() || new Date(a.updatedAt || a.createdAt || 0).getTime();
        return bTime - aTime;
      });
      setPreachings(data);
      setLoading(false);
    }, (error) => {
      console.error('Error cargando predicas:', error);
      notify('No se pudieron cargar las predicas. Revisa permisos de Firestore.', { type: 'error' });
      setLoading(false);
    });

    const unsubEvents = onSnapshot(collection(db, 'eventos'), (snap) => {
      const data = snap.docs.map(item => ({ id: item.id, ...item.data() }));
      data.sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
      setEvents(data);
    });

    const unsubUsers = onSnapshot(collection(db, 'usuarios'), (snap) => {
      setUsers(snap.docs.map(item => ({ id: item.id, ...item.data() })));
    });

    return () => {
      unsubPreachings();
      unsubEvents();
      unsubUsers();
    };
  }, [notify, user]);

  const pastorOptions = useMemo(() => users
    .filter(item => normalizeRole(item.rol || item.role) === 'pastor')
    .filter(item => normalizeAccountStatus(item.accountStatus) === ACCOUNT_STATUSES.ACTIVE)
    .sort((a, b) => getUserName(a).localeCompare(getUserName(b))), [users]);

  const filteredPreachings = useMemo(() => {
    const search = normalizeText(queryText);
    return preachings
      .filter(item => item.archived !== true)
      .filter(item => statusFilter === 'all' || item.status === statusFilter)
      .filter(item => !mineOnly || item.preacherId === user?.uid || item.createdBy?.uid === user?.uid)
      .filter(item => {
        if (!search) return true;
        return [item.title, item.topic, item.preacherName, item.mainReference].map(normalizeText).join(' ').includes(search);
      });
  }, [mineOnly, preachings, queryText, statusFilter, user?.uid]);

  const loadPrivateNotes = async (preaching) => {
    if (!preaching?.id || !isPastor(user) || preaching.preacherId !== user.uid || preaching.preacherType === 'external') {
      setPrivateNotes({});
      return {};
    }
    try {
      const snap = await getDoc(doc(db, 'predicas', preaching.id, 'private', 'preacher'));
      const notes = snap.exists() ? (snap.data().notes || {}) : {};
      setPrivateNotes(notes);
      return notes;
    } catch (error) {
      console.warn('No se pudo cargar contenido privado del pastor:', error);
      setPrivateNotes({});
      return {};
    }
  };

  const resetFormState = () => {
    const nextForm = {
      ...emptyForm,
      preacherId: isPastor(user) ? user.uid : '',
      preacherName: isPastor(user) ? getUserName(user) : '',
      preacherType: isPastor(user) ? 'user' : ''
    };
    setSelectedId(null);
    setPrivateNotes({});
    setInitialMediaRefs([]);
    setForm(nextForm);
    setInitialSnapshot(buildDirtySnapshot(nextForm, {}));
  };

  const resetForm = async () => {
    if (!(await confirmDiscardChanges())) return;
    resetFormState();
  };

  useEffect(() => {
    if (!selectedId && isPastor(user) && !form.preacherId) {
      resetFormState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, user?.uid]);

  const openPreaching = async (preaching) => {
    if (preaching?.id !== selectedId && !(await confirmDiscardChanges())) return;
    setSelectedId(preaching.id);
    const preacherType = preaching.preacherType || (preaching.preacherId ? 'user' : preaching.preacherName ? 'external' : '');
    const nextForm = {
      title: preaching.title || '',
      topic: preaching.topic || '',
      preacherId: preaching.preacherId || '',
      preacherName: preaching.preacherName || '',
      preacherType,
      eventId: preaching.eventId || '',
      mainReference: preaching.mainReference || '',
      targetDurationMinutes: preaching.targetDurationMinutes || '',
      status: preaching.status || 'draft',
      blocks: sanitizeBlocks(preaching.blocks || [])
    };
    setForm(nextForm);
    const notes = await loadPrivateNotes({ ...preaching, preacherType });
    setInitialMediaRefs(getMediaInstructionRefs(nextForm.blocks));
    setInitialSnapshot(buildDirtySnapshot(nextForm, notes));
  };

  const ensureEditable = () => {
    if (canEditCurrent) return true;
    notify(isReadOnlyAdmin ? 'Admin puede consultar predicas, pero no editarlas.' : 'No tienes permiso para editar esta predica.', { type: 'warning' });
    return false;
  };

  const updateForm = (field, value) => {
    if (!ensureEditable()) return;
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const getPrivateContent = (blockId) => privateNotes?.[blockId]?.content || '';

  const handlePreacherChange = async (value) => {
    if (!ensureEditable()) return;
    if (isPastor(user) && !canManageShared) {
      notify('Un Pastor solo puede crear predicas asignadas a su propia cuenta.', { type: 'warning' });
      return;
    }

    if (hasPrivateNoteBlocks(form.blocks) && value !== form.preacherId) {
      const ok = await confirm({
        title: 'Cambiar Pastor',
        message: 'Esta predica contiene notas Solo Pastor. Cambiar el pastor eliminara los bloques privados del bosquejo compartido para no transferir secretos al nuevo predicador.',
        confirmLabel: 'Continuar',
        cancelLabel: 'Cancelar',
        variant: 'danger'
      });
      if (!ok) return;
      setForm(prev => ({
        ...prev,
        blocks: sanitizeBlocks(prev.blocks.filter(block => !(block.type === 'note' && block.visibility === 'preacher_only')))
      }));
      setPrivateNotes({});
    }

    if (value === EXTERNAL_PREACHER_VALUE) {
      setForm(prev => ({ ...prev, preacherId: '', preacherName: '', preacherType: 'external' }));
      return;
    }

    const selected = pastorOptions.find(item => item.id === value);
    setForm(prev => ({
      ...prev,
      preacherId: selected?.id || '',
      preacherName: selected ? getUserName(selected) : '',
      preacherType: selected ? 'user' : ''
    }));
  };

  const updateExternalPreacherName = (value) => {
    if (!ensureEditable()) return;
    setForm(prev => ({ ...prev, preacherName: value, preacherId: '', preacherType: 'external' }));
  };

  const addBlock = (type) => {
    if (!ensureEditable()) return;
    const block = createBlock(type);
    setForm(prev => ({ ...prev, blocks: sanitizeBlocks([...prev.blocks, block]) }));
  };

  const updateBlock = (blockId, updates) => {
    if (!ensureEditable()) return;
    setForm(prev => ({ ...prev, blocks: prev.blocks.map(block => block.id === blockId ? { ...block, ...updates } : block) }));
  };

  const applyBiblePassageToBlock = (blockId, passage) => {
    if (!blockId || !passage || !ensureEditable()) return;
    const slides = splitPassageIntoSlides(passage);
    updateBlock(blockId, {
      reference: passage.reference || '',
      translation: passage.abbreviation || passage.translation || '',
      translationName: passage.translationName || '',
      text: passage.text || '',
      bibleId: passage.bibleId || '',
      passageId: passage.passageId || '',
      provider: passage.provider || 'local',
      copyright: passage.copyright || '',
      biblePassage: {
        translationId: passage.translationId || '',
        bookCode: passage.bookCode || '',
        bookName: passage.bookName || '',
        chapter: passage.chapter || null,
        reference: passage.reference || '',
        verses: passage.verses || [],
        slides
      }
    });
    setBiblePickerBlockId(null);
  };

  const selectMediaInstructionResource = (media) => {
    if (!mediaPickerBlockId || !media) return;
    if (!canUseMediaInPreaching) {
      notify('No tienes permiso para asociar recursos de Biblioteca Multimedia en esta predica.', { type: 'warning' });
      return;
    }
    updateBlock(mediaPickerBlockId, createPreachingMediaReference(media));
    setMediaPickerBlockId(null);
  };

  const removeMediaInstructionResource = (blockId) => {
    if (!canUseMediaInPreaching) {
      notify('No tienes permiso para quitar recursos de Biblioteca Multimedia en esta predica.', { type: 'warning' });
      return;
    }
    updateBlock(blockId, {
      mediaId: null,
      title: '',
      mediaType: '',
      thumbnailUrl: '',
      provider: '',
      source: ''
    });
  };

  const updatePrivateNote = (blockId, content) => {
    if (!canUsePrivateNotes) {
      notify('Solo el Pastor asignado puede escribir notas Solo Pastor.', { type: 'warning' });
      return;
    }
    setPrivateNotes(prev => ({ ...prev, [blockId]: { content } }));
  };

  const changeNoteVisibility = async (block, visibility) => {
    if (!ensureEditable()) return;
    if (visibility === block.visibility) return;

    if (visibility === 'preacher_only') {
      if (!canUsePrivateNotes) {
        notify('Las notas Solo Pastor requieren una cuenta asignada con rol Pastor.', { type: 'warning' });
        return;
      }
      const content = block.content || '';
      setPrivateNotes(prev => ({ ...prev, [block.id]: { content } }));
      updateBlock(block.id, { visibility: 'preacher_only', content: undefined });
      notify('Nota privada preparada para guardarse solo para el Pastor.', { type: 'info' });
      return;
    }

    const content = getPrivateContent(block.id);
    setPrivateNotes(prev => {
      const next = { ...prev };
      delete next[block.id];
      return next;
    });
    updateBlock(block.id, { visibility: 'shared', content });
  };

  const removeBlock = async (blockId) => {
    if (!ensureEditable()) return;
    setPrivateNotes(prev => {
      const next = { ...prev };
      delete next[blockId];
      return next;
    });
    setForm(prev => ({ ...prev, blocks: sanitizeBlocks(prev.blocks.filter(block => block.id !== blockId)) }));
  };

  const moveBlock = (blockId, direction) => {
    if (!ensureEditable()) return;
    setForm(prev => {
      const currentIndex = prev.blocks.findIndex(block => block.id === blockId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= prev.blocks.length) return prev;
      const nextBlocks = [...prev.blocks];
      const [moved] = nextBlocks.splice(currentIndex, 1);
      nextBlocks.splice(nextIndex, 0, moved);
      return { ...prev, blocks: sanitizeBlocks(nextBlocks) };
    });
  };

  const validateEventLink = () => {
    if (!canManageEventAssociation || !form.eventId) return true;
    const linked = preachings.find(item => item.eventId === form.eventId && item.id !== selectedId && item.archived !== true);
    if (!linked) return true;
    notify(`Ese evento ya tiene una predica asociada: ${linked.title || 'Sin titulo'}.`, { type: 'warning' });
    return false;
  };

  const savePreaching = async () => {
    if (isSaving) return;
    if (!canCreate && !selectedId) {
      notify('No tienes permiso para crear predicas.', { type: 'error' });
      return;
    }
    if (!canEditCurrent) {
      notify(isReadOnlyAdmin ? 'Admin puede consultar predicas, pero no editarlas.' : 'No tienes permiso para guardar esta predica.', { type: 'error' });
      return;
    }
    if (!form.title.trim()) {
      notify('El titulo de la predica es obligatorio.', { type: 'warning' });
      return;
    }
    if (form.preacherType === 'external' && !form.preacherName.trim()) {
      notify('Escribe el nombre del predicador externo.', { type: 'warning' });
      return;
    }
    if (isPastor(user) && !canManageShared && form.preacherId !== user.uid) {
      notify('Un Pastor solo puede guardar predicas asignadas a su cuenta.', { type: 'error' });
      return;
    }
    const targetDuration = form.targetDurationMinutes === '' ? null : Number(form.targetDurationMinutes);
    if (targetDuration !== null && (!Number.isInteger(targetDuration) || targetDuration <= 0 || targetDuration > 240)) {
      notify('La duracion objetivo debe ser un numero entero entre 1 y 240 minutos.', { type: 'warning' });
      return;
    }
    if (!validateEventLink()) return;

    setIsSaving(true);
    try {
      const sharedBlocks = sanitizeBlocks(form.blocks);
      const payload = {
        title: form.title.trim(),
        topic: form.topic.trim(),
        preacherId: form.preacherType === 'user' ? (form.preacherId || null) : null,
        preacherName: form.preacherName.trim(),
        preacherType: form.preacherType || (form.preacherId ? 'user' : form.preacherName ? 'external' : ''),
        eventId: form.eventId || null,
        mainReference: form.mainReference.trim(),
        targetDurationMinutes: targetDuration,
        status: form.status || 'draft',
        blocks: sharedBlocks,
        updatedAt: serverTimestamp(),
        updatedBy: {
          uid: user?.uid || null,
          name: getUserName(user),
          role
        }
      };

      let savedId = selectedId;
      const preachingRef = selectedId ? doc(db, 'predicas', selectedId) : doc(collection(db, 'predicas'));
      savedId = preachingRef.id;
      const previousPreaching = selectedId ? preachings.find(item => item.id === selectedId) : null;
      const previousEventId = previousPreaching?.eventId || null;
      const nextEventId = canManageEventAssociation ? (form.eventId || null) : previousEventId;
      payload.eventId = nextEventId;

      const batch = writeBatch(db);
      if (selectedId) {
        batch.update(preachingRef, payload);
      } else {
        batch.set(preachingRef, {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: {
            uid: user?.uid || null,
            name: getUserName(user),
            role
          }
        });
      }

      const hasPrivateBlocks = hasPrivateNoteBlocks(sharedBlocks);
      if (canUsePrivateNotes) {
        const privateWrite = buildPrivateNotesWrite({ sharedBlocks, privateNotes, preachingId: savedId, user });
        if (Object.keys(privateWrite.notes).length === 0) {
          if (selectedId) {
            batch.delete(privateWrite.ref);
          }
        } else {
          batch.set(privateWrite.ref, privateWrite.data);
        }
      } else if (selectedId && canManageShared && !hasPrivateBlocks) {
        batch.delete(doc(db, 'predicas', savedId, 'private', 'preacher'));
      }

      if (canManageEventAssociation) {
        if (previousEventId && previousEventId !== nextEventId) {
          const previousEventRef = doc(db, 'eventos', previousEventId);
          const previousEventSnap = await getDoc(previousEventRef);
          if (previousEventSnap.exists() && previousEventSnap.data().predicaId === savedId) {
            batch.update(previousEventRef, {
              predicaId: null,
              predicaTitle: '',
              predicadorId: null,
              predicadorNombre: ''
            });
          }
        }

        if (nextEventId) {
          const nextEventRef = doc(db, 'eventos', nextEventId);
          const nextEventSnap = await getDoc(nextEventRef);
          const nextEventData = nextEventSnap.exists() ? nextEventSnap.data() : null;
          if (nextEventData?.predicaId && nextEventData.predicaId !== savedId) {
            notify(`Ese evento ya tiene una predica asociada: ${nextEventData.predicaTitle || 'Sin titulo'}.`, { type: 'warning' });
            setIsSaving(false);
            return;
          }
          batch.update(nextEventRef, {
            predicaId: savedId,
            predicaTitle: form.title.trim(),
            predicadorId: payload.preacherId || null,
            predicadorNombre: form.preacherName.trim()
          });
        }
      }

      const currentMediaRefs = getMediaInstructionRefs(sharedBlocks);
      const mediaUsageChanges = canManageShared
        ? buildPreachingMediaUsageChanges({
          initialRefs: initialMediaRefs,
          currentRefs: currentMediaRefs,
          preachingId: savedId,
          preachingTitle: form.title.trim()
        })
        : [];

      const mediaUsageById = mediaUsageChanges.reduce((acc, change) => {
        if (!change.mediaId) return acc;
        acc.set(change.mediaId, [...(acc.get(change.mediaId) || []), change]);
        return acc;
      }, new Map());

      for (const [mediaId, changes] of mediaUsageById.entries()) {
        const mediaRef = doc(db, MEDIA_LIBRARY_COLLECTION, mediaId);
        const mediaSnap = await getDoc(mediaRef);
        if (!mediaSnap.exists()) {
          throw new Error(`media_not_found:${mediaId}`);
        }
        const mediaData = mediaSnap.data() || {};
        const usageFields = changes.reduce((fields, change) => {
          const nextFields = calculateMediaUsageFields(fields.usedBy, change.usage, change.action);
          return {
            ...nextFields,
            firstUsedAt: fields.firstUsedAt || nextFields.firstUsedAt
          };
        }, {
          usedBy: Array.isArray(mediaData.usedBy) ? mediaData.usedBy : [],
          firstUsedAt: mediaData.firstUsedAt || null
        });
        batch.update(mediaRef, {
          ...usageFields,
          firstUsedAt: mediaData.firstUsedAt || usageFields.firstUsedAt
        });
      }

      await batch.commit();
      setSelectedId(savedId);
      const savedForm = { ...form, eventId: nextEventId || '', blocks: sharedBlocks };
      setForm(savedForm);
      setInitialMediaRefs(currentMediaRefs);
      setInitialSnapshot(buildDirtySnapshot(savedForm, privateNotes));

      notify(selectedId ? 'Predica actualizada.' : 'Predica creada.', { type: 'success' });
    } catch (error) {
      console.error('Error guardando predica:', error);
      notify('No se pudo guardar la predica.', { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const renderBlockEditor = (block, index) => {
    const meta = BLOCK_TYPES[block.type] || BLOCK_TYPES.note;
    const Icon = meta.icon;
    const isPrivate = block.type === 'note' && block.visibility === 'preacher_only';
    const disabled = !canEditCurrent;
    const mediaUnavailable = block.type === 'mediaInstruction' && block.mediaId && !preachingMediaLoading
      && !preachingMediaItems.some(item => (item.id || item.mediaId) === block.mediaId);

    return (
      <div key={block.id} className="rounded-3xl border border-white/10 bg-zinc-950/55 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.18)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-200">
              <Icon size={18} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">Bloque {index + 1}</p>
              <h4 className="text-sm font-black text-white">{meta.label}</h4>
            </div>
          </div>
          {canEditCurrent && (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => moveBlock(block.id, -1)} disabled={index === 0} className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-300 disabled:opacity-30"><ArrowUp size={15} /></button>
              <button type="button" onClick={() => moveBlock(block.id, 1)} disabled={index === form.blocks.length - 1} className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-300 disabled:opacity-30"><ArrowDown size={15} /></button>
              <button type="button" onClick={() => removeBlock(block.id)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-black uppercase text-red-200">Eliminar</button>
            </div>
          )}
        </div>

        {block.type === 'point' && (
          <div className="grid gap-3">
            <input disabled={disabled} className="kp-input rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={block.title || ''} onChange={e => updateBlock(block.id, { title: e.target.value })} placeholder="Titulo del punto" />
            <textarea disabled={disabled} className="kp-input min-h-28 rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={block.content || ''} onChange={e => updateBlock(block.id, { content: e.target.value })} placeholder="Contenido o notas del punto" />
          </div>
        )}

        {block.type === 'subpoint' && (
          <div className="grid gap-3">
            <input disabled={disabled} className="kp-input rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={block.title || ''} onChange={e => updateBlock(block.id, { title: e.target.value })} placeholder="Titulo del subpunto" />
            <textarea disabled={disabled} className="kp-input min-h-24 rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={block.content || ''} onChange={e => updateBlock(block.id, { content: e.target.value })} placeholder="Detalle del subpunto" />
          </div>
        )}

        {block.type === 'verse' && (
          <div className="grid gap-3 md:grid-cols-2">
            {canEditCurrent && (
              <div className="flex justify-end md:col-span-2">
                <button
                  type="button"
                  onClick={() => setBiblePickerBlockId(block.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2 text-[10px] font-black uppercase text-blue-100 hover:bg-blue-500/20"
                >
                  <BookOpen size={14} /> Buscar en Biblia
                </button>
              </div>
            )}
            <input disabled={disabled} className="kp-input rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={block.reference || ''} onChange={e => updateBlock(block.id, { reference: e.target.value })} placeholder="Referencia: Juan 3:16" />
            <input disabled={disabled} className="kp-input rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={block.translation || ''} onChange={e => updateBlock(block.id, { translation: e.target.value })} placeholder="Traduccion: RVR1960" />
            <textarea disabled={disabled} className="kp-input min-h-28 rounded-2xl px-4 py-3 text-sm md:col-span-2 disabled:opacity-70" value={block.text || ''} onChange={e => updateBlock(block.id, { text: e.target.value })} placeholder="Texto biblico opcional" />
            <p className="text-xs font-bold text-blue-200 md:col-span-2">{block.reference || 'Referencia sin definir'} {block.translation ? `- ${block.translation}` : ''}</p>
          </div>
        )}

        {block.type === 'note' && (
          <div className="grid gap-3">
            <select disabled={disabled || (form.preacherType === 'external' && block.visibility !== 'preacher_only')} className="kp-input rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={block.visibility || 'shared'} onChange={e => changeNoteVisibility(block, e.target.value)}>
              {NOTE_VISIBILITY.map(option => <option key={option.value} value={option.value} className="bg-zinc-900">{option.label}</option>)}
            </select>
            {form.preacherType === 'external' && (
              <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-bold text-amber-100">
                Las notas Solo Pastor requieren una cuenta con rol Pastor. Un predicador externo no puede tener privacidad real dentro de Kadosh.
              </p>
            )}
            {isPrivate && !canUsePrivateNotes ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
                <Lock className="mb-2 text-amber-200" size={18} />
                Nota privada del Pastor. El contenido no se carga para este usuario.
              </div>
            ) : (
              <textarea
                disabled={disabled}
                className="kp-input min-h-28 rounded-2xl px-4 py-3 text-sm disabled:opacity-70"
                value={isPrivate ? getPrivateContent(block.id) : (block.content || '')}
                onChange={e => isPrivate ? updatePrivateNote(block.id, e.target.value) : updateBlock(block.id, { content: e.target.value })}
                placeholder={isPrivate ? 'Nota privada Solo Pastor' : 'Nota compartida'}
              />
            )}
          </div>
        )}

        {block.type === 'mediaInstruction' && (
          <div className="grid gap-3">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-3">
              {block.mediaId ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-zinc-950 text-zinc-500 sm:w-36">
                    {block.thumbnailUrl ? (
                      <img src={block.thumbnailUrl} alt={block.title || 'Recurso multimedia'} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : block.mediaType === MEDIA_TYPES.IMAGE ? (
                      <ImageIcon size={30} />
                    ) : (
                      <Video size={30} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">{block.title || 'Recurso multimedia'}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-violet-300">
                      Biblioteca Multimedia {block.mediaType ? `- ${getMediaTypeLabel(block.mediaType)}` : ''}
                    </p>
                    <p className="mt-1 truncate text-[11px] font-bold text-zinc-500">mediaId: {block.mediaId}</p>
                    {mediaUnavailable && <p className="mt-2 text-xs font-black text-amber-200">Recurso no disponible en Biblioteca</p>}
                  </div>
                  {canEditCurrent && canUseMediaInPreaching && (
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => setMediaPickerBlockId(block.id)} className="rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-[10px] font-black uppercase text-violet-100 hover:bg-violet-500/20">
                        Cambiar
                      </button>
                      <button type="button" onClick={() => removeMediaInstructionResource(block.id)} className="rounded-xl border border-red-500/20 bg-red-500/10 p-2 text-red-200 hover:bg-red-500/20" aria-label="Quitar recurso multimedia">
                        <X size={15} />
                      </button>
                      {canUploadMediaLibrary && <MediaLibraryUploadButton user={user} label="Subir para esta predica" disabled={!selectedId}
                        options={{ folder: `preaching/${selectedId}/media`, category: `Predicas / ${form.title || 'Sin titulo'}`, sourceContext: 'preaching', preachingId: selectedId, preachingTitle: form.title || 'Predica sin titulo' }}
                        onUploaded={(media) => { updateBlock(block.id, createPreachingMediaReference(media)); notify('Recurso subido y seleccionado. Guarda la predica para confirmar la referencia.', { type: 'success' }); }}
                        onError={(err) => { console.error('Error subiendo recurso de predica:', err); notify(err?.message === 'media_file_type_not_allowed' ? 'Selecciona una imagen o video compatible.' : 'No se pudo subir el recurso a Biblioteca.', { type: 'error' }); }}
                        className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-100 disabled:opacity-40" />}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-white">Sin recurso de Biblioteca</p>
                    <p className="mt-1 text-xs font-bold text-zinc-500">Puedes conservar solo la instruccion textual para compatibilidad.</p>
                  </div>
                  {canEditCurrent && canUseMediaInPreaching && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setMediaPickerBlockId(block.id)} className="rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-[10px] font-black uppercase text-violet-100 hover:bg-violet-500/20">Seleccionar de Biblioteca</button>
                      {canUploadMediaLibrary && <MediaLibraryUploadButton user={user} label="Subir para esta predica" disabled={!selectedId}
                        options={{ folder: `preaching/${selectedId}/media`, category: `Predicas / ${form.title || 'Sin titulo'}`, sourceContext: 'preaching', preachingId: selectedId, preachingTitle: form.title || 'Predica sin titulo' }}
                        onUploaded={(media) => { updateBlock(block.id, createPreachingMediaReference(media)); notify('Recurso subido y seleccionado. Guarda la predica para confirmar la referencia.', { type: 'success' }); }}
                        onError={(err) => { console.error('Error subiendo recurso de predica:', err); notify(err?.message === 'media_file_type_not_allowed' ? 'Selecciona una imagen o video compatible.' : 'No se pudo subir el recurso a Biblioteca.', { type: 'error' }); }}
                        className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-100 disabled:opacity-40" />}
                    </div>
                  )}
                  {canUploadMediaLibrary && !selectedId && <p className="text-[11px] font-bold text-amber-200">Guarda la predica antes de subir archivos para crear su carpeta vinculada.</p>}
                </div>
              )}
              {canEditCurrent && !canUseMediaInPreaching && (
                <p className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-100">
                  Tu rol puede editar la instruccion, pero no asociar recursos de Biblioteca Multimedia.
                </p>
              )}
              {canEditCurrent && isLimitedPreachingMediaUser && (
                <p className="mt-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold text-cyan-100">
                  Puedes usar recursos compartidos activos en tus predicas, sin administrar la biblioteca.
                </p>
              )}
            </div>
            <textarea disabled={disabled} className="kp-input min-h-24 rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={block.instruction || ''} onChange={e => updateBlock(block.id, { instruction: e.target.value })} placeholder="Instruccion opcional para el operador multimedia" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-10">
      <section className="kp-panel rounded-[2rem] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-300">Kadosh Pro</p>
            <h1 className="mt-1 text-3xl font-black text-white">Predicas</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-zinc-400">Prepara bosquejos, versiculos, notas privadas e indicaciones multimedia para futuros cultos.</p>
          </div>
          {canCreate && (
            <button type="button" onClick={resetForm} className="kp-button-primary inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black">
              <Plus size={18} /> Nueva predica
            </button>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="kp-card rounded-[2rem] p-4 md:p-5">
          <div className="mb-4 grid gap-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input className="kp-input w-full rounded-2xl py-3 pl-11 pr-4 text-sm" value={queryText} onChange={e => setQueryText(e.target.value)} placeholder="Buscar titulo, tema, pastor o referencia..." />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setStatusFilter('all')} className={`rounded-xl px-3 py-2 text-xs font-black uppercase ${statusFilter === 'all' ? 'bg-violet-600 text-white' : 'bg-white/5 text-zinc-400'}`}>Todas</button>
              {PREACHING_STATUSES.filter(item => item.value !== 'live').map(item => (
                <button key={item.value} type="button" onClick={() => setStatusFilter(item.value)} className={`rounded-xl px-3 py-2 text-xs font-black uppercase ${statusFilter === item.value ? 'bg-violet-600 text-white' : 'bg-white/5 text-zinc-400'}`}>{item.label}</button>
              ))}
              <button type="button" onClick={() => setMineOnly(prev => !prev)} className={`rounded-xl px-3 py-2 text-xs font-black uppercase ${mineOnly ? 'bg-emerald-600 text-white' : 'bg-white/5 text-zinc-400'}`}>Mis predicas</button>
            </div>
          </div>

          <div className="space-y-3">
            {loading ? (
              <p className="py-8 text-center text-sm font-bold text-zinc-500">Cargando predicas...</p>
            ) : filteredPreachings.length === 0 ? (
              <div className="kp-empty-state rounded-3xl p-8 text-center">
                <BookOpen className="mx-auto mb-3 text-zinc-500" size={36} />
                <p className="font-black text-white">No hay predicas para mostrar.</p>
                <p className="mt-1 text-sm text-zinc-500">{canCreate ? 'Crea un borrador para empezar.' : 'No hay predicas disponibles para tu rol.'}</p>
              </div>
            ) : filteredPreachings.map(preaching => {
              const status = getStatusMeta(preaching.status);
              const event = getPreachingEvent(preaching);
              const canPastorStart = isPastor(user) && preaching.preacherType === 'user' && preaching.preacherId === user?.uid;
              return (
                <div key={preaching.id} className={`w-full rounded-3xl border p-4 text-left transition-all ${selectedId === preaching.id ? 'border-violet-400/50 bg-violet-500/12' : 'border-white/10 bg-zinc-950/45 hover:border-white/20 hover:bg-white/5'}`}>
                  <button type="button" onClick={() => openPreaching(preaching)} className="w-full text-left">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-black text-white">{preaching.title || 'Predica sin titulo'}</h3>
                      <p className="mt-1 truncate text-xs font-bold text-zinc-500">{preaching.topic || 'Tema sin definir'}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${status.className}`}>{status.label}</span>
                  </div>
                  <div className="grid gap-2 text-xs font-bold text-zinc-400 sm:grid-cols-2">
                    <span className="flex min-w-0 items-center gap-2 truncate"><User size={14} /> {preaching.preacherName || 'Sin pastor asignado'}</span>
                    <span className="flex min-w-0 items-center gap-2 truncate"><BookOpen size={14} /> {preaching.mainReference || 'Sin referencia'}</span>
                    <span className="flex min-w-0 items-center gap-2 truncate sm:col-span-2"><Calendar size={14} /> {event ? `${event.titulo} - ${formatEventDate(event.fecha)}` : 'Sin culto asociado'}</span>
                  </div>
                  </button>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => openPreaching(preaching)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase text-zinc-200 hover:bg-white/10">
                      Editar
                    </button>
                    <button type="button" onClick={() => openPreachingView(preaching, event)} className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-[10px] font-black uppercase text-blue-100 hover:bg-blue-500/20">
                      Vista de predicacion
                    </button>
                    {canPastorStart && (
                      <button type="button" onClick={() => startOrContinuePreaching(preaching, event)} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-emerald-500">
                        {preaching.status === 'live' ? 'Continuar predica' : 'Iniciar predica'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="kp-card rounded-[2rem] p-4 md:p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">{selectedId ? (canEditCurrent ? 'Editar predica' : 'Vista de solo lectura') : 'Nueva predica'}</p>
              <h2 className="text-2xl font-black text-white">{form.title || 'Borrador sin titulo'}</h2>
              {canEditCurrent && (
                <p className={`mt-2 text-xs font-black uppercase ${isDirty ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {isDirty ? 'Cambios sin guardar' : 'Todos los cambios guardados'}
                </p>
              )}
            </div>
            {canEditCurrent ? (
              <button type="button" onClick={savePreaching} disabled={isSaving} className="kp-button-primary inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black disabled:opacity-50">
                {isSaving ? <CheckCircle2 size={18} /> : <Save size={18} />}
                {selectedId ? 'Guardar cambios' : 'Guardar borrador'}
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase text-zinc-400"><Eye size={16} /> Solo lectura</span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-black uppercase text-zinc-500">Titulo</span>
              <input disabled={!canEditCurrent} className="kp-input w-full rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={form.title} onChange={e => updateForm('title', e.target.value)} placeholder="La gracia que transforma" />
            </label>
            <div className="space-y-1">
              <span className="text-xs font-black uppercase text-zinc-500">Pastor / Predicador</span>
              <select disabled={!canEditCurrent || (isPastor(user) && !canManageShared)} className="kp-input w-full rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={form.preacherType === 'external' ? EXTERNAL_PREACHER_VALUE : form.preacherId} onChange={e => handlePreacherChange(e.target.value)}>
                <option value="" className="bg-zinc-900">Sin asignar</option>
                {pastorOptions.map(option => <option key={option.id} value={option.id} className="bg-zinc-900">{getUserName(option)}</option>)}
                {canManageShared && <option value={EXTERNAL_PREACHER_VALUE} className="bg-zinc-900">Predicador externo / Otro</option>}
              </select>
            </div>
            {form.preacherType === 'external' && (
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-black uppercase text-zinc-500">Nombre del predicador externo</span>
                <input disabled={!canEditCurrent} className="kp-input w-full rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={form.preacherName} onChange={e => updateExternalPreacherName(e.target.value)} placeholder="Samuel Rodriguez" />
              </label>
            )}
            <label className="space-y-1">
              <span className="text-xs font-black uppercase text-zinc-500">Evento / Culto</span>
              <select disabled={!canEditCurrent || !canManageEventAssociation} className="kp-input w-full rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={form.eventId} onChange={e => updateForm('eventId', e.target.value)}>
                <option value="" className="bg-zinc-900">Sin evento asignado</option>
                {events.map(event => <option key={event.id} value={event.id} className="bg-zinc-900">{event.titulo} {event.fecha ? `- ${formatEventDate(event.fecha)}` : ''}</option>)}
              </select>
              {canEditCurrent && !canManageEventAssociation && (
                <p className="text-[11px] font-bold text-zinc-500">La asociacion con eventos la administra el dueño para evitar cambios rechazados por permisos.</p>
              )}
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase text-zinc-500">Estado</span>
              <select disabled={!canEditCurrent} className="kp-input w-full rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={form.status} onChange={e => updateForm('status', e.target.value)}>
                {PREACHING_STATUSES.map(option => <option key={option.value} value={option.value} className="bg-zinc-900">{option.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase text-zinc-500">Tema</span>
              <input disabled={!canEditCurrent} className="kp-input w-full rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={form.topic} onChange={e => updateForm('topic', e.target.value)} placeholder="Gracia / Salvacion" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase text-zinc-500">Texto principal</span>
              <input disabled={!canEditCurrent} className="kp-input w-full rounded-2xl px-4 py-3 text-sm disabled:opacity-70" value={form.mainReference} onChange={e => updateForm('mainReference', e.target.value)} placeholder="Efesios 2:8-9" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase text-zinc-500">Duracion objetivo (min)</span>
              <input
                disabled={!canEditCurrent}
                type="number"
                min="1"
                max="240"
                step="1"
                className="kp-input w-full rounded-2xl px-4 py-3 text-sm disabled:opacity-70"
                value={form.targetDurationMinutes}
                onChange={e => updateForm('targetDurationMinutes', e.target.value)}
                placeholder="35"
              />
            </label>
          </div>

          <div className="mt-7 border-t border-white/10 pt-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">Bosquejo</p>
                <p className="mt-1 text-sm font-semibold text-zinc-500">{form.blocks.length} bloques preparados</p>
              </div>
              {canEditCurrent && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(BLOCK_TYPES).map(([type, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <button key={type} type="button" onClick={() => addBlock(type)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase text-zinc-200 hover:bg-white/10">
                        <span className="inline-flex items-center gap-1.5"><Icon size={14} /> {meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="space-y-4">
              {form.blocks.length === 0 ? (
                <div className="kp-empty-state rounded-3xl p-8 text-center">
                  <p className="font-black text-white">Aun no hay bloques.</p>
                  <p className="mt-1 text-sm text-zinc-500">Agrega puntos, versiculos, notas o indicaciones multimedia.</p>
                </div>
              ) : form.blocks.map(renderBlockEditor)}
            </div>
          </div>
        </section>
      </div>

      <BiblePicker
        open={Boolean(biblePickerBlockId)}
        onClose={() => setBiblePickerBlockId(null)}
        onUse={(passage) => applyBiblePassageToBlock(biblePickerBlockId, passage)}
        title="Buscar en Biblia"
        mode="editor"
      />
      <MediaPicker
        open={Boolean(mediaPickerBlockId)}
        onClose={() => setMediaPickerBlockId(null)}
        onSelect={selectMediaInstructionResource}
        title="Seleccionar recurso para predica"
        context="predicas"
        libraryOptions={isLimitedPreachingMediaUser ? { activeOnly: true, sharedOnly: true } : {}}
      />
    </div>
  );
};

export default PreachingManagement;

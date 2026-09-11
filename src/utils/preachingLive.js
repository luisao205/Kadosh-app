export const PREACHER_REQUEST_STATUS = {
  PENDING: 'pending',
  PROJECTED: 'projected',
  IGNORED: 'ignored',
  CANCELLED: 'cancelled'
};

export const PREACHER_REQUEST_TYPES = {
  VERSE: 'verse',
  POINT: 'point',
  QUICK_ALERT: 'quick_alert'
};

export const PREACHER_QUICK_ALERTS = {
  FINISHING: {
    key: 'finishing',
    label: 'Voy terminando',
    message: 'Voy terminando.'
  },
  FIVE_MORE: {
    key: 'five_more',
    label: 'Necesito 5 min mas',
    message: 'Necesito 5 min mas.'
  }
};

export const MULTIMEDIA_TO_PASTOR_PRESETS = [
  'Te quedan 5 min',
  'Te quedan 10 min',
  'Alabanza lista'
];

export const PREACHING_SESSION_STATUS = {
  READY: 'ready',
  LIVE: 'live',
  FINISHED: 'finished'
};

export const normalizeRequestStatus = (status) => (
  Object.values(PREACHER_REQUEST_STATUS).includes(status)
    ? status
    : PREACHER_REQUEST_STATUS.PENDING
);

export const sanitizePublicText = (value = '') => String(value || '').trim();

export const createProjectionActionId = (prefix = 'preaching') => (
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
);

export const createVerseRequestPayload = ({ eventoId, predicaId, block, preacher, step }) => ({
  type: PREACHER_REQUEST_TYPES.VERSE,
  predicaId,
  eventoId,
  blockId: block.id || '',
  stepIndex: step?.index ?? null,
  stepTitle: sanitizePublicText(step?.title),
  requestedBy: preacher?.uid || null,
  preacherName: preacher?.nombre || preacher?.displayName || preacher?.email || 'Pastor',
  reference: sanitizePublicText(block.reference),
  translation: sanitizePublicText(block.translation),
  text: sanitizePublicText(block.text),
  title: sanitizePublicText(block.reference) || 'Versiculo',
  status: PREACHER_REQUEST_STATUS.PENDING
});

export const createPointRequestPayload = ({ eventoId, predicaId, step, preacher }) => ({
  type: PREACHER_REQUEST_TYPES.POINT,
  predicaId,
  eventoId,
  blockId: step?.id || '',
  stepIndex: step?.index ?? null,
  requestedBy: preacher?.uid || null,
  preacherName: preacher?.nombre || preacher?.displayName || preacher?.email || 'Pastor',
  title: sanitizePublicText(step?.title) || 'Punto de predica',
  pointNumber: step?.pointNumber || null,
  status: PREACHER_REQUEST_STATUS.PENDING
});

export const createQuickAlertPayload = ({ eventoId, predicaId, alert, preacher, step }) => ({
  type: PREACHER_REQUEST_TYPES.QUICK_ALERT,
  predicaId,
  eventoId,
  blockId: '',
  stepIndex: step?.index ?? null,
  requestedBy: preacher?.uid || null,
  preacherName: preacher?.nombre || preacher?.displayName || preacher?.email || 'Pastor',
  title: alert?.label || 'Aviso del Pastor',
  message: alert?.message || '',
  alertKey: alert?.key || '',
  status: PREACHER_REQUEST_STATUS.PENDING
});

export const buildPreachingProgress = ({
  predicaId,
  pastor,
  currentIndex,
  totalSteps,
  currentTitle,
  isLive = false,
  active = false,
  startedAt = null,
  finishedAt = null,
  sessionStatus = PREACHING_SESSION_STATUS.READY
}) => ({
  predicaId,
  pastorUid: pastor?.uid || null,
  pastorName: pastor?.nombre || pastor?.displayName || pastor?.email || 'Pastor',
  currentStep: currentIndex + 1,
  currentStepIndex: currentIndex,
  totalSteps,
  currentTitle: sanitizePublicText(currentTitle),
  isLive: Boolean(isLive),
  active: Boolean(active),
  sessionStatus,
  ...(startedAt ? { startedAt } : {}),
  ...(finishedAt ? { finishedAt } : {}),
  updatedAt: Date.now()
});

const buildActorMetadata = (actor = {}, sourceActor = 'multimedia') => ({
  sourceActor,
  actorUid: actor?.uid || null,
  actorName: actor?.nombre || actor?.displayName || actor?.email || (sourceActor === 'pastor' ? 'Pastor' : 'Multimedia'),
  actorRole: actor?.rol || actor?.role || sourceActor
});

export const buildPreachingProjectorState = (request, actor = {}, options = {}) => {
  const now = Date.now();
  const actionId = options.actionId || createProjectionActionId('preaching');
  const actorMetadata = buildActorMetadata(actor, options.sourceActor || 'multimedia');
  const previousProjectorState = options.previousProjectorState || null;
  if (request?.type === PREACHER_REQUEST_TYPES.POINT) {
    return {
      type: 'preaching',
      preachingType: 'point',
      title: request.title || 'Punto de predica',
      reference: request.pointNumber ? `Punto ${request.pointNumber}` : 'Punto',
      translation: '',
      content: request.title || '',
      predicaId: request.predicaId || null,
      requestId: request.id || null,
      actionId,
      projectionVersion: now,
      previousProjectorState,
      ...actorMetadata,
      background: null,
      backgroundMedia: null,
      updatedAt: now,
      updatedBy: actorMetadata.actorName
    };
  }

  return {
    type: 'preaching',
    preachingType: 'verse',
    title: request.reference || request.title || 'Versiculo',
    reference: request.reference || '',
    translation: request.translation || '',
    content: request.text || '',
    predicaId: request.predicaId || null,
    requestId: request.id || null,
    actionId,
    projectionVersion: now,
    previousProjectorState,
    ...actorMetadata,
    background: null,
    backgroundMedia: null,
    updatedAt: now,
    updatedBy: actorMetadata.actorName
  };
};

export const buildDirectPreachingProjectorState = ({
  predicaId,
  preachingType,
  title,
  reference,
  translation,
  translationName = '',
  content,
  contentType = '',
  provider = '',
  bibleId = '',
  passageId = '',
  copyright = '',
  bible = null,
  bibleSlideIndex = null,
  bibleSlideCount = null,
  pastor,
  stepIndex = null,
  blockId = '',
  previousProjectorState = null
}) => {
  const now = Date.now();
  return {
    type: 'preaching',
    preachingType: preachingType || 'point',
    title: sanitizePublicText(title) || (preachingType === 'verse' ? 'Versiculo' : 'Punto de predica'),
    reference: sanitizePublicText(reference),
    translation: sanitizePublicText(translation),
    translationName: sanitizePublicText(translationName),
    content: sanitizePublicText(content),
    predicaId,
    requestId: null,
    blockId,
    stepIndex,
    actionId: createProjectionActionId('pastor'),
    projectionVersion: now,
    previousProjectorState,
    ...buildActorMetadata(pastor, 'pastor'),
    ...(contentType ? { contentType } : {}),
    ...(provider ? { provider } : {}),
    ...(bibleId ? { bibleId } : {}),
    ...(passageId ? { passageId } : {}),
    ...(copyright ? { copyright } : {}),
    ...(bible ? { bible } : {}),
    ...(Number.isInteger(bibleSlideIndex) ? { bibleSlideIndex } : {}),
    ...(Number.isInteger(bibleSlideCount) ? { bibleSlideCount } : {}),
    background: null,
    backgroundMedia: null,
    updatedAt: now,
    updatedBy: pastor?.nombre || pastor?.displayName || pastor?.email || 'Pastor'
  };
};

export const isPreachingStateFromAction = (projectorState, actionId) => (
  projectorState?.type === 'preaching'
  && actionId
  && projectorState.actionId === actionId
);

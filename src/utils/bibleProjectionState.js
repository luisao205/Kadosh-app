const cloneValue = (value) => {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
};

const sanitizeProjectorState = (state) => {
  if (!state || typeof state !== 'object') return null;
  const sanitized = cloneValue(state);
  delete sanitized.previousProjectionFields;
  delete sanitized.projectionActionId;
  delete sanitized.previousProjectorState;
  return sanitized;
};

export const BIBLE_RESTORABLE_FIELDS = [
  'proyectorSlide', 'proyectorMedia', 'proyectorLogo', 'proyectorApagado',
  'proyectorFondo', 'proyectorFondoMedia', 'proyectorSongId',
  'proyectorSlideIndex', 'proyectorNextSlide', 'proyectorNextSong',
  'proyectorOffset', 'liveState', 'currentSongId'
];

export const isValidPreviousProjectionFields = (snapshot) => (
  Boolean(snapshot)
  && typeof snapshot === 'object'
  && snapshot.projectorState != null
  && typeof snapshot.projectorState === 'object'
  && snapshot.liveState != null
  && typeof snapshot.liveState === 'object'
);

export const capturePreviousProjectionFields = (eventData = {}) => {
  const currentState = eventData?.projectorState;
  if (currentState?.contentType === 'bible'
    && isValidPreviousProjectionFields(currentState.previousProjectionFields)) {
    return cloneValue(currentState.previousProjectionFields);
  }

  const snapshot = { projectorState: sanitizeProjectorState(currentState) };
  BIBLE_RESTORABLE_FIELDS.forEach((field) => {
    snapshot[field] = Object.prototype.hasOwnProperty.call(eventData, field)
      ? cloneValue(eventData[field])
      : null;
  });
  return snapshot;
};

export const isMatchingBibleProjection = (projectorState, projectionActionId) => (
  Boolean(projectionActionId)
  && projectorState?.type === 'preaching'
  && projectorState?.contentType === 'bible'
  && projectorState?.projectionActionId === projectionActionId
);

export const resolveActiveBibleProjectorState = (eventData = {}) => {
  if (!eventData || typeof eventData !== 'object') return null;
  if (eventData.proyectorApagado) return null;
  const state = eventData.projectorState;
  return state?.type === 'preaching' && state?.contentType === 'bible' ? state : null;
};

export const resolveActiveBibleSlide = (projectorState) => {
  if (!projectorState) return null;
  const slides = Array.isArray(projectorState.bible?.slides) ? projectorState.bible.slides : [];
  const rawIndex = projectorState.bible?.slideIndex ?? projectorState.bibleSlideIndex ?? 0;
  const index = Math.max(0, Math.min(Number(rawIndex) || 0, Math.max(slides.length - 1, 0)));
  return slides[index] || {
    reference: projectorState.reference || projectorState.title || 'Biblia',
    translation: projectorState.translation || '',
    heading: '',
    text: projectorState.content || ''
  };
};

export const buildStoppedBibleProjectionPayload = ({ previousProjectionFields, liveState, updatedAt = Date.now() } = {}) => {
  if (isValidPreviousProjectionFields(previousProjectionFields)) {
    return cloneValue(previousProjectionFields);
  }

  return {
  projectorState: {
    type: 'resume',
    contentType: 'none',
    preachingType: null,
    title: 'Biblia detenida',
    content: '',
    media: null,
    bible: null,
    reference: null,
    translation: null,
    translationName: null,
    provider: null,
    bibleId: null,
    passageId: null,
    copyright: '',
    previousProjectorState: null,
    background: null,
    backgroundMedia: null,
    updatedAt
  },
  proyectorSlide: null,
  proyectorMedia: null,
  proyectorLogo: false,
  proyectorApagado: false,
  proyectorFondo: null,
  proyectorFondoMedia: null,
  proyectorSongId: null,
  proyectorSlideIndex: -1,
  proyectorNextSlide: null,
  proyectorNextSong: null,
  proyectorOffset: 0,
  liveState,
  currentSongId: null
  };
};

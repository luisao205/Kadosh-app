import { BIBLE_RESTORABLE_FIELDS, buildStoppedBibleProjectionPayload } from './bibleProjectionState.js';

export const QUICK_MESSAGE_TYPES = ['theme', 'title', 'point', 'phrase', 'call'];
export const QUICK_MESSAGE_COLORS = ['white', 'blue', 'red', 'yellow', 'green'];
export const QUICK_MESSAGE_MAX_SEGMENTS = 12;
export const QUICK_MESSAGE_MAX_TEXT_LENGTH = 800;

export const normalizeQuickMessageSegments = (segments = []) => {
  if (!Array.isArray(segments) || !segments.length || segments.length > QUICK_MESSAGE_MAX_SEGMENTS) return null;
  const normalized = segments.map((segment) => {
    if (
      typeof segment?.text !== 'string'
      || !segment.text.length
      || segment.text.length > 240
      || !QUICK_MESSAGE_COLORS.includes(segment?.color)
      || typeof segment?.bold !== 'boolean'
    ) return null;
    return { text: segment.text, color: segment.color, bold: segment.bold };
  });
  if (normalized.some((segment) => segment === null)) return null;
  const content = normalized.map((segment) => segment.text).join('');
  return normalized.length && content.length <= QUICK_MESSAGE_MAX_TEXT_LENGTH ? normalized : null;
};

export const createQuickMessage = ({ presentationType = 'point', segments, alignment = 'center' } = {}) => {
  const safeSegments = normalizeQuickMessageSegments(segments);
  if (!safeSegments || !QUICK_MESSAGE_TYPES.includes(presentationType) || alignment !== 'center') return null;
  return { presentationType, segments: safeSegments, alignment, content: safeSegments.map((segment) => segment.text).join('') };
};

export const isMatchingQuickMessageProjection = (state, projectionActionId) => (
  Boolean(projectionActionId)
  && state?.type === 'preaching'
  && state?.contentType === 'quickMessage'
  && state?.projectionActionId === projectionActionId
);

export const resolveActiveQuickMessageProjectorState = (eventData = {}) => {
  if (!eventData || eventData.proyectorApagado) return null;
  const state = eventData.projectorState;
  return state?.type === 'preaching' && state?.contentType === 'quickMessage' ? state : null;
};

export const buildQuickMessageProjectorState = ({ message, previousProjectionFields, actor, now = Date.now(), projectionActionId }) => ({
  type: 'preaching',
  contentType: 'quickMessage',
  preachingType: 'quickMessage',
  presentationType: message.presentationType,
  title: message.content.slice(0, 120),
  content: message.content,
  segments: message.segments,
  alignment: 'center',
  media: null,
  background: null,
  backgroundMedia: null,
  previousProjectorState: null,
  previousProjectionFields,
  sourceActor: 'multimedia',
  actorUid: actor?.uid || null,
  actorName: actor?.nombre || actor?.email || 'Multimedia',
  actorRole: actor?.rol || actor?.role || '',
  updatedBy: actor?.nombre || actor?.email || 'Multimedia',
  updatedAt: now,
  projectionVersion: now,
  projectionActionId
});

export const captureQuickMessagePreviousProjection = (eventData = {}) => {
  const snapshot = {
    projectorState: eventData.projectorState == null ? null : structuredClone(eventData.projectorState)
  };
  BIBLE_RESTORABLE_FIELDS.forEach((field) => {
    snapshot[field] = Object.prototype.hasOwnProperty.call(eventData, field)
      ? structuredClone(eventData[field])
      : null;
  });
  return snapshot;
};
export const buildStoppedQuickMessageProjectionPayload = ({ previousProjectionFields, liveState, updatedAt } = {}) =>
  buildStoppedBibleProjectionPayload({ previousProjectionFields, liveState, updatedAt });

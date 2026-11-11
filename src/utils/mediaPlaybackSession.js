export const MEDIA_OUTPUT_TARGET_IDS = ['projector', 'singers', 'musicians'];

export const getMediaRouteKey = (media = {}) => String(
  media?.mediaKey || media?.mediaId || media?.id || media?.url || ''
).trim();

export const createMediaSessionId = () => (
  `media_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
);

export const getMediaSessionKey = (media = {}) => {
  const sessionId = String(media?.sessionId || '').trim();
  if (sessionId) return sessionId;

  const mediaKey = getMediaRouteKey(media);
  return mediaKey ? `legacy:${mediaKey}` : '';
};

export const getExpectedMediaPosition = (media = {}, now = Date.now()) => {
  const positionSec = Number(media?.positionSec);
  const basePosition = Number.isFinite(positionSec) ? Math.max(0, positionSec) : 0;
  if (media?.playing === false) return basePosition;

  const anchorAt = Number(media?.anchorAt);
  if (!Number.isFinite(anchorAt) || anchorAt <= 0) return basePosition;
  return Math.max(0, basePosition + Math.max(0, now - anchorAt) / 1000);
};

// A shared session clock is unbounded. Convert it to a position that a finite
// media element can actually seek to without pinning looped videos at the end.
export const getMediaPlaybackPosition = (media = {}, duration, now = Date.now()) => {
  const expectedPosition = getExpectedMediaPosition(media, now);
  const safeDuration = Number(duration);
  if (!Number.isFinite(safeDuration) || safeDuration <= 0) return expectedPosition;

  if (media?.loop === true) return expectedPosition % safeDuration;
  return Math.min(safeDuration, expectedPosition);
};

export const isMediaPlaybackComplete = (media = {}, duration, now = Date.now()) => {
  const safeDuration = Number(duration);
  return media?.loop !== true
    && Number.isFinite(safeDuration)
    && safeDuration > 0
    && getExpectedMediaPosition(media, now) >= safeDuration;
};

export const isSameMedia = (left, right) => {
  const leftKey = getMediaRouteKey(left);
  return Boolean(leftKey) && leftKey === getMediaRouteKey(right);
};

export const groupActiveMediaOutputs = (outputs = {}) => MEDIA_OUTPUT_TARGET_IDS.reduce((sessions, targetId) => {
  const state = outputs?.[targetId];
  if (!state?.active || !state?.url) return sessions;

  const sessionKey = getMediaSessionKey(state);
  if (!sessionKey) return sessions;
  if (!sessions[sessionKey]) sessions[sessionKey] = { sessionKey, state, outputs: [] };
  sessions[sessionKey].outputs.push({ targetId, state });
  return sessions;
}, {});

export const buildSessionClockUpdate = (media = {}, action, now = Date.now()) => {
  const positionSec = getExpectedMediaPosition(media, now);
  const offset = action === 'back10' ? -10 : action === 'fwd10' ? 10 : 0;
  const nextPosition = action === 'start' ? 0 : Math.max(0, positionSec + offset);
  const playing = action === 'pause' ? false : action === 'play' ? true : media?.playing !== false;

  return {
    positionSec: nextPosition,
    anchorAt: now,
    syncVersion: Math.max(0, Number(media?.syncVersion) || 0) + 1,
    playing,
  };
};

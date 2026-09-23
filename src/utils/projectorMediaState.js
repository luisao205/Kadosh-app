import { buildInactiveAnnouncementState } from './announcementState.js';

export const buildProjectorMediaPayload = ({
  media,
  timer = null,
  liveState,
  title
} = {}) => {
  if (!media) return null;

  const foregroundMedia = {
    ...media,
    playing: media.playing ?? true,
    volume: media.volume ?? 1,
    mode: media.mode || 'foreground'
  };

  return {
    announcementState: buildInactiveAnnouncementState(),
    proyectorMedia: foregroundMedia,
    projectorState: {
      type: 'media',
      contentType: 'media',
      preachingType: null,
      title: title || media.name || media.title || 'Media',
      content: '',
      media: foregroundMedia,
      bible: null,
      reference: null,
      translation: null,
      translationName: null,
      provider: null,
      bibleId: null,
      passageId: null,
      copyright: '',
      previousProjectorState: null,
      timer,
      background: null,
      backgroundMedia: null,
      updatedAt: Date.now()
    },
    proyectorSlide: null,
    proyectorSongId: null,
    proyectorSlideIndex: -1,
    proyectorNextSlide: null,
    proyectorNextSong: null,
    proyectorLogo: false,
    proyectorApagado: false,
    liveState,
    currentSongId: null
  };
};

export const buildStoppedProjectorMediaPayload = ({
  eventData = {},
  liveState,
  updatedAt = Date.now()
} = {}) => {
  const projectedMedia = eventData.proyectorMedia || eventData.projectorState?.media || null;
  const backgroundMedia = eventData.proyectorFondoMedia || (
    eventData.proyectorFondo ? { url: eventData.proyectorFondo } : null
  );
  const projectedMediaId = projectedMedia?.mediaId || projectedMedia?.id || null;
  const backgroundMediaId = backgroundMedia?.mediaId || backgroundMedia?.id || null;
  const sameMediaId = projectedMediaId && backgroundMediaId
    && String(projectedMediaId) === String(backgroundMediaId);
  const sameUrl = projectedMedia?.url && backgroundMedia?.url
    && projectedMedia.url === backgroundMedia.url;
  const clearBackground = Boolean(sameMediaId || sameUrl);
  const nextBackground = clearBackground ? null : (eventData.proyectorFondo || null);
  const nextBackgroundMedia = clearBackground ? null : (eventData.proyectorFondoMedia || null);

  return {
    proyectorMedia: null,
    projectorState: {
      type: 'resume',
      contentType: 'none',
      preachingType: null,
      title: 'Multimedia detenida',
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
      timer: eventData.proyectorCountdown || null,
      background: nextBackground,
      backgroundMedia: nextBackgroundMedia,
      updatedAt
    },
    proyectorFondo: nextBackground,
    proyectorFondoMedia: nextBackgroundMedia,
    proyectorSlide: null,
    proyectorSongId: null,
    proyectorSlideIndex: -1,
    proyectorNextSlide: null,
    proyectorNextSong: null,
    liveState,
    currentSongId: null
  };
};

export const selectSongProjectionBackground = (sectionMedia, songBackground) => (
  sectionMedia?.url ? sectionMedia : (songBackground?.url ? songBackground : null)
);

export const createProjectionWriteQueue = () => {
  let tail = Promise.resolve();

  return (write) => {
    const operation = tail.catch(() => undefined).then(write);
    tail = operation;
    return operation;
  };
};

export const resolveProjectorBackground = (eventData = {}) => {
  const projectorState = eventData.projectorState;
  const hasModernBackgroundState = projectorState
    && Object.prototype.hasOwnProperty.call(projectorState, 'background');

  return {
    url: hasModernBackgroundState
      ? (projectorState.background || null)
      : (eventData.proyectorFondo || null),
    media: hasModernBackgroundState
      ? (projectorState.backgroundMedia || null)
      : (eventData.proyectorFondoMedia || null)
  };
};

export const buildPanicProjectorPayload = ({ liveState, previousProjectionFields, updatedAt = Date.now() } = {}) => ({
  announcementState: buildInactiveAnnouncementState(updatedAt),
  proyectorSlide: null,
  proyectorMedia: null,
  proyectorLogo: false,
  proyectorApagado: true,
  proyectorAlerta: null,
  proyectorTicker: null,
  proyectorFondo: null,
  proyectorFondoMedia: null,
  proyectorSongId: null,
  proyectorSlideIndex: -1,
  proyectorNextSlide: null,
  proyectorNextSong: null,
  liveState,
  currentSongId: null,
  projectorState: {
    type: 'blackout',
    contentType: 'none',
    title: 'Pantalla negra',
    content: '',
    media: null,
    timer: null,
    background: null,
    backgroundMedia: null,
    previousProjectionFields,
    updatedAt
  }
});

export const buildProjectorMediaPayload = ({
  media,
  timer = null,
  background = null,
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
      background,
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

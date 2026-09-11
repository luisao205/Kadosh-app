export const createInactiveSongLiveState = ({
  contentType = 'none',
  contentTitle = '',
  updatedBy = 'Multimedia'
} = {}) => ({
  activeSongId: null,
  activeSongTitle: '',
  activeSongIndex: -1,
  activeSectionIndex: -1,
  activeSectionTitle: '',
  activeContentType: contentType,
  activeContentTitle: contentTitle,
  updatedAt: Date.now(),
  updatedBy
});

export const hasModernLiveState = (eventData) => (
  eventData && Object.prototype.hasOwnProperty.call(eventData, 'liveState')
);

export const resolveEffectiveLiveState = (eventData) => {
  if (!eventData) {
    return {
      activeSongId: null,
      activeSongTitle: '',
      activeSongIndex: -1,
      activeSectionIndex: -1,
      activeSectionTitle: '',
      hasModernLiveState: false,
      isLegacyFallback: false
    };
  }

  if (hasModernLiveState(eventData)) {
    const liveState = eventData.liveState || {};
    return {
      activeSongId: liveState.activeSongId ?? null,
      activeSongTitle: liveState.activeSongTitle || '',
      activeSongIndex: liveState.activeSongIndex ?? -1,
      activeSectionIndex: liveState.activeSectionIndex ?? -1,
      activeSectionTitle: liveState.activeSectionTitle || '',
      activeContentType: liveState.activeContentType || '',
      activeContentTitle: liveState.activeContentTitle || '',
      updatedAt: liveState.updatedAt || null,
      updatedBy: liveState.updatedBy || 'Multimedia',
      hasModernLiveState: true,
      isLegacyFallback: false
    };
  }

  return {
    activeSongId: eventData.currentSongId || eventData.proyectorSongId || null,
    activeSongTitle: '',
    activeSongIndex: -1,
    activeSectionIndex: eventData.proyectorSlideIndex ?? -1,
    activeSectionTitle: eventData.proyectorSlide?.titulo || '',
    updatedAt: null,
    updatedBy: 'Multimedia',
    hasModernLiveState: false,
    isLegacyFallback: true
  };
};

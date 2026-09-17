import { createInactiveSongLiveState } from './liveState.js';

export const ANNOUNCEMENT_TRANSITIONS = ['fade', 'slide', 'zoom'];
export const buildInactiveAnnouncementState = (updatedAt = Date.now()) => ({ announcementId: '', currentSlideIndex: 0, currentSlide: null, totalSlides: 0, presentationActive: false, transition: { type: 'fade', durationMs: 500 }, autoAdvance: { enabled: false, durationMs: 7000 }, updatedAt });

export const buildAnnouncementProjectionPayload = ({ announcement, slideIndex = 0, user, autoAdvance = false } = {}) => {
  const slides = Array.isArray(announcement?.slides) ? announcement.slides : [];
  const index = Math.max(0, Math.min(slideIndex, Math.max(0, slides.length - 1)));
  const slide = slides[index] || null;
  const transition = slide?.transition || { type: 'fade', durationMs: 500 };
  return {
    announcementState: { announcementId: announcement.id, currentSlideIndex: index, currentSlide: slide ? { id: slide.id } : null, totalSlides: slides.length, presentationActive: Boolean(slide), transition, autoAdvance: { enabled: autoAdvance, durationMs: slide?.durationMs || 7000 }, updatedAt: Date.now() },
    projectorState: { type: 'announcement', contentType: 'announcement', title: announcement.title || 'Anuncio', content: '', media: null, background: null, backgroundMedia: null, updatedAt: Date.now() },
    liveState: createInactiveSongLiveState({ contentType: 'announcement', contentTitle: announcement.title || 'Anuncio', updatedBy: user?.nombre || user?.email || 'Multimedia' }),
    proyectorMedia: null, proyectorSlide: null, proyectorFondo: null, proyectorFondoMedia: null,
    currentSongId: null, proyectorSongId: null, proyectorSlideIndex: -1, proyectorNextSlide: null, proyectorNextSong: null,
    proyectorLogo: false, proyectorApagado: false
  };
};

export const buildFinishedAnnouncementPayload = () => ({
  announcementState: buildInactiveAnnouncementState(),
  projectorState: { type: 'resume', contentType: 'none', title: 'Anuncio finalizado', content: '', media: null, background: null, backgroundMedia: null, updatedAt: Date.now() },
  liveState: createInactiveSongLiveState({ contentType: 'none', contentTitle: '' })
});

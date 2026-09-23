import { splitPassageIntoSlides } from './bibleService.js';

export const normalizePreachingBiblePreviewIndex = (slides, requestedIndex) => {
  const length = Array.isArray(slides) ? slides.length : 0;
  if (!length) return 0;
  return Math.max(0, Math.min(Number(requestedIndex) || 0, length - 1));
};

export const getPreachingBiblePreview = (block) => {
  if (!block || typeof block !== 'object' || block.type !== 'verse') return null;
  const passage = block.biblePassage && typeof block.biblePassage === 'object'
    ? block.biblePassage
    : null;
  const storedSlides = Array.isArray(passage?.slides) ? passage.slides : [];
  const slides = storedSlides.length ? storedSlides : splitPassageIntoSlides({
    ...passage,
    bookName: passage?.bookName || String(block.reference || '').replace(/\s+\d+.*$/, ''),
    chapter: passage?.chapter,
    abbreviation: block.translation || '',
    translationName: block.translationName || '',
    verses: passage?.verses || []
  });
  const fallbackSlides = slides.length ? slides : (block.text ? [{
    reference: block.reference || 'Versiculo',
    translation: block.translation || '',
    translationName: block.translationName || '',
    verseNumber: null,
    text: block.text,
    slideIndex: 0,
    slideCount: 1
  }] : []);
  if (!fallbackSlides.length) return null;
  return {
    blockId: block.id || '',
    passage: {
      ...passage,
      reference: block.reference || passage?.reference || '',
      abbreviation: block.translation || '',
      translationName: block.translationName || '',
      bibleId: block.bibleId || '',
      passageId: block.passageId || passage?.passageId || '',
      provider: block.provider || 'local',
      copyright: block.copyright || ''
    },
    slides: fallbackSlides
  };
};

export const resolveActivePreachingProjectorState = (eventData = {}) => {
  if (!eventData || typeof eventData !== 'object') return null;
  if (eventData.proyectorApagado) return null;
  const state = eventData.projectorState;
  if (!state || typeof state !== 'object') return null;
  if (state.type !== 'preaching' || ['bible', 'quickMessage'].includes(state.contentType)) return null;
  return state;
};

export const resolvePreachingProjectionContent = (state) => {
  if (!state || typeof state !== 'object') return null;
  const kind = state.preachingType === 'verse'
    ? 'verse'
    : state.preachingType === 'subpoint' ? 'subpoint' : 'point';
  const reference = state.reference || '';
  const title = state.title || reference || (kind === 'verse' ? 'Versiculo' : 'Punto de predica');
  const body = state.content || state.text || title;

  return {
    kind,
    eyebrow: 'Predica',
    title,
    pointTitle: kind === 'verse' ? '' : reference,
    body,
    content: body,
    reference,
    translation: state.translation || '',
    bible: state.bible || null,
    slideIndex: Number.isInteger(state.bibleSlideIndex) ? state.bibleSlideIndex : null,
    totalSlides: Number.isInteger(state.bibleSlideCount) ? state.bibleSlideCount : null,
    media: state.media || null,
    metadata: {
      predicaId: state.predicaId || null,
      blockId: state.blockId || null,
      requestId: state.requestId || null
    }
  };
};

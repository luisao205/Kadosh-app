import { getSectionPages } from './songParser.js';
import { createLyricFormattingSidecar, hashLyricsSource } from './lyricFormatting.js';

const wordsToText = (line = []) => line
  .map((word) => word.map((token) => token.texto === '\u00A0' ? '' : token.texto).join(''))
  .join(' ');

const createOpaqueId = (prefix) => `${prefix}:${globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

const contextualAnchor = (text, start, end) => ({
  quote: text.slice(start, end),
  prefix: text.slice(Math.max(0, start - 80), start),
  suffix: text.slice(end, Math.min(text.length, end + 80)),
});

const pageLines = (text) => {
  const lines = [];
  let cursor = 0;
  text.split('\n').forEach((line, index) => {
    const start = cursor;
    const end = start + line.length;
    if (line.trim()) lines.push({ id: `line:${index}`, index, text: line, anchor: contextualAnchor(text, start, end) });
    cursor = end + 1;
  });
  return lines;
};

const withContext = (items) => items.map((item, index) => ({
  ...item,
  previousFingerprint: items[index - 1]?.fingerprint || null,
  nextFingerprint: items[index + 1]?.fingerprint || null,
}));

const structuralMatch = (current, candidates, { allowContextFallback = false } = {}) => {
  const contentMatches = candidates.filter((candidate) => candidate.fingerprint === current.fingerprint);
  if (contentMatches.length === 1) return { status: 'resolved', value: contentMatches[0] };
  const contextMatches = contentMatches.filter((candidate) => candidate.previousFingerprint === current.previousFingerprint
    && candidate.nextFingerprint === current.nextFingerprint);
  if (contextMatches.length === 1) return { status: 'resolved', value: contextMatches[0] };
  if (allowContextFallback) {
    const structuralMatches = candidates.filter((candidate) => candidate.previousFingerprint === current.previousFingerprint
      && candidate.nextFingerprint === current.nextFingerprint);
    if (structuralMatches.length === 1) return { status: 'resolved', value: structuralMatches[0] };
  }
  return { status: contentMatches.length ? 'ambiguous' : 'stale', value: null };
};

export const buildLyricFormattingDraftModel = (sections = [], {
  identities,
  idFactory = createOpaqueId,
  manualRemaps = {},
} = {}) => {
  const rawSections = sections.map((section) => {
    const pages = getSectionPages(section).map((page) => {
      const text = page.lineas.map(wordsToText).join('\n').trim();
      return { text, page, fingerprint: hashLyricsSource(text) };
    });
    const sectionText = pages.map((page) => page.text).join('\n\n');
    const title = section.titulo || 'Sección';
    const titleFingerprint = hashLyricsSource(String(title).normalize('NFC'));
    const fingerprint = hashLyricsSource(`${String(title).normalize('NFC')}\0${sectionText}`);
    return { title, titleFingerprint, text: sectionText, fingerprint, pages: withContext(pages) };
  });
  const contextualSections = withContext(rawSections);
  const persistedSections = identities?.sections || [];
  const sourceUnchanged = persistedSections.length === contextualSections.length
    && persistedSections.every((section, index) => section.fingerprint === contextualSections[index].fingerprint);

  const model = contextualSections.map((section, sectionIndex) => {
    const remappedSection = persistedSections.find((item) => item.id === manualRemaps[`section:${sectionIndex}`]);
    const sectionMatch = remappedSection
      ? { status: 'manual', value: remappedSection }
      : (sourceUnchanged
        ? { status: 'resolved', value: persistedSections[sectionIndex] }
        : structuralMatch(section, persistedSections.filter((candidate) => candidate.titleFingerprint === section.titleFingerprint), { allowContextFallback: true }));
    const persistedSection = sectionMatch.value;
    const slidesUnchanged = persistedSection?.slides?.length === section.pages.length
      && persistedSection.slides.every((slide, index) => slide.fingerprint === section.pages[index].fingerprint);
    return {
      id: persistedSection?.id || idFactory('section'),
      title: section.title,
      text: section.text,
      fingerprint: section.fingerprint,
      titleFingerprint: section.titleFingerprint,
      previousFingerprint: section.previousFingerprint,
      nextFingerprint: section.nextFingerprint,
      reconciliation: persistedSections.length ? sectionMatch.status : 'new',
      ambiguous: sectionMatch.status === 'ambiguous',
      slides: section.pages.map((page, pageIndex) => {
        const remappedSlide = persistedSection?.slides?.find((item) => item.id === manualRemaps[`slide:${sectionIndex}:${pageIndex}`]);
        const slideMatch = remappedSlide
          ? { status: 'manual', value: remappedSlide }
          : (slidesUnchanged
            ? { status: 'resolved', value: persistedSection.slides[pageIndex] }
            : structuralMatch(page, persistedSection?.slides || [], { allowContextFallback: true }));
        return {
        id: slideMatch.value?.id || idFactory('slide'),
        text: page.text,
        fingerprint: page.fingerprint,
        previousFingerprint: page.previousFingerprint,
        nextFingerprint: page.nextFingerprint,
        reconciliation: persistedSection?.slides?.length ? slideMatch.status : 'new',
        ambiguous: slideMatch.status === 'ambiguous',
        lines: pageLines(page.text),
      };}),
    };
  });
  const markCompetingIdentities = (items) => {
    const groups = items.reduce((result, item) => {
      if (item.reconciliation === 'resolved' || item.reconciliation === 'manual') {
        result.set(item.id, [...(result.get(item.id) || []), item]);
      }
      return result;
    }, new Map());
    groups.forEach((matches) => {
      if (matches.length < 2) return;
      const manual = matches.filter((item) => item.reconciliation === 'manual');
      matches.filter((item) => !manual.includes(item)).forEach((item) => {
        item.id = idFactory(item.slides ? 'section' : 'slide');
        item.reconciliation = 'ambiguous';
        item.ambiguous = true;
      });
      if (manual.length !== 1) manual.forEach((item) => {
        item.id = idFactory(item.slides ? 'section' : 'slide');
        item.reconciliation = 'ambiguous';
        item.ambiguous = true;
      });
    });
  };
  markCompetingIdentities(model);
  model.forEach((section) => markCompetingIdentities(section.slides));
  return model;
};

export const serializeLyricFormattingIdentities = (model = []) => ({
  sections: model.map((section) => ({
    id: section.id,
    fingerprint: section.fingerprint,
    titleFingerprint: section.titleFingerprint,
    previousFingerprint: section.previousFingerprint ?? null,
    nextFingerprint: section.nextFingerprint ?? null,
    slides: section.slides.map((slide) => ({
      id: slide.id,
      fingerprint: slide.fingerprint,
      previousFingerprint: slide.previousFingerprint ?? null,
      nextFingerprint: slide.nextFingerprint ?? null,
    })),
  })),
});

const templateRole = (templateId, index) => templateId === 'single-emphasis'
  ? 'primary'
  : (index % 2 === 0 ? 'primary' : 'secondary');

export const createLyricFormattingDraft = ({ lyricsRaw, identities, blocks = [], section, slide, scopeType, templateId, selectedLineIds, manualStyles = {} }) => {
  if (!section || section.ambiguous) throw new TypeError('A uniquely identified section is required.');
  if (!slide || slide.ambiguous) throw new TypeError('A uniquely identified slide is required.');
  if (!['section', 'slide'].includes(scopeType)) throw new TypeError('Draft scope is invalid.');
  const selectedLines = slide.lines.filter((line) => selectedLineIds.includes(line.id));
  if (!selectedLines.length) throw new TypeError('At least one explicit phrase selection is required.');

  const template = templateId ? {
    id: templateId,
    version: 1,
    slots: selectedLines.map((line, index) => ({ id: `slot-${line.id}`, role: templateRole(templateId, index), anchor: line.anchor })),
  } : undefined;
  const segments = selectedLines.flatMap((line) => {
    const style = manualStyles[line.id];
    return style && Object.keys(style).length
      ? [{ id: `manual-${line.id}`, anchor: line.anchor, style, reconciliation: 'resolved' }]
      : [];
  });
  const blockId = `block-${scopeType}-${scopeType === 'section' ? section.id : slide.id}`;
  return createLyricFormattingSidecar({ lyricsRaw, identities, blocks: [...blocks.filter((block) => block.id !== blockId), {
    id: blockId,
    scope: scopeType === 'section'
      ? { type: 'section', sectionId: section.id }
      : { type: 'slide', sectionId: section.id, slideId: slide.id },
    sourceHash: hashLyricsSource(scopeType === 'section' ? section.text : slide.text),
    ...(template ? { template } : {}),
    segments,
    reconciliation: 'resolved',
  }] });
};

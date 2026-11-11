import { hashLyricsSource, resolveLyricFormatting, validateLyricFormatting } from './lyricFormatting.js';
import { buildLyricFormattingDraftModel } from './lyricFormattingDraft.js';
import { assertRichLyricRuns } from './richLyricText.js';

const RESOLVED_PAYLOAD_KEYS = new Set([
  'version', 'sectionId', 'slideId', 'text', 'segments', 'formatIdentity', 'reconciliation',
]);

const hasOnlyKeys = (value, allowed) => Object.keys(value).every((key) => allowed.has(key));

export const isSameProjectedLyricSlide = (left, right) => {
  if (!left || !right) return false;
  if (left.slideId || right.slideId) return Boolean(left.slideId && right.slideId && left.slideId === right.slideId);
  return left.texto === right.texto;
};

export const buildLyricProjectionIdentityModel = ({ lyricsRaw, sections, lyricFormatting }) => {
  if (!lyricFormatting?.identities) return null;
  try {
    validateLyricFormatting(lyricFormatting, { lyricsRaw });
    if (lyricFormatting.sourceLyricsHash !== hashLyricsSource(lyricsRaw)) return null;
    return buildLyricFormattingDraftModel(sections, { identities: lyricFormatting.identities });
  } catch {
    return null;
  }
};

export const createResolvedLyricProjectionPayload = ({
  lyricsRaw,
  lyricFormatting,
  identitySection,
  identitySlide,
  text,
  generalStyle,
}) => {
  if (!identitySection || !identitySlide
    || identitySection.ambiguous || identitySlide.ambiguous
    || identitySection.reconciliation !== 'resolved'
    || identitySlide.reconciliation !== 'resolved') return null;

  try {
    const result = resolveLyricFormatting({
      lyricsRaw,
      text,
      sectionText: identitySection.text,
      sectionId: identitySection.id,
      slideId: identitySlide.id,
      lyricFormatting,
      generalStyle,
    });
    if (!result.applied || result.status !== 'resolved') return null;
    const segments = assertRichLyricRuns(result.runs);
    if (segments.map((segment) => segment.text).join('') !== text) return null;
    return {
      version: 1,
      sectionId: identitySection.id,
      slideId: identitySlide.id,
      text,
      segments,
      formatIdentity: `${lyricFormatting.sourceLyricsHash}:${identitySection.id}:${identitySlide.id}`,
      reconciliation: 'resolved',
    };
  } catch {
    return null;
  }
};

export const normalizeResolvedLyricProjectionPayload = (value, visibleText) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !hasOnlyKeys(value, RESOLVED_PAYLOAD_KEYS)) return null;
  if (value.version !== 1 || value.reconciliation !== 'resolved') return null;
  if (typeof value.sectionId !== 'string' || typeof value.slideId !== 'string' || typeof value.formatIdentity !== 'string') return null;
  if (typeof value.text !== 'string' || value.text !== String(visibleText ?? '')) return null;
  try {
    const segments = assertRichLyricRuns(value.segments);
    if (segments.map((segment) => segment.text).join('') !== value.text) return null;
    return { ...value, segments };
  } catch {
    return null;
  }
};


/* global Buffer, module, require */
const { createHash } = require('crypto');

const CONTRACT_VERSION = 1;
const LIMITS = Object.freeze({ maxSidecarBytes: 256 * 1024, maxOperationBytes: 64 * 1024, maxSegmentsPerBlock: 128 });
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const SONG_ID = /^[^/\s][^/]{0,255}$/;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const ROOT_KEYS = new Set(['version', 'sourceLyricsHash', 'identities', 'blocks']);
const IDENTITY_KEYS = new Set(['sections']);
const SECTION_KEYS = new Set(['id', 'fingerprint', 'titleFingerprint', 'previousFingerprint', 'nextFingerprint', 'slides']);
const SLIDE_KEYS = new Set(['id', 'fingerprint', 'previousFingerprint', 'nextFingerprint']);
const BLOCK_KEYS = new Set(['id', 'scope', 'sourceHash', 'template', 'segments', 'reconciliation']);
const SCOPE_KEYS = new Set(['type', 'sectionId', 'slideId']);
const TEMPLATE_KEYS = new Set(['id', 'version', 'slots']);
const SLOT_KEYS = new Set(['id', 'role', 'anchor']);
const SEGMENT_KEYS = new Set(['id', 'anchor', 'style', 'reconciliation']);
const ANCHOR_KEYS = new Set(['quote', 'prefix', 'suffix']);
const STYLE_KEYS = new Set(['bold', 'transform', 'scale', 'color', 'spacing']);
const TEMPLATES = Object.freeze({
  'single-emphasis': new Set(['primary']),
  'double-emphasis': new Set(['primary', 'secondary']),
  'alternating-lines': new Set(['primary', 'secondary']),
});

class LyricFormattingPersistenceError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'LyricFormattingPersistenceError';
    this.code = code;
    this.details = details;
  }
}

const fail = (condition, code, details) => {
  if (!condition) throw new LyricFormattingPersistenceError(code, details);
};
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value, allowed) => isPlainObject(value) && Object.keys(value).every(key => allowed.has(key));
const bytes = value => Buffer.byteLength(value, 'utf8');
const canonicalizeLyrics = value => String(value ?? '').replace(/\r\n?/g, '\n').normalize('NFC');
const stableSerialize = value => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const computeLyricsHash = value => sha256(canonicalizeLyrics(value));
const hashLyricsSource = value => {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(canonicalizeLyrics(value), 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `lf1-${hash.toString(16).padStart(8, '0')}`;
};

const validateId = (value, code = 'invalid-format') => fail(typeof value === 'string' && ID.test(value), code);
const validateAnchor = anchor => {
  fail(hasOnly(anchor, ANCHOR_KEYS), 'invalid-format');
  fail(typeof anchor.quote === 'string' && anchor.quote.length > 0 && anchor.quote.length <= 500, 'invalid-format');
  for (const key of ['prefix', 'suffix']) fail(anchor[key] === undefined || (typeof anchor[key] === 'string' && anchor[key].length <= 160), 'invalid-format');
};
const validateStyle = style => {
  fail(hasOnly(style, STYLE_KEYS) && Object.keys(style).length > 0, 'invalid-format');
  if ('bold' in style) fail(typeof style.bold === 'boolean', 'invalid-format');
  if ('transform' in style) fail(['none', 'uppercase'].includes(style.transform), 'invalid-format');
  if ('scale' in style) fail(['xs', 'sm', 'md', 'lg', 'xl'].includes(style.scale), 'invalid-format');
  if ('color' in style) fail(['default', 'primary', 'secondary', 'accent', 'muted'].includes(style.color), 'invalid-format');
  if ('spacing' in style) fail(['compact', 'normal', 'relaxed'].includes(style.spacing), 'invalid-format');
};

const validateSidecar = (value, lyricsRaw) => {
  if (value === undefined || value === null) return null;
  fail(isPlainObject(value), 'invalid-format');
  if (value.version !== CONTRACT_VERSION) throw new LyricFormattingPersistenceError('unsupported-version');
  fail(hasOnly(value, ROOT_KEYS), 'invalid-format');
  const serialized = stableSerialize(value);
  fail(bytes(serialized) <= LIMITS.maxSidecarBytes, 'payload-too-large', { limit: LIMITS.maxSidecarBytes });
  fail(value.sourceLyricsHash === hashLyricsSource(lyricsRaw), 'stale-lyrics');
  fail(Array.isArray(value.blocks) && value.blocks.length <= 64, 'invalid-format');

  const sectionIds = new Set();
  const slideIds = new Set();
  if (value.identities !== undefined) {
    fail(hasOnly(value.identities, IDENTITY_KEYS) && Array.isArray(value.identities.sections), 'invalid-format');
    for (const section of value.identities.sections) {
      fail(hasOnly(section, SECTION_KEYS) && Array.isArray(section.slides), 'invalid-format');
      validateId(section.id);
      fail(!sectionIds.has(section.id), 'invalid-format');
      sectionIds.add(section.id);
      for (const field of ['fingerprint', 'titleFingerprint']) fail(typeof section[field] === 'string', 'invalid-format');
      for (const field of ['previousFingerprint', 'nextFingerprint']) fail(section[field] === null || typeof section[field] === 'string', 'invalid-format');
      for (const slide of section.slides) {
        fail(hasOnly(slide, SLIDE_KEYS), 'invalid-format');
        validateId(slide.id);
        fail(!slideIds.has(slide.id), 'invalid-format');
        slideIds.add(slide.id);
        fail(typeof slide.fingerprint === 'string', 'invalid-format');
        for (const field of ['previousFingerprint', 'nextFingerprint']) fail(slide[field] === null || typeof slide[field] === 'string', 'invalid-format');
      }
    }
  }

  const blockIds = new Set();
  for (const block of value.blocks) {
    fail(hasOnly(block, BLOCK_KEYS), 'invalid-format');
    validateId(block.id);
    fail(!blockIds.has(block.id), 'invalid-format');
    blockIds.add(block.id);
    fail(hasOnly(block.scope, SCOPE_KEYS) && ['section', 'slide'].includes(block.scope.type), 'invalid-format');
    validateId(block.scope.sectionId);
    fail(sectionIds.has(block.scope.sectionId), 'invalid-format');
    if (block.scope.type === 'slide') {
      validateId(block.scope.slideId);
      fail(slideIds.has(block.scope.slideId), 'invalid-format');
    } else fail(block.scope.slideId === undefined, 'invalid-format');
    fail(/^lf1-[a-f0-9]{8}$/.test(block.sourceHash), 'invalid-format');
    if (block.reconciliation !== 'resolved') throw new LyricFormattingPersistenceError('reconciliation-required');
    if (block.template !== undefined) {
      fail(hasOnly(block.template, TEMPLATE_KEYS) && block.template.version === 1 && Array.isArray(block.template.slots), 'invalid-format');
      const roles = TEMPLATES[block.template.id];
      fail(roles && block.template.slots.length > 0 && block.template.slots.length <= 16, 'invalid-format');
      const slotIds = new Set();
      for (const slot of block.template.slots) {
        fail(hasOnly(slot, SLOT_KEYS), 'invalid-format');
        validateId(slot.id);
        fail(!slotIds.has(slot.id) && roles.has(slot.role), 'invalid-format');
        slotIds.add(slot.id);
        validateAnchor(slot.anchor);
      }
    }
    fail(Array.isArray(block.segments) && block.segments.length <= LIMITS.maxSegmentsPerBlock, 'invalid-format');
    const segmentIds = new Set();
    for (const segment of block.segments) {
      fail(hasOnly(segment, SEGMENT_KEYS), 'invalid-format');
      validateId(segment.id);
      fail(!segmentIds.has(segment.id), 'invalid-format');
      segmentIds.add(segment.id);
      if (segment.reconciliation !== 'resolved') throw new LyricFormattingPersistenceError('reconciliation-required');
      validateAnchor(segment.anchor);
      validateStyle(segment.style);
    }
  }
  return JSON.parse(serialized);
};

const computeFormattingHash = (value, lyricsRaw) => sha256(stableSerialize(validateSidecar(value, lyricsRaw)));
const measureSavePayloadBytes = value => bytes(stableSerialize(value));
const validateRequest = data => {
  fail(isPlainObject(data), 'invalid-format');
  const kind = Object.hasOwn(data, 'letraRaw') ? 'lyrics-and-format' : 'format-only';
  const allowed = new Set(['songId', 'lyricFormatting', 'expectedLyricsHash', 'expectedFormattingHash', 'requestId', ...(kind === 'lyrics-and-format' ? ['letraRaw'] : [])]);
  fail(Object.keys(data).length === allowed.size && Object.keys(data).every(key => allowed.has(key)), 'invalid-format');
  fail(SONG_ID.test(String(data.songId || '')), 'invalid-format');
  fail(REQUEST_ID.test(String(data.requestId || '')), 'invalid-format');
  fail(HASH.test(String(data.expectedLyricsHash || '')) && HASH.test(String(data.expectedFormattingHash || '')), 'invalid-format');
  if (kind === 'lyrics-and-format') fail(typeof data.letraRaw === 'string' && data.letraRaw.length <= 100000, 'invalid-format');
  const normalized = { ...data, ...(kind === 'lyrics-and-format' ? { letraRaw: canonicalizeLyrics(data.letraRaw) } : {}) };
  const payloadBytes = measureSavePayloadBytes(normalized);
  fail(payloadBytes <= LIMITS.maxOperationBytes, 'payload-too-large', { bytes: payloadBytes, limit: LIMITS.maxOperationBytes });
  return { kind, data: normalized, fingerprint: sha256(stableSerialize({ kind, ...normalized })) };
};

module.exports = {
  CONTRACT_VERSION,
  LIMITS,
  LyricFormattingPersistenceError,
  canonicalizeLyrics,
  computeFormattingHash,
  computeLyricsHash,
  hashLyricsSource,
  measureSavePayloadBytes,
  stableSerialize,
  validateRequest,
  validateSidecar,
};

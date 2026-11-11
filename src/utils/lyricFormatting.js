export const LYRIC_FORMATTING_VERSION = 1;

export const LYRIC_FORMATTING_LIMITS = Object.freeze({
  maxLyricsLength: 100_000,
  maxBlocks: 64,
  maxSegmentsPerBlock: 128,
  maxTemplateSlots: 16,
  maxAnchorQuoteLength: 500,
  maxAnchorContextLength: 160,
});

export const LYRIC_FORMATTING_TEMPLATES = Object.freeze({
  'single-emphasis': Object.freeze({
    primary: Object.freeze({ bold: true, transform: 'uppercase', scale: 'xl', color: 'primary' }),
  }),
  'double-emphasis': Object.freeze({
    primary: Object.freeze({ bold: true, transform: 'uppercase', scale: 'xl', color: 'primary' }),
    secondary: Object.freeze({ bold: false, transform: 'none', scale: 'sm', color: 'secondary' }),
  }),
  'alternating-lines': Object.freeze({
    primary: Object.freeze({ bold: true, transform: 'none', scale: 'lg', color: 'primary' }),
    secondary: Object.freeze({ bold: false, transform: 'none', scale: 'sm', color: 'secondary' }),
  }),
});

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const SCOPE_TYPES = new Set(['section', 'slide']);
const RECONCILIATION_STATES = new Set(['resolved', 'stale', 'ambiguous']);
const TRANSFORMS = new Set(['none', 'uppercase']);
const SCALES = new Set(['xs', 'sm', 'md', 'lg', 'xl']);
const COLORS = new Set(['default', 'primary', 'secondary', 'accent', 'muted']);
const SPACINGS = new Set(['compact', 'normal', 'relaxed']);
const STYLE_KEYS = new Set(['bold', 'transform', 'scale', 'color', 'spacing']);
const ANCHOR_KEYS = new Set(['quote', 'prefix', 'suffix']);
const SCOPE_KEYS = new Set(['type', 'sectionId', 'slideId']);
const TEMPLATE_KEYS = new Set(['id', 'version', 'slots']);
const SLOT_KEYS = new Set(['id', 'role', 'anchor']);
const SEGMENT_KEYS = new Set(['id', 'anchor', 'style', 'reconciliation']);
const BLOCK_KEYS = new Set(['id', 'scope', 'sourceHash', 'template', 'segments', 'reconciliation']);
const IDENTITY_KEYS = new Set(['sections']);
const SECTION_IDENTITY_KEYS = new Set(['id', 'fingerprint', 'titleFingerprint', 'previousFingerprint', 'nextFingerprint', 'slides']);
const SLIDE_IDENTITY_KEYS = new Set(['id', 'fingerprint', 'previousFingerprint', 'nextFingerprint']);
const ROOT_KEYS = new Set(['version', 'sourceLyricsHash', 'identities', 'blocks']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value, allowed) => Object.keys(value).every((key) => allowed.has(key));

const invariant = (condition, message) => {
  if (!condition) throw new TypeError(message);
};

const assertId = (value, path) => {
  invariant(typeof value === 'string' && ID_PATTERN.test(value), `${path} must be a stable identifier.`);
};

// Deterministic content fingerprint. It is an edit detector, not a security primitive.
export const hashLyricsSource = (value) => {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').normalize('NFC');
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(text);
  bytes.forEach((byte) => {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  });
  return `lf1-${hash.toString(16).padStart(8, '0')}`;
};

const validateAnchor = (anchor, path) => {
  invariant(isPlainObject(anchor) && hasOnlyKeys(anchor, ANCHOR_KEYS), `${path} is invalid.`);
  invariant(typeof anchor.quote === 'string' && anchor.quote.length > 0, `${path}.quote is required.`);
  invariant(anchor.quote.length <= LYRIC_FORMATTING_LIMITS.maxAnchorQuoteLength, `${path}.quote is too long.`);
  ['prefix', 'suffix'].forEach((key) => {
    invariant(anchor[key] === undefined || typeof anchor[key] === 'string', `${path}.${key} must be text.`);
    invariant((anchor[key]?.length || 0) <= LYRIC_FORMATTING_LIMITS.maxAnchorContextLength, `${path}.${key} is too long.`);
  });
};

const validateStyle = (style, path) => {
  invariant(isPlainObject(style) && hasOnlyKeys(style, STYLE_KEYS), `${path} contains unsupported properties.`);
  invariant(Object.keys(style).length > 0, `${path} must declare at least one property.`);
  if ('bold' in style) invariant(typeof style.bold === 'boolean', `${path}.bold must be boolean.`);
  if ('transform' in style) invariant(TRANSFORMS.has(style.transform), `${path}.transform is invalid.`);
  if ('scale' in style) invariant(SCALES.has(style.scale), `${path}.scale is invalid.`);
  if ('color' in style) invariant(COLORS.has(style.color), `${path}.color is invalid.`);
  if ('spacing' in style) invariant(SPACINGS.has(style.spacing), `${path}.spacing is invalid.`);
};

const validateScope = (scope, path) => {
  invariant(isPlainObject(scope) && hasOnlyKeys(scope, SCOPE_KEYS), `${path} is invalid.`);
  invariant(SCOPE_TYPES.has(scope.type), `${path}.type is invalid.`);
  assertId(scope.sectionId, `${path}.sectionId`);
  if (scope.type === 'slide') assertId(scope.slideId, `${path}.slideId`);
  else invariant(scope.slideId === undefined, `${path}.slideId is only valid for slide scope.`);
};

const validateTemplate = (template, path) => {
  invariant(isPlainObject(template) && hasOnlyKeys(template, TEMPLATE_KEYS), `${path} is invalid.`);
  invariant(Object.hasOwn(LYRIC_FORMATTING_TEMPLATES, template.id), `${path}.id is invalid.`);
  invariant(template.version === 1, `${path}.version is invalid.`);
  invariant(Array.isArray(template.slots) && template.slots.length > 0, `${path}.slots requires an explicit selection.`);
  invariant(template.slots.length <= LYRIC_FORMATTING_LIMITS.maxTemplateSlots, `${path}.slots exceeds the limit.`);
  const roles = LYRIC_FORMATTING_TEMPLATES[template.id];
  const ids = new Set();
  template.slots.forEach((slot, index) => {
    const slotPath = `${path}.slots[${index}]`;
    invariant(isPlainObject(slot) && hasOnlyKeys(slot, SLOT_KEYS), `${slotPath} is invalid.`);
    assertId(slot.id, `${slotPath}.id`);
    invariant(!ids.has(slot.id), `${slotPath}.id is duplicated.`);
    ids.add(slot.id);
    invariant(Object.hasOwn(roles, slot.role), `${slotPath}.role is invalid for ${template.id}.`);
    validateAnchor(slot.anchor, `${slotPath}.anchor`);
  });
};

export const validateLyricFormatting = (value, { lyricsRaw } = {}) => {
  if (value === undefined || value === null) return null;
  invariant(isPlainObject(value) && hasOnlyKeys(value, ROOT_KEYS), 'lyricFormatting is invalid.');
  invariant(value.version === LYRIC_FORMATTING_VERSION, 'lyricFormatting.version is unsupported.');
  invariant(typeof value.sourceLyricsHash === 'string' && /^lf1-[a-f0-9]{8}$/.test(value.sourceLyricsHash), 'lyricFormatting.sourceLyricsHash is invalid.');
  invariant(Array.isArray(value.blocks), 'lyricFormatting.blocks must be an array.');
  invariant(value.blocks.length <= LYRIC_FORMATTING_LIMITS.maxBlocks, 'lyricFormatting.blocks exceeds the limit.');
  if (lyricsRaw !== undefined) {
    invariant(String(lyricsRaw).length <= LYRIC_FORMATTING_LIMITS.maxLyricsLength, 'lyricsRaw exceeds the formatting limit.');
  }

  if (value.identities !== undefined) {
    invariant(isPlainObject(value.identities) && hasOnlyKeys(value.identities, IDENTITY_KEYS), 'lyricFormatting.identities is invalid.');
    invariant(Array.isArray(value.identities.sections), 'lyricFormatting.identities.sections must be an array.');
    const sectionIds = new Set();
    const slideIds = new Set();
    value.identities.sections.forEach((section, sectionIndex) => {
      const path = `lyricFormatting.identities.sections[${sectionIndex}]`;
      invariant(isPlainObject(section) && hasOnlyKeys(section, SECTION_IDENTITY_KEYS), `${path} is invalid.`);
      assertId(section.id, `${path}.id`);
      invariant(!sectionIds.has(section.id), `${path}.id is duplicated.`);
      sectionIds.add(section.id);
      invariant(typeof section.fingerprint === 'string', `${path}.fingerprint is required.`);
      invariant(typeof section.titleFingerprint === 'string', `${path}.titleFingerprint is required.`);
      invariant(section.previousFingerprint === null || typeof section.previousFingerprint === 'string', `${path}.previousFingerprint is invalid.`);
      invariant(section.nextFingerprint === null || typeof section.nextFingerprint === 'string', `${path}.nextFingerprint is invalid.`);
      invariant(Array.isArray(section.slides), `${path}.slides must be an array.`);
      section.slides.forEach((slide, slideIndex) => {
        const slidePath = `${path}.slides[${slideIndex}]`;
        invariant(isPlainObject(slide) && hasOnlyKeys(slide, SLIDE_IDENTITY_KEYS), `${slidePath} is invalid.`);
        assertId(slide.id, `${slidePath}.id`);
        invariant(!slideIds.has(slide.id), `${slidePath}.id is duplicated.`);
        slideIds.add(slide.id);
        invariant(typeof slide.fingerprint === 'string', `${slidePath}.fingerprint is required.`);
        invariant(slide.previousFingerprint === null || typeof slide.previousFingerprint === 'string', `${slidePath}.previousFingerprint is invalid.`);
        invariant(slide.nextFingerprint === null || typeof slide.nextFingerprint === 'string', `${slidePath}.nextFingerprint is invalid.`);
      });
    });
  }

  const blockIds = new Set();
  value.blocks.forEach((block, blockIndex) => {
    const path = `lyricFormatting.blocks[${blockIndex}]`;
    invariant(isPlainObject(block) && hasOnlyKeys(block, BLOCK_KEYS), `${path} is invalid.`);
    assertId(block.id, `${path}.id`);
    invariant(!blockIds.has(block.id), `${path}.id is duplicated.`);
    blockIds.add(block.id);
    validateScope(block.scope, `${path}.scope`);
    invariant(typeof block.sourceHash === 'string' && /^lf1-[a-f0-9]{8}$/.test(block.sourceHash), `${path}.sourceHash is invalid.`);
    invariant(RECONCILIATION_STATES.has(block.reconciliation), `${path}.reconciliation is invalid.`);
    if (block.template !== undefined) validateTemplate(block.template, `${path}.template`);
    invariant(Array.isArray(block.segments), `${path}.segments must be an array.`);
    invariant(block.segments.length <= LYRIC_FORMATTING_LIMITS.maxSegmentsPerBlock, `${path}.segments exceeds the limit.`);
    const segmentIds = new Set();
    block.segments.forEach((segment, segmentIndex) => {
      const segmentPath = `${path}.segments[${segmentIndex}]`;
      invariant(isPlainObject(segment) && hasOnlyKeys(segment, SEGMENT_KEYS), `${segmentPath} is invalid.`);
      assertId(segment.id, `${segmentPath}.id`);
      invariant(!segmentIds.has(segment.id), `${segmentPath}.id is duplicated.`);
      segmentIds.add(segment.id);
      validateAnchor(segment.anchor, `${segmentPath}.anchor`);
      validateStyle(segment.style, `${segmentPath}.style`);
      invariant(RECONCILIATION_STATES.has(segment.reconciliation), `${segmentPath}.reconciliation is invalid.`);
    });
  });
  return value;
};

const anchorMatches = (text, anchor) => {
  const matches = [];
  let from = 0;
  while (from <= text.length - anchor.quote.length) {
    const start = text.indexOf(anchor.quote, from);
    if (start === -1) break;
    const end = start + anchor.quote.length;
    const prefixMatches = anchor.prefix === undefined || text.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix;
    const suffixMatches = anchor.suffix === undefined || text.slice(end, end + anchor.suffix.length) === anchor.suffix;
    if (prefixMatches && suffixMatches) matches.push({ start, end });
    from = start + Math.max(1, anchor.quote.length);
  }
  return matches;
};

export const reconcileTextAnchor = (text, anchor) => {
  validateAnchor(anchor, 'anchor');
  const matches = anchorMatches(String(text ?? ''), anchor);
  if (matches.length === 0) return { status: 'stale', range: null };
  if (matches.length > 1) return { status: 'ambiguous', range: null };
  return { status: 'resolved', range: matches[0] };
};

const scopeMatches = (scope, sectionId, slideId) => scope.sectionId === sectionId
  && (scope.type === 'section' || scope.slideId === slideId);

const buildRuns = (text, layers) => {
  if (!layers.length) return [{ text, style: {} }];
  const boundaries = new Set([0, text.length]);
  layers.forEach(({ start, end }) => { boundaries.add(start); boundaries.add(end); });
  const sorted = [...boundaries].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((start, index) => {
    const end = sorted[index + 1];
    const style = layers
      .filter((layer) => layer.start <= start && layer.end >= end)
      .sort((a, b) => a.priority - b.priority)
      .reduce((result, layer) => ({ ...result, ...layer.style }), {});
    return { text: text.slice(start, end), style };
  }).filter((run) => run.text.length > 0);
};

export const resolveLyricFormatting = ({ lyricsRaw, text, sectionText, sectionId, slideId, lyricFormatting, generalStyle }) => {
  const sourceText = String(text ?? '');
  if (lyricFormatting === undefined || lyricFormatting === null) {
    return { applied: false, status: 'legacy', generalStyle, runs: [{ text: sourceText, style: {} }], diagnostics: [] };
  }
  validateLyricFormatting(lyricFormatting, { lyricsRaw });
  if (hashLyricsSource(lyricsRaw) !== lyricFormatting.sourceLyricsHash) {
    return { applied: false, status: 'stale', generalStyle, runs: [{ text: sourceText, style: {} }], diagnostics: ['lyrics-source-changed'] };
  }

  const blocks = lyricFormatting.blocks.filter((block) => scopeMatches(block.scope, sectionId, slideId));
  if (!blocks.length) {
    return { applied: false, status: 'unselected', generalStyle, runs: [{ text: sourceText, style: {} }], diagnostics: [] };
  }

  const layers = [];
  const diagnostics = [];
  blocks.forEach((block) => {
    const scopeText = block.scope.type === 'section' ? String(sectionText ?? sourceText) : sourceText;
    if (block.reconciliation !== 'resolved' || block.sourceHash !== hashLyricsSource(scopeText)) {
      diagnostics.push(`${block.id}:stale`);
      return;
    }
    block.template?.slots.forEach((slot) => {
      const scopeResult = reconcileTextAnchor(scopeText, slot.anchor);
      if (scopeResult.status !== 'resolved') diagnostics.push(`${slot.id}:${scopeResult.status}`);
      else {
        const pageResult = reconcileTextAnchor(sourceText, slot.anchor);
        if (pageResult.status === 'resolved') layers.push({ ...pageResult.range, priority: 1, style: LYRIC_FORMATTING_TEMPLATES[block.template.id][slot.role] });
      }
    });
    block.segments.forEach((segment) => {
      if (segment.reconciliation !== 'resolved') {
        diagnostics.push(`${segment.id}:${segment.reconciliation}`);
        return;
      }
      const scopeResult = reconcileTextAnchor(scopeText, segment.anchor);
      if (scopeResult.status !== 'resolved') diagnostics.push(`${segment.id}:${scopeResult.status}`);
      else {
        const pageResult = reconcileTextAnchor(sourceText, segment.anchor);
        if (pageResult.status === 'resolved') layers.push({ ...pageResult.range, priority: 2, style: segment.style });
      }
    });
  });

  return {
    applied: layers.length > 0,
    status: layers.length > 0 ? (diagnostics.length ? 'partial' : 'resolved') : (diagnostics.some((item) => item.endsWith(':ambiguous')) ? 'ambiguous' : 'stale'),
    generalStyle,
    runs: buildRuns(sourceText, layers),
    diagnostics,
  };
};

export const createLyricFormattingSidecar = ({ lyricsRaw, identities, blocks = [] }) => {
  const value = {
    version: LYRIC_FORMATTING_VERSION,
    sourceLyricsHash: hashLyricsSource(lyricsRaw),
    ...(identities ? { identities } : {}),
    blocks,
  };
  validateLyricFormatting(value, { lyricsRaw });
  return value;
};

import assert from 'node:assert/strict';
import {
  LYRIC_FORMATTING_LIMITS,
  createLyricFormattingSidecar,
  hashLyricsSource,
  reconcileTextAnchor,
  resolveLyricFormatting,
  validateLyricFormatting,
} from '../src/utils/lyricFormatting.js';

const style = Object.freeze({ preset: 'worship', motion: 'dynamic', alignment: 'center', backgroundTreatment: 'auto' });
const lyricsRaw = '# Verso 1\nTu amor permanece\n\n# Coro 1\nTu gracia es suficiente\nTu presencia es mi hogar\n\n# Verso 2\nTu voz me guía';
const chorusText = 'Tu gracia es suficiente\nTu presencia es mi hogar';

const block = ({
  id = 'block-chorus-1',
  sectionId = 'section-chorus-stable',
  slideId,
  text = chorusText,
  template,
  segments = [],
  reconciliation = 'resolved',
} = {}) => ({
  id,
  scope: slideId ? { type: 'slide', sectionId, slideId } : { type: 'section', sectionId },
  sourceHash: hashLyricsSource(text),
  ...(template ? { template } : {}),
  segments,
  reconciliation,
});

const segment = ({ id = 'manual-grace', quote = 'Tu gracia', prefix, suffix = ' es suficiente', style: patch = { bold: true, transform: 'uppercase', scale: 'xl' }, reconciliation = 'resolved' } = {}) => ({
  id,
  anchor: { quote, ...(prefix !== undefined ? { prefix } : {}), ...(suffix !== undefined ? { suffix } : {}) },
  style: patch,
  reconciliation,
});

const template = (id = 'double-emphasis') => ({
  id,
  version: 1,
  slots: [
    { id: 'slot-grace-main', role: 'primary', anchor: { quote: 'Tu gracia', suffix: ' es suficiente' } },
    { id: 'slot-grace-answer', role: 'secondary', anchor: { quote: 'es suficiente', prefix: 'Tu gracia ' } },
    { id: 'slot-presence-main', role: 'primary', anchor: { quote: 'Tu presencia', suffix: ' es mi hogar' } },
    { id: 'slot-presence-answer', role: 'secondary', anchor: { quote: 'es mi hogar', prefix: 'Tu presencia ' } },
  ],
});

const sidecar = (...blocks) => createLyricFormattingSidecar({ lyricsRaw, blocks });
const resolve = (formatting, overrides = {}) => resolveLyricFormatting({
  lyricsRaw,
  text: chorusText,
  sectionId: 'section-chorus-stable',
  slideId: 'slide-chorus-stable',
  lyricFormatting: formatting,
  generalStyle: style,
  ...overrides,
});

// 1, 18: legacy documents remain byte-for-byte plain and keep the same style object.
const legacy = resolve(undefined);
assert.equal(legacy.status, 'legacy');
assert.deepEqual(legacy.runs, [{ text: chorusText, style: {} }]);
assert.strictEqual(legacy.generalStyle, style);

// 2: normal verse -> formatted chorus -> normal verse.
const chorusOnly = sidecar(block({ segments: [segment()] }));
assert.equal(resolve(chorusOnly, { text: 'Tu amor permanece', sectionId: 'section-verse-1' }).status, 'unselected');
assert.equal(resolve(chorusOnly).applied, true);
assert.equal(resolve(chorusOnly, { text: 'Tu voz me guía', sectionId: 'section-verse-2' }).status, 'unselected');

// 3: a template applies only to its explicitly selected block.
const templated = sidecar(block({ template: template() }));
assert.equal(resolve(templated).runs.filter((run) => run.style.scale === 'xl').length, 2);
assert.equal(resolve(templated, { sectionId: 'section-other' }).applied, false);

// 4: manual formatting applies to one phrase, not its answer.
const manual = resolve(chorusOnly);
assert.deepEqual(manual.runs.find((run) => run.text === 'Tu gracia').style, { bold: true, transform: 'uppercase', scale: 'xl' });
assert.deepEqual(manual.runs.filter((run) => run.text !== 'Tu gracia').map((run) => run.style), [{}]);

// 5: manual properties override template properties while undeclared template properties survive.
const composed = sidecar(block({ template: template(), segments: [segment({ style: { color: 'accent', scale: 'lg' } })] }));
const grace = resolve(composed).runs.find((run) => run.text === 'Tu gracia');
assert.deepEqual(grace.style, { bold: true, transform: 'uppercase', scale: 'lg', color: 'accent' });

// 6, 7: rich formatting never mutates or replaces general preset/motion.
assert.strictEqual(resolve(composed).generalStyle, style);
assert.equal(resolve(composed).generalStyle.preset, 'worship');
assert.equal(resolve(composed).generalStyle.motion, 'dynamic');

// 8: repeated phrases require context; unresolved duplicates are ambiguous and never styled.
assert.equal(reconcileTextAnchor('Santo\nSanto', { quote: 'Santo' }).status, 'ambiguous');
assert.equal(reconcileTextAnchor('Santo\nSanto', { quote: 'Santo', suffix: '\nSanto' }).status, 'resolved');
const repeatedText = 'Santo\nSanto';
const repeated = createLyricFormattingSidecar({ lyricsRaw: repeatedText, blocks: [block({ text: repeatedText, segments: [segment({ quote: 'Santo', suffix: '' })] })] });
assert.equal(resolveLyricFormatting({ lyricsRaw: repeatedText, text: repeatedText, sectionId: 'section-chorus-stable', lyricFormatting: repeated, generalStyle: style }).status, 'ambiguous');

// 9, 12: duplicate names and reordered sections remain isolated by stable IDs, not title/index.
const duplicates = sidecar(block({ sectionId: 'chorus-instance-a', segments: [segment()] }));
assert.equal(resolve(duplicates, { sectionId: 'chorus-instance-b' }).applied, false);
assert.equal(resolve(duplicates, { sectionId: 'chorus-instance-a' }).applied, true);

// 10, 11: edited lyrics, missing anchors and pre-marked stale records never migrate silently.
assert.equal(resolve(chorusOnly, { lyricsRaw: `${lyricsRaw}\nNueva línea` }).status, 'stale');
const missing = sidecar(block({ segments: [segment({ quote: 'Frase ausente', suffix: undefined })] }));
assert.equal(resolve(missing).status, 'stale');
const stale = sidecar(block({ segments: [segment({ reconciliation: 'stale' })] }));
assert.equal(resolve(stale).applied, false);

// 13: Unicode is normalized deterministically without changing displayed text.
assert.equal(hashLyricsSource('Canción'), hashLyricsSource('Cancio\u0301n'));
const accentedText = 'Él está aquí';
const accented = createLyricFormattingSidecar({ lyricsRaw: accentedText, blocks: [block({ text: accentedText, segments: [segment({ quote: 'Él', suffix: ' está aquí' })] })] });
assert.equal(resolveLyricFormatting({ lyricsRaw: accentedText, text: accentedText, sectionId: 'section-chorus-stable', lyricFormatting: accented, generalStyle: style }).applied, true);

// 14: identical medley text remains isolated by different persistent section IDs.
const medley = createLyricFormattingSidecar({ lyricsRaw: chorusText, blocks: [block({ sectionId: 'medley-song-a', segments: [segment()] })] });
assert.equal(resolveLyricFormatting({ lyricsRaw: chorusText, text: chorusText, sectionId: 'medley-song-b', lyricFormatting: medley, generalStyle: style }).applied, false);

// 15: arbitrary HTML/CSS/URLs/classes and unknown keys are rejected.
for (const maliciousStyle of [
  { html: '<b>unsafe</b>' },
  { color: 'url(javascript:alert(1))' },
  { className: 'fixed inset-0' },
  { fontSize: '9999px' },
]) {
  assert.throws(() => sidecar(block({ segments: [segment({ style: maliciousStyle })] })), /unsupported|invalid/);
}
assert.throws(() => validateLyricFormatting({ ...chorusOnly, unexpected: true }), /invalid/);

// 16: bounded collections reject oversized payloads.
assert.throws(() => sidecar(...Array.from({ length: LYRIC_FORMATTING_LIMITS.maxBlocks + 1 }, (_, index) => block({ id: `block-${index}`, sectionId: `section-${index}` }))), /exceeds/);
assert.throws(() => sidecar(block({ segments: Array.from({ length: LYRIC_FORMATTING_LIMITS.maxSegmentsPerBlock + 1 }, (_, index) => segment({ id: `segment-${index}` })) })), /exceeds/);

// 17: normalization, validation and resolution are deterministic and JSON serializable.
const serialized = JSON.stringify(composed);
assert.deepEqual(JSON.parse(serialized), composed);
assert.deepEqual(resolve(composed), resolve(JSON.parse(serialized)));
assert.strictEqual(validateLyricFormatting(composed, { lyricsRaw }), composed);

// Slide scope applies only to the selected stable slide ID.
const oneSlide = sidecar(block({ slideId: 'slide-a', segments: [segment()] }));
assert.equal(resolve(oneSlide, { slideId: 'slide-a' }).applied, true);
assert.equal(resolve(oneSlide, { slideId: 'slide-b' }).applied, false);

console.log('Projection V2.1 isolated lyric formatting tests: PASS');

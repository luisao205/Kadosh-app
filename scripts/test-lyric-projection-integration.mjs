import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsearCancion } from '../src/utils/songParser.js';
import { createLyricFormattingDraft, buildLyricFormattingDraftModel, serializeLyricFormattingIdentities } from '../src/utils/lyricFormattingDraft.js';
import {
  buildLyricProjectionIdentityModel,
  createResolvedLyricProjectionPayload,
  isSameProjectedLyricSlide,
  normalizeResolvedLyricProjectionPayload,
} from '../src/utils/lyricProjectionFormatting.js';

let sequence = 0;
const idFactory = (prefix) => `${prefix}:projection-${++sequence}`;
const lyricsRaw = [
  '# Coro 1',
  'Tu gracia es suficiente',
  'Tu presencia es mi hogar',
  '',
  'Tu gracia es suficiente',
  'Tu presencia es mi hogar',
  '',
  '# Puente',
  '[C]Santo por siempre',
].join('\n');
const sections = parsearCancion(lyricsRaw);
const draftModel = buildLyricFormattingDraftModel(sections, { idFactory });
const identities = serializeLyricFormattingIdentities(draftModel);
const chorus = draftModel[0];
const [slideA, slideB] = chorus.slides;
assert.equal(slideA.text, slideB.text);
assert.notEqual(slideA.id, slideB.id);

const style = Object.freeze({ preset: 'worship', motion: 'dynamic', alignment: 'center', backgroundTreatment: 'auto' });
const formatSlide = (current, slide) => createLyricFormattingDraft({
  lyricsRaw,
  identities,
  blocks: current?.blocks || [],
  section: chorus,
  slide,
  scopeType: 'slide',
  templateId: 'double-emphasis',
  selectedLineIds: slide.lines.map((line) => line.id),
  manualStyles: { [slide.lines[0].id]: { bold: true, scale: 'xl', color: 'accent' } },
});
const sidecarA = formatSlide(null, slideA);
const sidecarB = formatSlide(null, slideB);
const sidecarBoth = formatSlide(sidecarA, slideB);

const resolvePages = (lyricFormatting) => {
  const model = buildLyricProjectionIdentityModel({ lyricsRaw, sections, lyricFormatting });
  return model[0].slides.map((identitySlide) => createResolvedLyricProjectionPayload({
    lyricsRaw,
    lyricFormatting,
    identitySection: model[0],
    identitySlide,
    text: identitySlide.text,
    generalStyle: style,
  }));
};

const [onlyAOnA, onlyAOnB] = resolvePages(sidecarA);
assert.ok(onlyAOnA, 'Selected slide A receives a rich payload.');
assert.equal(onlyAOnB, null, 'Identical unselected slide B remains legacy.');
const [onlyBOnA, onlyBOnB] = resolvePages(sidecarB);
assert.equal(onlyBOnA, null, 'Unselected slide A remains legacy.');
assert.ok(onlyBOnB, 'Selected slide B receives a rich payload.');
const [bothA, bothB] = resolvePages(sidecarBoth);
assert.ok(bothA && bothB, 'Both identical slides can be formatted explicitly.');
assert.notEqual(bothA.slideId, bothB.slideId);
assert.equal(isSameProjectedLyricSlide({ slideId: bothA.slideId, texto: bothA.text }, { slideId: bothB.slideId, texto: bothB.text }), false);
assert.equal(isSameProjectedLyricSlide({ slideId: bothA.slideId, texto: bothA.text }, { slideId: bothA.slideId, texto: bothA.text }), true);
assert.equal(isSameProjectedLyricSlide({ texto: 'Legacy' }, { texto: 'Legacy' }), true);

// A -> B -> A, bridge return and same-slide repetition preserve opaque identity.
assert.equal(onlyAOnA.slideId, slideA.id);
assert.equal(onlyAOnB, null);
assert.equal(resolvePages(sidecarA)[0].slideId, slideA.id);
assert.equal(resolvePages(sidecarA)[0].formatIdentity, onlyAOnA.formatIdentity);
assert.equal(buildLyricProjectionIdentityModel({ lyricsRaw, sections, lyricFormatting: sidecarA })[1].id, draftModel[1].id);

assert.equal(onlyAOnA.text, slideA.text);
assert.equal(onlyAOnA.segments.map((segment) => segment.text).join(''), slideA.text);
assert.strictEqual(style.motion, 'dynamic');
assert.strictEqual(style.preset, 'worship');
assert.equal(JSON.stringify(onlyAOnA).includes('[C]'), false, 'Chord-free visible text remains chord-free.');

assert.equal(buildLyricProjectionIdentityModel({ lyricsRaw, sections, lyricFormatting: null }), null);
assert.equal(normalizeResolvedLyricProjectionPayload(null, slideA.text), null);
assert.ok(normalizeResolvedLyricProjectionPayload(onlyAOnA, slideA.text));
assert.deepEqual(
  normalizeResolvedLyricProjectionPayload(JSON.parse(JSON.stringify(onlyAOnA)), slideA.text),
  onlyAOnA,
  'A reload-safe JSON round trip preserves identity and resolved segments.',
);
assert.equal(normalizeResolvedLyricProjectionPayload({ ...onlyAOnA, text: 'Texto sustituido' }, slideA.text), null);
assert.equal(normalizeResolvedLyricProjectionPayload({ ...onlyAOnA, reconciliation: 'ambiguous' }, slideA.text), null);
assert.equal(normalizeResolvedLyricProjectionPayload({ ...onlyAOnA, segments: [{ text: slideA.text, style: { className: 'fixed' } }] }, slideA.text), null);

const staleLyrics = `${lyricsRaw}\nNueva frase`;
assert.equal(buildLyricProjectionIdentityModel({ lyricsRaw: staleLyrics, sections: parsearCancion(staleLyrics), lyricFormatting: sidecarA }), null);

const resolvedModel = buildLyricProjectionIdentityModel({ lyricsRaw, sections, lyricFormatting: sidecarA });
assert.equal(createResolvedLyricProjectionPayload({
  lyricsRaw,
  lyricFormatting: sidecarA,
  identitySection: { ...resolvedModel[0], ambiguous: true },
  identitySlide: resolvedModel[0].slides[0],
  text: resolvedModel[0].slides[0].text,
  generalStyle: style,
}), null, 'An ambiguous identity never produces rich output.');

const controllerSource = fs.readFileSync(new URL('../src/components/live/ProyectorController.jsx', import.meta.url), 'utf8');
const projectorSource = fs.readFileSync(new URL('../src/components/live/Proyector.jsx', import.meta.url), 'utf8');
const singersSource = fs.readFileSync(new URL('../src/components/live/StageDisplayCantantes.jsx', import.meta.url), 'utf8');
const musiciansSource = fs.readFileSync(new URL('../src/components/live/StageDisplayMusicos.jsx', import.meta.url), 'utf8');
assert.match(controllerSource, /sectionId: slide\.sectionId \|\| null/);
assert.match(controllerSource, /slideId: slide\.slideId \|\| null/);
assert.match(controllerSource, /richLyrics: slide\.richLyrics \|\| null/);
assert.match(projectorSource, /normalizeResolvedLyricProjectionPayload\(slide\?\.richLyrics, slide\?\.texto\)/);
assert.match(projectorSource, /resolvedRichLyrics \? \(/);
assert.match(projectorSource, /<RichLyricText/);
assert.match(projectorSource, /<AutoFitText/);
assert.match(singersSource, /setSlide\(data\.proyectorSlide \|\| null\)/);
assert.match(musiciansSource, /setSlide\(data\.proyectorSlide \|\| null\)/);

console.log('Projection V2.1 lyric payload and projector integration: PASS');

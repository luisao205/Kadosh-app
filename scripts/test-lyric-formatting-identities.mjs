import assert from 'node:assert/strict';
import { parsearCancion } from '../src/utils/songParser.js';
import { resolveLyricFormatting, validateLyricFormatting } from '../src/utils/lyricFormatting.js';
import {
  buildLyricFormattingDraftModel,
  createLyricFormattingDraft,
  serializeLyricFormattingIdentities,
} from '../src/utils/lyricFormattingDraft.js';

let sequence = 0;
const idFactory = (prefix) => `${prefix}:test-${++sequence}`;
const raw = [
  '# Verso 1',
  '[C]Normal',
  '',
  '# Coro 1',
  'Que ruja el le[F#m]ón',
  'Ante la ma[D]jestad',
  '',
  'Que ruja el le[F#m]ón',
  'Ante la ma[D]jestad',
  '',
  '# Verso 2',
  '[E]Normal otra vez',
].join('\n');

const model = buildLyricFormattingDraftModel(parsearCancion(raw), { idFactory });
const chorus = model[1];
assert.equal(chorus.slides.length, 2, 'Blank lines keep two pages in one section.');
assert.equal(chorus.slides[0].text, chorus.slides[1].text);
assert.notEqual(chorus.slides[0].id, chorus.slides[1].id, 'Identical pages have separate opaque IDs.');
assert.equal(chorus.slides.every((slide) => !slide.ambiguous), true);

const identities = serializeLyricFormattingIdentities(model);
const stableModel = buildLyricFormattingDraftModel(parsearCancion(raw), { identities, idFactory });
assert.deepEqual(serializeLyricFormattingIdentities(stableModel), identities, 'Serialization and reload are stable.');

const style = { preset: 'worship', motion: 'dynamic', alignment: 'center', backgroundTreatment: 'auto' };
const formatSlide = (current, slide) => createLyricFormattingDraft({
  lyricsRaw: raw,
  identities,
  blocks: current?.blocks || [],
  section: chorus,
  slide,
  scopeType: 'slide',
  templateId: 'single-emphasis',
  selectedLineIds: [slide.lines[0].id],
  manualStyles: { [slide.lines[0].id]: { bold: true } },
});
const onlyA = formatSlide(null, chorus.slides[0]);
assert.equal(resolveLyricFormatting({ lyricsRaw: raw, text: chorus.slides[0].text, sectionText: chorus.text, sectionId: chorus.id, slideId: chorus.slides[0].id, lyricFormatting: onlyA, generalStyle: style }).applied, true);
assert.equal(resolveLyricFormatting({ lyricsRaw: raw, text: chorus.slides[1].text, sectionText: chorus.text, sectionId: chorus.id, slideId: chorus.slides[1].id, lyricFormatting: onlyA, generalStyle: style }).status, 'unselected');
const onlyB = formatSlide(null, chorus.slides[1]);
assert.equal(resolveLyricFormatting({ lyricsRaw: raw, text: chorus.slides[0].text, sectionText: chorus.text, sectionId: chorus.id, slideId: chorus.slides[0].id, lyricFormatting: onlyB, generalStyle: style }).status, 'unselected');
assert.equal(resolveLyricFormatting({ lyricsRaw: raw, text: chorus.slides[1].text, sectionText: chorus.text, sectionId: chorus.id, slideId: chorus.slides[1].id, lyricFormatting: onlyB, generalStyle: style }).applied, true);
const both = formatSlide(onlyA, chorus.slides[1]);
assert.equal(both.blocks.length, 2, 'Both identical pages can be selected explicitly.');
assert.strictEqual(resolveLyricFormatting({ lyricsRaw: raw, text: chorus.slides[1].text, sectionText: chorus.text, sectionId: chorus.id, slideId: chorus.slides[1].id, lyricFormatting: both, generalStyle: style }).generalStyle, style);
validateLyricFormatting(both, { lyricsRaw: raw });

const insertedRaw = raw.replace('# Verso 2', 'Página nueva\n\n# Verso 2');
const inserted = buildLyricFormattingDraftModel(parsearCancion(insertedRaw), { identities, idFactory });
assert.equal(inserted[0].id, model[0].id, 'Unaffected section identity survives page insertion elsewhere.');
const deletedRaw = raw.replace('Que ruja el le[F#m]ón\nAnte la ma[D]jestad\n\nQue ruja el le[F#m]ón\nAnte la ma[D]jestad', 'Que ruja el le[F#m]ón\nAnte la ma[D]jestad');
const deleted = buildLyricFormattingDraftModel(parsearCancion(deletedRaw), { identities, idFactory });
assert.equal(deleted[1].slides.length, 1, 'Deleting one page does not recreate it.');

const movedRaw = ['# Verso 2', '[E]Normal otra vez', '', '# Verso 1', '[C]Normal', '', '# Coro 1', 'Que ruja el le[F#m]ón', 'Ante la ma[D]jestad', '', 'Que ruja el le[F#m]ón', 'Ante la ma[D]jestad'].join('\n');
const moved = buildLyricFormattingDraftModel(parsearCancion(movedRaw), { identities, idFactory });
assert.equal(moved.find((section) => section.title === 'Verso 1').id, model[0].id, 'Section moves preserve unique identities.');

const editedRaw = raw.replace('[C]Normal', '[C]Normal editado');
const edited = buildLyricFormattingDraftModel(parsearCancion(editedRaw), { identities, idFactory });
assert.equal(edited[0].id, model[0].id, 'A uniquely contextualized text edit preserves section identity.');
assert.equal(edited[0].slides[0].id, model[0].slides[0].id, 'A uniquely contextualized text edit preserves slide identity.');

const duplicatedRaw = `${raw}\n\n# Coro 1\nQue ruja el le[F#m]ón\nAnte la ma[D]jestad\n\nQue ruja el le[F#m]ón\nAnte la ma[D]jestad`;
const duplicated = buildLyricFormattingDraftModel(parsearCancion(duplicatedRaw), { identities, idFactory });
assert.equal(duplicated.filter((section) => section.title === 'Coro 1').some((section) => section.ambiguous), true, 'An equally valid duplicate is marked ambiguous.');

const ambiguousPageRaw = raw.replace('Ante la ma[D]jestad\n\n# Verso 2', 'Ante la ma[D]jestad\n\nQue ruja el le[F#m]ón\nAnte la ma[D]jestad\n\n# Verso 2');
const ambiguous = buildLyricFormattingDraftModel(parsearCancion(ambiguousPageRaw), { identities, idFactory });
assert.equal(ambiguous[1].slides.some((slide) => slide.ambiguous), true);
const remapped = buildLyricFormattingDraftModel(parsearCancion(ambiguousPageRaw), {
  identities,
  idFactory,
  manualRemaps: { 'slide:1:0': chorus.slides[0].id },
});
assert.equal(remapped[1].slides[0].id, chorus.slides[0].id, 'Manual remap selects an explicit previous identity.');

assert.equal(raw.includes('[F#m]') && raw.includes('[D]'), true, 'Chord source remains unchanged.');
assert.equal(both.sourceLyricsHash, onlyA.sourceLyricsHash);
assert.equal(JSON.stringify(both).includes('firebase'), false);
console.log('Projection V2.1 persistent identity contract: PASS');

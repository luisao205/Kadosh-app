import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsearCancion } from '../src/utils/songParser.js';
import { resolveLyricFormatting } from '../src/utils/lyricFormatting.js';
import { buildLyricFormattingDraftModel, createLyricFormattingDraft, serializeLyricFormattingIdentities } from '../src/utils/lyricFormattingDraft.js';

const lyricsRaw = '# Verso 1\nTodo comienza aquí\n\n# Coro 1\nTu gracia es suficiente\nTu presencia es mi hogar\n\n# Verso 2\nTodo vuelve a ti';
const generalStyle = { preset: 'worship', motion: 'dynamic', alignment: 'center', backgroundTreatment: 'auto' };
const model = buildLyricFormattingDraftModel(parsearCancion(lyricsRaw));
const verse1 = model.find((section) => section.title === 'Verso 1');
const chorus = model.find((section) => section.title === 'Coro 1');
const verse2 = model.find((section) => section.title === 'Verso 2');
assert.ok(verse1 && chorus && verse2, 'The editor model must expose each parsed section.');
assert.notEqual(verse1.id, verse2.id, 'Sections are identified by content, not only by their title family.');

const chorusSlide = chorus.slides[0];
const selectedLineIds = chorusSlide.lines.map((line) => line.id);
const manualStyles = {
  [selectedLineIds[0]]: { bold: true, transform: 'uppercase', scale: 'xl', color: 'accent', spacing: 'normal' },
};
const formatting = createLyricFormattingDraft({
  lyricsRaw,
  section: chorus,
  slide: chorusSlide,
  scopeType: 'slide',
  templateId: 'double-emphasis',
  selectedLineIds,
  manualStyles,
});

const resolve = (section, slide = section.slides[0]) => resolveLyricFormatting({
  lyricsRaw,
  text: slide.text,
  sectionText: section.text,
  sectionId: section.id,
  slideId: slide.id,
  lyricFormatting: formatting,
  generalStyle,
});

assert.equal(resolve(chorus).applied, true, 'Coro 1 receives its explicit draft.');
assert.equal(resolve(verse1).status, 'unselected', 'Verso 1 remains untouched.');
assert.equal(resolve(verse2).status, 'unselected', 'Verso 2 remains untouched.');
assert.strictEqual(resolve(chorus).generalStyle, generalStyle, 'Preset and motion remain owned by the general style.');
assert.equal(resolve(chorus).runs.find((run) => run.text === 'Tu gracia es suficiente').style.color, 'accent', 'Manual values override the template.');

const onePropertyFormatting = createLyricFormattingDraft({
  lyricsRaw,
  section: chorus,
  slide: chorusSlide,
  scopeType: 'slide',
  templateId: 'single-emphasis',
  selectedLineIds: [selectedLineIds[0]],
  manualStyles: { [selectedLineIds[0]]: { bold: false } },
});
const onePropertyRun = resolveLyricFormatting({ lyricsRaw, text: chorusSlide.text, sectionText: chorus.text, sectionId: chorus.id, slideId: chorusSlide.id, lyricFormatting: onePropertyFormatting, generalStyle })
  .runs.find((run) => run.text === 'Tu gracia es suficiente');
assert.equal(onePropertyRun.style.bold, false);
assert.equal(onePropertyRun.style.scale, 'xl', 'Undeclared manual properties continue inheriting the template.');

const sectionFormatting = createLyricFormattingDraft({
  lyricsRaw,
  section: chorus,
  slide: chorusSlide,
  scopeType: 'section',
  templateId: 'single-emphasis',
  selectedLineIds: [selectedLineIds[0]],
});
assert.equal(resolveLyricFormatting({ lyricsRaw, text: chorusSlide.text, sectionText: chorus.text, sectionId: chorus.id, slideId: chorusSlide.id, lyricFormatting: sectionFormatting, generalStyle }).applied, true);

const reorderedRaw = '# Verso 2\nTodo vuelve a ti\n\n# Coro 1\nTu gracia es suficiente\nTu presencia es mi hogar\n\n# Verso 1\nTodo comienza aquí';
const reordered = buildLyricFormattingDraftModel(parsearCancion(reorderedRaw), { identities: serializeLyricFormattingIdentities(model) });
assert.equal(reordered.find((section) => section.title === 'Coro 1').id, chorus.id, 'Reordering sections preserves deterministic identity.');
assert.equal(reordered.find((section) => section.title === 'Coro 1').slides[0].id, chorusSlide.id, 'Reordering preserves slide identity.');

const duplicateRaw = '# Coro 1\nSanto\n\n# Coro 1\nSanto';
const duplicateModel = buildLyricFormattingDraftModel(parsearCancion(duplicateRaw));
assert.notEqual(duplicateModel[0].id, duplicateModel[1].id, 'New duplicate sections receive separate opaque identities.');
assert.equal(duplicateModel.every((section) => !section.ambiguous), true, 'A new draft can distinguish duplicate sections during the editing session.');

const repeatedPhraseRaw = '# Coro 1\nSanto\nSanto';
const repeatedModel = buildLyricFormattingDraftModel(parsearCancion(repeatedPhraseRaw));
const repeatedSlide = repeatedModel[0].slides[0];
const repeatedFormatting = createLyricFormattingDraft({
  lyricsRaw: repeatedPhraseRaw,
  section: repeatedModel[0],
  slide: repeatedSlide,
  scopeType: 'slide',
  templateId: 'alternating-lines',
  selectedLineIds: repeatedSlide.lines.map((line) => line.id),
});
assert.equal(resolveLyricFormatting({ lyricsRaw: repeatedPhraseRaw, text: repeatedSlide.text, sectionText: repeatedModel[0].text, sectionId: repeatedModel[0].id, slideId: repeatedSlide.id, lyricFormatting: repeatedFormatting, generalStyle }).status, 'resolved', 'Context anchors disambiguate repeated lines.');

const editorSource = await readFile(new URL('../src/components/admin/LyricFormattingDraftEditor.jsx', import.meta.url), 'utf8');
const editSongSource = await readFile(new URL('../src/components/admin/EditSong.jsx', import.meta.url), 'utf8');
assert.match(editorSource, /Restablecer borrador/);
assert.match(editorSource, /Aplicar al borrador/);
assert.match(editorSource, /Restaurar esta diapositiva/);
assert.match(editorSource, /Remapear esta diapositiva/);
assert.match(editorSource, /Remapear esta sección/);
assert.doesNotMatch(editorSource, /firebase|updateDoc|setDoc|addDoc|httpsCallable/i, 'The draft editor must not write formatting to Firebase.');
assert.match(editorSource, /initialFormatting/);
assert.match(editorSource, /onDraftChange/);
const saveSource = editSongSource.slice(editSongSource.indexOf('const handleSave'), editSongSource.indexOf('const handleSaveAndExit'));
assert.match(saveSource, /saveLyricFormattingV21\(payload\)/, 'Format-only changes use the dedicated callable.');
assert.match(saveSource, /saveLyricsAndFormattingV21\(payload\)/, 'Lyrics and formatting use one atomic callable.');
assert.match(saveSource, /expectedLyricsHash/);
assert.match(saveSource, /expectedFormattingHash/);
assert.match(saveSource, /Tus cambios se conservaron/, 'Partial failures preserve the draft and report pending areas.');
assert.equal(lyricsRaw, '# Verso 1\nTodo comienza aquí\n\n# Coro 1\nTu gracia es suficiente\nTu presencia es mi hogar\n\n# Verso 2\nTodo vuelve a ti', 'The draft never changes letraRaw.');

console.log('Projection V2.1 draft editor contract: PASS');

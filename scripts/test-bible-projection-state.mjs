import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildStoppedBibleProjectionPayload,
  capturePreviousProjectionFields,
  isMatchingBibleProjection,
  resolveActiveBibleProjectorState,
  resolveActiveBibleSlide
} from '../src/utils/bibleProjectionState.js';
import { commitBibleSelectionField, createBibleSelection, getBibleVerseNumbers, normalizeBibleSelection, selectBibleVerse, updateBibleSelectionDraft } from '../src/utils/bibleSelection.js';

let selection = selectBibleVerse(createBibleSelection(1), 1, 23);
selection = selectBibleVerse(selection, 5, 23);
assert.deepEqual(getBibleVerseNumbers(selection, 23), [1, 2, 3, 4, 5]);

selection = selectBibleVerse(createBibleSelection(5, 5, true), 8, 23);
assert.deepEqual(normalizeBibleSelection(selection, 23), { start: 5, end: 8, active: true });
selection = selectBibleVerse(selection, 5, 23);
assert.deepEqual(normalizeBibleSelection(selection, 23), { start: 8, end: 8, active: true });
selection = selectBibleVerse(selection, 12, 23);
assert.deepEqual(normalizeBibleSelection(selection, 23), { start: 8, end: 12, active: true });

selection = selectBibleVerse(createBibleSelection(5, 8, true), 8, 23);
assert.deepEqual(normalizeBibleSelection(selection, 23), { start: 5, end: 5, active: true });
selection = selectBibleVerse(selection, 12, 23);
assert.deepEqual(normalizeBibleSelection(selection, 23), { start: 5, end: 12, active: true });

selection = selectBibleVerse(createBibleSelection(21), 21, 23);
selection = selectBibleVerse(selection, 23, 23);
assert.deepEqual(getBibleVerseNumbers(selection, 23), [21, 22, 23]);

let draft = updateBibleSelectionDraft(createBibleSelection(1, 22, true), 'start', '');
assert.equal(draft.start, '');
draft = updateBibleSelectionDraft(draft, 'start', '2');
draft = updateBibleSelectionDraft(draft, 'start', '22');
draft = commitBibleSelectionField(draft, 'start', 123);
assert.deepEqual(draft, createBibleSelection(22, 22, true));

draft = updateBibleSelectionDraft(createBibleSelection(1, 1, true), 'start', '21');
draft = commitBibleSelectionField(draft, 'start', 23);
draft = updateBibleSelectionDraft(draft, 'end', '23');
draft = commitBibleSelectionField(draft, 'end', 23);
assert.deepEqual(getBibleVerseNumbers(draft, 23), [21, 22, 23]);

const slides = Array.from({ length: 20 }, (_, index) => ({
  reference: `Juan 3:${index + 1}`,
  translation: 'RVR1960',
  text: `Texto ${index + 1}`
}));
const bibleState = {
  type: 'preaching',
  contentType: 'bible',
  reference: slides[0].reference,
  content: slides[0].text,
  bible: { slides, slideIndex: 9, slideCount: slides.length, outlineItemId: 'outline-1' }
};

assert.equal(resolveActiveBibleProjectorState(null), null);
assert.equal(resolveActiveBibleProjectorState(undefined), null);
assert.equal(resolveActiveBibleProjectorState('loading'), null);
assert.equal(resolveActiveBibleProjectorState({ projectorState: bibleState }), bibleState);
assert.equal(resolveActiveBibleSlide(bibleState).reference, 'Juan 3:10');
assert.equal(resolveActiveBibleProjectorState({ projectorState: bibleState, proyectorApagado: true }), null);
assert.equal(resolveActiveBibleProjectorState({ projectorState: { type: 'lyrics', contentType: 'song' } }), null);
assert.equal(resolveActiveBibleProjectorState({ projectorState: { type: 'media', contentType: 'media' } }), null);
assert.equal(resolveActiveBibleProjectorState({ projectorState: { type: 'preaching', contentType: 'preaching' } }), null);

const bibleTransitions = [
  null,
  { projectorState: bibleState },
  null,
  { projectorState: { type: 'lyrics', contentType: 'song' } },
  { projectorState: { type: 'media', contentType: 'media' } },
  { projectorState: { type: 'preaching', contentType: 'preaching' } },
  { proyectorApagado: true, projectorState: bibleState },
  { proyectorApagado: false, projectorState: bibleState }
];
assert.deepEqual(bibleTransitions.map(state => Boolean(resolveActiveBibleProjectorState(state))), [false, true, false, false, false, false, false, true]);

const controller = await readFile(new URL('../src/components/live/ProyectorController.jsx', import.meta.url), 'utf8');
assert.match(controller, /const projectBiblePassage = async/);
assert.match(controller, /announcementState: buildInactiveAnnouncementState\(\),\s*projectorState:/);
assert.match(controller, /const projectBibleDeckSlideAt = async \(targetIndex\)/);
assert.match(controller, /const projectBibleDeckSlide = async \(delta\)/);
assert.match(controller, /await projectBibleDeckSlideAt\(currentIndex \+ delta\)/);
assert.match(controller, /setBiblePreview\(null\);\s*setBiblePreviewOutlineItemId\(null\);/);
assert.match(controller, /const clearLocalBibleControl = \(\) =>/);
assert.match(controller, /capturePreviousProjectionFields\(eventSnapshot\.data\(\)\)/);
assert.match(controller, /projectionActionId/);
assert.match(controller, /runTransaction\(db, async \(transaction\) =>/);
assert.match(controller, /bibleProjectionActiveRef\.current = true/);
assert.match(controller, /onClick=\{clearLocalBibleControl\}[\s\S]*Cerrar preview/);
const clearLocalHandler = controller.match(/const clearLocalBibleControl = \(\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
assert.doesNotMatch(clearLocalHandler, /setDoc|updateDoc|enqueueProjectionWrite|buildRestorePayload/);
assert.match(controller, /const stopPublicBibleProjection = async \(\) =>/);
const stopPublicHandler = controller.match(/const stopPublicBibleProjection = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
assert.match(stopPublicHandler, /isMatchingBibleProjection/);
assert.match(stopPublicHandler, /buildStoppedBibleProjectionPayload/);
assert.match(stopPublicHandler, /enqueueProjectionWrite/);
assert.match(stopPublicHandler, /currentState\.previousProjectionFields/);
assert.match(stopPublicHandler, /transaction\.set/);
assert.doesNotMatch(stopPublicHandler, /buildRestorePayload|setTimeout/);
assert.match(controller, /onClick=\{stopPublicBibleProjection\}[\s\S]*Dejar de proyectar Biblia/);
assert.match(controller, /projectedBibleOutlineItemId === biblePreviewOutlineItemId\s*&& Number\(biblePreview\?\.selectedIndex \|\| 0\) === Number\(evento\?\.projectorState\?\.bible\?\.slideIndex \|\| 0\)/);
const localMoveHandler = controller.match(/const moveBiblePreviewSlide = async \(delta\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
const localSelectHandler = controller.match(/const selectBiblePreviewSlide = \(index\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
assert.doesNotMatch(localMoveHandler, /projectBibleDeckSlide/);
assert.doesNotMatch(localSelectHandler, /projectBibleDeckSlideAt/);
assert.match(controller, /\{slide\.verseNumber \?\? index \+ 1\}/);
assert.doesNotMatch(controller, /evento\.projectorState\.bible\.slides\.map\(\(slide, index\)/);

const publicStateBeforeLocalSelection = structuredClone(bibleState);
selectBibleVerse(createBibleSelection(8, 12, true), 10, 23);
assert.deepEqual(bibleState, publicStateBeforeLocalSelection);

const stoppedBible = buildStoppedBibleProjectionPayload({ liveState: { activeContentType: 'none' }, updatedAt: 123 });
assert.equal(stoppedBible.projectorState.type, 'resume');
assert.equal(stoppedBible.projectorState.contentType, 'none');
assert.equal(stoppedBible.projectorState.bible, null);
assert.equal(stoppedBible.projectorState.background, null);
assert.equal(stoppedBible.proyectorMedia, null);
assert.equal(stoppedBible.proyectorFondo, null);
assert.equal(stoppedBible.proyectorSlide, null);
assert.deepEqual(stoppedBible.liveState, { activeContentType: 'none' });

const contentStates = {
  song: {
    projectorState: { type: 'lyrics', contentType: 'lyrics', reference: 'Coro', background: 'song.jpg' },
    proyectorSlide: { titulo: 'Coro', texto: 'Letra' }, proyectorMedia: null,
    proyectorFondo: 'song.jpg', proyectorFondoMedia: { mediaId: 'song-bg', url: 'song.jpg' },
    proyectorSongId: 'song-a', currentSongId: 'song-a', proyectorSlideIndex: 2,
    proyectorNextSlide: { titulo: 'Puente' }, proyectorNextSong: 'Song B', proyectorOffset: 1,
    proyectorLogo: false, proyectorApagado: false,
    liveState: { activeContentType: 'song', activeSongId: 'song-a', activeSectionIndex: 2 }
  },
  preaching: {
    projectorState: { type: 'preaching', contentType: 'preaching', reference: 'Punto 1', content: 'Fe' },
    proyectorSlide: null, proyectorMedia: null, proyectorFondo: null, proyectorFondoMedia: null,
    proyectorSongId: null, currentSongId: null, proyectorSlideIndex: -1,
    proyectorNextSlide: null, proyectorNextSong: null, proyectorOffset: 0,
    proyectorLogo: false, proyectorApagado: false,
    liveState: { activeContentType: 'preaching', activeSongId: null }
  },
  media: {
    projectorState: { type: 'media', contentType: 'media', media: { mediaId: 'media-a', url: 'media.jpg' } },
    proyectorSlide: null, proyectorMedia: { mediaId: 'media-a', url: 'media.jpg' },
    proyectorFondo: null, proyectorFondoMedia: null, proyectorSongId: null,
    currentSongId: null, proyectorSlideIndex: -1, proyectorNextSlide: null,
    proyectorNextSong: null, proyectorOffset: 0, proyectorLogo: false, proyectorApagado: false,
    liveState: { activeContentType: 'media', activeSongId: null }
  }
};

const enterBible = (eventData, actionId) => ({
  projectorState: {
    type: 'preaching', contentType: 'bible', projectionActionId: actionId,
    previousProjectionFields: capturePreviousProjectionFields(eventData)
  },
  liveState: { activeContentType: 'bible' }, proyectorSlide: null, proyectorMedia: null,
  proyectorFondo: null, proyectorFondoMedia: null, proyectorSongId: null,
  currentSongId: null, proyectorApagado: false
});
const leaveBible = (eventData, requestedActionId) => isMatchingBibleProjection(
  eventData.projectorState,
  requestedActionId
) ? buildStoppedBibleProjectionPayload({
  previousProjectionFields: eventData.projectorState.previousProjectionFields,
  liveState: { activeContentType: 'none' }
}) : eventData;
const panic = () => ({
  projectorState: { type: 'blackout', contentType: 'none' },
  liveState: { activeContentType: 'blackout' }, proyectorApagado: true
});

for (const kind of ['song', 'preaching', 'media']) {
  const before = structuredClone(contentStates[kind]);
  const bible = enterBible(before, `bible-${kind}`);
  assert.deepEqual(leaveBible(bible, `bible-${kind}`), before);
  assert.equal(leaveBible(panic(), `bible-${kind}`).projectorState.type, 'blackout');
}

const firstBible = enterBible(contentStates.song, 'bible-1');
const secondBible = enterBible(firstBible, 'bible-2');
assert.deepEqual(leaveBible(secondBible, 'bible-2'), contentStates.song);
assert.equal(leaveBible(secondBible, 'bible-1'), secondBible);

for (const replacement of [contentStates.song, contentStates.preaching, contentStates.media, panic()]) {
  assert.equal(leaveBible(replacement, 'bible-1'), replacement);
}

const serializedBible = JSON.parse(JSON.stringify(enterBible(contentStates.preaching, 'persisted-bible')));
assert.deepEqual(leaveBible(serializedBible, 'persisted-bible'), contentStates.preaching);
assert.deepEqual(leaveBible(structuredClone(serializedBible), 'persisted-bible'), contentStates.preaching);

for (const next of [enterBible(panic(), 'after-panic'), contentStates.preaching, contentStates.song]) {
  assert.notEqual(next.projectorState.type, undefined);
}

const nestedSnapshot = capturePreviousProjectionFields(secondBible);
assert.equal(nestedSnapshot.projectorState.contentType, 'lyrics');
assert.equal(nestedSnapshot.projectorState.previousProjectionFields, undefined);
assert.equal(isMatchingBibleProjection(firstBible.projectorState, 'bible-1'), true);
assert.equal(isMatchingBibleProjection(firstBible.projectorState, 'wrong'), false);

for (const file of ['StageDisplayMusicos.jsx', 'StageDisplayCantantes.jsx']) {
  const source = await readFile(new URL(`../src/components/live/${file}`, import.meta.url), 'utf8');
  assert.match(source, /InternalScreenBible/);
  assert.match(source, /InternalScreenBlackout/);
}

const preacher = await readFile(new URL('../src/components/live/PreacherDisplay.jsx', import.meta.url), 'utf8');
assert.match(preacher, /InternalMessageOverlay alert=\{eventData\?\.proyectorAlerta\} audience="pastor" currentTime=\{now\}/);
assert.doesNotMatch(preacher, /<InternalScreenBible/);
assert.match(preacher, /resolveActiveBibleProjectorState\(eventData\)/);
assert.match(preacher, /Biblia en proyeccion/);
assert.match(preacher, /if \(eventData\?\.proyectorApagado\) \{\s*return <InternalScreenBlackout active \/>;/);

const internalMessage = await readFile(new URL('../src/components/live/InternalMessageOverlay.jsx', import.meta.url), 'utf8');
assert.match(internalMessage, /data\.target === 'all' \|\| data\.target === audience/);
assert.match(internalMessage, /z-\[100\]/);

const internalBible = await readFile(new URL('../src/components/live/InternalScreenBible.jsx', import.meta.url), 'utf8');
assert.match(internalBible, /BibleAmbientBackground/);
assert.match(internalBible, /AutoFitText/);

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
assert.match(rules, /function projectorEventFields\(\)[\s\S]*'announcementState'/);
assert.match(rules, /function canUpdateEventAsMedia\(\)[\s\S]*validInactiveAnnouncementState\(\)/);
assert.match(rules, /function validInactiveAnnouncementState\(\)[\s\S]*announcementId == ''[\s\S]*currentSlide == null[\s\S]*presentationActive == false[\s\S]*autoAdvance\.enabled == false/);
assert.match(rules, /function canUpdateEventAnnouncement\(\) \{\s*return isOwnerOnly\(\)/);
assert.match(rules, /match \/anuncios\/\{announcementId\} \{\s*allow read, create, update, delete: if isOwnerOnly\(\);/);

console.log('bible projection state and internal outputs: OK');

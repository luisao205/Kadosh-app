import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveActiveBibleProjectorState } from '../src/utils/bibleProjectionState.js';
import { resolveActivePreachingProjectorState } from '../src/utils/preachingProjectionState.js';
import { resolveActiveQuickMessageProjectorState } from '../src/utils/quickMessageProjectionState.js';

const bible = { type: 'preaching', contentType: 'bible', content: 'Texto biblico' };
const preaching = { type: 'preaching', contentType: 'preaching', preachingType: 'point', content: 'Punto' };
const quickMessage = { type: 'preaching', contentType: 'quickMessage', preachingType: 'quickMessage', content: 'Punto rapido' };
const song = { type: 'lyrics', contentType: 'song' };
const media = { type: 'media', contentType: 'media' };

const states = [null, undefined, {}, { projectorState: bible }, { projectorState: quickMessage }, { projectorState: preaching }, { projectorState: song }, { projectorState: media }];
assert.deepEqual(states.map(state => Boolean(resolveActiveBibleProjectorState(state))), [false, false, false, true, false, false, false, false]);
assert.deepEqual(states.map(state => Boolean(resolveActiveQuickMessageProjectorState(state))), [false, false, false, false, true, false, false, false]);
assert.deepEqual(states.map(state => Boolean(resolveActivePreachingProjectorState(state))), [false, false, false, false, false, true, false, false]);

for (const state of [bible, quickMessage, preaching, song, media]) {
  const eventData = { projectorState: state, proyectorApagado: true };
  assert.equal(resolveActiveBibleProjectorState(eventData), null);
  assert.equal(resolveActiveQuickMessageProjectorState(eventData), null);
  assert.equal(resolveActivePreachingProjectorState(eventData), null);
}

const files = Object.fromEntries(await Promise.all([
  'InternalScreenBible.jsx',
  'InternalScreenPreaching.jsx',
  'InternalScreenMedia.jsx',
  'InternalScreenBlackout.jsx',
  'InternalMessageOverlay.jsx',
  'StageDisplayMusicos.jsx',
  'StageDisplayCantantes.jsx',
  'PreacherDisplay.jsx',
  'Proyector.jsx',
  'ProyectorController.jsx'
].map(async file => [file, await readFile(new URL(`../src/components/live/${file}`, import.meta.url), 'utf8')])));

assert.match(files['InternalScreenBible.jsx'], /z-\[70\]/);
assert.match(files['InternalScreenPreaching.jsx'], /layerClassName = 'z-\[75\]'/);
assert.match(files['InternalScreenMedia.jsx'], /z-\[80\]/);
assert.match(files['InternalMessageOverlay.jsx'], /z-\[90\]/);
assert.match(files['InternalMessageOverlay.jsx'], /z-\[100\]/);
assert.match(files['InternalScreenBlackout.jsx'], /z-\[200\]/);
assert.match(files['InternalScreenPreaching.jsx'], /content\.eyebrow/);
assert.match(files['InternalScreenPreaching.jsx'], /text=\{content\.body\}/);
assert.match(files['Proyector.jsx'], /resolvePreachingProjectionContent\(activePreachingState\)/);
assert.match(files['Proyector.jsx'], /hasProjectedTextContent = isBibleContent \|\| isPreachingContent \|\| isQuickMessageContent/);
assert.match(files['Proyector.jsx'], /<PreachingPresentation content=\{preachingContent\} layerClassName="z-20"/);

for (const file of ['StageDisplayMusicos.jsx', 'StageDisplayCantantes.jsx']) {
  assert.match(files[file], /<InternalScreenMedia/);
  assert.match(files[file], /<QuickMessagePresentation eventData=\{evento\} layerClassName="z-\[75\]" \/>/);
  assert.match(files[file], /<InternalScreenBible eventData=\{evento\}/);
  assert.match(files[file], /<InternalScreenPreaching eventData=\{evento\}/);
  assert.match(files[file], /<InternalScreenBlackout active=\{evento\?\.proyectorApagado === true\}/);
  assert.match(files[file], /z-\[100\]/);
  assert.match(files[file], /z-\[90\]/);
}

assert.doesNotMatch(files['PreacherDisplay.jsx'], /<InternalScreenBible/);
assert.doesNotMatch(files['PreacherDisplay.jsx'], /<InternalScreenMedia/);
assert.match(files['PreacherDisplay.jsx'], /Biblia en proyeccion/);
assert.match(files['PreacherDisplay.jsx'], /<InternalScreenBlackout active/);

const controller = files['ProyectorController.jsx'];
assert.match(controller, /const \[preachingBiblePreviewIndex, setPreachingBiblePreviewIndex\] = useState\(0\)/);
assert.match(controller, /projectPreachingBlockFromController\(selectedPreachingBlock, safePreachingBiblePreviewIndex\)/);
assert.match(controller, /selectedIndex: selectedVerseIndex/);
assert.match(controller, /Versiculo anterior/);
assert.match(controller, /Versiculo siguiente/);
assert.match(controller, /Previsualizar/);
assert.match(controller, /preachingSelectionPanel[\s\S]*onClick=\{stopPublicBibleProjection\}[\s\S]*Dejar de proyectar Biblia/);
const selectHandler = controller.match(/const selectPreachingBlock = \(blockId\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
assert.doesNotMatch(selectHandler, /setDoc|updateDoc|enqueueProjectionWrite/);

console.log('internal output null safety, transitions, and overlay priority: OK');

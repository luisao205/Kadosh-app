import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  QUICK_MESSAGE_COLORS,
  QUICK_MESSAGE_MAX_SEGMENTS,
  QUICK_MESSAGE_MAX_TEXT_LENGTH,
  buildQuickMessageProjectorState,
  buildStoppedQuickMessageProjectionPayload,
  captureQuickMessagePreviousProjection,
  createQuickMessage,
  isMatchingQuickMessageProjection,
  normalizeQuickMessageSegments,
  resolveActiveQuickMessageProjectorState
} from '../src/utils/quickMessageProjectionState.js';
import { resolveActiveBibleProjectorState } from '../src/utils/bibleProjectionState.js';
import { resolveActivePreachingProjectorState } from '../src/utils/preachingProjectionState.js';
import { getQuickMessagePresentationLayout } from '../src/utils/quickMessagePresentationLayout.js';

const message = createQuickMessage({
  presentationType: 'phrase',
  segments: [{ text: 'No pierdas tu bendicion', color: 'blue', bold: true }, { text: ' por un momentito de pecado', color: 'red', bold: true }]
});
assert.equal(message.content, 'No pierdas tu bendicion por un momentito de pecado');
assert.deepEqual(message.segments.map((segment) => segment.color), ['blue', 'red']);
assert.equal(normalizeQuickMessageSegments([{ text: 'No', color: 'purple', bold: true }]), null);
assert.equal(createQuickMessage({ segments: Array.from({ length: QUICK_MESSAGE_MAX_SEGMENTS + 1 }, () => ({ text: 'x', color: 'white', bold: true })) }), null);
assert.equal(createQuickMessage({ segments: Array.from({ length: 4 }, () => ({ text: 'x'.repeat(240), color: 'white', bold: true })) }), null);
assert.equal(QUICK_MESSAGE_COLORS.includes('green'), true);

const shortLayout = getQuickMessagePresentationLayout({ content: 'NO PEQUES POR OTROS', segments: [{ text: 'NO PEQUES POR OTROS' }], presentationType: 'theme' });
const mediumLayout = getQuickMessagePresentationLayout({ content: 'No pierdas tu bendicion por un momento de pecado', segments: [{ text: 'No pierdas tu bendicion por un momento de pecado' }], presentationType: 'point' });
const longLayout = getQuickMessagePresentationLayout({ content: 'x'.repeat(700), segments: Array.from({ length: 8 }, () => ({ text: 'x'.repeat(80) })), presentationType: 'phrase' });
assert.equal(shortLayout.header, 'TEMA');
assert.equal(mediumLayout.header, 'PUNTO');
assert.equal(longLayout.header, 'FRASE');
assert.ok(shortLayout.maxFontSize > mediumLayout.maxFontSize);
assert.ok(mediumLayout.maxFontSize > longLayout.maxFontSize);

const before = {
  projectorState: { type: 'lyrics', contentType: 'lyrics' }, proyectorSlide: { texto: 'Letra' }, proyectorMedia: null,
  proyectorLogo: false, proyectorApagado: false, proyectorFondo: null, proyectorFondoMedia: null,
  proyectorSongId: 'song-1', proyectorSlideIndex: 0, proyectorNextSlide: null, proyectorNextSong: null,
  proyectorOffset: 0, liveState: { activeContentType: 'song' }, currentSongId: 'song-1'
};
const applyProjectionUpdate = (eventData, updates) => ({ ...eventData, ...updates });
const state = buildQuickMessageProjectorState({ message, previousProjectionFields: captureQuickMessagePreviousProjection(before), actor: { uid: 'quick', rol: 'multimedia' }, now: 1, projectionActionId: 'quick-1' });
assert.equal(state.type, 'preaching');
assert.equal(state.contentType, 'quickMessage');
assert.equal(state.media, null);
assert.equal(resolveActiveQuickMessageProjectorState({ projectorState: state }), state);
assert.equal(resolveActiveQuickMessageProjectorState({ projectorState: state, proyectorApagado: true }), null);
assert.equal(isMatchingQuickMessageProjection(state, 'quick-1'), true);
assert.equal(isMatchingQuickMessageProjection(state, 'other'), false);
assert.deepEqual(buildStoppedQuickMessageProjectionPayload({ previousProjectionFields: state.previousProjectionFields }), before);
const quickEvent = applyProjectionUpdate(before, { projectorState: state });
const restoredQuickEvent = applyProjectionUpdate(quickEvent, state.previousProjectionFields);
assert.deepEqual(restoredQuickEvent.projectorState, before.projectorState);

const previousBible = {
  ...before,
  projectorState: { type: 'preaching', contentType: 'bible', content: 'Salmos 23:4' },
  proyectorSlide: null,
  liveState: { activeContentType: 'bible' },
  currentSongId: null
};
const previousMedia = {
  ...before,
  projectorState: { type: 'media', contentType: 'media', media: { mediaId: 'media-1', url: 'media.mp4' } },
  proyectorSlide: null,
  proyectorMedia: { mediaId: 'media-1', url: 'media.mp4' },
  proyectorSongId: null,
  proyectorSlideIndex: -1,
  liveState: { activeContentType: 'media' },
  currentSongId: null
};

const bibleWithRestorablePrevious = {
  ...previousBible,
  projectorState: {
    ...previousBible.projectorState,
    projectionActionId: 'bible-1',
    previousProjectionFields: captureQuickMessagePreviousProjection(before)
  }
};
const bibleSnapshotForQuickMessage = captureQuickMessagePreviousProjection(bibleWithRestorablePrevious);
assert.deepEqual(bibleSnapshotForQuickMessage.projectorState, bibleWithRestorablePrevious.projectorState);
assert.deepEqual(
  buildStoppedQuickMessageProjectionPayload({ previousProjectionFields: bibleSnapshotForQuickMessage }),
  bibleWithRestorablePrevious
);

for (const previousState of [before, previousBible, bibleWithRestorablePrevious, previousMedia]) {
  const quickState = buildQuickMessageProjectorState({
    message,
    previousProjectionFields: captureQuickMessagePreviousProjection(previousState),
    actor: { uid: 'quick', rol: 'multimedia' },
    now: 2,
    projectionActionId: 'quick-priority'
  });
  const activeStates = [
    resolveActiveBibleProjectorState({ projectorState: quickState }),
    resolveActiveQuickMessageProjectorState({ projectorState: quickState }),
    resolveActivePreachingProjectorState({ projectorState: quickState })
  ].filter(Boolean);
  assert.equal(activeStates.length, 1);
  assert.equal(activeStates[0], quickState);
  assert.deepEqual(buildStoppedQuickMessageProjectionPayload({ previousProjectionFields: quickState.previousProjectionFields }), previousState);
}

const [controller, panel, projector, musicians, singers, quickPresentation, quickGlow, quickParticles, rules, functions] = await Promise.all([
  readFile(new URL('../src/components/live/ProyectorController.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/live/QuickMessagePanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/live/Proyector.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/live/StageDisplayMusicos.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/live/StageDisplayCantantes.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/live/QuickMessagePresentation.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/live/QuickMessageAmbientGlow.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/live/QuickMessageAmbientParticles.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
  readFile(new URL('../functions/index.js', import.meta.url), 'utf8')
]);

const assertReactHooksAreImported = (source, fileName) => {
  const reactImport = source.match(/import\s*\{([^}]+)\}\s*from\s*['"]react['"]/);
  const importedHooks = new Set(
    (reactImport?.[1] || '')
      .split(',')
      .map((entry) => entry.trim().split(/\s+as\s+/)[0])
      .filter(Boolean)
  );
  const usedHooks = new Set(
    [...source.matchAll(/\b(useMemo|useEffect|useRef|useState|useCallback|useLayoutEffect)\s*\(/g)]
      .map((match) => match[1])
  );

  for (const hook of usedHooks) {
    assert.ok(importedHooks.has(hook), `${fileName} uses ${hook} without importing it from React`);
  }
};

assertReactHooksAreImported(quickPresentation, 'QuickMessagePresentation.jsx');
assertReactHooksAreImported(quickGlow, 'QuickMessageAmbientGlow.jsx');
assertReactHooksAreImported(quickParticles, 'QuickMessageAmbientParticles.jsx');
assert.match(controller, /hasPermission\(user, 'bible\.quickProjection'\)/);
assert.match(controller, /const projectQuickMessage = async/);
assert.match(controller, /const clearQuickMessageProjection = async/);
assert.match(controller, /QuickMessagePanel/);
assert.match(controller, /requestQuickMessageProjection/);
assert.match(controller, /requestQuickMessageClear/);
assert.match(controller, /notify\('No se pudo proyectar el punto\.', \{ type: 'error' \}\);\s*throw error;/);
assert.match(controller, /notify\('No se pudo limpiar el punto\.', \{ type: 'error' \}\);\s*throw error;/);
assert.match(panel, /await onProject\(message\);\s*const exists = entryId/);
assert.match(panel, /catch \{\s*setError\('No se pudo proyectar el punto\.'\);/);
assert.match(panel, /removeQuickMessageHistoryEntry\(history, entryId\)/);
assert.match(panel, /replaceQuickMessageHistoryEntry\(history, entryId, message\)/);
assert.match(panel, /Editando punto anterior/);
assert.match(panel, /startEditing\(item\)/);
assert.match(panel, /projectHistoryEntry\(item\)/);
assert.match(panel, /window\.confirm\('.*Eliminar todos los .*ltimos puntos\?'\)/);
assert.match(panel, /persistHistory\(clearQuickMessageHistory\(\)\)/);
const clearHistorySource = panel.match(/const clearHistory = \(\) => \{([\s\S]*?)\n  \};/);
assert.ok(clearHistorySource);
assert.doesNotMatch(clearHistorySource[1], /onClear|onProject/);
assert.match(projector, /QuickMessagePresentation/);
assert.match(musicians, /QuickMessagePresentation/);
assert.match(singers, /QuickMessagePresentation/);
assert.match(quickPresentation, /QuickMessageAmbientGlow/);
assert.doesNotMatch(quickPresentation, /BibleAmbientBackground/);
assert.match(quickPresentation, /ResizeObserver/);
assert.match(quickPresentation, /minFontSize=\{layout\.minFontSize\}/);
assert.match(quickPresentation, /maxFontSize=\{layout\.maxFontSize\}/);
assert.match(quickPresentation, /text-amber-100/);
assert.match(panel, /red: 'text-\[#FF1F1F\]'/);
assert.match(quickPresentation, /quick-message-dynamic-text/);
assert.match(rules, /contentType == 'quickMessage'/);
assert.match(rules, /contentType == 'quickMessage'\n\s*\? false/);
assert.match(functions, /exports\.projectQuickMessage = functions\.https\.onCall/);
assert.match(functions, /exports\.clearQuickMessageProjection = functions\.https\.onCall/);
assert.match(functions, /transaction\.update\(eventRef, \{/);
assert.match(functions, /transaction\.update\(eventRef, cloneProjectionValue\(state\.previousProjectionFields\)\)/);
assert.doesNotMatch(functions, /transaction\.set\([\s\S]{0,500}?projectorState[\s\S]{0,500}?\{\s*merge:\s*true\s*\}/);
assert.doesNotMatch(functions, /contentType === "bible" && isPlainObject\(currentState\.previousProjectionFields\)/);
assert.match(functions, /validateQuickMessagePayload\(data\)/);
assert.match(functions, /hasPermission\(actor\.user, actor\.roleDefaults, "bible\.quickProjection"\)/);

console.log('quick message projection state and contracts: OK');

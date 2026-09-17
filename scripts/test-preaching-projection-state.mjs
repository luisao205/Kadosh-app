import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getPreachingBiblePreview, normalizePreachingBiblePreviewIndex, resolveActivePreachingProjectorState, resolvePreachingProjectionContent } from '../src/utils/preachingProjectionState.js';

const point = { type: 'preaching', preachingType: 'point', title: 'La fe', content: 'Explicacion' };
assert.equal(resolveActivePreachingProjectorState(null), null);
assert.equal(resolveActivePreachingProjectorState(undefined), null);
assert.equal(resolveActivePreachingProjectorState('loading'), null);
assert.equal(resolveActivePreachingProjectorState({}), null);
assert.equal(resolveActivePreachingProjectorState({ projectorState: null }), null);
assert.equal(resolveActivePreachingProjectorState({ projectorState: 'loading' }), null);
assert.equal(resolveActivePreachingProjectorState({ projectorState: point }), point);
assert.equal(resolveActivePreachingProjectorState({ proyectorApagado: true, projectorState: point }), null);
assert.equal(resolveActivePreachingProjectorState({ projectorState: { ...point, contentType: 'bible' } }), null);
assert.equal(resolveActivePreachingProjectorState({ projectorState: { type: 'media' } }), null);
assert.equal(resolvePreachingProjectionContent(null), null);
assert.equal(resolvePreachingProjectionContent(undefined), null);
assert.equal(resolvePreachingProjectionContent('loading'), null);
assert.deepEqual(resolvePreachingProjectionContent(point), {
  kind: 'point', eyebrow: 'Predica', title: 'La fe', pointTitle: '', body: 'Explicacion',
  content: 'Explicacion', reference: '', translation: '', bible: null,
  slideIndex: null, totalSlides: null, media: null,
  metadata: { predicaId: null, blockId: null, requestId: null }
});
const validationPoint = resolvePreachingProjectionContent({
  type: 'preaching', preachingType: 'point', reference: 'Punto 1',
  title: 'Punto de validacion Codex', content: 'Punto de validacion Codex'
});
assert.equal(validationPoint.eyebrow, 'Predica');
assert.equal(validationPoint.reference, 'Punto 1');
assert.equal(validationPoint.body, 'Punto de validacion Codex');
assert.equal(validationPoint.pointTitle, 'Punto 1');
const verse = resolvePreachingProjectionContent({ type: 'preaching', preachingType: 'verse', reference: 'Juan 3:16', translation: 'RVR1960', content: 'Porque de tal manera...' });
assert.equal(verse.kind, 'verse');
assert.equal(verse.reference, 'Juan 3:16');

const subpoint = resolvePreachingProjectionContent({ type: 'preaching', preachingType: 'subpoint', title: 'Aplicacion', content: 'Contenido' });
assert.equal(subpoint.kind, 'subpoint');

const legacyPoint = resolvePreachingProjectionContent({ type: 'preaching', title: 'Contenido antiguo' });
assert.equal(legacyPoint.body, 'Contenido antiguo');
assert.equal(resolvePreachingProjectionContent({ type: 'preaching' }).body, 'Punto de predica');

const transitions = [
  null,
  { projectorState: point },
  { projectorState: { ...point, contentType: 'bible' } },
  { projectorState: { type: 'lyrics', contentType: 'song' } },
  { projectorState: { type: 'media', contentType: 'media' } },
  { proyectorApagado: true, projectorState: point },
  { proyectorApagado: false, projectorState: point }
];
assert.deepEqual(transitions.map(state => Boolean(resolveActivePreachingProjectorState(state))), [false, true, false, false, false, false, true]);

const psalmSlides = Array.from({ length: 6 }, (_, index) => ({
  reference: `Salmos 23:${index + 1}`,
  verseNumber: index + 1,
  text: `${index + 1}. Texto ${index + 1}`,
  slideIndex: index,
  slideCount: 6
}));
const psalmPreview = getPreachingBiblePreview({
  id: 'psalm-23',
  type: 'verse',
  reference: 'Salmos 23:1-6',
  translation: 'RVR1960',
  bibleId: 'rvr1960',
  passageId: 'rvr1960:PSA.23.1-6',
  biblePassage: { bookName: 'Salmos', chapter: 23, verses: [], slides: psalmSlides }
});
assert.equal(psalmPreview.slides.length, 6);
assert.equal(psalmPreview.slides[0].reference, 'Salmos 23:1');
assert.equal(psalmPreview.slides[2].reference, 'Salmos 23:3');
assert.equal(psalmPreview.slides[5].reference, 'Salmos 23:6');
assert.equal(psalmPreview.passage.reference, 'Salmos 23:1-6');

const publicState = { passageId: psalmPreview.passage.passageId, slideIndex: 0, reference: 'Salmos 23:1' };
const publicSnapshot = structuredClone(publicState);
const previewSequence = [0, 2, 5, 3].map(index => normalizePreachingBiblePreviewIndex(psalmPreview.slides, index));
assert.deepEqual(previewSequence, [0, 2, 5, 3]);
assert.equal(psalmPreview.slides[previewSequence.at(-1)].reference, 'Salmos 23:4');
assert.deepEqual(publicState, publicSnapshot);
assert.equal(normalizePreachingBiblePreviewIndex(psalmPreview.slides, -1), 0);
assert.equal(normalizePreachingBiblePreviewIndex(psalmPreview.slides, 99), 5);
assert.equal(normalizePreachingBiblePreviewIndex(null, 4), 0);

const projectorSource = await readFile(new URL('../src/components/live/Proyector.jsx', import.meta.url), 'utf8');
const preachingRenderer = projectorSource.match(/\) : isPreachingContent \? \(([\s\S]*?)\) : displaySlide/)?.[1] || '';
assert.match(preachingRenderer, /<PreachingPresentation content=\{preachingContent\} layerClassName="z-20"/);
assert.doesNotMatch(preachingRenderer, /line-clamp|truncate|text-overflow/);

const autoFitSource = await readFile(new URL('../src/components/live/AutoFitText.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(autoFitSource, /preferSingleLine/);

const singlePreview = getPreachingBiblePreview({
  id: 'john-3-16', type: 'verse', reference: 'Juan 3:16', translation: 'RVR1960', text: '16. Porque de tal manera...'
});
assert.equal(singlePreview.slides.length, 1);
assert.equal(singlePreview.slides[0].reference, 'Juan 3:16');
assert.equal(getPreachingBiblePreview(null), null);
assert.equal(getPreachingBiblePreview({ type: 'point', title: 'Punto' }), null);
assert.equal(getPreachingBiblePreview({ type: 'verse', reference: 'Referencia invalida' }), null);
console.log('preaching projection state and output priority: OK');

import assert from 'node:assert/strict';
import { isValidChordToken, normalizarTonoVisual, transponerNota } from '../src/utils/musicCore.js';
import { getSectionPages, parsearCancion } from '../src/utils/songParser.js';
import { getEventSingerTransposeState, getSingerTransposeState } from '../src/utils/songAssignments.js';

const acceptedChords = [
  'C', 'Cm', 'C7', 'Cmaj7', 'Cm7', 'Csus2', 'Csus4', 'Cadd9', 'Cdim', 'Caug',
  'C#', 'F#m', 'G#7', 'Bb', 'Eb', 'Ab', 'C/E', 'D/F#', 'Bb/D', 'C9', 'C11', 'C13', 'Cm9'
];
acceptedChords.forEach((chord) => assert.equal(isValidChordToken(chord), true, `${chord} must be a chord`));
['Verso', 'Pre-Coro', '123', 'Dios es fiel', 'Hola mundo'].forEach((text) => {
  assert.equal(isValidChordToken(text), false, `${text} must not be a chord`);
});

assert.equal(transponerNota('C', 2), 'D');
assert.equal(transponerNota('D', -2), 'C');
assert.equal(transponerNota('F#m', 2), 'G#m');
assert.deepEqual(['F#maj7', 'D#m11', 'F#'].map((chord) => transponerNota(chord, -2)), ['Emaj7', 'C#m11', 'E']);
assert.equal(transponerNota('Cmaj7', 1), 'C#maj7');
assert.equal(transponerNota('C/E', 2), 'D/F#');
assert.equal(normalizarTonoVisual('e'), 'E');
assert.equal(normalizarTonoVisual('bb'), 'Bb');
assert.equal(normalizarTonoVisual('f#m'), 'F#m');
assert.deepEqual(['F#', 'B', 'D#m'].map((chord) => transponerNota(chord, -2)), ['E', 'A', 'C#m']);

const singerSong = {
  tonoOriginal: 'F#m',
  tonosPorCantante: { Ana: 'G#m', Beto: 'F#m', Carla: 'H' }
};
assert.deepEqual(getSingerTransposeState({ tonoOriginal: 'C', tonosPorCantante: { Ana: 'D' } }, 'Ana'), {
  originalKey: 'C', targetKey: 'D', offset: 2, status: 'resolved'
});
assert.equal(getSingerTransposeState(singerSong, 'Ana').offset, 2);
assert.deepEqual(['F#m', 'E', 'D', 'Bm'].map((chord) => transponerNota(chord, getSingerTransposeState(singerSong, 'Ana').offset)), ['G#m', 'F#', 'E', 'C#m']);
assert.equal(getSingerTransposeState(singerSong, 'Beto').offset, 0);
assert.equal(getSingerTransposeState(singerSong, '').status, 'no-singer-key');
assert.equal(getSingerTransposeState(singerSong, 'Carla').status, 'invalid-key');
assert.equal(getSingerTransposeState(singerSong, 'Carla').offset, 0);
assert.equal(getSingerTransposeState(singerSong, 'Ana').offset, 2);
assert.equal(getSingerTransposeState(singerSong, 'Beto').offset, 0);
assert.equal(getSingerTransposeState({
  tonoOriginal: 'C',
  tonosPorCantante: { Ana: 'D' },
  medleyConfig: { songs: [{ songId: 'a' }, { songId: 'b' }] }
}, 'Ana').status, 'materialized-medley');
assert.equal(getSingerTransposeState({
  tonoOriginal: 'C',
  tonosPorCantante: { Ana: 'D' },
  medleyConfig: { songs: [{ songId: 'a' }, { songId: 'b' }] }
}, 'Ana').offset, 0);

const medley = {
  id: 'medley',
  medleyConfig: {
    sectionPartIndexes: [0, 1, 2],
    songs: [
      { songId: 'a', originalKey: 'C', materializedKey: 'C', tonosPorCantante: { Ana: 'D' } },
      { songId: 'b', originalKey: 'F#m', materializedKey: 'F#m', tonosPorCantante: { Beto: 'G#m' } },
      { songId: 'c', originalKey: 'Bb', materializedKey: 'Bb', tonosPorCantante: { Carla: 'C', Invalido: 'H' } },
    ]
  }
};
const event = { cantantesPorCancion: { a: 'Ana', b: 'Beto', c: 'Carla' } };
assert.equal(getEventSingerTransposeState(medley, event, 0).offset, 2);
assert.equal(getEventSingerTransposeState(medley, event, 1).offset, 2);
assert.equal(getEventSingerTransposeState(medley, event, 2).offset, 2);
assert.equal(getEventSingerTransposeState(medley, { cantantesPorCancion: { c: 'Invalido' } }, 2).status, 'invalid-key');
assert.equal(getEventSingerTransposeState(medley, { cantantesPorCancion: {} }, 1).offset, 0);
assert.equal(transponerNota('Bb/D', 2), 'C/E');
assert.equal(transponerNota(transponerNota(transponerNota('C/E', 1), 1), -2), 'C/E');

const raw = '# Intro\n[C]Uno  con  espacios\n\n# Coro\n[C/E]Letra sin perder\n{cue: Todos}\n\n# Final\nSolo letra';
const sections = parsearCancion(raw);
assert.equal(sections.length, 3);
assert.equal(sections[0].items.filter((item) => item.type === 'blank').length, 1);
assert.equal(sections[1].items.some((item) => item.type === 'cue' && item.text === 'Todos'), true);

assert.equal(sections[1].items.some((item) => item.type === 'lyrics'), true);
assert.equal(transponerNota('C/E', 2), 'D/F#');

const repeatBridge = parsearCancion(`# Puente 1

//
Ningun princi[F#m]pado
Ni las potes[E]tades

No han prevale[F#m]cido
Ha caido el ene[E]migo
//`);
assert.equal(repeatBridge.length, 1);
const bridgePages = getSectionPages(repeatBridge[0]);
assert.equal(bridgePages.length, 2);
assert.equal(bridgePages[0].repetition, true);
assert.equal(bridgePages[0].repeatCount, 2);
assert.equal(bridgePages[0].items.some((item) => item.type === 'lyrics'), true);
assert.equal(JSON.stringify(bridgePages).includes('//'), false);

const tripleRepeat = parsearCancion('# Coro\n///\n[C]Tres veces\n///');
assert.equal(getSectionPages(tripleRepeat[0])[0].repeatCount, 3);

const quadrupleRepeat = parsearCancion('# Coro\n////\n[C]Cuatro veces\n////');
assert.equal(getSectionPages(quadrupleRepeat[0])[0].repeatCount, 4);

const inlineRepeat = parsearCancion('# Intro\n[//] [F#] [B] [//]');
const inlinePage = getSectionPages(inlineRepeat[0])[0];
assert.equal(inlinePage.repeatCount, 2);
assert.equal(JSON.stringify(inlinePage).includes('//'), false);
assert.equal(inlinePage.lineas[0][0][0].acorde, 'F#');

const repeatedSectionOccurrences = parsearCancion([
  '# Puente',
  '[A]Primera pagina',
  '',
  '[B]Segunda pagina',
  '# Puente',
  '[C]Nueva ocurrencia',
].join('\n'));
assert.equal(repeatedSectionOccurrences.length, 2);
assert.equal(getSectionPages(repeatedSectionOccurrences[0]).length, 2);
assert.equal(getSectionPages(repeatedSectionOccurrences[1]).length, 1);

const cueWithLyrics = parsearCancion([
  '# Pre-Coro',
  '{cue: Comienza a crecer la intensidad}',
  '',
  '///',
  '[A]Yo no soy de aqui, a casa volvere',
  '[B9]Me viene a buscar',
  '///',
].join('\n'));
const cueWithLyricsPages = getSectionPages(cueWithLyrics[0]);
assert.equal(cueWithLyricsPages.length, 1, 'a cue must not become its own page');
assert.deepEqual(cueWithLyricsPages[0].cues, ['Comienza a crecer la intensidad']);
assert.equal(cueWithLyricsPages[0].repeatCount, 3);
assert.equal(cueWithLyricsPages[0].items.every((item) => item.type === 'lyrics'), true);
assert.equal(cueWithLyricsPages[0].lineas.length, 2);

const cueMultipage = parsearCancion([
  '# Puente',
  '{cue: Baja dinamica}',
  '',
  '[A]Parrafo musical A',
  '',
  '[B]Parrafo musical B',
].join('\n'));
const cueMultipagePages = getSectionPages(cueMultipage[0]);
assert.equal(cueMultipagePages.length, 2, 'a cue must not affect page count');
assert.deepEqual(cueMultipagePages.map((page) => page.cues), [['Baja dinamica'], []]);
assert.deepEqual(cueMultipagePages.map((page) => page.lineas.length), [1, 1]);

const cueOccurrences = parsearCancion([
  '# Puente',
  '{cue: Solo voces}',
  '[A]Primera ocurrencia',
  '# Puente',
  '{cue: Todos juntos}',
  '[B]Segunda ocurrencia',
].join('\n'));
assert.deepEqual(getSectionPages(cueOccurrences[0])[0].cues, ['Solo voces']);
assert.deepEqual(getSectionPages(cueOccurrences[1])[0].cues, ['Todos juntos']);

const mismatchedRepeat = parsearCancion('# Puente\n//\n[C]Invalido\n///');
assert.deepEqual(mismatchedRepeat[0].repeatValidation, {
  valid: false,
  openingCount: 2,
  closingCount: 3,
  line: 2,
});

console.log('song format and transposition contract: OK');

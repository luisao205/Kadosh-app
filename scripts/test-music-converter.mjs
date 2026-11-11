import assert from 'node:assert/strict';
import {
  convertPlainTextToKadosh,
  extractChordsWithPositions,
  extractMusicalMetadataFromText,
  extractPureKadoshContent,
  isChordLine,
  mergeChordLineWithLyricLine,
  normalizeSectionHeading,
  transposeKey,
  validateKadoshSyntax
} from '../src/utils/musicConverter.js';
import { parsearCancion } from '../src/utils/songParser.js';

console.log('=== TESTING KADOSH MUSIC CONVERTER ===');

// 1. isChordLine tests
assert.equal(isChordLine('G   D/F#   Em   C'), true, 'Should detect line of chords');
assert.equal(isChordLine('Am7   Bm7   Cmaj7   D9'), true, 'Should detect complex chords line');
assert.equal(isChordLine('Tu fidelidad es grande'), false, 'Should not detect lyrics as chords');
assert.equal(isChordLine('# Coro'), false, 'Should not detect section headers as chords');
console.log('✓ isChordLine checks passed');

// 2. normalizeSectionHeading tests
assert.equal(normalizeSectionHeading('intro:'), '# Intro');
assert.equal(normalizeSectionHeading('verso 1'), '# Verso 1');
assert.equal(normalizeSectionHeading('Pre-Coro'), '# Pre-Coro');
assert.equal(normalizeSectionHeading('CORO:'), '# Coro');
assert.equal(normalizeSectionHeading('puente:'), '# Puente');
assert.equal(normalizeSectionHeading('[Solo de Guitarra]'), '# Solo - Guitarra');
console.log('✓ normalizeSectionHeading checks passed');

// 3. mergeChordLineWithLyricLine tests
const chordLine = '       G              D';
const lyricLine = 'Tu fidelidad es grande';
const merged = mergeChordLineWithLyricLine(chordLine, lyricLine);
console.log('Merged line:', merged);
assert.ok(merged.includes('[G]'), 'Should contain [G]');
assert.ok(merged.includes('[D]'), 'Should contain [D]');
assert.ok(merged.includes('Tu'), 'Should contain original lyrics');
console.log('✓ mergeChordLineWithLyricLine checks passed');

// 4. Full plain text conversion test (Fixtures: Ab, G shape, Capo 1)
const rawSample = `
Título: Tu Fidelidad
Artista: Marcos Witt
Tono: Ab
Forma: G
Capo: 1
BPM: 72
YouTube: https://www.youtube.com/watch?v=dQw4w9WgXcQ

Intro
G   D/F#   Em   C

Verso 1
       G              D
Tu fidelidad es grande
       Em             C
Tu fidelidad incomparable es

Coro
       G           D
Nadie como tú, bendito Dios
       Em          C
Grande es tu fidelidad
`;

const converted = convertPlainTextToKadosh(rawSample);
console.log('--- Converted KADOSH song ---');
console.log(converted);
console.log('-----------------------------');

assert.ok(converted.includes('# Intro'), 'Should include # Intro');
assert.ok(converted.includes('# Verso 1'), 'Should include # Verso 1');
assert.ok(converted.includes('# Coro'), 'Should include # Coro');
assert.ok(converted.includes('[G]'), 'Should contain [G]');
assert.ok(converted.includes('[D]'), 'Should contain [D]');

// 5. Test compatibility with real KADOSH song parser
const parsedSections = parsearCancion(converted);
console.log(`Parsed sections count: ${parsedSections.length}`);
assert.equal(parsedSections.length, 3, 'Should produce 3 distinct sections (Intro, Verso 1, Coro)');
assert.equal(parsedSections[0].titulo, 'Intro');
assert.equal(parsedSections[1].titulo, 'Verso 1');
assert.equal(parsedSections[2].titulo, 'Coro');
console.log('✓ KADOSH song parser compatibility passed');

// 6. Metadata extraction
const meta = extractMusicalMetadataFromText(rawSample);
console.log('Extracted metadata:', meta);
assert.equal(meta.tono, 'Ab', 'Tono should be Ab');
assert.equal(meta.forma, 'G', 'Forma should be G');
assert.equal(meta.capo, 1, 'Capo should be 1');
assert.equal(meta.bpm, '72', 'BPM should be 72');
assert.equal(meta.titulo, 'Tu Fidelidad');
assert.equal(meta.artista, 'Marcos Witt');
assert.equal(meta.youtubeUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
console.log('✓ Musical metadata extraction passed');

// 7. Transpose key test
assert.equal(transposeKey('G', 1), 'Ab', 'G + 1 semitone should transpose to Ab');
assert.equal(transposeKey('C', 2), 'D', 'C + 2 semitones should transpose to D');
assert.equal(transposeKey('Em', 3), 'Gm', 'Em + 3 semitones should transpose to Gm');
console.log('✓ Transposition logic passed');

// 8. extractPureKadoshContent
const aiRawResponse = `
¡Hola! He preparado la canción organizada para KADOSH PROJECTION V2.1 según tus indicaciones:

\`\`\`kadosh
# Intro
[G] [D] [Em] [C]

# Verso 1
Tu [G]fidelidad es [D]grande
Tu [Em]fidelidad incompa[C]rable es
\`\`\`

Espero que te sirva para el culto del domingo. ¡Bendiciones!
`;

const pure = extractPureKadoshContent(aiRawResponse);
console.log('Extracted Pure Kadosh:\n' + pure);
assert.ok(!pure.includes('¡Hola!'), 'Should strip greeting');
assert.ok(!pure.includes('Espero que te sirva'), 'Should strip farewell');
assert.ok(!pure.includes('```'), 'Should strip code blocks');
assert.ok(pure.startsWith('# Intro'), 'Should start directly with # Intro');
console.log('✓ extractPureKadoshContent passed');

// 9. Validation
const validation = validateKadoshSyntax(converted);
console.log('Validation results:', validation);
assert.equal(validation.valid, true, 'Converted text must be valid syntax');
assert.equal(validation.stats.sections, 3);
assert(validation.stats.chords > 5);

console.log('=== ALL MUSIC CONVERTER TESTS PASSED ===');

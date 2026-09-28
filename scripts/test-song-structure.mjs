import assert from 'node:assert/strict';
import { isSongSectionTitle, parsearCancion } from '../src/utils/songParser.js';

const raw = `[Intro]\n[C]Ven\n\n[Coro — Rodeado]\n[G]Uno\n\n[Coro]\n[D]Dos\n\n[Coro]\n[A]Tres\n\n[Instrumental]\n{cue: SOLO GUITARRA}\n`;

const sections = parsearCancion(raw);
assert.deepEqual(sections.map((section) => section.titulo), [
  'Intro',
  'Coro — Rodeado',
  'Coro',
  'Coro',
  'Instrumental'
]);
assert.equal(sections[2].titulo, 'Coro');
assert.equal(sections[3].titulo, 'Coro');
assert.equal(sections[4].items.find((item) => item.type === 'cue')?.text, 'SOLO GUITARRA');
assert.equal(isSongSectionTitle('Coro — Rodeado'), true);
assert.equal(isSongSectionTitle('Verso 1: Yo navegaré'), true);
assert.equal(isSongSectionTitle('C#m'), false);
assert.equal(isSongSectionTitle('G'), false);

console.log('song structure sequence: OK');

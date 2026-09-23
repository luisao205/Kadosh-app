import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildEventSetlistUpdate, getEventSetlistItems, getEventSongIds } from '../src/utils/setlistUtils.js';

const legacyOnly = { canciones: ['song-a', 'song-b'] };
const emptyModernWithLegacy = { setlist: [], canciones: ['song-a', 'song-b'] };
const modern = {
  setlist: [{ idLocal: 'note-1', type: 'note', value: 'Entrada' }, { idLocal: 'song-1', type: 'song', value: 'song-a' }],
  canciones: ['song-old']
};

assert.deepEqual(getEventSongIds(legacyOnly), ['song-a', 'song-b']);
assert.deepEqual(getEventSongIds(emptyModernWithLegacy), ['song-a', 'song-b']);
assert.deepEqual(getEventSetlistItems(modern), modern.setlist);
assert.deepEqual(buildEventSetlistUpdate(modern.setlist), {
  setlist: modern.setlist,
  canciones: ['song-a']
});

const panel = await readFile(new URL('../src/components/live/QuickMessagePanel.jsx', import.meta.url), 'utf8');
const functionsSource = await readFile(new URL('../functions/index.js', import.meta.url), 'utf8');
assert.doesNotMatch(panel, /quick-message-history\.\$\{eventoId\}/);
assert.doesNotMatch(panel, /sessionStorage/);
assert.match(functionsSource, /quickMessageHistory: appendQuickMessageHistory/);

console.log('setlist fallback and persistent quick-message history: OK');

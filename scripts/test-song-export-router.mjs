import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const songExportSource = await readFile(
  new URL('../src/components/songs/SongExportCenter.jsx', import.meta.url),
  'utf8'
);
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

assert.match(songExportSource, /import \{ useLocation \} from 'react-router-dom';/);
assert.match(songExportSource, /const \{ pathname \} = useLocation\(\);/);
assert.doesNotMatch(songExportSource, /window\.history\.pushState\s*=/);
assert.doesNotMatch(songExportSource, /window\.history\.replaceState\s*=/);
assert.match(appSource, /<Router>[\s\S]*<SongExportCenter \/>[\s\S]*<\/Router>/);
assert.doesNotMatch(mainSource, /<SongExportCenter \/>/);

console.log('song export router integration: OK');

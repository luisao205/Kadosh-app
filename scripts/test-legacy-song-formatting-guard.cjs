const assert = require('node:assert/strict');
const {
  assertLegacySongContentWriteCompatible,
  hasProtectedLyricFormatting,
} = require('../functions/legacySongFormattingGuard');

const lyrics = '# Verso\n[C] Santo';
const changed = '# Verso\n[D] Santo';
const expectBlocked = song => assert.throws(
  () => assertLegacySongContentWriteCompatible(song, changed),
  error => error?.code === 'projection-v2-compatible-save-required'
);

assert.equal(hasProtectedLyricFormatting({}), false);
assert.equal(hasProtectedLyricFormatting({ lyricFormatting: null }), false);
assert.equal(hasProtectedLyricFormatting({ lyricFormatting: undefined }), false);
assert.equal(assertLegacySongContentWriteCompatible({ letraRaw: lyrics }, changed).changesLyrics, true);
assert.equal(assertLegacySongContentWriteCompatible({ letraRaw: lyrics, lyricFormatting: null }, changed).changesLyrics, true);
assert.equal(assertLegacySongContentWriteCompatible({ letraRaw: lyrics, lyricFormatting: { version: 1 } }, lyrics).changesLyrics, false);
expectBlocked({ letraRaw: lyrics, lyricFormatting: { version: 1 } });
expectBlocked({ letraRaw: lyrics, lyricFormatting: { version: 999 } });
expectBlocked({ letraRaw: lyrics, lyricFormatting: 'invalid-sidecar' });
expectBlocked({ letraRaw: lyrics, lyricFormatting: {} });

console.log('Projection V2.1-C3B.1 legacy guard: 10 scenarios PASS');

import assert from 'node:assert/strict';
import {
  RICH_LYRIC_SCALE_FACTORS,
  assertRichLyricRuns,
  calculateProportionalFit,
  richLyricRunStyle,
} from '../src/utils/richLyricText.js';

const original = 'Tú eres fiel\nÉl está aquí — siempre.';
const runs = assertRichLyricRuns([
  { text: 'Tú eres fiel', style: { bold: true, transform: 'uppercase', scale: 'xl', color: 'primary' } },
  { text: '\nÉl está aquí — siempre.', style: { scale: 'sm', color: 'secondary', spacing: 'relaxed' } },
]);
assert.equal(runs.map((run) => run.text).join(''), original, 'The renderer contract preserves source text exactly.');
assert.equal(richLyricRunStyle(runs[0].style).fontSize, `${RICH_LYRIC_SCALE_FACTORS.xl}em`);
assert.equal(richLyricRunStyle(runs[0].style).textTransform, 'uppercase');
assert.equal(richLyricRunStyle(runs[1].style).letterSpacing, '0.075em');

const fit = calculateProportionalFit({
  minBaseFontSize: 18,
  maxBaseFontSize: 220,
  measure: (size) => ({ fits: size <= 73, width: size * 4, height: size * 2 }),
});
assert.equal(fit.baseFontSize, 73);
assert.equal(fit.overflow, false);
const overflow = calculateProportionalFit({
  minBaseFontSize: 24,
  maxBaseFontSize: 220,
  measure: (size) => ({ fits: false, width: size * 100, height: size * 100 }),
});
assert.deepEqual({ baseFontSize: overflow.baseFontSize, overflow: overflow.overflow }, { baseFontSize: 24, overflow: true });

for (const malicious of [
  [{ text: '<img src=x onerror=alert(1)>', style: { className: 'fixed' } }],
  [{ text: 'Texto', style: { color: 'url(javascript:alert(1))' } }],
  [{ text: 'Texto', style: { transform: 'rotate(90deg)' } }],
  [{ text: 'Texto', style: { backgroundImage: 'https://example.test/a.png' } }],
]) assert.throws(() => assertRichLyricRuns(malicious), /unsupported|invalid/);

assert.throws(() => assertRichLyricRuns([]), /non-empty/);
assert.throws(() => calculateProportionalFit({ minBaseFontSize: 0, maxBaseFontSize: 10, measure: () => ({ fits: true }) }), /invalid/);

console.log('Projection V2.1 rich lyric renderer contract: PASS');

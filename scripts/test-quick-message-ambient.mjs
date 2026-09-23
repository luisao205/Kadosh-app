import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getAmbientHalosFromFragmentBounds,
  getQuickMessageAmbientColors,
  getQuickMessageAmbientGlows
} from '../src/utils/quickMessageAmbient.js';
import {
  buildQuickMessageParticles,
  getQuickMessageColorTheme,
  getQuickMessageThemeStyle
} from '../src/utils/quickMessageVisualTheme.js';

const redFragment = { color: 'red', left: 62, top: 56, width: 18, height: 8 };
const nearbyRedFragment = { color: 'red', left: 81, top: 57, width: 12, height: 8 };
const distantRedFragment = { color: 'red', left: 8, top: 8, width: 12, height: 8 };
const blueFragment = { color: 'blue', left: 12, top: 26, width: 30, height: 10 };

assert.deepEqual(getQuickMessageAmbientColors([]), ['white']);
assert.deepEqual(getQuickMessageAmbientColors([{ color: 'white' }, { color: 'white' }]), ['white']);
assert.deepEqual(getQuickMessageAmbientColors([{ color: 'red' }, { color: 'red' }, { color: 'white' }]), ['red', 'white']);
assert.deepEqual(getQuickMessageAmbientColors([{ color: 'white' }, { color: 'green' }, { color: 'blue' }, { color: 'red' }, { color: 'yellow' }]), ['blue', 'red', 'yellow', 'green']);

const oneRedHalo = getAmbientHalosFromFragmentBounds([redFragment]);
assert.equal(oneRedHalo.length, 1);
assert.equal(oneRedHalo[0].color, 'red');
assert.ok(oneRedHalo[0].left > 62 && oneRedHalo[0].left < 80);

const lowerRedHalo = getAmbientHalosFromFragmentBounds([{ color: 'red', left: 58, top: 68, width: 22, height: 9 }])[0];
assert.ok(lowerRedHalo.left > 58 && lowerRedHalo.left < 80);
assert.ok(lowerRedHalo.top > 68 && lowerRedHalo.top < 78);

const groupedRedHalos = getAmbientHalosFromFragmentBounds([redFragment, nearbyRedFragment]);
assert.equal(groupedRedHalos.length, 1);
assert.ok(groupedRedHalos[0].width > oneRedHalo[0].width);

const separateColorHalos = getAmbientHalosFromFragmentBounds([redFragment, blueFragment]);
assert.deepEqual(separateColorHalos.map((halo) => halo.color), ['blue', 'red']);

const splitRedHalos = getAmbientHalosFromFragmentBounds([distantRedFragment, redFragment]);
assert.equal(splitRedHalos.length, 2);
assert.equal(splitRedHalos.every((halo) => halo.color === 'red'), true);

const limitedHalos = getAmbientHalosFromFragmentBounds([
  distantRedFragment,
  redFragment,
  blueFragment,
  { color: 'yellow', left: 50, top: 12, width: 10, height: 8 },
  { color: 'green', left: 44, top: 82, width: 10, height: 8 },
  { color: 'white', left: 72, top: 14, width: 8, height: 8 }
]);
assert.equal(limitedHalos.length, 4);
assert.equal(limitedHalos.every((halo) => halo.left >= 0 && halo.left <= 100 && halo.top >= 0 && halo.top <= 100), true);

const fallbackGlows = getQuickMessageAmbientGlows([{ color: 'blue' }, { color: 'red' }], []);
assert.deepEqual(fallbackGlows.map((glow) => glow.color), ['blue', 'red']);
assert.equal(fallbackGlows[1].background.includes('255, 31, 31'), true);
const measuredGlows = getQuickMessageAmbientGlows([{ color: 'blue' }, { color: 'red' }], [blueFragment, redFragment]);
assert.equal(measuredGlows[0].left, '27%');
assert.equal(measuredGlows[1].left, '71%');

const redTheme = getQuickMessageColorTheme('red');
const blueTheme = getQuickMessageColorTheme('blue');
const whiteTheme = getQuickMessageColorTheme('white');
assert.equal(redTheme.text.every((color) => /#(?:FF|E9)/.test(color)), true);
assert.equal(blueTheme.text.every((color) => /#(?:7D|38|25)/.test(color)), true);
assert.equal(whiteTheme.text.every((color) => /#(?:FF|DF)/.test(color)), true);
assert.equal(getQuickMessageThemeStyle('red')['--quick-text-base'], '#FF1F1F');

const particleGlows = [{ color: 'blue', left: '27%', top: '31%', width: '44%', height: '40%' }, { color: 'red', left: '71%', top: '60%', width: '36%', height: '38%' }];
const particles = buildQuickMessageParticles({ glows: particleGlows, messageKey: 'message-a' });
assert.equal(particles.length, 20);
assert.deepEqual(particles, buildQuickMessageParticles({ glows: particleGlows, messageKey: 'message-a' }));
assert.notDeepEqual(particles, buildQuickMessageParticles({ glows: particleGlows, messageKey: 'message-b' }));
assert.equal(particles.every((particle) => ['blue', 'red'].includes(particle.color)), true);
assert.deepEqual(buildQuickMessageParticles({ glows: particleGlows, messageKey: 'message-a', reducedMotion: true }), []);
assert.ok(buildQuickMessageParticles({ glows: particleGlows, messageKey: 'message-a', maxParticles: 10 }).length <= 10);

const [presentation, glow, particlesComponent, styles] = await Promise.all([
  readFile(new URL('../src/components/live/QuickMessagePresentation.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/live/QuickMessageAmbientGlow.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/live/QuickMessageAmbientParticles.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8')
]);
assert.match(presentation, /getBoundingClientRect\(\)/);
assert.match(presentation, /measureFrameId = requestAnimationFrame/);
assert.match(presentation, /presentationBounds\.width/);
assert.match(presentation, /QuickMessageAmbientGlow glows=\{glows\}/);
assert.match(presentation, /QuickMessageAmbientParticles glows=\{glows\}/);
assert.doesNotMatch(presentation, /BibleAmbientBackground/);
assert.match(glow, /transition-opacity duration-500/);
assert.match(glow, /requestAnimationFrame/);
assert.match(glow, /setCurrent\(\{ signature, glows \}\)/);
assert.match(glow, /\}, \[transitionReady\]\)/);
assert.match(glow, /quick-message-ambient-glow-\$\{index % 4\}/);
assert.match(glow, /width: glow\.width, height: glow\.height/);
assert.match(glow, /quick-message-dynamic-glow/);
assert.match(particlesComponent, /buildQuickMessageParticles/);
assert.match(particlesComponent, /pointer-events-none/);
assert.match(styles, /quick-message-ambient-drift-a 12s ease-in-out infinite alternate/);
assert.match(styles, /quick-message-ambient-drift-b/);
assert.match(styles, /quick-message-text-color/);
assert.match(styles, /quick-message-glow-color/);
assert.match(styles, /quick-message-particle-color/);
assert.match(styles, /prefers-reduced-motion: reduce/);
console.log('quick message ambient fragment positioning: OK');

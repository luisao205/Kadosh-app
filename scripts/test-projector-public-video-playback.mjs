import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildProjectorMediaPayload } from '../src/utils/projectorMediaState.js';

const projectorSource = await readFile(
  new URL('../src/components/live/Proyector.jsx', import.meta.url),
  'utf8'
);
const internalMediaSource = await readFile(
  new URL('../src/components/live/InternalScreenMedia.jsx', import.meta.url),
  'utf8'
);

const video = {
  mediaId: 'public-video',
  url: 'https://example.test/public-video.mp4',
  type: 'video'
};
const liveState = {
  activeSongId: null,
  activeSectionIndex: -1,
  activeContentType: 'none'
};
const projectedVideo = buildProjectorMediaPayload({ media: video, liveState });

assert.equal(projectedVideo.proyectorMedia.mediaId, video.mediaId);
assert.equal(projectedVideo.proyectorMedia.url, video.url);
assert.equal(projectedVideo.proyectorMedia.playing, true);
assert.equal(projectedVideo.proyectorMedia.volume, 1);
assert.equal(projectedVideo.projectorState.type, 'media');

assert.match(projectorSource, /const syncProjectedVideoPlayback = useCallback/);
assert.match(projectorSource, /videoPlaybackRef/);
assert.match(projectorSource, /play\(volume === 0 \|\| attempt\.fallbackMuted\)/);
assert.match(projectorSource, /if \(!muted && !attempt\.fallbackMuted\)/);
assert.match(projectorSource, /attempt\.fallbackMuted = true;\s+play\(true\);/);
assert.match(projectorSource, /preload="auto"/);
assert.match(projectorSource, /loop=\{true\}/);
assert.match(projectorSource, /onLoadedMetadata=\{\(event\) => syncProjectedVideoPlayback\(event\.currentTarget\)\}/);
assert.match(projectorSource, /onLoadedData=\{\(event\) => syncProjectedVideoPlayback\(event\.currentTarget\)\}/);
assert.match(projectorSource, /onCanPlay=\{\(event\) => syncProjectedVideoPlayback\(event\.currentTarget\)\}/);
assert.match(projectorSource, /key=\{media\.url\}/);
assert.match(projectorSource, /video\.pause\(\);\s+video\.removeAttribute\('src'\);\s+video\.load\(\);/);
assert.doesNotMatch(projectorSource, /muted=\{false\}/);
assert.doesNotMatch(projectorSource, /Haz clic para reproducir el video/);
assert.doesNotMatch(projectorSource, /onEnded=/);
assert.doesNotMatch(projectorSource, /\.loop\s*=\s*false/);

// The returns retain their independent muted autoplay behavior.
assert.match(internalMediaSource, /autoPlay/);
assert.match(internalMediaSource, /muted/);
assert.match(internalMediaSource, /playsInline/);
assert.match(internalMediaSource, /preload="auto"/);
assert.match(internalMediaSource, /loop=\{media\.loop \?\? true\}/);

console.log('public projector video playback contract: OK');

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildPanicProjectorPayload,
  buildProjectorMediaPayload,
  buildStoppedProjectorMediaPayload,
  createProjectionWriteQueue,
  resolveProjectorBackground,
  selectSongProjectionBackground
} from '../src/utils/projectorMediaState.js';

const inactiveLiveState = {
  activeSongId: null,
  activeSectionIndex: -1,
  activeContentType: 'none'
};

const projectedMedia = {
  mediaId: 'announcement-1',
  url: 'https://example.test/announcement.jpg',
  mode: 'foreground'
};

const contaminatedEvent = {
  proyectorMedia: projectedMedia,
  projectorState: { type: 'media', media: projectedMedia },
  proyectorFondo: projectedMedia.url,
  proyectorFondoMedia: projectedMedia,
  proyectorSlide: { titulo: 'Legacy', texto: 'Legacy' },
  proyectorSongId: 'old-song',
  proyectorSlideIndex: 2,
  currentSongId: 'old-song'
};

const cleared = buildStoppedProjectorMediaPayload({
  eventData: contaminatedEvent,
  liveState: inactiveLiveState,
  updatedAt: 123
});

assert.equal(cleared.proyectorMedia, null);
assert.equal(cleared.projectorState.type, 'resume');
assert.equal(cleared.projectorState.media, null);
assert.equal(cleared.projectorState.background, null);
assert.equal(cleared.proyectorFondo, null);
assert.equal(cleared.proyectorFondoMedia, null);
assert.equal(cleared.proyectorSlide, null);
assert.equal(cleared.proyectorSongId, null);
assert.equal(cleared.proyectorSlideIndex, -1);
assert.equal(cleared.currentSongId, null);
assert.deepEqual(cleared.liveState, inactiveLiveState);

const songOwnBackground = 'https://example.test/song-own-background.jpg';
const backgroundAfterProjectingSong = cleared.proyectorFondo || songOwnBackground;
assert.equal(backgroundAfterProjectingSong, 'https://example.test/song-own-background.jpg');

const songBackground = {
  mediaId: 'song-background-1',
  url: 'https://example.test/song-background.jpg'
};
const independentBackground = buildStoppedProjectorMediaPayload({
  eventData: {
    proyectorMedia: projectedMedia,
    projectorState: { type: 'media', media: projectedMedia },
    proyectorFondo: songBackground.url,
    proyectorFondoMedia: songBackground
  },
  liveState: inactiveLiveState
});

assert.equal(independentBackground.proyectorFondo, songBackground.url);
assert.equal(independentBackground.proyectorFondoMedia, songBackground);
assert.equal(selectSongProjectionBackground(null, songBackground), songBackground);
assert.equal(selectSongProjectionBackground(projectedMedia, songBackground), projectedMedia);

const projectSong = (eventData, id) => {
  const background = selectSongProjectionBackground(null, {
    mediaId: `background-${id}`,
    url: `https://example.test/${id}.jpg`,
    source: 'songBackground'
  });
  return {
    ...eventData,
    proyectorMedia: null,
    proyectorFondo: background.url,
    proyectorFondoMedia: background,
    projectorState: {
      type: 'lyrics',
      contentType: 'lyrics',
      media: null,
      background: background.url,
      backgroundMedia: background
    },
    currentSongId: id,
    proyectorSongId: id
  };
};

const projectMedia = eventData => ({
  ...eventData,
  ...buildProjectorMediaPayload({ media: projectedMedia, liveState: inactiveLiveState }),
  proyectorFondo: null,
  proyectorFondoMedia: null
});

const stopMedia = eventData => ({
  ...eventData,
  ...buildStoppedProjectorMediaPayload({ eventData, liveState: inactiveLiveState })
});

const projectNonMusical = (eventData, contentType) => ({
  ...eventData,
  proyectorMedia: null,
  projectorState: {
    type: 'preaching',
    contentType,
    media: null,
    background: null,
    backgroundMedia: null
  }
});

let sequence = projectSong({}, 'song-a');
sequence = projectMedia(sequence);
sequence = stopMedia(sequence);
sequence = projectSong(sequence, 'song-b');
assert.equal(resolveProjectorBackground(sequence).url, 'https://example.test/song-b.jpg');

sequence = stopMedia(projectMedia(projectSong({}, 'song-a')));
assert.equal(resolveProjectorBackground(projectNonMusical(sequence, 'bible')).url, null);
assert.equal(resolveProjectorBackground(projectNonMusical(sequence, 'preaching')).url, null);
assert.equal(resolveProjectorBackground({
  proyectorFondo: projectedMedia.url,
  proyectorFondoMedia: projectedMedia,
  projectorState: { type: 'preaching', contentType: 'bible', background: null, backgroundMedia: null }
}).url, null);

sequence = projectMedia({});
sequence = { ...sequence, ...buildPanicProjectorPayload({ liveState: inactiveLiveState }) };
assert.equal(resolveProjectorBackground(sequence).url, null);
assert.equal(sequence.proyectorFondo, null);
assert.equal(sequence.proyectorMedia, null);

sequence = projectSong(projectSong(projectSong({}, 'song-a'), 'song-b'), 'song-c');
assert.equal(resolveProjectorBackground(sequence).url, 'https://example.test/song-c.jpg');

sequence = projectMedia({});
sequence = { ...sequence, ...buildPanicProjectorPayload({ liveState: inactiveLiveState }) };
sequence = projectSong(sequence, 'song-after-panic');
assert.equal(resolveProjectorBackground(sequence).url, 'https://example.test/song-after-panic.jpg');

const videoMedia = {
  mediaId: 'video-1',
  url: 'https://example.test/video.mp4',
  type: 'video'
};

for (const media of [projectedMedia, videoMedia]) {
  let state = {
    ...buildProjectorMediaPayload({ media, liveState: inactiveLiveState }),
    proyectorFondo: null,
    proyectorFondoMedia: null
  };
  assert.equal(state.projectorState.type, 'media');
  assert.equal(state.projectorState.background, null);
  assert.equal(resolveProjectorBackground(state).url, null);

  state = stopMedia(state);
  assert.equal(state.proyectorMedia, null);
  assert.equal(state.projectorState.media, null);
  assert.equal(resolveProjectorBackground(state).url, null);
}

sequence = projectMedia({});
sequence = {
  ...sequence,
  ...buildProjectorMediaPayload({ media: videoMedia, liveState: inactiveLiveState }),
  proyectorFondo: null,
  proyectorFondoMedia: null
};
sequence = projectMedia(sequence);
assert.equal(sequence.proyectorMedia.mediaId, projectedMedia.mediaId);
assert.equal(resolveProjectorBackground(sequence).url, null);

for (const target of ['bible', 'preaching']) {
  sequence = projectMedia(projectSong({}, 'song-a'));
  sequence = stopMedia(sequence);
  sequence = projectNonMusical(sequence, target);
  assert.equal(sequence.proyectorMedia, null);
  assert.equal(resolveProjectorBackground(sequence).url, null);
}

const permanentSongData = { ...songBackground };
buildStoppedProjectorMediaPayload({
  eventData: { proyectorMedia: projectedMedia },
  liveState: inactiveLiveState
});
buildPanicProjectorPayload({ liveState: inactiveLiveState });
assert.deepEqual(songBackground, permanentSongData);

const orderedWrites = [];
const enqueue = createProjectionWriteQueue();
const wait = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));
const first = enqueue(async () => { await wait(20); orderedWrites.push('media'); });
const second = enqueue(async () => { orderedWrites.push('song'); });
await Promise.all([first, second]);
assert.deepEqual(orderedWrites, ['media', 'song']);

await assert.rejects(enqueue(async () => { throw new Error('expected write failure'); }));
await enqueue(async () => { orderedWrites.push('after-failure'); });
assert.equal(orderedWrites.at(-1), 'after-failure');

const controllerSource = await readFile(
  new URL('../src/components/live/ProyectorController.jsx', import.meta.url),
  'utf8'
);
assert.match(controllerSource, /handleUploadBackground = async \(e, \{ applyAsBackground = false \} = \{\}\)/);
assert.match(controllerSource, /if \(applyAsBackground\) \{/);
assert.match(controllerSource, /onChange=\{\(event\) => handleUploadBackground\(event, \{ applyAsBackground: true \}\)\}/);
assert.match(controllerSource, /onChange=\{handleUploadBackground\}/);
assert.doesNotMatch(controllerSource, /background: evento\?\.projectorState\?\.background \|\| fondoActivo/);

const backgroundSource = await readFile(
  new URL('../src/components/live/ProjectorMediaBackground.jsx', import.meta.url),
  'utf8'
);
assert.match(backgroundSource, /currentLayerRef\.current = layer;\s+setCurrentLayer\(layer\);/);
assert.match(backgroundSource, /if \(suspended\) \{\s+setNextVisible\(false\);\s+return undefined;/);
assert.doesNotMatch(backgroundSource, /if \(disabled \|\| suspended \|\|/);
assert.match(backgroundSource, /suspended \? 'invisible' : 'visible'/);
assert.match(backgroundSource, /if \(currentLayerRef\.current\?\.id === nextLayer\.id\) \{\s+setPreviousLayer\(null\);\s+setNextVisible\(true\);/);
assert.match(backgroundSource, /if \(tokenRef\.current !== token\) return;/);
assert.match(backgroundSource, /element\.pause\(\);\s+element\.removeAttribute\('src'\);\s+element\.load\(\);/);

const projectorSource = await readFile(
  new URL('../src/components/live/Proyector.jsx', import.meta.url),
  'utf8'
);
assert.match(projectorSource, /suspended=\{Boolean\(media\?\.url && media\.mode === 'foreground'\)\}/);

const internalMediaSource = await readFile(
  new URL('../src/components/live/InternalScreenMedia.jsx', import.meta.url),
  'utf8'
);
assert.match(internalMediaSource, /className="h-full w-full object-contain"/);
assert.match(internalMediaSource, /video\.pause\(\);\s+video\.removeAttribute\('src'\);\s+video\.load\(\);/);
assert.match(internalMediaSource, /if \(media\?\.playing === false\) video\.pause\(\);/);

for (const displayPath of [
  '../src/components/live/StageDisplayMusicos.jsx',
  '../src/components/live/StageDisplayCantantes.jsx'
]) {
  const displaySource = await readFile(new URL(displayPath, import.meta.url), 'utf8');
  assert.match(displaySource, /data\.projectorState\?\.type === 'media'/);
  assert.match(displaySource, /!data\.proyectorApagado/);
  assert.match(displaySource, /<InternalScreenMedia media=\{media\}/);
  assert.doesNotMatch(displaySource, /media && media\.url && !/);
}

const preacherSource = await readFile(
  new URL('../src/components/live/PreacherDisplay.jsx', import.meta.url),
  'utf8'
);
assert.doesNotMatch(preacherSource, /<InternalScreenMedia/);
assert.match(preacherSource, /const internalMessageOverlay = <InternalMessageOverlay/);
assert.match(preacherSource, /if \(eventData\?\.proyectorApagado\)/);

console.log('projector media transition states: OK');

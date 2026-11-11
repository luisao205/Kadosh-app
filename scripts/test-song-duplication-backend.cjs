const assert = require('node:assert/strict');
const formatting = require('../functions/lyricFormattingPersistence');
const {
  buildCopy,
  createSongDuplicationService,
  targetSongId,
} = require('../functions/songDuplicationService');

const lyrics = '# Verso 1\n[C] Santo\n\n[C] Santo\n\n# Coro 1\nTu gracia';
const sidecar = {
  version: 1,
  sourceLyricsHash: formatting.hashLyricsSource(lyrics),
  identities: { sections: [
    { id: 'section-verso', fingerprint: 'v', titleFingerprint: 'verso', previousFingerprint: null, nextFingerprint: 'c', slides: [
      { id: 'slide-same-a', fingerprint: 'same', previousFingerprint: null, nextFingerprint: 'same' },
      { id: 'slide-same-b', fingerprint: 'same', previousFingerprint: 'same', nextFingerprint: null },
    ] },
    { id: 'section-coro', fingerprint: 'c', titleFingerprint: 'coro', previousFingerprint: 'v', nextFingerprint: null, slides: [
      { id: 'slide-coro', fingerprint: 'gracia', previousFingerprint: null, nextFingerprint: null },
    ] },
  ] },
  blocks: [
    { id: 'block-a', scope: { type: 'slide', sectionId: 'section-verso', slideId: 'slide-same-a' }, sourceHash: formatting.hashLyricsSource('[C] Santo'), reconciliation: 'resolved', segments: [{ id: 'seg-a', anchor: { quote: 'Santo' }, style: { bold: true, color: 'primary' }, reconciliation: 'resolved' }] },
    { id: 'block-b', scope: { type: 'slide', sectionId: 'section-verso', slideId: 'slide-same-b' }, sourceHash: formatting.hashLyricsSource('[C] Santo'), reconciliation: 'resolved', template: { id: 'double-emphasis', version: 1, slots: [{ id: 'slot-a', role: 'primary', anchor: { quote: 'Santo' } }] }, segments: [{ id: 'seg-b', anchor: { quote: 'Santo' }, style: { scale: 'xl', color: 'accent' }, reconciliation: 'resolved' }] },
  ],
};

const source = {
  id: 'song-source', titulo: 'Fuente', artista: 'Kadosh', tonoOriginal: 'C', tonosAlternativos: 'D',
  tonosPorCantante: { singer: 'D' }, etiquetas: ['Adoracion'], bpm: 72, letraRaw: lyrics,
  projectionStyle: { preset: 'worship', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' },
  recursos: [{ id: 'old-resource', titulo: 'PDF', tipo: 'pdf', url: '/fixture.pdf', instrumento: 'todos', secret: 'drop' }],
  multitracks: [{ id: 'old-track', nombre: 'Guide', url: '/guide.mp3', fileName: 'guide.mp3', token: 'drop' }],
  sectionMedia: { 'Verso 1': [{ id: 'old-media', mediaId: 'media-1', title: 'Video', type: 'video', url: '/fixture.webm', sectionTitle: 'Verso 1', usedBy: ['drop'] }] },
  transposeMode: 'UNIFIED', cancionesOrigen: ['part-1'], medleyConfig: { materializationVersion: 2, songs: [{ songId: 'part-1' }] },
  lyricFormatting: sidecar, createdAt: 'old', updatedAt: 'old', creadoPor: 'old-user', archived: true,
  permissionAudit: { unsafe: true }, accessToken: 'secret', eventState: { unsafe: true },
};

class MockRepository {
  constructor(options = {}) {
    this.actor = options.actor || { accountStatus: 'active', permissions: ['songs.create'] };
    this.songs = new Map([[source.id, structuredClone(options.source || source)]]);
    this.media = new Map([['media-1', { id: 'media-1', usedBy: [], firstUsedAt: null }]]);
    this.operations = new Map();
    this.audits = [];
    this.failAt = options.failAt || null;
  }
  async runTransaction(callback) {
    const songs = structuredClone(this.songs);
    const media = structuredClone(this.media);
    const operations = structuredClone(this.operations);
    const audits = structuredClone(this.audits);
    const key = (songId, requestId) => `${songId}:${requestId}`;
    const tx = {
      getActorAuthorization: async () => this.actor,
      getSong: async id => songs.has(id) ? { id, ...structuredClone(songs.get(id)) } : null,
      getOperation: async (songId, requestId) => operations.get(key(songId, requestId)) || null,
      getMedia: async id => media.get(id) || null,
      songExists: async id => songs.has(id),
      createSong: async (id, value) => { if (this.failAt === 'song') throw new Error('firestore-failure'); songs.set(id, structuredClone(value)); },
      updateMedia: async (id, value) => { if (this.failAt === 'media') throw new Error('firestore-failure'); media.set(id, { ...media.get(id), ...structuredClone(value) }); },
      createOperation: async (songId, requestId, value) => { if (this.failAt === 'operation') throw new Error('firestore-failure'); operations.set(key(songId, requestId), structuredClone(value)); },
      appendAudit: async (id, value) => { if (this.failAt === 'audit') throw new Error('firestore-failure'); audits.push({ id, ...structuredClone(value) }); },
    };
    const result = await callback(tx);
    this.songs = songs; this.media = media; this.operations = operations; this.audits = audits;
    return result;
  }
}

const request = requestId => ({ auth: { uid: 'actor-a' }, data: { songId: source.id, requestId } });
const expectCode = async (code, fn) => assert.rejects(fn, error => error?.code === code);

(async () => {
  const copy = buildCopy({ source, actorUid: 'actor-a', targetId: 'copy-a', now: 1700000000000 });
  assert.equal(copy.titulo, 'Fuente (Copia)');
  assert.equal(copy.letraRaw, lyrics);
  assert.deepEqual(copy.lyricFormatting, sidecar);
  assert.notEqual(copy.lyricFormatting, source.lyricFormatting);
  assert.equal(copy.lyricFormatting.blocks[0].scope.slideId, 'slide-same-a');
  assert.equal(copy.lyricFormatting.blocks[1].scope.slideId, 'slide-same-b');
  assert.notEqual(copy.recursos[0].id, source.recursos[0].id);
  assert.notEqual(copy.multitracks[0].id, source.multitracks[0].id);
  assert.notEqual(copy.sectionMedia['Verso 1'][0].id, source.sectionMedia['Verso 1'][0].id);
  assert.equal(copy.recursos[0].secret, undefined);
  assert.equal(copy.sectionMedia['Verso 1'][0].usedBy, undefined);
  assert.equal(copy.createdAt, undefined);
  assert.equal(copy.archived, undefined);
  assert.equal(copy.permissionAudit, undefined);
  assert.equal(copy.accessToken, undefined);
  assert.equal(copy.creadoPor, 'actor-a');

  const legacy = buildCopy({ source: { id: 'legacy', titulo: 'Legacy', letraRaw: '# V\nText' }, actorUid: 'actor-a', targetId: 'copy-l', now: 1 });
  assert.equal(Object.hasOwn(legacy, 'lyricFormatting'), false);
  const nullFormatted = buildCopy({ source: { id: 'null', titulo: 'Null', letraRaw: '# V\nText', lyricFormatting: null }, actorUid: 'actor-a', targetId: 'copy-n', now: 1 });
  assert.equal(nullFormatted.lyricFormatting, null);

  const invalid = structuredClone(source); invalid.lyricFormatting.blocks[0].scope.slideId = 'missing';
  assert.throws(() => buildCopy({ source: invalid, actorUid: 'a', targetId: 'x', now: 1 }), error => error.code === 'invalid-format');
  const unknown = structuredClone(source); unknown.lyricFormatting.version = 999;
  assert.throws(() => buildCopy({ source: unknown, actorUid: 'a', targetId: 'x', now: 1 }), error => error.code === 'unsupported-version');
  const ambiguous = structuredClone(source); ambiguous.lyricFormatting.blocks[0].reconciliation = 'ambiguous';
  assert.throws(() => buildCopy({ source: ambiguous, actorUid: 'a', targetId: 'x', now: 1 }), error => error.code === 'reconciliation-required');
  const stale = structuredClone(source); stale.letraRaw += '\nchanged';
  assert.throws(() => buildCopy({ source: stale, actorUid: 'a', targetId: 'x', now: 1 }), error => error.code === 'stale-lyrics');

  const repo = new MockRepository();
  const service = createSongDuplicationService({ repository: repo, now: () => 1700000000000 });
  const first = await service.duplicate(request('duplicate_request_0001'));
  assert.equal(first.idempotent, false);
  assert.equal(first.songId, targetSongId('actor-a', source.id, 'duplicate_request_0001'));
  assert(repo.songs.has(first.songId));
  assert.equal(repo.media.get('media-1').usedBy[0].songId, first.songId);
  assert.equal(repo.audits.length, 1);
  assert.deepEqual(repo.songs.get(source.id), source);
  const retry = await createSongDuplicationService({ repository: repo }).duplicate(request('duplicate_request_0001'));
  assert.equal(retry.idempotent, true);
  assert.equal(repo.songs.size, 2);
  assert.equal(repo.audits.length, 1);
  await expectCode('idempotency-conflict', () => service.duplicate({ auth: { uid: 'actor-b' }, data: request('duplicate_request_0001').data }));
  await expectCode('unauthenticated', () => service.duplicate({ auth: null, data: request('duplicate_request_0002').data }));
  await expectCode('invalid-argument', () => service.duplicate({ auth: { uid: 'actor-a' }, data: { songId: source.id, requestId: 'short' } }));
  await expectCode('permission-denied', () => createSongDuplicationService({ repository: new MockRepository({ actor: { accountStatus: 'active', permissions: [] } }) }).duplicate(request('duplicate_request_0003')));
  await expectCode('permission-denied', () => createSongDuplicationService({ repository: new MockRepository({ actor: { accountStatus: 'suspended', permissions: ['songs.create'] } }) }).duplicate(request('duplicate_request_0004')));
  const missingRepo = new MockRepository(); missingRepo.songs.clear();
  await expectCode('song-not-found', () => createSongDuplicationService({ repository: missingRepo }).duplicate(request('duplicate_request_0005')));
  const missingMedia = new MockRepository(); missingMedia.media.clear();
  await expectCode('media-not-found', () => createSongDuplicationService({ repository: missingMedia }).duplicate(request('duplicate_request_0006')));
  const collisionRepo = new MockRepository(); collisionRepo.songs.set(targetSongId('actor-a', source.id, 'duplicate_request_0007'), { title: 'occupied' });
  await expectCode('destination-conflict', () => createSongDuplicationService({ repository: collisionRepo }).duplicate(request('duplicate_request_0007')));
  for (const failAt of ['song', 'media', 'operation', 'audit']) {
    const failing = new MockRepository({ failAt });
    await assert.rejects(() => createSongDuplicationService({ repository: failing }).duplicate(request(`duplicate_failure_${failAt}_0001`)), /firestore-failure/);
    assert.equal(failing.songs.size, 1);
    assert.equal(failing.operations.size, 0);
    assert.equal(failing.audits.length, 0);
  }

  console.log('Projection V2.1-C3B.2 song duplication backend: 38 scenarios PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });

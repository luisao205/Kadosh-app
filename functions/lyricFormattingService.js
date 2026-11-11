/* global module, require */
const { LyricFormattingPersistenceError, computeFormattingHash, computeLyricsHash, validateRequest, validateSidecar } = require('./lyricFormattingPersistence');

const activeAccount = value => value === undefined || value === 'active' || value === 'Activa';

const createLyricFormattingService = ({ repository, now = () => Date.now() }) => {
  if (!repository?.runTransaction) throw new Error('lyric_formatting_repository_required');

  const save = async ({ auth, data }) => {
    if (!auth?.uid) throw new LyricFormattingPersistenceError('unauthenticated');
    const request = validateRequest(data);
    return repository.runTransaction(async transaction => {
      const actor = await transaction.getActorAuthorization(auth.uid);
      if (!actor || !activeAccount(actor.accountStatus)) throw new LyricFormattingPersistenceError('permission-denied');
      if (!actor.permissions?.includes('songs.editLyrics')) throw new LyricFormattingPersistenceError('permission-denied');

      const existing = await transaction.getOperation(auth.uid, request.data.songId, request.data.requestId);
      if (existing) {
        if (existing.actorUid !== auth.uid) throw new LyricFormattingPersistenceError('idempotency-conflict');
        if (existing.fingerprint !== request.fingerprint || existing.kind !== request.kind) throw new LyricFormattingPersistenceError('idempotency-conflict');
        return { ...existing.result, idempotent: true };
      }

      const current = await transaction.getSong(request.data.songId);
      if (!current) throw new LyricFormattingPersistenceError('song-not-found');
      const currentLyrics = String(current.letraRaw || '');
      const currentLyricsHash = computeLyricsHash(currentLyrics);
      let currentFormattingHash;
      try {
        currentFormattingHash = computeFormattingHash(current.lyricFormatting ?? null, currentLyrics);
      } catch (error) {
        if (error instanceof LyricFormattingPersistenceError) throw new LyricFormattingPersistenceError('formatting-conflict');
        throw error;
      }
      if (request.data.expectedLyricsHash !== currentLyricsHash) throw new LyricFormattingPersistenceError('stale-lyrics');
      if (request.data.expectedFormattingHash !== currentFormattingHash) throw new LyricFormattingPersistenceError('formatting-conflict');

      const nextLyrics = request.kind === 'lyrics-and-format' ? request.data.letraRaw : currentLyrics;
      const nextFormatting = validateSidecar(request.data.lyricFormatting, nextLyrics);
      const result = {
        ok: true,
        songId: request.data.songId,
        requestId: request.data.requestId,
        kind: request.kind,
        lyricsHash: computeLyricsHash(nextLyrics),
        formattingHash: computeFormattingHash(nextFormatting, nextLyrics),
        idempotent: false,
      };
      const changedFields = request.kind === 'lyrics-and-format' ? ['letraRaw', 'lyricFormatting'] : ['lyricFormatting'];
      await transaction.updateSong(request.data.songId, {
        ...(request.kind === 'lyrics-and-format' ? { letraRaw: nextLyrics } : {}),
        lyricFormatting: nextFormatting,
        fechaActualizacion: new Date(now()).toISOString(),
      });
      await transaction.createOperation(auth.uid, request.data.songId, request.data.requestId, {
        version: 1,
        actorUid: auth.uid,
        songId: request.data.songId,
        requestId: request.data.requestId,
        kind: request.kind,
        fingerprint: request.fingerprint,
        result,
        completedAt: now(),
      });
      await transaction.appendAudit(request.data.songId, {
        actorUid: auth.uid,
        action: request.kind,
        permission: 'songs.editLyrics',
        changedFields,
        requestId: request.data.requestId,
        lyricsHash: result.lyricsHash,
        formattingHash: result.formattingHash,
        timestamp: now(),
      });
      return result;
    });
  };

  return { save };
};

module.exports = { createLyricFormattingService };

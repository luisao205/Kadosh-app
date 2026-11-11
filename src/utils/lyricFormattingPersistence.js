import { hashLyricsSource, validateLyricFormatting } from './lyricFormatting.js';

export const LYRIC_FORMATTING_PERSISTENCE_VERSION = 1;
export const LYRIC_FORMATTING_PERSISTENCE_LIMITS = Object.freeze({
  maxSidecarBytes: 256 * 1024,
  maxOperationBytes: 64 * 1024,
});

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const SONG_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CALLABLE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const CALLABLE_SONG_ID = /^[^/\s][^/]{0,255}$/;
const OPERATION_KEYS = new Set([
  'version', 'songId', 'requestId', 'expectedLyricsHash', 'expectedFormattingHash',
  'nextLyricsRaw', 'lyricFormatting', 'operationFingerprint',
]);

export class LyricFormattingPersistenceError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'LyricFormattingPersistenceError';
    this.code = code;
    this.details = details;
  }
}

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const utf8Bytes = value => new TextEncoder().encode(value).byteLength;
const fail = (condition, code, details) => {
  if (!condition) throw new LyricFormattingPersistenceError(code, details);
};

export const canonicalizeLyricsForPersistence = value => String(value ?? '')
  .replace(/\r\n?/g, '\n')
  .normalize('NFC');

export const stableSerializeFormatting = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerializeFormatting).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerializeFormatting(value[key])}`).join(',')}}`;
};

export const measureV21SavePayloadBytes = payload => utf8Bytes(stableSerializeFormatting(payload));

export const validateV21SavePayloadSize = payload => {
  fail(isPlainObject(payload), 'invalid-format');
  const includesLyrics = Object.hasOwn(payload, 'letraRaw');
  const allowed = new Set([
    'songId', 'lyricFormatting', 'expectedLyricsHash', 'expectedFormattingHash', 'requestId',
    ...(includesLyrics ? ['letraRaw'] : []),
  ]);
  fail(Object.keys(payload).length === allowed.size && Object.keys(payload).every(key => allowed.has(key)), 'invalid-format');
  fail(CALLABLE_SONG_ID.test(String(payload.songId || '')), 'invalid-format');
  fail(CALLABLE_REQUEST_ID.test(String(payload.requestId || '')), 'invalid-format');
  fail(SHA256.test(String(payload.expectedLyricsHash || '')) && SHA256.test(String(payload.expectedFormattingHash || '')), 'invalid-format');
  if (includesLyrics) fail(typeof payload.letraRaw === 'string' && payload.letraRaw.length <= 100000, 'invalid-format');
  const normalized = {
    ...payload,
    ...(includesLyrics ? { letraRaw: canonicalizeLyricsForPersistence(payload.letraRaw) } : {}),
  };
  const bytes = measureV21SavePayloadBytes(normalized);
  fail(bytes <= LYRIC_FORMATTING_PERSISTENCE_LIMITS.maxOperationBytes, 'payload-too-large', {
    bytes,
    limit: LYRIC_FORMATTING_PERSISTENCE_LIMITS.maxOperationBytes,
  });
  return normalized;
};

const sha256 = async value => {
  fail(globalThis.crypto?.subtle && typeof globalThis.crypto.subtle.digest === 'function', 'sha256_unavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

export const computeLyricsHash = lyricsRaw => sha256(canonicalizeLyricsForPersistence(lyricsRaw));

export const classifyLyricFormattingSidecar = (lyricFormatting, { lyricsRaw } = {}) => {
  if (lyricFormatting === undefined || lyricFormatting === null) return { status: 'absent', value: null };
  if (!isPlainObject(lyricFormatting)) return { status: 'invalid', value: null };
  if (lyricFormatting.version !== 1) return { status: 'legacy-unsupported', value: null };
  try {
    validateLyricFormatting(lyricFormatting, { lyricsRaw });
    if (lyricsRaw !== undefined && lyricFormatting.sourceLyricsHash !== hashLyricsSource(lyricsRaw)) {
      return { status: 'stale', value: null };
    }
    return { status: 'valid', value: lyricFormatting };
  } catch {
    return { status: 'invalid', value: null };
  }
};

export const canonicalizeLyricFormatting = (lyricFormatting, { lyricsRaw } = {}) => {
  if (lyricFormatting === undefined || lyricFormatting === null) return null;
  const classification = classifyLyricFormattingSidecar(lyricFormatting, { lyricsRaw });
  fail(classification.status === 'valid', `sidecar_${classification.status.replace('-', '_')}`);
  const serialized = stableSerializeFormatting(lyricFormatting);
  fail(utf8Bytes(serialized) <= LYRIC_FORMATTING_PERSISTENCE_LIMITS.maxSidecarBytes, 'sidecar_too_large');
  return JSON.parse(serialized);
};

export const computeFormattingHash = async (lyricFormatting, options = {}) => {
  const canonical = canonicalizeLyricFormatting(lyricFormatting, options);
  return sha256(stableSerializeFormatting(canonical));
};

export const createLyricFormattingSaveOperation = async ({
  songId,
  requestId,
  expectedLyricsHash,
  expectedFormattingHash,
  nextLyricsRaw,
  lyricFormatting,
}) => {
  fail(SONG_ID.test(String(songId || '')), 'song_id_invalid');
  fail(REQUEST_ID.test(String(requestId || '')), 'request_id_invalid');
  fail(SHA256.test(String(expectedLyricsHash || '')), 'expected_lyrics_hash_invalid');
  fail(SHA256.test(String(expectedFormattingHash || '')), 'expected_formatting_hash_invalid');
  fail(typeof nextLyricsRaw === 'string', 'next_lyrics_invalid');
  const canonicalLyrics = canonicalizeLyricsForPersistence(nextLyricsRaw);
  const canonicalFormatting = canonicalizeLyricFormatting(lyricFormatting, { lyricsRaw: canonicalLyrics });
  const base = {
    version: LYRIC_FORMATTING_PERSISTENCE_VERSION,
    songId,
    requestId,
    expectedLyricsHash,
    expectedFormattingHash,
    nextLyricsRaw: canonicalLyrics,
    lyricFormatting: canonicalFormatting,
  };
  const serialized = stableSerializeFormatting(base);
  fail(utf8Bytes(serialized) <= LYRIC_FORMATTING_PERSISTENCE_LIMITS.maxOperationBytes, 'operation_too_large');
  return Object.freeze({ ...base, operationFingerprint: await sha256(serialized) });
};

export const validateLyricFormattingSaveOperation = async operation => {
  fail(isPlainObject(operation) && Object.keys(operation).every(key => OPERATION_KEYS.has(key)), 'operation_invalid');
  const rebuilt = await createLyricFormattingSaveOperation(operation);
  fail(operation.version === LYRIC_FORMATTING_PERSISTENCE_VERSION, 'operation_version_invalid');
  fail(operation.operationFingerprint === rebuilt.operationFingerprint, 'operation_fingerprint_mismatch');
  return rebuilt;
};

export const evaluateLyricFormattingPersistence = async ({ operation, currentSong, actorUid, existingRequest = null }) => {
  fail(typeof actorUid === 'string' && actorUid.length > 0, 'actor_uid_invalid');
  const validated = await validateLyricFormattingSaveOperation(operation);
  fail(isPlainObject(currentSong) && currentSong.id === validated.songId, 'song_snapshot_invalid');

  if (existingRequest) {
    fail(existingRequest.actorUid === actorUid, 'request_owned_by_another_user');
    fail(existingRequest.operationFingerprint === validated.operationFingerprint, 'request_id_conflict');
    return { status: 'idempotent', requestId: validated.requestId, operationFingerprint: validated.operationFingerprint };
  }

  const currentLyricsHash = await computeLyricsHash(currentSong.letraRaw || '');
  const currentFormattingHash = await computeFormattingHash(currentSong.lyricFormatting ?? null, { lyricsRaw: currentSong.letraRaw || '' });
  fail(currentLyricsHash === validated.expectedLyricsHash, 'lyrics_conflict', { currentLyricsHash });
  fail(currentFormattingHash === validated.expectedFormattingHash, 'formatting_conflict', { currentFormattingHash });

  return {
    status: 'ready',
    requestId: validated.requestId,
    operationFingerprint: validated.operationFingerprint,
    actorUid,
    expected: { lyricsHash: currentLyricsHash, formattingHash: currentFormattingHash },
    next: {
      lyricsHash: await computeLyricsHash(validated.nextLyricsRaw),
      formattingHash: await computeFormattingHash(validated.lyricFormatting, { lyricsRaw: validated.nextLyricsRaw }),
    },
    atomicPatch: {
      letraRaw: validated.nextLyricsRaw,
      lyricFormatting: validated.lyricFormatting,
    },
  };
};

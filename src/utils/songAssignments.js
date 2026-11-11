import { calcularOffsetSemitonos, normalizarNota } from './musicCore.js';

const normalizeText = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

export const getEventSingerAssignments = (event = {}) => (
  event?.cantantesPorCancion
  || event?.['cantantesPorCanción']
  || {}
);

export const getEventChoirAssignments = (event = {}) => (
  event?.corosPorCancion
  || event?.['corosPorCanción']
  || {}
);

export const getEventSingerForSong = (event = {}, songId = '') => {
  const assignments = getEventSingerAssignments(event);
  return assignments?.[songId] || '';
};

export const getEventChoirsForSong = (event = {}, songId = '') => {
  const assignments = getEventChoirAssignments(event);
  const choirs = assignments?.[songId];
  return Array.isArray(choirs) ? choirs : [];
};

export const getSongBaseKey = (song = {}) => (
  song?.tonoOriginal
  || song?.tono
  || 'C'
);

export const parseSingerTones = (tonosAlternativos) => {
  if (!tonosAlternativos) return {};
  if (typeof tonosAlternativos === 'object' && !Array.isArray(tonosAlternativos)) {
    return Object.fromEntries(
      Object.entries(tonosAlternativos)
        .map(([name, key]) => [String(name || '').trim(), String(key || '').trim()])
        .filter(([name]) => Boolean(name))
    );
  }

  return String(tonosAlternativos)
    .split(',')
    .reduce((acc, item) => {
      const separatorIndex = item.indexOf(':');
      if (separatorIndex === -1) return acc;
      const name = item.slice(0, separatorIndex).trim();
      const key = item.slice(separatorIndex + 1).trim();
      if (name) acc[name] = key;
      return acc;
    }, {});
};

export const getSingerTone = (song = {}, singerName = '') => {
  const normalizedSinger = normalizeText(singerName);
  if (!normalizedSinger) return '';
  const tones = parseSingerTones(song?.tonosPorCantante || song?.tonosAlternativos);
  const match = Object.entries(tones).find(([name]) => normalizeText(name) === normalizedSinger);
  return match?.[1] || '';
};

export const getSingerTransposeState = (song = {}, singerName = '') => {
  const originalKey = getSongBaseKey(song);
  const singerKey = getSingerTone(song, singerName);
  const normalizedOriginal = normalizarNota(originalKey);
  const normalizedSinger = normalizarNota(singerKey);

  if (Array.isArray(song?.medleyConfig?.songs) && song.medleyConfig.songs.length) {
    return { originalKey, targetKey: originalKey, offset: 0, status: 'materialized-medley' };
  }

  if (!singerKey) {
    return { originalKey, targetKey: originalKey, offset: 0, status: 'no-singer-key' };
  }

  if (!normalizedOriginal || !normalizedSinger) {
    return { originalKey, targetKey: originalKey, offset: 0, status: 'invalid-key' };
  }

  return {
    originalKey,
    targetKey: singerKey,
    offset: calcularOffsetSemitonos(normalizedOriginal, normalizedSinger),
    status: 'resolved'
  };
};

export const getMedleyPartForSection = (song = {}, sectionIndex = -1) => {
  const config = song?.medleyConfig;
  const partIndex = Number(config?.sectionPartIndexes?.[sectionIndex]);
  return Number.isInteger(partIndex) ? config?.songs?.[partIndex] || null : null;
};

export const getEventSingerTransposeState = (song = {}, event = {}, sectionIndex = -1) => {
  const part = getMedleyPartForSection(song, sectionIndex);
  if (!part) return getSingerTransposeState(song, getEventSingerForSong(event, song?.id));

  const singer = getEventSingerForSong(event, part.songId)
    || getEventSingerForSong(event, song?.id);
  return getSingerTransposeState({
    tonoOriginal: part.materializedKey || part.medleyKey || part.originalKey || getSongBaseKey(song),
    tonosPorCantante: part.tonosPorCantante || song?.tonosPorCantante,
    tonosAlternativos: part.tonosAlternativos || song?.tonosAlternativos,
  }, singer);
};

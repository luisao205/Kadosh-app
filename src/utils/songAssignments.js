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

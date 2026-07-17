const stripChordMarkup = (text = '') => String(text)
  .replace(/\[[^\]]+\]/g, ' ')
  .replace(/\{[^}]+\}/g, ' ');

const getSongLyricsText = (song = {}) => {
  const sectionText = Array.isArray(song.secciones)
    ? song.secciones
      .map(section => [section.titulo, section.contenido, section.texto, section.letra].filter(Boolean).join('\n'))
      .join('\n')
    : '';

  return [
    song.letraRaw,
    song.letra,
    song.lyrics,
    song.contenido,
    sectionText
  ].filter(Boolean).join('\n');
};

export const normalizeSongSearchText = (text = '') => stripChordMarkup(text)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const getSongLyricSnippet = (song, searchTerm, maxLength = 96) => {
  const query = normalizeSongSearchText(searchTerm);
  if (!query) return '';

  const lines = getSongLyricsText(song)
    .split(/\r?\n/)
    .map(line => stripChordMarkup(line).replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const matchingLine = lines.find(line => normalizeSongSearchText(line).includes(query));
  if (!matchingLine) return '';

  return matchingLine.length > maxLength
    ? `${matchingLine.slice(0, maxLength - 3).trim()}...`
    : matchingLine;
};

export const getSongSearchMatch = (song, searchTerm) => {
  const query = normalizeSongSearchText(searchTerm);
  if (!query) return { matches: true, field: 'empty', snippet: '' };

  const title = normalizeSongSearchText(song?.titulo || '');
  const artist = normalizeSongSearchText(song?.artista || '');
  const tags = normalizeSongSearchText((song?.etiquetas || []).join(' '));
  const lyrics = normalizeSongSearchText(getSongLyricsText(song));

  if (title.includes(query)) return { matches: true, field: 'title', snippet: '' };
  if (artist.includes(query)) return { matches: true, field: 'artist', snippet: '' };
  if (tags.includes(query)) return { matches: true, field: 'tags', snippet: '' };
  if (lyrics.includes(query)) {
    return {
      matches: true,
      field: 'lyrics',
      snippet: getSongLyricSnippet(song, searchTerm)
    };
  }

  return { matches: false, field: null, snippet: '' };
};

export const songMatchesSearch = (song, searchTerm) => getSongSearchMatch(song, searchTerm).matches;

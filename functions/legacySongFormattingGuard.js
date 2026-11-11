/* global module */
class LegacySongFormattingGuardError extends Error {
  constructor() {
    super('projection_v2_compatible_save_required');
    this.name = 'LegacySongFormattingGuardError';
    this.code = 'projection-v2-compatible-save-required';
  }
}

const hasProtectedLyricFormatting = song => (
  song !== null
  && typeof song === 'object'
  && Object.prototype.hasOwnProperty.call(song, 'lyricFormatting')
  && song.lyricFormatting !== null
  && song.lyricFormatting !== undefined
);

const assertLegacySongContentWriteCompatible = (song, nextLyricsRaw) => {
  const currentLyricsRaw = String(song?.letraRaw || '');
  const changesLyrics = String(nextLyricsRaw ?? '') !== currentLyricsRaw;
  if (changesLyrics && hasProtectedLyricFormatting(song)) throw new LegacySongFormattingGuardError();
  return { changesLyrics, protectedFormatting: hasProtectedLyricFormatting(song) };
};

module.exports = {
  LegacySongFormattingGuardError,
  assertLegacySongContentWriteCompatible,
  hasProtectedLyricFormatting,
};

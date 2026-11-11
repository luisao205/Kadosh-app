import { normalizarTonoVisual } from './musicCore.js';

export const SONG_LOGIC_STATUS = Object.freeze({
  CURRENT: 'current',
  LEGACY: 'legacy',
  NEEDS_REPAIR: 'needs-repair',
});

const hasValidKey = (value) => Boolean(normalizarTonoVisual(value));
const hasExpectedPartShape = (part) => part
  && typeof part.songId === 'string'
  && hasValidKey(part.originalKey)
  && hasValidKey(part.materializedKey || part.medleyKey);

// A legacy document is only classified from data it carries. We never infer a
// repair from its age or overwrite material that may have been edited manually.
export const getSongLogicStatus = (song = {}) => {
  const config = song?.medleyConfig;
  if (!config) return SONG_LOGIC_STATUS.CURRENT;

  const parts = Array.isArray(config.songs) ? config.songs : [];
  const indexes = Array.isArray(config.sectionPartIndexes) ? config.sectionPartIndexes : [];
  const validParts = parts.length > 0 && parts.every(hasExpectedPartShape);
  const validIndexes = indexes.length > 0 && indexes.every((index) => (
    Number.isInteger(index) && index >= 0 && index < parts.length
  ));
  const hasIndexes = Array.isArray(config.sectionPartIndexes);

  if (!validParts || config.manualEdited === true) return SONG_LOGIC_STATUS.NEEDS_REPAIR;
  if (hasIndexes && !validIndexes) return SONG_LOGIC_STATUS.NEEDS_REPAIR;
  if (!hasIndexes) {
    return Number(config.materializationVersion) >= 2
      ? SONG_LOGIC_STATUS.NEEDS_REPAIR
      : SONG_LOGIC_STATUS.LEGACY;
  }

  if (config.transposeMode === 'UNIFIED') {
    const unifiedKey = normalizarTonoVisual(config.unifiedKey);
    if (!unifiedKey || parts.some((part) => normalizarTonoVisual(part.materializedKey || part.medleyKey) !== unifiedKey)) {
      return SONG_LOGIC_STATUS.NEEDS_REPAIR;
    }
  }

  return Number(config.materializationVersion) >= 2
    ? SONG_LOGIC_STATUS.CURRENT
    : SONG_LOGIC_STATUS.LEGACY;
};

export const getSongLogicStatusMeta = (song = {}) => {
  const status = getSongLogicStatus(song);
  if (status === SONG_LOGIC_STATUS.LEGACY) return {
    status, label: 'Legacy',
    title: 'Documento anterior compatible. Se actualizara al volver a procesarlo.',
    className: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-500 dark:text-zinc-300',
  };
  if (status === SONG_LOGIC_STATUS.NEEDS_REPAIR) return {
    status, label: 'Revisar',
    title: 'Se detecto una diferencia entre configuracion y contenido materializado.',
    className: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  };
  return {
    status, label: 'Actual', title: 'Usa la logica musical actual.',
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  };
};

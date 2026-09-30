const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const normalizeBpm = (value) => {
  const bpm = Number(value);
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  return clamp(bpm, 20, 400);
};

export const normalizeBeatsPerBar = (value, fallback = 4) => {
  const beats = Number(value);
  if (!Number.isFinite(beats) || beats <= 0) return fallback;
  return Math.round(clamp(beats, 1, 16));
};

export const getMusicalPosition = ({
  time = 0,
  bpm,
  beatsPerBar = 4,
  gridOffsetSeconds = 0,
}) => {
  const safeBpm = normalizeBpm(bpm);
  const safeBeatsPerBar = normalizeBeatsPerBar(beatsPerBar);
  const safeTime = Math.max(0, Number(time) || 0);
  const safeOffset = Math.max(0, Number(gridOffsetSeconds) || 0);

  if (!safeBpm) {
    return {
      valid: false,
      beforeStart: false,
      bar: null,
      beat: null,
      beatProgress: 0,
      secondsPerBeat: null,
      secondsPerBar: null,
      elapsedFromGrid: 0,
    };
  }

  const secondsPerBeat = 60 / safeBpm;
  const secondsPerBar = secondsPerBeat * safeBeatsPerBar;
  const elapsedFromGrid = safeTime - safeOffset;

  if (elapsedFromGrid < 0) {
    return {
      valid: true,
      beforeStart: true,
      bar: 0,
      beat: 0,
      beatProgress: 0,
      secondsPerBeat,
      secondsPerBar,
      elapsedFromGrid,
    };
  }

  const absoluteBeat = elapsedFromGrid / secondsPerBeat;
  const completedBeats = Math.floor(absoluteBeat + 1e-9);
  const beatProgress = absoluteBeat - completedBeats;
  const bar = Math.floor(completedBeats / safeBeatsPerBar) + 1;
  const beat = (completedBeats % safeBeatsPerBar) + 1;

  return {
    valid: true,
    beforeStart: false,
    bar,
    beat,
    beatProgress,
    secondsPerBeat,
    secondsPerBar,
    elapsedFromGrid,
  };
};

export const getNextMusicalBoundary = ({
  time = 0,
  bpm,
  beatsPerBar = 4,
  gridOffsetSeconds = 0,
  boundary = 'bar',
}) => {
  const safeBpm = normalizeBpm(bpm);
  const safeBeatsPerBar = normalizeBeatsPerBar(beatsPerBar);
  if (!safeBpm) return null;

  const safeTime = Math.max(0, Number(time) || 0);
  const safeOffset = Math.max(0, Number(gridOffsetSeconds) || 0);
  const secondsPerBeat = 60 / safeBpm;
  const unitSeconds = boundary === 'beat'
    ? secondsPerBeat
    : secondsPerBeat * safeBeatsPerBar;

  if (safeTime < safeOffset) return safeOffset;

  const elapsed = safeTime - safeOffset;
  const units = Math.floor(elapsed / unitSeconds + 1e-9) + 1;
  return safeOffset + (units * unitSeconds);
};

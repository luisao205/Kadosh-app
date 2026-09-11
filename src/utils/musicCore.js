// src/utils/musicCore.js
const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const EQUIVALENCIAS = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
  Cb: 'B',
  Fb: 'E'
};

const SHARP_TO_FLAT = {
  'C#': 'Db',
  'D#': 'Eb',
  'F#': 'Gb',
  'G#': 'Ab',
  'A#': 'Bb'
};

const MAPA_LATINO = {
  C: 'Do',
  'C#': 'Do#',
  Db: 'Reb',
  D: 'Re',
  'D#': 'Re#',
  Eb: 'Mib',
  E: 'Mi',
  F: 'Fa',
  'F#': 'Fa#',
  Gb: 'Solb',
  G: 'Sol',
  'G#': 'Sol#',
  Ab: 'Lab',
  A: 'La',
  'A#': 'La#',
  Bb: 'Sib',
  B: 'Si',
  Cb: 'Dob'
};

const CHORD_ROOT_REGEX = /^([A-G][#b]?)(.*)$/;
const VALID_CHORD_REGEX = /^[A-G][#b]?(?:m(?!aj)|maj|min|dim|aug|sus|add|ø|°)?(?:\d{0,2})?(?:[#b]?\d{0,2})?(?:\([^)]*\))?(?:\/[A-G][#b]?)?$/;
const SECTION_TITLE_REGEX = /^\s*(intro|verso|verse|estrofa|pre[\s-]?(?:coro|chorus)|precoro|prechorus|coro|chorus|refr[aá]n|refrain|puente|bridge|tag|vamp|break(?:down)?|coda|solo|rap|final|outro|interludio|interlude|instrumental|ministraci[oó]n|espont[aá]neo|espontaneo)(?:\s*\d+|\s*[:.-])?\s*$/i;
const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_DIATONIC_QUALITIES = ['', 'm', 'm', '', '', 'm', 'dim'];
const MINOR_SCALE_STEPS = [0, 2, 3, 5, 7, 8, 10];
const MINOR_DIATONIC_QUALITIES = ['m', 'dim', '', 'm', 'm', '', ''];

export const normalizarNota = (nota) => {
  const match = String(nota || '').trim().match(/^[A-G][#b]?/);
  if (!match) return '';
  return EQUIVALENCIAS[match[0]] || match[0];
};

export const isValidChordToken = (chord) => {
  const cleanChord = String(chord || '').trim();
  return Boolean(cleanChord)
    && VALID_CHORD_REGEX.test(cleanChord)
    && !SECTION_TITLE_REGEX.test(cleanChord);
};

const getChordInfo = (chord) => {
  const cleanChord = String(chord || '').trim();
  if (!isValidChordToken(cleanChord)) return null;
  const mainChord = cleanChord.split('/')[0];
  const match = mainChord.match(CHORD_ROOT_REGEX);
  if (!match) return null;
  const root = normalizarNota(match[1]);
  const suffix = match[2] || '';
  if (!root || !NOTAS.includes(root)) return null;
  return {
    root,
    isMinor: /^(m|min)(?!aj)/i.test(suffix),
    isDiminished: /^(dim|°|ø)/i.test(suffix)
  };
};

const scoreKeyCandidate = (chordMatches, key, mode = 'major') => {
  const keyIndex = NOTAS.indexOf(key);
  const steps = mode === 'minor' ? MINOR_SCALE_STEPS : MAJOR_SCALE_STEPS;
  const qualities = mode === 'minor' ? MINOR_DIATONIC_QUALITIES : MAJOR_DIATONIC_QUALITIES;
  let score = 0;
  let matched = 0;

  chordMatches.forEach((chord, index) => {
    const degree = steps.findIndex(step => NOTAS[(keyIndex + step) % 12] === chord.root);
    if (degree === -1) {
      score -= 1.5;
      return;
    }

    matched += 1;
    score += 2;

    const expectedQuality = qualities[degree];
    if (expectedQuality === 'm' && chord.isMinor) score += 1.2;
    if (expectedQuality === '' && !chord.isMinor && !chord.isDiminished) score += 1;
    if (expectedQuality === 'dim' && chord.isDiminished) score += 1;

    if (degree === 0) score += 1.2;
    if (mode === 'major' && degree === 4) score += 0.6;
    if (mode === 'minor' && degree === 4 && chord.isMinor) score += 0.6;
    if (index === 0 && degree === 0) score += 3;
    if (index === chordMatches.length - 1 && degree === 0) score += 2;
  });

  return {
    key,
    mode,
    score,
    confidence: Math.max(0, Math.min(1, score / (chordMatches.length * 4))),
    matched,
    total: chordMatches.length
  };
};

export const detectarTonoDesdeAcordes = (textoRaw) => {
  const chordMatches = [...String(textoRaw || '').matchAll(/\[([^\]]+)\]/g)]
    .map(match => match[1].trim())
    .map(getChordInfo)
    .filter(Boolean);

  if (chordMatches.length < 2) return null;

  const candidates = NOTAS.flatMap(key => [
    scoreKeyCandidate(chordMatches, key, 'major'),
    scoreKeyCandidate(chordMatches, key, 'minor')
  ]).sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const second = candidates[1];
  if (!best || best.matched < Math.ceil(chordMatches.length * 0.55)) return null;

  return {
    tono: best.key,
    modo: best.mode,
    confianza: best.confidence,
    acordesAnalizados: chordMatches.length,
    ambiguo: second ? best.score - second.score < 2 : false
  };
};

export const calcularOffsetSemitonos = (tonoOriginal, tonoDestino) => {
  const origen = normalizarNota(tonoOriginal);
  const destino = normalizarNota(tonoDestino);
  const origIdx = NOTAS.indexOf(origen);
  const targetIdx = NOTAS.indexOf(destino);

  if (origIdx === -1 || targetIdx === -1) return 0;

  let diff = targetIdx - origIdx;
  if (diff > 6) diff -= 12;
  if (diff < -5) diff += 12;
  return diff;
};

export const traducirAcorde = (acorde, formato = 'american', notacion = 'sharps') => {
  if (!acorde) return '';

  const partes = String(acorde).split('/');
  const traducirParte = (parte) => {
    const rootMatch = parte.match(/^[A-G][#b]?/);
    if (!rootMatch) return parte;
    let root = rootMatch[0];
    const adorno = parte.substring(root.length);

    if (notacion === 'sharps' && EQUIVALENCIAS[root]) {
      root = EQUIVALENCIAS[root];
    } else if (notacion === 'flats' && SHARP_TO_FLAT[root]) {
      root = SHARP_TO_FLAT[root];
    }

    if (formato === 'american') return root + adorno;
    return (MAPA_LATINO[root] || root) + adorno;
  };

  return partes.map(traducirParte).join('/');
};

export const transponerNota = (nota, semitonos) => {
  if (!nota) return '';
  if (semitonos === 0) return nota;

  const partes = String(nota).split('/');
  const transponerParte = (parte) => {
    const rootMatch = parte.match(/^[A-G][#b]?/);
    if (!rootMatch) return parte;

    let root = rootMatch[0];
    const adorno = parte.substring(root.length);
    root = EQUIVALENCIAS[root] || root;

    const index = NOTAS.indexOf(root);
    if (index === -1) return parte;

    let nuevoIndex = (index + semitonos) % 12;
    if (nuevoIndex < 0) nuevoIndex += 12;

    return `${NOTAS[nuevoIndex]}${adorno}`;
  };

  return partes.map(transponerParte).join('/');
};

export const aplicarCapo = (notaOriginal, trasteCapo) => transponerNota(notaOriginal, -trasteCapo);

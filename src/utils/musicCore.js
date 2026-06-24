// src/utils/musicCore.js
const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const EQUIVALENCIAS = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B', 'Fb': 'E'
};

const SHARP_TO_FLAT = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb'
};

const MAPA_LATINO = {
  'C': 'Do', 'C#': 'Do#', 'Db': 'Reb', 'D': 'Re', 'D#': 'Re#', 'Eb': 'Mib', 'E': 'Mi',
  'F': 'Fa', 'F#': 'Fa#', 'Gb': 'Solb', 'G': 'Sol', 'G#': 'Sol#', 'Ab': 'Lab', 'A': 'La',
  'A#': 'La#', 'Bb': 'Sib', 'B': 'Si', 'Cb': 'Dob'
};

export const normalizarNota = (nota) => {
  const match = String(nota || '').trim().match(/^[A-G][#b]?/);
  if (!match) return '';
  return EQUIVALENCIAS[match[0]] || match[0];
};

const CHORD_ROOT_REGEX = /^([A-G][#b]?)(.*)$/;
const VALID_CHORD_REGEX = /^[A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?(?:\d{0,2})?(?:[#b]?\d{0,2})?(?:\/[A-G][#b]?)?$/;
const SECTION_TITLE_REGEX = /^\s*(intro|verso|verse|pre[\s-]?(?:coro|chorus)|precoro|coro|chorus|puente|bridge|final|outro|instrumental|espont[aá]neo|espontaneo)(?:\s+\d+|\s*[:.-])?\s*$/i;
const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_DIATONIC_QUALITIES = ['', 'm', 'm', '', '', 'm', 'dim'];

const getChordInfo = (chord) => {
  const cleanChord = String(chord || '').trim();
  if (!VALID_CHORD_REGEX.test(cleanChord) || SECTION_TITLE_REGEX.test(cleanChord)) return null;
  const mainChord = cleanChord.split('/')[0];
  const match = mainChord.match(CHORD_ROOT_REGEX);
  if (!match) return null;
  const root = normalizarNota(match[1]);
  const suffix = match[2] || '';
  if (!root || !NOTAS.includes(root)) return null;
  return {
    root,
    isMinor: /^(m|min)(?!aj)/i.test(suffix),
    isDiminished: /^(dim|°)/i.test(suffix)
  };
};

export const detectarTonoDesdeAcordes = (textoRaw) => {
  const chordMatches = [...String(textoRaw || '').matchAll(/\[([^\]]+)\]/g)]
    .map(match => match[1].trim())
    .map(getChordInfo)
    .filter(Boolean);

  if (chordMatches.length < 2) return null;

  const candidates = NOTAS.map((key) => {
    const keyIndex = NOTAS.indexOf(key);
    let score = 0;
    let matched = 0;

    chordMatches.forEach((chord, index) => {
      const degree = MAJOR_SCALE_STEPS.findIndex(step => NOTAS[(keyIndex + step) % 12] === chord.root);
      if (degree === -1) {
        score -= 1.5;
        return;
      }

      matched += 1;
      score += 2;

      const expectedQuality = MAJOR_DIATONIC_QUALITIES[degree];
      if (expectedQuality === 'm' && chord.isMinor) score += 1.2;
      if (expectedQuality === '' && !chord.isMinor && !chord.isDiminished) score += 1;
      if (expectedQuality === 'dim' && chord.isDiminished) score += 1;

      if (degree === 0) score += 1.2;
      if (degree === 4) score += 0.6;
      if (index === 0 && degree === 0) score += 3;
      if (index === chordMatches.length - 1 && degree === 0) score += 2;
    });

    const confidence = Math.max(0, Math.min(1, score / (chordMatches.length * 4)));
    return { key, score, confidence, matched, total: chordMatches.length };
  }).sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const second = candidates[1];
  if (!best || best.matched < Math.ceil(chordMatches.length * 0.55)) return null;

  return {
    tono: best.key,
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

/**
 * Traduce un acorde americano a formato latino si es necesario
 * Ahora respeta la preferencia de Sostenidos/Bemoles
 */
export const traducirAcorde = (acorde, formato = 'american', notacion = 'sharps') => {
  if (!acorde) return '';

  // Dividir por slash si es un acorde compuesto (ej. D/F# -> Re/Fa#)
  const partes = acorde.split('/');
  
  const traducirParte = (parte) => {
    const rootMatch = parte.match(/^[A-G][#b]?/);
    if (!rootMatch) return parte; 
    let root = rootMatch[0];
    const adorno = parte.substring(root.length);
        // 1. Aplicar preferencia de alteraciones (# vs b)
    if (notacion === 'sharps' && EQUIVALENCIAS[root]) {
      root = EQUIVALENCIAS[root];
    } else if (notacion === 'flats' && SHARP_TO_FLAT[root]) {
      root = SHARP_TO_FLAT[root];
    }

    if (formato === 'american') return root + adorno;
    return (MAPA_LATINO[root] || root) + adorno; // Aquí ya 'root' debería estar en el formato correcto (# o b)
  };

  return partes.map(traducirParte).join('/');
};

/**
 * Transpone una nota musical por un número de semitonos.
 * @param {string} nota - Nota original (ej. 'G')
 * @param {number} semitonos - Pasos a transponer (positivos o negativos)
 * @returns {string} - Nueva nota
 */
export const transponerNota = (nota, semitonos) => {
  if (!nota) return '';
  if (semitonos === 0) return nota; // Optimización: Retornar intacto si no se transpone

  // Dividir por slash si es un acorde compuesto (ej. D/F# -> E/G#)
  const partes = nota.split('/');
  
  const transponerParte = (parte) => {
    const rootMatch = parte.match(/^[A-G][#b]?/);
    if (!rootMatch) return parte; 
    
    let root = rootMatch[0];
    const adorno = parte.substring(root.length);
    
    // Convertir bemoles a sostenidos para la matemática de transposición
    const flatToSharp = { 'Cb': 'B', 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
    root = flatToSharp[root] || root;

    let index = NOTAS.indexOf(root);
    if (index === -1) return parte;

    let nuevoIndex = (index + semitonos) % 12;
    if (nuevoIndex < 0) nuevoIndex += 12;

    return `${NOTAS[nuevoIndex]}${adorno}`;
  };

  return partes.map(transponerParte).join('/');
};

/**
 * Lógica de Vista de Capotraste Inteligente
 * @param {string} notaOriginal - Nota en el tono real
 * @param {number} trasteCapo - Traste donde se coloca el Capo (ej. 2)
 * @returns {string} - Acorde que el guitarrista debe tocar visualmente
 */
export const aplicarCapo = (notaOriginal, trasteCapo) => {
  // Subir el Capo es equivalente a "bajar" el acorde visualmente
  return transponerNota(notaOriginal, -trasteCapo);
};

// Ejemplo de uso:
// transponerNota('Am7', 2) -> 'Bm7'
// aplicarCapo('F#m', 2) -> 'Em' (Si pongo capo en traste 2, toco posición de Em para sonar F#m)

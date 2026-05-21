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
    return (MAPA_LATINO[root] || root) + adorno;
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

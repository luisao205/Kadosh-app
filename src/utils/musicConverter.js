/**
 * KADOSH Music Converter & AI Engine
 * Motor determinista y reglas maestras de preparación musical para KADOSH PROJECTION V2.1.
 */

import { normalizarNota, normalizarTonoVisual } from './musicCore.js';
import { isSongSectionTitle, SECTION_TITLE_REGEX } from './songParser.js';

export const normalizeKey = (value, fallback = 'C') => {
  const clean = String(value || '').trim();
  if (!clean) return fallback;
  const match = clean.match(/^[A-G][#b]?m?/i);
  if (!match) return fallback;
  const note = match[0];
  const root = note[0].toUpperCase();
  const acc = note.length > 1 && (note[1] === '#' || note[1].toLowerCase() === 'b') ? (note[1] === '#' ? '#' : 'b') : '';
  const minor = note.toLowerCase().endsWith('m') ? 'm' : '';
  return `${root}${acc}${minor}`;
};

// Expresión regular para acordes en cifrado americano
export const CHORD_REGEX = /\b([A-G][#b]?(?:m|maj|min|dim|aug|sus|add|2|4|5|6|7|9|11|13|M)*(?:\/[A-G][#b]?)?)\b/g;

// Expresión regular para determinar si una línea está compuesta exclusivamente de acordes y espacios
export const CHORD_ONLY_LINE_REGEX = /^\s*(?:[A-G][#b]?(?:m|maj|min|dim|aug|sus|add|2|4|5|6|7|9|11|13|M)*(?:\/[A-G][#b]?)?|\(|\)|\/|\||\s+|-)+\s*$/;

// Encabezados comunes de sección musical
const SECTION_HEADER_PATTERNS = [
  /^(?:\[\s*)?(?:#\s*)?(intro|verso|verse|estrofa|pre[\s-]?(?:coro|chorus)|precoro|prechorus|coro|chorus|refr[aá]n|refrain|puente|bridge|tag|vamp|break(?:down)?|coda|solo|rap|final|outro|interludio|interlude|instrumental|ministraci[oó]n|espont[aá]neo|espontaneo)(?:\s*(\d+))?(?:\s*(?:[:.\-—–]|de)\s*(.*?))?(?:\s*\])?$/i
];

/**
 * Normaliza un encabezado de sección musical al formato KADOSH: "# Nombre [N]"
 */
export const normalizeSectionHeading = (line = '') => {
  const trimmed = line.trim();
  if (!trimmed) return '';

  for (const regex of SECTION_HEADER_PATTERNS) {
    const match = trimmed.match(regex);
    if (match) {
      const rawName = match[1].toLowerCase();
      const num = match[2] ? ` ${match[2]}` : '';
      const extra = match[3] ? ` - ${match[3].trim()}` : '';

      let canonical = 'Sección';
      if (/^intro/i.test(rawName)) canonical = 'Intro';
      else if (/^(?:verso|verse|estrofa)/i.test(rawName)) canonical = 'Verso';
      else if (/^pre[\s-]?(?:coro|chorus)/i.test(rawName)) canonical = 'Pre-Coro';
      else if (/^(?:coro|chorus|refr)/i.test(rawName)) canonical = 'Coro';
      else if (/^(?:puente|bridge)/i.test(rawName)) canonical = 'Puente';
      else if (/^tag/i.test(rawName)) canonical = 'Tag';
      else if (/^vamp/i.test(rawName)) canonical = 'Vamp';
      else if (/^instrumental/i.test(rawName)) canonical = 'Instrumental';
      else if (/^interludio/i.test(rawName)) canonical = 'Interludio';
      else if (/^solo/i.test(rawName)) canonical = 'Solo';
      else if (/^(?:final|outro|coda)/i.test(rawName)) canonical = 'Final';
      else if (/^ministraci/i.test(rawName)) canonical = 'Ministración';
      else if (/^espont/i.test(rawName)) canonical = 'Espontáneo';

      return `# ${canonical}${num}${extra}`;
    }
  }

  if (trimmed.startsWith('#')) {
    return trimmed;
  }

  return null;
};

/**
 * Detecta si una línea es exclusivamente una línea de acordes
 */
export const isChordLine = (line = '') => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#')) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;

  // Si contiene corchetes con acordes ya colocados
  if (/\[[A-G][#b]?[^\]]*\]/.test(trimmed)) {
    // Si la línea tiene palabras largas sin corchetes, no es chord-only
    const withoutChords = trimmed.replace(/\[[^\]]+\]/g, '').trim();
    return withoutChords.length === 0;
  }

  // Detectar acordes individuales
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  let chordMatches = 0;
  for (const w of words) {
    const cleanW = w.replace(/[(),|/]/g, '');
    if (!cleanW) continue;
    if (/^[A-G][#b]?(?:m|maj|min|dim|aug|sus|add|2|4|5|6|7|9|11|13|M)*(?:\/[A-G][#b]?)?$/.test(cleanW)) {
      chordMatches += 1;
    }
  }

  return chordMatches > 0 && (chordMatches / words.length) >= 0.7;
};

/**
 * Extrae acordes y sus posiciones de columna en una línea
 */
export const extractChordsWithPositions = (chordLine = '') => {
  const chords = [];
  const regex = /([A-G][#b]?(?:m|maj|min|dim|aug|sus|add|2|4|5|6|7|9|11|13|M)*(?:\/[A-G][#b]?)?)/g;
  let match;

  while ((match = regex.exec(chordLine)) !== null) {
    chords.push({
      chord: match[1],
      index: match.index
    });
  }

  return chords;
};

/**
 * Fusiona una línea de acordes ubicada arriba con la línea de letra ubicada abajo,
 * insertando los acordes en corchetes `[Acorde]` en la posición exacta.
 */
export const mergeChordLineWithLyricLine = (chordLine = '', lyricLine = '') => {
  const chords = extractChordsWithPositions(chordLine);
  if (chords.length === 0) return lyricLine;

  if (!lyricLine || !lyricLine.trim()) {
    // Es una línea puramente instrumental (e.g. Intro o Interludio)
    return chords.map((c) => `[${c.chord}]`).join(' ');
  }

  // Si la línea de letra ya tiene acordes entre corchetes, conservarla
  if (/\[[A-G][#b]?[^\]]*\]/.test(lyricLine)) {
    return lyricLine;
  }

  // Insertar de atrás hacia adelante para no alterar los índices de corte
  let result = lyricLine;
  const sortedChords = [...chords].sort((a, b) => b.index - a.index);

  for (const { chord, index } of sortedChords) {
    const bracket = `[${chord}]`;
    if (index >= result.length) {
      result = `${result.trimEnd()} ${bracket}`;
    } else {
      // Ajustar para no cortar una palabra de forma no natural si cayó en el medio
      let targetIndex = index;
      result = result.slice(0, targetIndex) + bracket + result.slice(targetIndex);
    }
  }

  return result;
};

/**
 * Convierte un texto plano (letra con acordes arriba o en formatos varios)
 * al estándar canónico de KADOSH PROJECTION V2.1.
 */
export const convertPlainTextToKadosh = (rawText = '') => {
  if (!rawText || !rawText.trim()) return '';

  const rawLines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const outputLines = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      // Preservar separación de diapositivas (líneas en blanco)
      if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
        outputLines.push('');
      }
      i += 1;
      continue;
    }

    // Verificar si es metadato de título, artista, tono, capo o youtube en el texto
    if (/^(?:t[ií]tulo|title|artista|artist|autor):\s*(.*)$/i.test(trimmed) ||
        /^(?:tono|key|tonalidad):\s*(.*)$/i.test(trimmed) ||
        /^(?:capo|cejilla):\s*(\d+)$/i.test(trimmed) ||
        /^(?:forma|shape):\s*(.*)$/i.test(trimmed) ||
        /^(?:bpm|tempo):\s*(\d+)$/i.test(trimmed) ||
        /^(?:youtube|video):\s*(.*)$/i.test(trimmed)) {
      // Omitir del cuerpo de letra, los metadatos se capturan por separado
      i += 1;
      continue;
    }

    // Verificar si es encabezado de sección
    const heading = normalizeSectionHeading(trimmed);
    if (heading) {
      // Asegurar línea vacía antes del encabezado si no la hay
      if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
        outputLines.push('');
      }
      outputLines.push(heading);
      i += 1;
      continue;
    }

    // Verificar si es línea de repetición (e.g. "// Letra //", "/// Letra ///" o "(x2)")
    const repeatMatch = trimmed.match(/^(\/{2,})\s*(.*?)\s*(\/{2,})(?:\s*\((?:x\d+|\d+x)\))?$/);
    if (repeatMatch && repeatMatch[1].length === repeatMatch[3].length && repeatMatch[2]) {
      outputLines.push(`${repeatMatch[1]} ${repeatMatch[2]} ${repeatMatch[3]}`);
      i += 1;
      continue;
    }

    // Verificar si es una línea de acordes
    if (isChordLine(line)) {
      const nextLine = rawLines[i + 1];
      if (nextLine !== undefined && !isChordLine(nextLine) && !normalizeSectionHeading(nextLine?.trim())) {
        // La siguiente línea es la letra asociada
        const merged = mergeChordLineWithLyricLine(line, nextLine);
        outputLines.push(merged);
        i += 2;
        continue;
      } else {
        // Es una línea puramente instrumental
        const chordsOnly = extractChordsWithPositions(line).map((c) => `[${c.chord}]`).join(' ');
        outputLines.push(chordsOnly || trimmed);
        i += 1;
        continue;
      }
    }

    // Línea de letra estándar (posiblemente con corchetes ya existentes)
    outputLines.push(line);
    i += 1;
  }

  // Limpieza final de líneas consecutivas
  const cleaned = [];
  for (let idx = 0; idx < outputLines.length; idx += 1) {
    const cur = outputLines[idx];
    if (cur === '' && (cleaned.length === 0 || cleaned[cleaned.length - 1] === '')) {
      continue;
    }
    cleaned.push(cur);
  }

  return cleaned.join('\n').trim();
};

/**
 * Extrae metadatos musicales inferidos a partir del texto (Tono, Capo, Forma, BPM)
 */
export const extractMusicalMetadataFromText = (rawText = '') => {
  const metadata = {
    tono: '',
    capo: null,
    forma: '',
    bpm: '',
    youtubeUrl: '',
    titulo: '',
    artista: ''
  };

  if (!rawText) return metadata;

  const keyMatch = rawText.match(/(?:tono|tonalidad|key)\s*[:=]\s*([A-G][#b]?m?)/i);
  if (keyMatch) metadata.tono = normalizeKey(keyMatch[1]);

  const capoMatch = rawText.match(/(?:capo|cejilla)\s*[:=]\s*(\d+)/i);
  if (capoMatch) metadata.capo = parseInt(capoMatch[1], 10);

  const shapeMatch = rawText.match(/(?:forma|shape|acordes de)\s*[:=]\s*([A-G][#b]?m?)/i);
  if (shapeMatch) metadata.forma = normalizeKey(shapeMatch[1]);

  const bpmMatch = rawText.match(/(?:bpm|tempo)\s*[:=]\s*(\d+)/i);
  if (bpmMatch) metadata.bpm = bpmMatch[1];

  const ytMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (ytMatch) metadata.youtubeUrl = `https://www.youtube.com/watch?v=${ytMatch[1]}`;

  const titleMatch = rawText.match(/(?:t[ií]tulo|title)\s*[:=]\s*(.+)/i);
  if (titleMatch) metadata.titulo = titleMatch[1].trim();

  const artistMatch = rawText.match(/(?:artista|autor|artist)\s*[:=]\s*(.+)/i);
  if (artistMatch) metadata.artista = artistMatch[1].trim();

  // Si no se especificó tono explícito pero hay capo y forma, calcular tono real
  if (!metadata.tono && metadata.forma && metadata.capo !== null) {
    // Ejemplo: Forma G + Capo 1 -> Tono real Ab
    metadata.tono = transposeKey(metadata.forma, metadata.capo);
  }

  return metadata;
};

const CHROMATIC_SCALE_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_SCALE_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Transporta una tonalidad por un número de semitonos
 */
export const transposeKey = (rootKey = 'C', semitones = 0) => {
  if (!rootKey || semitones === 0) return rootKey;

  const isMinor = rootKey.endsWith('m') && !rootKey.endsWith('maj');
  const base = rootKey.replace(/m$/, '');

  let idx = CHROMATIC_SCALE_SHARPS.indexOf(base);
  if (idx === -1) idx = CHROMATIC_SCALE_FLATS.indexOf(base);
  if (idx === -1) return rootKey;

  const targetIdx = (idx + semitones + 120) % 12;
  // Si la tonalidad original usa bemoles o el tono destino es típicamente bemol (Eb, Ab, Bb, Db, Gb)
  const useFlats = base.includes('b') || [1, 3, 6, 8, 10].includes(targetIdx);
  const targetBase = useFlats ? CHROMATIC_SCALE_FLATS[targetIdx] : CHROMATIC_SCALE_SHARPS[targetIdx];

  return isMinor ? `${targetBase}m` : targetBase;
};

/**
 * Limpia un bloque de respuesta para que contenga exclusivamente el contenido
 * compatible con KADOSH, removiendo explicaciones, markdown fences y notas de chat.
 */
export const extractPureKadoshContent = (rawResponse = '') => {
  if (!rawResponse || !rawResponse.trim()) return '';

  let text = rawResponse.replace(/\r\n/g, '\n').trim();

  // Si contiene bloques de código Markdown ``` ... ``` (preferir ```kadosh si existe)
  const kadoshBlockMatch = text.match(/```kadosh\s*\n([\s\S]*?)```/i);
  if (kadoshBlockMatch && kadoshBlockMatch[1]) {
    text = kadoshBlockMatch[1].trim();
  } else {
    const anyCodeBlockMatch = text.match(/```(?:chordpro|plaintext|markdown|txt|text)?\s*\n([\s\S]*?)```/i);
    if (anyCodeBlockMatch && anyCodeBlockMatch[1]) {
      text = anyCodeBlockMatch[1].trim();
    }
  }

  // Filtrar líneas de saludo, explicación o despedida
  const lines = text.split('\n');
  const filtered = [];
  let foundMusicContent = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Comprobar si es encabezado, acorde o letra
    if (trimmed.startsWith('#') || isChordLine(trimmed) || /\[[A-G][#b]?[^\]]*\]/.test(trimmed)) {
      foundMusicContent = true;
    }

    if (foundMusicContent) {
      // Si ya empezó el contenido musical y encontramos un cierre conversacional
      if (/^(?:espero que te sirva|aquí tienes|cualquier otro cambio|avísame si|si deseas|saludos|nota:|explicaci[oó]n:|verificado:|inferido:)/i.test(trimmed)) {
        break;
      }
      filtered.push(line);
    } else if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      foundMusicContent = true;
      filtered.push(line);
    }
  }

  const result = (filtered.length > 0 ? filtered.join('\n') : text).trim();
  return result;
};

/**
 * Importa y normaliza una respuesta pegada desde Gemini o ChatGPT oficiales.
 */
export const importExternalAssistantResult = (rawResponse = '') => {
  const metadata = extractMusicalMetadataFromText(rawResponse);
  const pure = extractPureKadoshContent(rawResponse);
  const kadoshContent = convertPlainTextToKadosh(pure);
  const syntax = validateKadoshSyntax(kadoshContent);

  return {
    kadoshContent,
    metadata,
    syntax,
    rawExtracted: pure
  };
};

/**
 * Valida la sintaxis musical de un borrador KADOSH
 */
export const validateKadoshSyntax = (text = '') => {
  const issues = [];
  if (!text || !text.trim()) {
    issues.push('El borrador está vacío.');
    return { valid: false, issues, stats: { sections: 0, chords: 0, slides: 0 } };
  }

  const lines = text.split('\n');
  let sectionCount = 0;
  let chordCount = 0;
  let slideCount = 1;
  let repeatCount = 0;
  let openRepeat = false;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      slideCount += 1;
      return;
    }

    if (trimmed.startsWith('#')) {
      sectionCount += 1;
      return;
    }

    // Contar acordes entre corchetes
    const chordsInLine = trimmed.match(/\[[A-G][#b]?[^\]]*\]/g);
    if (chordsInLine) {
      chordCount += chordsInLine.length;
    }

    // Verificar repeticiones compatibles (// ... //, /// ... ///, bloques multilínea, [Bis], (x2))
    const standaloneRepeatMatch = trimmed.match(/^(\/{2,})$/);
    if (standaloneRepeatMatch) {
      const markerCount = standaloneRepeatMatch[1].length;
      if (!openRepeat) {
        openRepeat = markerCount;
      } else if (openRepeat === markerCount) {
        repeatCount += 1;
        openRepeat = 0;
      } else {
        openRepeat = markerCount;
      }
      return;
    }

    const inlineRepeatMatch = trimmed.match(/^(\/{2,})\s*(.*?)\s*(\/{2,})$/);
    if (inlineRepeatMatch && inlineRepeatMatch[1].length === inlineRepeatMatch[3].length && inlineRepeatMatch[2]) {
      repeatCount += 1;
    } else if (/^\/{2,}/.test(trimmed) && !/\/{2,}$/.test(trimmed)) {
      openRepeat = trimmed.match(/^(\/{2,})/)[1].length;
    } else if (/\/{2,}$/.test(trimmed) && !/^\/{2,}/.test(trimmed)) {
      const closingCount = trimmed.match(/(\/{2,})$/)[1].length;
      if (openRepeat === closingCount) repeatCount += 1;
      openRepeat = 0;
    } else if (/(?:\[bis\]|\(bis\)|\((?:x\d+|\d+x)\))/i.test(trimmed)) {
      repeatCount += 1;
    }
  });

  if (openRepeat) {
    issues.push('Hay un marcador de repetición "//" que no fue cerrado correctamente.');
  }

  if (sectionCount === 0) {
    issues.push('Se recomienda incluir al menos un encabezado de sección musical (ej. # Intro, # Verso 1, # Coro).');
  }

  return {
    valid: issues.length === 0,
    issues,
    stats: {
      sections: sectionCount,
      chords: chordCount,
      slides: slideCount,
      repeats: repeatCount
    }
  };
};

/**
 * Prompt Maestro Definitivo para Gemini — KADOSH PROJECTION V2.1
 */
export const KADOSH_MUSIC_AI_SYSTEM_PROMPT = `
Actúa como transcriptor, arreglista y preparador musical experto de KADOSH PROJECTION V2.1.
Tu objetivo es entregar letras y acordes perfectamente estructurados y listos para proyección y ensayo musical.

REGLAS MAESTRAS KADOSH PROJECTION V2.1:
1. FUENTE PRIMARIA: La letra y acordes proporcionados por el usuario son la fuente principal de verdad. Conserva fielmente la letra sin omitir palabras ni inventar versos.
2. CIFRADO AMERICANO: Usa exclusivamente acordes en cifrado americano (C, D, Em, F#m, G/B, etc.).
3. ACORDES ENTRE CORCHETES: Coloca cada acorde entre corchetes [C] en la sílaba exacta donde se ejecuta. Ejemplo: "Tu [G]gracia es sufi[D]ciente".
4. ENCABEZADOS CON #: Cada sección musical debe iniciar con '#' y su nombre canónico:
   - # Intro
   - # Verso 1, # Verso 2
   - # Pre-Coro
   - # Coro
   - # Puente
   - # Solo
   - # Instrumental
   - # Final
5. REFERENCIA DE YOUTUBE & ANÁLISIS AUDIOVISUAL:
   - Cuando se proporcione un video público de YouTube y la API lo analice:
     * Compara la letra y acordes con la grabación para proponer el orden real de las secciones y el número exacto de repeticiones (ej. si el coro o puente se repite 2 o 3 veces).
     * En tu explicación antes del bloque de código, DISTINGUE CLARAMENTE lo VERIFICADO en la grabación de lo INFERIDO o propuesto por deducción musical.
     * NO inventes acordes que no se distingan con certeza en el audio ni repitas afirmaciones no comprobadas.
     * Si no fue posible analizar directamente el video o falló la carga audiovisual, indícalo con total honestidad ("Referencia audiovisual no verificada") y básate en las indicaciones manuales del usuario.
6. REPETICIONES:
   - Secciones idénticas se encierran entre doble barra: // Letra de la sección //
   - Si una sección tiene variación armónica o de letra, escríbela como una nueva sección (ej. # Coro 2).
7. PANTALLAS Y DIAPOSITIVAS:
   - Separa cada pantalla/diapositiva mediante una línea en blanco.
   - Cada pantalla debe tener entre 2 y 4 líneas para no saturar el proyector.
8. TONALIDAD Y CAPO:
   - Si el usuario indica "tono real Ab, forma G, capo 1", respeta la forma de los acordes en el texto ([G], [C], [D]) e indica la tonalidad real Ab y Capo 1.

FORMATO DE RESPUESTA:
- Explica brevemente la estructura (especificando secciones verificadas vs inferidas si hay referencia de video).
- Entrega siempre la canción completa en un único bloque de código:
\`\`\`kadosh
# Intro
[G] [D] [Em] [C]

# Verso 1
Tu [G]fidelidad es [D]grande
Tu [Em]fidelidad incompa[C]rable es

# Coro
// [G]Grande es tu [D]fidelidad
[Em]Grande es tu [C]fidelidad //
\`\`\`
- Si el usuario hace una pregunta o pide un cambio específico, responde amablemente, explica el cambio realizado brevemente y siempre incluye el bloque kadosh actualizado.
`.trim();

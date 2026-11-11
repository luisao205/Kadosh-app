/* global module */

const CHORD_REGEX = /\b([A-G][#b]?(?:m|maj|min|dim|aug|sus|add|2|4|5|6|7|9|11|13|M)*(?:\/[A-G][#b]?)?)\b/g;

const SECTION_HEADER_PATTERNS = [
  /^(?:\[\s*)?(?:#\s*)?(intro|verso|verse|estrofa|pre[\s-]?(?:coro|chorus)|precoro|prechorus|coro|chorus|refr[aá]n|refrain|puente|bridge|tag|vamp|break(?:down)?|coda|solo|rap|final|outro|interludio|interlude|instrumental|ministraci[oó]n|espont[aá]neo|espontaneo)(?:\s*(\d+))?(?:\s*(?:[:.\-—–]|de)\s*(.*?))?(?:\s*\])?$/i
];

const normalizeSectionHeading = (line = '') => {
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

  if (trimmed.startsWith('#')) return trimmed;
  return null;
};

const isChordLine = (line = '') => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || /^https?:\/\//i.test(trimmed)) return false;

  if (/\[[A-G][#b]?[^\]]*\]/.test(trimmed)) {
    const withoutChords = trimmed.replace(/\[[^\]]+\]/g, '').trim();
    return withoutChords.length === 0;
  }

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

const extractChordsWithPositions = (chordLine = '') => {
  const chords = [];
  const regex = /([A-G][#b]?(?:m|maj|min|dim|aug|sus|add|2|4|5|6|7|9|11|13|M)*(?:\/[A-G][#b]?)?)/g;
  let match;

  while ((match = regex.exec(chordLine)) !== null) {
    chords.push({ chord: match[1], index: match.index });
  }

  return chords;
};

const mergeChordLineWithLyricLine = (chordLine = '', lyricLine = '') => {
  const chords = extractChordsWithPositions(chordLine);
  if (chords.length === 0) return lyricLine;

  if (!lyricLine || !lyricLine.trim()) {
    return chords.map((c) => `[${c.chord}]`).join(' ');
  }

  if (/\[[A-G][#b]?[^\]]*\]/.test(lyricLine)) return lyricLine;

  let result = lyricLine;
  const sortedChords = [...chords].sort((a, b) => b.index - a.index);

  for (const { chord, index } of sortedChords) {
    const bracket = `[${chord}]`;
    if (index >= result.length) {
      result = `${result.trimEnd()} ${bracket}`;
    } else {
      result = result.slice(0, index) + bracket + result.slice(index);
    }
  }

  return result;
};

const convertPlainTextToKadosh = (rawText = '') => {
  if (!rawText || !rawText.trim()) return '';

  const rawLines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const outputLines = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
        outputLines.push('');
      }
      i += 1;
      continue;
    }

    if (/^(?:t[ií]tulo|title|artista|artist|autor):\s*(.*)$/i.test(trimmed) ||
        /^(?:tono|key|tonalidad):\s*(.*)$/i.test(trimmed) ||
        /^(?:capo|cejilla):\s*(\d+)$/i.test(trimmed) ||
        /^(?:forma|shape):\s*(.*)$/i.test(trimmed) ||
        /^(?:bpm|tempo):\s*(\d+)$/i.test(trimmed) ||
        /^(?:youtube|video):\s*(.*)$/i.test(trimmed)) {
      i += 1;
      continue;
    }

    const heading = normalizeSectionHeading(trimmed);
    if (heading) {
      if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
        outputLines.push('');
      }
      outputLines.push(heading);
      i += 1;
      continue;
    }

    const repeatMatch = trimmed.match(/^\/\/\s*(.*?)\s*\/\/(?:\s*\((?:x\d+|\d+x)\))?$/);
    if (repeatMatch && repeatMatch[1]) {
      outputLines.push(`// ${repeatMatch[1]} //`);
      i += 1;
      continue;
    }

    if (isChordLine(line)) {
      const nextLine = rawLines[i + 1];
      if (nextLine !== undefined && !isChordLine(nextLine) && !normalizeSectionHeading(nextLine?.trim())) {
        const merged = mergeChordLineWithLyricLine(line, nextLine);
        outputLines.push(merged);
        i += 2;
        continue;
      } else {
        const chordsOnly = extractChordsWithPositions(line).map((c) => `[${c.chord}]`).join(' ');
        outputLines.push(chordsOnly || trimmed);
        i += 1;
        continue;
      }
    }

    outputLines.push(line);
    i += 1;
  }

  const cleaned = [];
  for (let idx = 0; idx < outputLines.length; idx += 1) {
    const cur = outputLines[idx];
    if (cur === '' && (cleaned.length === 0 || cleaned[cleaned.length - 1] === '')) continue;
    cleaned.push(cur);
  }

  return cleaned.join('\n').trim();
};

const extractMusicalMetadataFromText = (rawText = '') => {
  const metadata = { tono: '', capo: null, forma: '', bpm: '', youtubeUrl: '', titulo: '', artista: '' };
  if (!rawText) return metadata;

  const keyMatch = rawText.match(/(?:tono|tonalidad|key)\s*[:=]\s*([A-G][#b]?m?)/i);
  if (keyMatch) metadata.tono = keyMatch[1];

  const capoMatch = rawText.match(/(?:capo|cejilla)\s*[:=]\s*(\d+)/i);
  if (capoMatch) metadata.capo = parseInt(capoMatch[1], 10);

  const shapeMatch = rawText.match(/(?:forma|shape|acordes de)\s*[:=]\s*([A-G][#b]?m?)/i);
  if (shapeMatch) metadata.forma = shapeMatch[1];

  const bpmMatch = rawText.match(/(?:bpm|tempo)\s*[:=]\s*(\d+)/i);
  if (bpmMatch) metadata.bpm = bpmMatch[1];

  const ytMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (ytMatch) metadata.youtubeUrl = `https://www.youtube.com/watch?v=${ytMatch[1]}`;

  const titleMatch = rawText.match(/(?:t[ií]tulo|title)\s*[:=]\s*(.+)/i);
  if (titleMatch) metadata.titulo = titleMatch[1].trim();

  const artistMatch = rawText.match(/(?:artista|autor|artist)\s*[:=]\s*(.+)/i);
  if (artistMatch) metadata.artista = artistMatch[1].trim();

  return metadata;
};

const extractPureKadoshContent = (rawResponse = '') => {
  if (!rawResponse || !rawResponse.trim()) return '';
  let text = rawResponse.trim();

  const codeBlockMatch = text.match(/```(?:kadosh|chordpro|text)?\n([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    text = codeBlockMatch[1].trim();
  }

  const lines = text.split('\n');
  const filtered = [];
  let foundMusicContent = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || isChordLine(trimmed) || /\[[A-G][#b]?[^\]]*\]/.test(trimmed)) {
      foundMusicContent = true;
    }

    if (foundMusicContent) {
      if (/^(?:espero que te sirva|aquí tienes|cualquier otro cambio|avísame si|saludos|nota:)/i.test(trimmed)) {
        break;
      }
      filtered.push(line);
    } else if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      foundMusicContent = true;
      filtered.push(line);
    }
  }

  return (filtered.length > 0 ? filtered.join('\n') : text).trim();
};

const validateKadoshSyntax = (text = '') => {
  const issues = [];
  if (!text || !text.trim()) {
    issues.push('El borrador está vacío.');
    return { valid: false, issues, stats: { sections: 0, chords: 0, slides: 0 } };
  }

  const lines = text.split('\n');
  let sectionCount = 0;
  let chordCount = 0;
  let slideCount = 1;

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
    // Verificar repeticiones no cerradas
    if (trimmed.startsWith('//') && !trimmed.endsWith('//')) {
      openRepeat = true;
    } else if (trimmed.endsWith('//') && !trimmed.startsWith('//')) {
      openRepeat = false;
    }

    const chordsInLine = trimmed.match(/\[[A-G][#b]?[^\]]*\]/g);
    if (chordsInLine) chordCount += chordsInLine.length;
  });

  return {
    valid: issues.length === 0,
    issues,
    stats: { sections: sectionCount, chords: chordCount, slides: slideCount }
  };
};

const KADOSH_MUSIC_AI_SYSTEM_PROMPT = `
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
`.trim();

module.exports = {
  normalizeSectionHeading,
  isChordLine,
  convertPlainTextToKadosh,
  extractMusicalMetadataFromText,
  extractPureKadoshContent,
  validateKadoshSyntax,
  KADOSH_MUSIC_AI_SYSTEM_PROMPT
};

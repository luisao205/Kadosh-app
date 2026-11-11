export const SECTION_TITLE_REGEX = /^\s*(intro|verso|verse|estrofa|pre[\s-]?(?:coro|chorus)|precoro|prechorus|coro|chorus|refr[aá]n|refrain|puente|bridge|tag|vamp|break(?:down)?|coda|solo|rap|final|outro|interludio|interlude|instrumental|ministraci[oó]n|espont[aá]neo|espontaneo)(?:\s*\d+)?(?:\s*[:.\-—–]\s*.+)?\s*$/i;

export const isSongSectionTitle = (value) => SECTION_TITLE_REGEX.test(String(value || '').trim());

export const CUE_REGEX = /^\s*\{cue:\s*(.*?)\s*\}\s*$/i;
export const REPEAT_MARKER_REGEX = /^\s*(\/{2,})\s*$/;
const INLINE_REPEAT_MARKER_REGEX = /\[(\/{2,})\]|(?<!\[)(\/{2,})(?!\])/g;

export const getSectionKey = (section, index = 0) => {
  const title = String(section?.titulo || section?.title || 'seccion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'seccion';
  return `${index}_${title}`;
};

/**
 * Convierte un texto plano con acordes en formato [C] a un objeto estructurado.
 * Usa "# NombreSeccion" o "[NombreSeccion]" para dividir bloques.
 */
export const parsearCancion = (textoRaw) => {
  if (!textoRaw) return [];

  const secciones = [];
  let seccionActual = null;
  let repeatMarker = null;
  const lineas = textoRaw.split('\n');

  const closeOpenRepeatAsInvalid = () => {
    if (!repeatMarker || !seccionActual) return;
    seccionActual.repeatValidation = {
      valid: false,
      openingCount: repeatMarker.count,
      closingCount: null,
      line: repeatMarker.line,
    };
    repeatMarker = null;
  };

  lineas.forEach((linea, lineIndex) => {
    const lineaLimpia = linea.trim();
    if (!lineaLimpia) {
      if (seccionActual) {
        seccionActual.lineas.push([]);
        seccionActual.items.push({ type: 'blank' });
      }
      return;
    }

    const repeatMarkers = [...lineaLimpia.matchAll(INLINE_REPEAT_MARKER_REGEX)]
      .map((match) => (match[1] || match[2]).length);
    let contentLine = lineaLimpia;

    if (repeatMarkers.length > 0) {
      if (!seccionActual) {
        seccionActual = { titulo: 'Inicio', lineas: [], items: [] };
        secciones.push(seccionActual);
      }
      repeatMarkers.forEach((count) => {
        if (!repeatMarker) {
          repeatMarker = { count, line: lineIndex + 1 };
        } else if (repeatMarker.count === count) {
          seccionActual.repeatCount = Math.max(seccionActual.repeatCount || 1, count);
          seccionActual.repetition = true;
          seccionActual.repeatValidation = { valid: true, count };
          repeatMarker = null;
        } else {
          seccionActual.repeatValidation = {
            valid: false,
            openingCount: repeatMarker.count,
            closingCount: count,
            line: repeatMarker.line,
          };
          repeatMarker = null;
        }
      });
      contentLine = lineaLimpia.replace(INLINE_REPEAT_MARKER_REGEX, '').trim();
      if (!contentLine) return;
    }

    const bracketSectionMatch = contentLine.match(/^\[(.*?)\]$/);
    const cueMatch = contentLine.match(CUE_REGEX);

    if (contentLine.startsWith('#')) {
      closeOpenRepeatAsInvalid();
      seccionActual = { titulo: contentLine.substring(1).trim(), lineas: [], items: [] };
      secciones.push(seccionActual);
    } else if (bracketSectionMatch && isSongSectionTitle(bracketSectionMatch[1])) {
      closeOpenRepeatAsInvalid();
      seccionActual = { titulo: bracketSectionMatch[1].trim(), lineas: [], items: [] };
      secciones.push(seccionActual);
    } else if (cueMatch) {
      if (!seccionActual) {
        seccionActual = { titulo: 'Inicio', lineas: [], items: [] };
        secciones.push(seccionActual);
      }
      const cueText = cueMatch[1].trim();
      if (cueText) seccionActual.items.push({ type: 'cue', text: cueText });
    } else {
      if (!seccionActual) {
        seccionActual = { titulo: 'Inicio', lineas: [], items: [] };
        secciones.push(seccionActual);
      }

      const tokens = contentLine.match(/(\[[^\]]+\]|[^\s[]+|\s+)/g) || [];
      const lineaEstructurada = [];
      let palabraActual = [];
      let acordeActual = '';

      tokens.forEach(token => {
        if (token.startsWith('[') && token.endsWith(']')) {
          if (acordeActual) {
            palabraActual.push({ acorde: acordeActual, texto: '\u00A0' });
          }
          acordeActual = token.slice(1, -1);
        } else if (token.trim() === '') {
          if (acordeActual) {
            palabraActual.push({ acorde: acordeActual, texto: '\u00A0' });
            acordeActual = '';
          }

          if (palabraActual.length > 0) {
            lineaEstructurada.push(palabraActual);
            palabraActual = [];
          }
        } else {
          palabraActual.push({ acorde: acordeActual, texto: token });
          acordeActual = '';
        }
      });

      if (palabraActual.length > 0) {
        if (acordeActual) palabraActual.push({ acorde: acordeActual, texto: '\u00A0' });
        lineaEstructurada.push(palabraActual);
      } else if (acordeActual) {
        lineaEstructurada.push([{ acorde: acordeActual, texto: '\u00A0' }]);
      }

      if (lineaEstructurada.length > 0) {
        seccionActual.lineas.push(lineaEstructurada);
        seccionActual.items.push({ type: 'lyrics', line: lineaEstructurada });
      }
    }
  });

  closeOpenRepeatAsInvalid();

  return secciones;
};

const trimOuterBlankItems = (items = []) => {
  let start = 0;
  let end = items.length;
  while (start < end && items[start]?.type === 'blank') start += 1;
  while (end > start && items[end - 1]?.type === 'blank') end -= 1;
  return items.slice(start, end);
};

const sectionLinesFromItems = (items = []) => items
  .filter((item) => item?.type === 'lyrics')
  .map((item) => item.line);

// Paragraphs are intentional visual pages. Consecutive blank lines are one
// separator; leading and trailing blanks do not produce empty pages.
export const getSectionPages = (section = {}) => {
  const items = trimOuterBlankItems(section.items?.length
    ? section.items
    : (section.lineas || []).map((line) => (line?.length ? { type: 'lyrics', line } : { type: 'blank' })));
  const groups = [];
  let current = [];
  let pendingCues = [];

  const pushCurrent = () => {
    const pageItems = trimOuterBlankItems(current);
    if (pageItems.some((item) => item.type === 'lyrics')) {
      groups.push({ items: pageItems, cues: pendingCues });
      pendingCues = [];
    }
    current = [];
  };

  items.forEach((item) => {
    if (item?.type === 'blank') {
      pushCurrent();
    } else if (item?.type === 'cue') {
      // A cue describes the musical block that follows. It is metadata, never
      // its own visual page, so it cannot displace lyrics or chords.
      pushCurrent();
      if (item.text) pendingCues.push(item.text);
    } else {
      current.push(item);
    }
  });
  pushCurrent();

  const pages = groups.length ? groups : [{ items: [], cues: [] }];
  return pages.map((page, pageIndex) => ({
    title: section.titulo || section.title || 'Seccion',
    pageIndex,
    pageCount: pages.length,
    repetition: section.repetition === true,
    repeatCount: Number.isInteger(section.repeatCount) && section.repeatCount >= 2 ? section.repeatCount : 1,
    repeatValidation: section.repeatValidation || null,
    cues: page.cues,
    items: page.items,
    lineas: sectionLinesFromItems(page.items),
  }));
};

export const getSongRepeatValidation = (sections = []) => sections
  .map((section, sectionIndex) => ({ section, sectionIndex, validation: section?.repeatValidation }))
  .filter(({ validation }) => validation && validation.valid === false)
  .map(({ section, sectionIndex, validation }) => ({
    sectionIndex,
    title: section?.titulo || section?.title || 'Seccion',
    ...validation,
  }));

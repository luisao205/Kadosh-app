export const SECTION_TITLE_REGEX = /^\s*(intro|verso|verse|estrofa|pre[\s-]?(?:coro|chorus)|precoro|prechorus|coro|chorus|refr[aá]n|refrain|puente|bridge|tag|vamp|break(?:down)?|coda|solo|rap|final|outro|interludio|interlude|instrumental|ministraci[oó]n|espont[aá]neo|espontaneo)(?:\s*\d+|\s*[:.-])?\s*$/i;

export const isSongSectionTitle = (value) => SECTION_TITLE_REGEX.test(String(value || '').trim());

export const CUE_REGEX = /^\s*\{cue:\s*(.*?)\s*\}\s*$/i;

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
  const lineas = textoRaw.split('\n');

  lineas.forEach(linea => {
    const lineaLimpia = linea.trim();
    if (!lineaLimpia) {
      if (seccionActual) {
        seccionActual.lineas.push([]);
        seccionActual.items.push({ type: 'blank' });
      }
      return;
    }

    const bracketSectionMatch = lineaLimpia.match(/^\[(.*?)\]$/);
    const cueMatch = lineaLimpia.match(CUE_REGEX);

    if (lineaLimpia.startsWith('#')) {
      seccionActual = { titulo: lineaLimpia.substring(1).trim(), lineas: [], items: [] };
      secciones.push(seccionActual);
    } else if (bracketSectionMatch && isSongSectionTitle(bracketSectionMatch[1])) {
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

      const tokens = lineaLimpia.match(/(\[[^\]]+\]|[^\[\s]+|\s+)/g) || [];
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

  return secciones;
};

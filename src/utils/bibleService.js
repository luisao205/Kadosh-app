const PREFERENCE_KEY = 'kadosh.bible.translation';
export const DEFAULT_TRANSLATION_ID = 'local:rvr1960';

const LOCAL_TRANSLATIONS = [
  { id: 'rvr1960', translationId: 'local:rvr1960' },
  { id: 'dhh', translationId: 'local:dhh' },
  { id: 'ntv', translationId: 'local:ntv' },
  { id: 'nvi', translationId: 'local:nvi' },
  { id: 'pdt', translationId: 'local:pdt' },
  { id: 'tla', translationId: 'local:tla' }
];

const localCache = {
  metadata: new Map(),
  books: new Map()
};

const normalize = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const BOOK_ALIASES = {
  gen: 'GEN', genesis: 'GEN', gn: 'GEN',
  ex: 'EXO', exodo: 'EXO', exodus: 'EXO',
  lev: 'LEV', levitico: 'LEV',
  num: 'NUM', numeros: 'NUM',
  deu: 'DEU', deuteronomio: 'DEU', dt: 'DEU',
  jos: 'JOS', josue: 'JOS',
  jue: 'JDG', jueces: 'JDG',
  rut: 'RUT', rt: 'RUT',
  '1 samuel': '1SA', '1 sam': '1SA', '1sa': '1SA',
  '2 samuel': '2SA', '2 sam': '2SA', '2sa': '2SA',
  '1 reyes': '1KI', '1 rey': '1KI', '1ki': '1KI',
  '2 reyes': '2KI', '2 rey': '2KI', '2ki': '2KI',
  '1 cronicas': '1CH', '1 cro': '1CH', '1cr': '1CH', '1ch': '1CH',
  '2 cronicas': '2CH', '2 cro': '2CH', '2cr': '2CH', '2ch': '2CH',
  esd: 'EZR', esdras: 'EZR',
  neh: 'NEH', nehemias: 'NEH',
  est: 'EST', ester: 'EST',
  job: 'JOB',
  sal: 'PSA', salmo: 'PSA', salmos: 'PSA', ps: 'PSA',
  pro: 'PRO', proverbios: 'PRO', prov: 'PRO',
  ecl: 'ECC', eclesiastes: 'ECC',
  cnt: 'SNG', cantares: 'SNG', cantar: 'SNG',
  isa: 'ISA', isaias: 'ISA',
  jer: 'JER', jeremias: 'JER',
  lam: 'LAM', lamentaciones: 'LAM',
  ez: 'EZK', ezequiel: 'EZK',
  dan: 'DAN', daniel: 'DAN',
  os: 'HOS', oseas: 'HOS',
  joel: 'JOL', jl: 'JOL',
  am: 'AMO', amos: 'AMO',
  abd: 'OBA', abdias: 'OBA',
  jon: 'JON', jonas: 'JON',
  miq: 'MIC', miqueas: 'MIC',
  nah: 'NAM', nahum: 'NAM',
  hab: 'HAB', habacuc: 'HAB',
  sof: 'ZEP', sofonias: 'ZEP',
  hag: 'HAG', hageo: 'HAG',
  zac: 'ZEC', zacarias: 'ZEC',
  mal: 'MAL', malaquias: 'MAL',
  mt: 'MAT', mat: 'MAT', mateo: 'MAT',
  mr: 'MRK', mrk: 'MRK', marcos: 'MRK',
  lc: 'LUK', luc: 'LUK', lucas: 'LUK',
  jn: 'JHN', jhn: 'JHN', juan: 'JHN',
  hch: 'ACT', hechos: 'ACT',
  ro: 'ROM', rom: 'ROM', romanos: 'ROM',
  '1 co': '1CO', '1 cor': '1CO', '1 corintios': '1CO', '1co': '1CO',
  '2 co': '2CO', '2 cor': '2CO', '2 corintios': '2CO', '2co': '2CO',
  gal: 'GAL', galatas: 'GAL',
  ef: 'EPH', efe: 'EPH', efesios: 'EPH',
  fil: 'PHP', filipenses: 'PHP',
  col: 'COL', colosenses: 'COL',
  '1 tes': '1TH', '1 tesalonicenses': '1TH', '1ts': '1TH',
  '2 tes': '2TH', '2 tesalonicenses': '2TH', '2ts': '2TH',
  '1 tim': '1TI', '1 timoteo': '1TI', '1ti': '1TI',
  '2 tim': '2TI', '2 timoteo': '2TI', '2ti': '2TI',
  tit: 'TIT', tito: 'TIT',
  flm: 'PHM', filemon: 'PHM',
  heb: 'HEB', hebreos: 'HEB',
  stg: 'JAS', santiago: 'JAS',
  '1 p': '1PE', '1 pe': '1PE', '1 pedro': '1PE', '1pe': '1PE',
  '2 p': '2PE', '2 pe': '2PE', '2 pedro': '2PE', '2pe': '2PE',
  '1 jn': '1JN', '1 juan': '1JN', '1jn': '1JN',
  '2 jn': '2JN', '2 juan': '2JN', '2jn': '2JN',
  '3 jn': '3JN', '3 juan': '3JN', '3jn': '3JN',
  jud: 'JUD', judas: 'JUD',
  ap: 'REV', apo: 'REV', apocalipsis: 'REV'
};

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar ${url}`);
  return response.json();
};

const getLocalBibleId = (translationId = DEFAULT_TRANSLATION_ID) => {
  const localTranslation = LOCAL_TRANSLATIONS.find(item => item.translationId === translationId);
  if (!localTranslation) throw new Error('La traduccion seleccionada no esta disponible localmente.');
  return localTranslation.id;
};

export async function getLocalBibleMetadata(translationId = DEFAULT_TRANSLATION_ID) {
  const bibleId = getLocalBibleId(translationId);
  if (!localCache.metadata.has(bibleId)) {
    localCache.metadata.set(bibleId, fetchJson(`/bibles/${bibleId}/metadata.json`));
  }
  return localCache.metadata.get(bibleId);
}

export async function getLocalBibleBook(bookCode, translationId = DEFAULT_TRANSLATION_ID) {
  const bibleId = getLocalBibleId(translationId);
  const cacheKey = `${bibleId}:${bookCode}`;
  if (!localCache.books.has(cacheKey)) {
    localCache.books.set(cacheKey, fetchJson(`/bibles/${bibleId}/${bookCode}.json`));
  }
  return localCache.books.get(cacheKey);
}

export async function getTranslations() {
  const available = await Promise.all(LOCAL_TRANSLATIONS.map(async ({ translationId }) => {
    const metadata = await getLocalBibleMetadata(translationId);
    return {
      provider: 'local',
      bibleId: metadata.id,
      translationId,
      abbreviation: metadata.abbreviation,
      translationName: metadata.name,
      available: true,
      offline: true,
      copyright: metadata.license,
      source: metadata.source
    };
  }));
  return { available, future: [] };
}

export const getPreferredTranslationId = () => {
  if (typeof window === 'undefined') return DEFAULT_TRANSLATION_ID;
  const storedTranslationId = window.localStorage.getItem(PREFERENCE_KEY);
  return LOCAL_TRANSLATIONS.some(item => item.translationId === storedTranslationId)
    ? storedTranslationId
    : DEFAULT_TRANSLATION_ID;
};

export const setPreferredTranslationId = (translationId) => {
  if (typeof window !== 'undefined') window.localStorage.setItem(PREFERENCE_KEY, translationId);
};

export async function getBooks(translationId = DEFAULT_TRANSLATION_ID) {
  const metadata = await getLocalBibleMetadata(translationId);
  return metadata.books || [];
}

export async function getChapters(bookCode, translationId = DEFAULT_TRANSLATION_ID) {
  const book = await getLocalBibleBook(bookCode, translationId);
  return Object.keys(book.chapters || {}).map(Number).sort((a, b) => a - b);
}

export async function getChapter({ bookCode, chapter, translationId = DEFAULT_TRANSLATION_ID }) {
  const metadata = await getLocalBibleMetadata(translationId);
  const book = await getLocalBibleBook(bookCode, translationId);
  const chapterData = book.chapters?.[String(chapter)] || {};
  const verses = Object.entries(chapterData).map(([number, value]) => normalizeVerseRecord(value, number));
  return {
    provider: 'local',
    bibleId: metadata.id,
    translationId,
    abbreviation: metadata.abbreviation,
    translationName: metadata.name,
    bookCode,
    bookName: book.name,
    chapter: Number(chapter),
    verses,
    copyright: metadata.license,
    available: true,
    offline: true
  };
}

export function parseReference(input = '') {
  const value = String(input || '')
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
  const match = value.match(/^(.+?)\s+(\d+)(?::\s*(\d+)(?:\s*-\s*(\d+))?)?$/u);
  if (!match) return null;
  const [, rawBook, chapterRaw, verseRaw, endVerseRaw] = match;
  const bookCode = BOOK_ALIASES[normalize(rawBook).replace(/\.$/, '')];
  if (!bookCode) return null;
  return {
    bookCode,
    chapter: Number(chapterRaw),
    verse: verseRaw ? Number(verseRaw) : null,
    endVerse: endVerseRaw ? Number(endVerseRaw) : null
  };
}

const normalizeVerseRecord = (value, fallbackNumber) => {
  if (typeof value === 'string') {
    return {
      number: Number(fallbackNumber),
      rawText: value,
      text: value,
      lineBreaks: [...value].reduce((positions, character, index) => character === '\n' ? [...positions, index] : positions, []),
      editorial: { headingCandidates: [], verseRangeHint: null },
      annotations: [],
      sourceState: { empty: !value.trim(), containsOmittedText: false }
    };
  }

  const text = String(value?.text || '');
  return {
    number: Number(value?.number ?? fallbackNumber),
    rawText: String(value?.rawText ?? text),
    text,
    lineBreaks: Array.isArray(value?.lineBreaks) ? value.lineBreaks : [],
    editorial: value?.editorial || { headingCandidates: [], verseRangeHint: null },
    annotations: Array.isArray(value?.annotations) ? value.annotations : [],
    sourceState: {
      empty: Boolean(value?.sourceState?.empty) || !text.trim(),
      containsOmittedText: Boolean(value?.sourceState?.containsOmittedText)
    },
    ...(value?.sourceVerseRange ? { sourceVerseRange: value.sourceVerseRange } : {})
  };
};

const getVerseRecord = (chapterData, verseNumber) => normalizeVerseRecord(
  chapterData?.[String(verseNumber)] ?? chapterData?.[`${verseNumber}a`],
  verseNumber
);

const rangeIncludesVerse = (range, verseNumber) => {
  const match = String(range || '').match(/^(\d+)\s*[-–—]\s*(\d+)$/u);
  return Boolean(match && Number(match[1]) <= verseNumber && verseNumber <= Number(match[2]));
};

export async function getPassage({ reference, translationId = DEFAULT_TRANSLATION_ID }) {
  const parsed = typeof reference === 'string' ? parseReference(reference) : reference;
  if (!parsed) throw new Error('No se pudo interpretar la referencia.');
  const chapter = await getChapter({ bookCode: parsed.bookCode, chapter: parsed.chapter, translationId });
  const book = await getLocalBibleBook(parsed.bookCode, translationId);
  const chapterData = book.chapters?.[String(parsed.chapter)] || {};
  const verseNumbers = Object.keys(chapterData).map(v => Number.parseInt(v, 10)).filter(Number.isFinite);
  if (!verseNumbers.length) throw new Error('No se encontraron versiculos para ese capitulo.');
  const start = parsed.verse || Math.min(...verseNumbers);
  const end = parsed.endVerse || parsed.verse || Math.max(...verseNumbers);
  const firstVerse = Math.min(...verseNumbers);
  const lastVerse = Math.max(...verseNumbers);
  if (start < firstVerse || end > lastVerse || end < start) {
    throw new Error(`El rango debe estar entre los versiculos ${firstVerse} y ${lastVerse}.`);
  }
  const verses = [];
  const unavailableVerses = [];
  const groupedRanges = [];
  for (let number = start; number <= end; number += 1) {
    const verse = getVerseRecord(chapterData, number);
    verses.push(verse);
    if (verse.sourceState.empty) {
      const groupedSource = Object.entries(chapterData)
        .map(([sourceNumber, value]) => normalizeVerseRecord(value, sourceNumber))
        .find(item => rangeIncludesVerse(item.sourceVerseRange, number));
      unavailableVerses.push({ number, sourceVerseRange: groupedSource?.sourceVerseRange || null });
    }
    if (verse.sourceVerseRange) groupedRanges.push({ number, sourceVerseRange: verse.sourceVerseRange });
  }
  const projectableVerses = verses.filter(verse => !verse.sourceState.empty && verse.text.trim());
  const warnings = [];
  if (groupedRanges.length) warnings.push('La fuente proporciona parte de este pasaje como un rango agrupado.');
  if (unavailableVerses.length) warnings.push('La fuente no proporciona texto individual verificable para todos los versiculos solicitados.');
  if (projectableVerses.length === 0) warnings.push('Este versiculo no se puede proyectar individualmente porque la fuente lo incluye dentro de un rango agrupado.');
  const referenceText = `${chapter.bookName} ${parsed.chapter}${parsed.verse ? `:${start}${end > start ? `-${end}` : ''}` : ''}`;
  return {
    ...chapter,
    reference: referenceText,
    passageId: `${chapter.bibleId}:${parsed.bookCode}.${parsed.chapter}.${start}-${end}`,
    verses,
    projectableVerses,
    unavailableVerses,
    groupedRanges,
    warning: warnings.join(' '),
    text: projectableVerses.map(item => `${item.number}. ${item.text}`).join('\n')
  };
}

export async function searchReference(reference, translationId = DEFAULT_TRANSLATION_ID) {
  return getPassage({ reference, translationId });
}

export async function searchText({ query, translationId = DEFAULT_TRANSLATION_ID, limit = 20 }) {
  const search = normalize(query);
  if (!search) return [];
  const metadata = await getLocalBibleMetadata(translationId);
  const books = await getBooks(translationId);
  const results = [];
  for (const meta of books) {
    const book = await getLocalBibleBook(meta.code, translationId);
    for (const [chapter, verses] of Object.entries(book.chapters || {})) {
      for (const [number, value] of Object.entries(verses)) {
        const verse = normalizeVerseRecord(value, number);
        if (verse.text && normalize(verse.text).includes(search)) {
          results.push({
            provider: 'local',
            bibleId: getLocalBibleId(translationId),
            translationId,
            abbreviation: metadata.abbreviation,
            translationName: metadata.name,
            reference: `${book.name} ${chapter}:${number}`,
            text: verse.text,
            passageId: `${getLocalBibleId(translationId)}:${meta.code}.${chapter}.${number}`,
            copyright: 'Public Domain',
            available: true,
            offline: true
          });
          if (results.length >= limit) return results;
        }
      }
    }
  }
  return results;
}

const splitLongVerse = (text, maxChars) => {
  const source = String(text || '').trim();
  if (source.length <= maxChars) return source ? [source] : [];

  const sentences = source.match(/[^.!?;:]+[.!?;:]?\s*/g) || [source];
  const chunks = [];
  let buffer = '';

  const pushWords = (value) => {
    String(value || '').trim().split(/\s+/).filter(Boolean).forEach((word) => {
      const next = buffer ? `${buffer} ${word}` : word;
      if (buffer && next.length > maxChars) {
        chunks.push(buffer);
        buffer = word;
      } else {
        buffer = next;
      }
    });
  };

  sentences.forEach((sentence) => {
    const next = buffer ? `${buffer} ${sentence.trim()}` : sentence.trim();
    if (next.length > maxChars) {
      if (buffer) {
        chunks.push(buffer);
        buffer = '';
      }
      pushWords(sentence);
    } else {
      buffer = next;
    }
  });
  if (buffer) chunks.push(buffer);
  return chunks.filter(Boolean);
};

const getStructuredVersePresentation = (verse) => {
  const textLines = String(verse?.text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const heading = textLines[0] || '';

  // Only a standalone, conventional superscription is promoted. Parenthetical
  // lines and source-specific candidates remain part of the verse text.
  const isUnambiguousSuperscription = textLines.length > 1
    && /^(?:Salmo(?:\s+de\s+.+)?|Al\s+m[uú]sico\s+principal(?:\s*[:.]\s*.*)?|Oraci[oó]n(?:\s+de\s+.+)?|C[aá]ntico(?:\s+de\s+.+)?|Masquil(?:\s+de\s+.+)?|Mictam(?:\s+de\s+.+)?|Siga[ií]on(?:\s+de\s+.+)?)\.?$/iu.test(heading);

  return isUnambiguousSuperscription
    ? { heading, text: textLines.slice(1).join('\n') }
    : { heading: null, text: String(verse?.text || '') };
};

export const splitPassageIntoSlides = (passage, maxChars = 360) => {
  const verses = Array.isArray(passage?.verses) ? passage.verses : [];
  if (verses.length === 0) return [];
  const slides = verses.filter(verse => !verse?.sourceState?.empty && String(verse?.text || '').trim()).flatMap((verse) => {
    const presentation = getStructuredVersePresentation(verse);
    const parts = splitLongVerse(presentation.text, maxChars);
    return parts.map((text, partIndex) => ({
      title: `${passage.bookName} ${passage.chapter}:${verse.number}`,
      reference: `${passage.bookName} ${passage.chapter}:${verse.number}${parts.length > 1 ? ` · ${partIndex + 1}/${parts.length}` : ''}`,
      verseNumber: verse.number,
      partIndex,
      partCount: parts.length,
      heading: partIndex === 0 ? presentation.heading : null,
      text: `${verse.number}. ${text}`
    }));
  });
  return slides.map((slide, index) => ({
    ...slide,
    translation: passage.abbreviation,
    translationName: passage.translationName,
    slideIndex: index,
    slideCount: slides.length
  }));
};

const LOCAL_BASE = '/bibles/rv1909';
const PREFERENCE_KEY = 'kadosh.bible.translation';

export const FUTURE_TRANSLATIONS = [
  { id: 'future:rvr1960', abbreviation: 'RVR1960', name: 'Reina-Valera 1960', reason: 'Requiere licencia' },
  { id: 'future:nvi', abbreviation: 'NVI', name: 'Nueva Versión Internacional', reason: 'Requiere licencia' },
  { id: 'future:pdt', abbreviation: 'PDT', name: 'Palabra de Dios para Todos', reason: 'Requiere licencia' }
];

const localCache = {
  metadata: null,
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

export async function getLocalBibleMetadata() {
  if (!localCache.metadata) {
    localCache.metadata = await fetchJson(`${LOCAL_BASE}/metadata.json`);
  }
  return localCache.metadata;
}

export async function getLocalBibleBook(bookCode) {
  if (!localCache.books.has(bookCode)) {
    localCache.books.set(bookCode, await fetchJson(`${LOCAL_BASE}/${bookCode}.json`));
  }
  return localCache.books.get(bookCode);
}

export async function getTranslations() {
  const metadata = await getLocalBibleMetadata();
  return {
    available: [{
      provider: 'local',
      bibleId: metadata.id,
      translationId: 'local:rv1909',
      abbreviation: metadata.abbreviation,
      translationName: metadata.name,
      available: true,
      offline: true,
      copyright: metadata.license,
      source: metadata.source
    }],
    future: FUTURE_TRANSLATIONS
  };
}

export const getPreferredTranslationId = () => {
  if (typeof window === 'undefined') return 'local:rv1909';
  return window.localStorage.getItem(PREFERENCE_KEY) || 'local:rv1909';
};

export const setPreferredTranslationId = (translationId) => {
  if (typeof window !== 'undefined') window.localStorage.setItem(PREFERENCE_KEY, translationId);
};

export async function getBooks(translationId = 'local:rv1909') {
  if (translationId !== 'local:rv1909') return [];
  const metadata = await getLocalBibleMetadata();
  return metadata.books || [];
}

export async function getChapters(bookCode, translationId = 'local:rv1909') {
  if (translationId !== 'local:rv1909') return [];
  const book = await getLocalBibleBook(bookCode);
  return Object.keys(book.chapters || {}).map(Number).sort((a, b) => a - b);
}

export async function getChapter({ bookCode, chapter, translationId = 'local:rv1909' }) {
  if (translationId !== 'local:rv1909') throw new Error('Esta traduccion online todavia no esta conectada en el frontend.');
  const metadata = await getLocalBibleMetadata();
  const book = await getLocalBibleBook(bookCode);
  const chapterData = book.chapters?.[String(chapter)] || {};
  const verses = Object.entries(chapterData).map(([number, text]) => ({ number, text }));
  return {
    provider: 'local',
    bibleId: metadata.id,
    translationId: 'local:rv1909',
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

const getVerseText = (chapterData, verseNumber) => chapterData?.[String(verseNumber)] || chapterData?.[`${verseNumber}a`] || '';

export async function getPassage({ reference, translationId = 'local:rv1909' }) {
  const parsed = typeof reference === 'string' ? parseReference(reference) : reference;
  if (!parsed) throw new Error('No se pudo interpretar la referencia.');
  const chapter = await getChapter({ bookCode: parsed.bookCode, chapter: parsed.chapter, translationId });
  const book = await getLocalBibleBook(parsed.bookCode);
  const chapterData = book.chapters?.[String(parsed.chapter)] || {};
  const verseNumbers = Object.keys(chapterData).map(v => Number.parseInt(v, 10)).filter(Number.isFinite);
  const start = parsed.verse || Math.min(...verseNumbers);
  const end = parsed.endVerse || parsed.verse || Math.max(...verseNumbers);
  const verses = [];
  for (let number = start; number <= end; number += 1) {
    const text = getVerseText(chapterData, number);
    if (text) verses.push({ number, text });
  }
  if (verses.length === 0) throw new Error('No se encontro texto para esa referencia.');
  const referenceText = `${chapter.bookName} ${parsed.chapter}${parsed.verse ? `:${start}${end > start ? `-${end}` : ''}` : ''}`;
  return {
    ...chapter,
    reference: referenceText,
    passageId: `rv1909:${parsed.bookCode}.${parsed.chapter}.${start}-${end}`,
    verses,
    text: verses.map(item => `${item.number}. ${item.text}`).join('\n')
  };
}

export async function searchReference(reference, translationId = 'local:rv1909') {
  return getPassage({ reference, translationId });
}

export async function searchText({ query, translationId = 'local:rv1909', limit = 20 }) {
  if (translationId !== 'local:rv1909') return [];
  const search = normalize(query);
  if (!search) return [];
  const books = await getBooks(translationId);
  const results = [];
  for (const meta of books) {
    const book = await getLocalBibleBook(meta.code);
    for (const [chapter, verses] of Object.entries(book.chapters || {})) {
      for (const [number, text] of Object.entries(verses)) {
        if (normalize(text).includes(search)) {
          results.push({
            provider: 'local',
            bibleId: 'rv1909',
            translationId,
            abbreviation: 'RV1909',
            translationName: 'Reina-Valera 1909',
            reference: `${book.name} ${chapter}:${number}`,
            text,
            passageId: `rv1909:${meta.code}.${chapter}.${number}`,
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

export const splitPassageIntoSlides = (passage, maxChars = 420) => {
  const verses = Array.isArray(passage?.verses) ? passage.verses : [];
  if (verses.length === 0) return [];
  const slides = [];
  let buffer = [];
  let bufferLength = 0;
  verses.forEach((verse) => {
    const line = `${verse.number}. ${verse.text}`;
    if (buffer.length && bufferLength + line.length > maxChars) {
      slides.push(buffer);
      buffer = [];
      bufferLength = 0;
    }
    buffer.push(line);
    bufferLength += line.length;
  });
  if (buffer.length) slides.push(buffer);
  return slides.map((lines, index) => ({
    title: passage.reference,
    reference: passage.reference,
    translation: passage.abbreviation,
    translationName: passage.translationName,
    text: lines.join('\n'),
    slideIndex: index,
    slideCount: slides.length
  }));
};

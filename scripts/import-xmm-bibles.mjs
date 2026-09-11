import fs from 'node:fs/promises';
import path from 'node:path';
import { parseStringPromise } from 'xml2js';

const sourceDirectory = process.argv[2] || 'bibles-source/xmm';
const outputDirectory = process.argv[3] || 'bibles-import-staging';

const TRANSLATIONS = [
  { sourceKey: 'reina valera 1960', id: 'rvr1960', abbreviation: 'RVR1960', name: 'Reina-Valera 1960' },
  { sourceKey: 'dios habla hoy', id: 'dhh', abbreviation: 'DHH', name: 'Dios Habla Hoy' },
  { sourceKey: 'nueva traduccion viviente', id: 'ntv', abbreviation: 'NTV', name: 'Nueva Traducci\u00f3n Viviente' },
  { sourceKey: 'nvi', id: 'nvi', abbreviation: 'NVI', name: 'Nueva Versi\u00f3n Internacional' },
  { sourceKey: 'palabra de dios para todos', id: 'pdt', abbreviation: 'PDT', name: 'Palabra de Dios para Todos' },
  { sourceKey: 'traduccion en lenguaje actual', id: 'tla', abbreviation: 'TLA', name: 'Traducci\u00f3n en Lenguaje Actual' }
];

const BOOKS = [
  ['GEN', 'Genesis', 'Genesis'], ['EXO', 'Exodo', 'Exodo'], ['LEV', 'Levitico', 'Levitico'], ['NUM', 'Numeros', 'Numeros'], ['DEU', 'Deuteronomio', 'Deuteronomio'],
  ['JOS', 'Josue', 'Josue'], ['JDG', 'Jueces', 'Jueces'], ['RUT', 'Rut', 'Rut'], ['1SA', '1 Samuel', '1 Samuel'], ['2SA', '2 Samuel', '2 Samuel'],
  ['1KI', '1 Reyes', '1 Reyes'], ['2KI', '2 Reyes', '2 Reyes'], ['1CH', '1 Cronicas', '1 Cronicas'], ['2CH', '2 Cronicas', '2 Cronicas'], ['EZR', 'Esdras', 'Esdras'],
  ['NEH', 'Nehemias', 'Nehemias'], ['EST', 'Ester', 'Ester'], ['JOB', 'Job', 'Job'], ['PSA', 'Salmos', 'Salmos'], ['PRO', 'Proverbios', 'Proverbios'],
  ['ECC', 'Eclesiastes', 'Eclesiastes'], ['SNG', 'Cantares', 'Cantares'], ['ISA', 'Isaias', 'Isaias'], ['JER', 'Jeremias', 'Jeremias'], ['LAM', 'Lamentaciones', 'Lamentaciones'],
  ['EZK', 'Ezequiel', 'Ezequiel'], ['DAN', 'Daniel', 'Daniel'], ['HOS', 'Oseas', 'Oseas'], ['JOL', 'Joel', 'Joel'], ['AMO', 'Amos', 'Amos'],
  ['OBA', 'Abdias', 'Abdias'], ['JON', 'Jonas', 'Jonas'], ['MIC', 'Miqueas', 'Miqueas'], ['NAM', 'Nahum', 'Nahum'], ['HAB', 'Habacuc', 'Habacuc'],
  ['ZEP', 'Sofonias', 'Sofonias'], ['HAG', 'Hageo', 'Hageo'], ['ZEC', 'Zacarias', 'Zacarias'], ['MAL', 'Malaquias', 'Malaquias'], ['MAT', 'Mateo', 'Mateo'],
  ['MRK', 'Marcos', 'Marcos'], ['LUK', 'Lucas', 'Lucas'], ['JHN', 'Juan', 'Juan'], ['ACT', 'Hechos', 'Hechos'], ['ROM', 'Romanos', 'Romanos'],
  ['1CO', '1 Corintios', '1 Corintios'], ['2CO', '2 Corintios', '2 Corintios'], ['GAL', 'Galatas', 'Galatas'], ['EPH', 'Efesios', 'Efesios'], ['PHP', 'Filipenses', 'Filipenses'],
  ['COL', 'Colosenses', 'Colosenses'], ['1TH', '1 Tesalonicenses', '1 Tesalonicenses'], ['2TH', '2 Tesalonicenses', '2 Tesalonicenses'], ['1TI', '1 Timoteo', '1 Timoteo'], ['2TI', '2 Timoteo', '2 Timoteo'],
  ['TIT', 'Tito', 'Tito'], ['PHM', 'Filemon', 'Filemon'], ['HEB', 'Hebreos', 'Hebreos'], ['JAS', 'Santiago', 'Santiago'], ['1PE', '1 Pedro', '1 Pedro'],
  ['2PE', '2 Pedro', '2 Pedro'], ['1JN', '1 Juan', '1 Juan'], ['2JN', '2 Juan', '2 Juan'], ['3JN', '3 Juan', '3 Juan'], ['JUD', 'Judas', 'Judas'], ['REV', 'Apocalipsis', 'Apocalipsis']
];

const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const textValue = (value) => typeof value === 'string' ? value : String(value?._ || '');

const normalize = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeRawText = (value = '') => String(value)
  .replace(/\r\n?/g, '\n')
  .trim();

const sourceFileLookup = new Map((await fs.readdir(sourceDirectory))
  .filter(file => path.extname(file).toLowerCase() === '.xmm')
  .map(file => [normalize(path.basename(file, '.xmm')), file]));

const markerPattern = (translationId) => translationId === 'dhh'
  ? /\(TEXT OMITTED\)|r\*|\[\d+\]|\*/gu
  : /\(TEXT OMITTED\)|\[\d+\]|\*/gu;

const lineBreakPositions = (text) => [...text]
  .reduce((positions, character, index) => character === '\n' ? [...positions, index] : positions, []);

const buildEditorial = (rawText, translationId) => {
  const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
  const rangeMatch = rawText.match(/\((\d+(?:\s*[\-–—]\s*\d+))\)/u);
  const headingCandidates = [];

  if (translationId === 'tla') {
    for (const [index, line] of lines.entries()) {
      if (/^\([^)]{1,120}\)$/u.test(line)) {
        headingCandidates.push({ line, lineIndex: index, confidence: 'candidate' });
      }
      if (index + 1 < lines.length && /^\(\d+[a-z]?\)\s+(?:Himno|Salmo|Cantico|Oracion)\b/iu.test(lines[index + 1]) && line.length <= 120) {
        headingCandidates.push({ line, lineIndex: index, confidence: 'candidate' });
        headingCandidates.push({ line: lines[index + 1], lineIndex: index + 1, confidence: 'candidate' });
      }
    }
  }

  return {
    headingCandidates: headingCandidates.filter((entry, index, entries) => entries.findIndex(item => item.lineIndex === entry.lineIndex) === index),
    verseRangeHint: rangeMatch?.[1]?.replace(/\s+/g, '') || null
  };
};

const tokenizeVerse = (rawText, translationId) => {
  const annotations = [];
  let containsOmittedText = false;
  let match;
  const pattern = markerPattern(translationId);

  while ((match = pattern.exec(rawText))) {
    const marker = match[0];
    const kind = marker === '(TEXT OMITTED)'
      ? 'source-text-omitted'
      : marker === 'r*'
        ? 'unresolved-editorial-marker'
        : marker.startsWith('[')
          ? 'unresolved-note-reference'
          : 'unresolved-editorial-marker';
    annotations.push({ marker, kind, position: match.index });
    containsOmittedText ||= kind === 'source-text-omitted';
  }

  const visibleLines = rawText
    .replace(markerPattern(translationId), '')
    .split('\n')
    .map(line => line.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean);
  const text = visibleLines.join('\n');

  return {
    text,
    lineBreaks: lineBreakPositions(text),
    annotations,
    sourceState: {
      empty: rawText.trim().length === 0,
      containsOmittedText
    }
  };
};

const parseTranslation = async ({ source, translation }) => {
  const xml = await parseStringPromise(source, {
    attrkey: '$',
    charkey: '_',
    explicitArray: true,
    explicitCharkey: true,
    trim: false,
    normalize: false
  });
  const sourceBooks = new Map();
  const stats = { books: 0, chapters: 0, verseNodes: 0, emptyVerses: 0, annotations: 0, omittedText: 0, groupedRanges: 0 };

  for (const bookNode of asArray(xml?.bible?.b)) {
    const sourceName = String(bookNode?.$?.n || '').trim();
    const chapters = {};
    stats.books += 1;

    for (const chapterNode of asArray(bookNode?.c)) {
      const chapterNumber = String(chapterNode?.$?.n || '').trim();
      const verses = {};
      stats.chapters += 1;

      for (const verseNode of asArray(chapterNode?.v)) {
        const verseNumber = String(verseNode?.$?.n || '').trim();
        const rawText = normalizeRawText(textValue(verseNode));
        const editorial = buildEditorial(rawText, translation.id);
        const tokenized = tokenizeVerse(rawText, translation.id);
        const record = {
          number: Number(verseNumber),
          rawText,
          text: tokenized.text,
          lineBreaks: tokenized.lineBreaks,
          editorial,
          annotations: tokenized.annotations,
          sourceState: tokenized.sourceState,
          ...(editorial.verseRangeHint ? { sourceVerseRange: editorial.verseRangeHint } : {})
        };
        if (!verseNumber) throw new Error(`${translation.abbreviation}: versiculo sin numero.`);
        verses[verseNumber] = record;
        stats.verseNodes += 1;
        stats.emptyVerses += Number(record.sourceState.empty);
        stats.annotations += record.annotations.length;
        stats.omittedText += Number(record.sourceState.containsOmittedText);
        stats.groupedRanges += Number(Boolean(record.sourceVerseRange));
      }
      chapters[chapterNumber] = verses;
    }
    sourceBooks.set(normalize(sourceName), { sourceName, chapters });
  }

  return { sourceBooks, stats };
};

const countChapterVerseNodes = (book) => Object.values(book.chapters)
  .reduce((count, chapter) => count + Object.keys(chapter).length, 0);

const importTranslation = async (translation) => {
  const sourceFile = sourceFileLookup.get(translation.sourceKey);
  if (!sourceFile) throw new Error(`${translation.abbreviation}: no se encontro el XMM original.`);
  const source = await fs.readFile(path.join(sourceDirectory, sourceFile), 'utf8');
  const { sourceBooks, stats } = await parseTranslation({ source, translation });
  const destination = path.join(outputDirectory, translation.id);
  await fs.mkdir(destination, { recursive: true });

  const generatedBooks = [];
  let generatedVerseNodes = 0;
  for (const [code, asciiName, name] of BOOKS) {
    const sourceBook = sourceBooks.get(normalize(name));
    if (!sourceBook) throw new Error(`${translation.abbreviation}: falta el libro ${name}.`);
    const chapterNumbers = Object.keys(sourceBook.chapters).map(Number).sort((a, b) => a - b);
    const book = { code, name: sourceBook.sourceName, asciiName, chapters: sourceBook.chapters };
    generatedVerseNodes += countChapterVerseNodes(book);
    await fs.writeFile(path.join(destination, `${code}.json`), `${JSON.stringify(book)}\n`, 'utf8');
    generatedBooks.push({ code, name: sourceBook.sourceName, asciiName, chapters: chapterNumbers.length, chapterNumbers, order: generatedBooks.length + 1 });
  }

  if (generatedBooks.length !== 66 || stats.books !== 66 || stats.chapters !== 1189 || generatedVerseNodes !== stats.verseNodes) {
    throw new Error(`${translation.abbreviation}: validacion estructural fallida.`);
  }

  await fs.writeFile(path.join(destination, 'metadata.json'), `${JSON.stringify({
    id: translation.id,
    abbreviation: translation.abbreviation,
    name: translation.name,
    language: 'es',
    provider: 'local',
    offline: true,
    license: 'Verify distribution license before public release.',
    source: 'Original XMM local',
    importSchemaVersion: 2,
    sourceStats: stats,
    books: generatedBooks
  })}\n`, 'utf8');
  return { translation: translation.abbreviation, ...stats, generatedVerseNodes };
};

await fs.rm(outputDirectory, { recursive: true, force: true });
await fs.mkdir(outputDirectory, { recursive: true });
const report = [];
for (const translation of TRANSLATIONS) report.push(await importTranslation(translation));
await fs.writeFile(path.join(outputDirectory, 'import-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
for (const item of report) {
  console.log(`${item.translation}: ${item.books} libros, ${item.chapters} capitulos, ${item.verseNodes} nodos, ${item.emptyVerses} vacios, ${item.annotations} anotaciones, ${item.omittedText} TEXT OMITTED, ${item.groupedRanges} rangos.`);
}

import fs from 'node:fs/promises';
import path from 'node:path';

const inputDir = process.argv[2];
const outputDir = process.argv[3] || 'public/bibles/rv1909';

if (!inputDir) {
  console.error('Usage: node scripts/import-rv1909.mjs <usfm-dir> [output-dir]');
  process.exit(1);
}

const BOOKS = [
  ['GEN', 'Genesis', 'G\u00e9nesis'], ['EXO', 'Exodo', '\u00c9xodo'], ['LEV', 'Levitico', 'Lev\u00edtico'], ['NUM', 'Numeros', 'N\u00fameros'], ['DEU', 'Deuteronomio', 'Deuteronomio'],
  ['JOS', 'Josue', 'Josu\u00e9'], ['JDG', 'Jueces', 'Jueces'], ['RUT', 'Rut', 'Rut'], ['1SA', '1 Samuel', '1 Samuel'], ['2SA', '2 Samuel', '2 Samuel'],
  ['1KI', '1 Reyes', '1 Reyes'], ['2KI', '2 Reyes', '2 Reyes'], ['1CH', '1 Cronicas', '1 Cr\u00f3nicas'], ['2CH', '2 Cronicas', '2 Cr\u00f3nicas'], ['EZR', 'Esdras', 'Esdras'],
  ['NEH', 'Nehemias', 'Nehem\u00edas'], ['EST', 'Ester', 'Ester'], ['JOB', 'Job', 'Job'], ['PSA', 'Salmos', 'Salmos'], ['PRO', 'Proverbios', 'Proverbios'],
  ['ECC', 'Eclesiastes', 'Eclesiast\u00e9s'], ['SNG', 'Cantares', 'Cantares'], ['ISA', 'Isaias', 'Isa\u00edas'], ['JER', 'Jeremias', 'Jerem\u00edas'], ['LAM', 'Lamentaciones', 'Lamentaciones'],
  ['EZK', 'Ezequiel', 'Ezequiel'], ['DAN', 'Daniel', 'Daniel'], ['HOS', 'Oseas', 'Oseas'], ['JOL', 'Joel', 'Joel'], ['AMO', 'Amos', 'Am\u00f3s'],
  ['OBA', 'Abdias', 'Abd\u00edas'], ['JON', 'Jonas', 'Jon\u00e1s'], ['MIC', 'Miqueas', 'Miqueas'], ['NAM', 'Nahum', 'Nahum'], ['HAB', 'Habacuc', 'Habacuc'],
  ['ZEP', 'Sofonias', 'Sofon\u00edas'], ['HAG', 'Hageo', 'Hageo'], ['ZEC', 'Zacarias', 'Zacar\u00edas'], ['MAL', 'Malaquias', 'Malaqu\u00edas'], ['MAT', 'Mateo', 'Mateo'],
  ['MRK', 'Marcos', 'Marcos'], ['LUK', 'Lucas', 'Lucas'], ['JHN', 'Juan', 'Juan'], ['ACT', 'Hechos', 'Hechos'], ['ROM', 'Romanos', 'Romanos'],
  ['1CO', '1 Corintios', '1 Corintios'], ['2CO', '2 Corintios', '2 Corintios'], ['GAL', 'Galatas', 'G\u00e1latas'], ['EPH', 'Efesios', 'Efesios'], ['PHP', 'Filipenses', 'Filipenses'],
  ['COL', 'Colosenses', 'Colosenses'], ['1TH', '1 Tesalonicenses', '1 Tesalonicenses'], ['2TH', '2 Tesalonicenses', '2 Tesalonicenses'], ['1TI', '1 Timoteo', '1 Timoteo'], ['2TI', '2 Timoteo', '2 Timoteo'],
  ['TIT', 'Tito', 'Tito'], ['PHM', 'Filemon', 'Filem\u00f3n'], ['HEB', 'Hebreos', 'Hebreos'], ['JAS', 'Santiago', 'Santiago'], ['1PE', '1 Pedro', '1 Pedro'],
  ['2PE', '2 Pedro', '2 Pedro'], ['1JN', '1 Juan', '1 Juan'], ['2JN', '2 Juan', '2 Juan'], ['3JN', '3 Juan', '3 Juan'], ['JUD', 'Judas', 'Judas'],
  ['REV', 'Apocalipsis', 'Apocalipsis']
];

const stripUsfm = (value) => String(value || '')
  .replace(/\\f [\s\S]*?\\f\*/g, '')
  .replace(/\\x [\s\S]*?\\x\*/g, '')
  .replace(/\\w\s+([^|\\]+)(?:\|[^\\]*)?\\w\*/g, '$1')
  .replace(/\\[a-z0-9]+(?:-[a-z0-9]+)?\*?/gi, '')
  .replace(/\|[a-z0-9_-]+="[^"]*"/gi, '')
  .replace(/\s+/g, ' ')
  .trim();

const parseBook = (content, fallbackCode) => {
  const code = content.match(/\\id\s+([A-Z0-9]{3})/)?.[1] || fallbackCode;
  const chapters = {};
  let chapter = null;
  let verse = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const chapterMatch = line.match(/^\\c\s+(\d+)/);
    if (chapterMatch) {
      chapter = chapterMatch[1];
      chapters[chapter] ||= {};
      verse = null;
      continue;
    }

    const verseMatch = line.match(/^\\v\s+(\d+[a-z]?)\s*(.*)$/);
    if (verseMatch && chapter) {
      verse = verseMatch[1];
      const text = stripUsfm(verseMatch[2]);
      chapters[chapter][verse] = text;
      continue;
    }

    if (chapter && verse && !line.startsWith('\\c ')) {
      const text = stripUsfm(line);
      if (text) chapters[chapter][verse] = `${chapters[chapter][verse]} ${text}`.trim();
    }
  }

  return { code, chapters };
};

await fs.mkdir(outputDir, { recursive: true });
const files = await fs.readdir(inputDir);
const generatedBooks = [];

for (const [code, asciiName, name] of BOOKS) {
  const file = files.find(item => item.toUpperCase().includes(code) && item.toLowerCase().endsWith('.usfm'));
  if (!file) continue;
  const content = await fs.readFile(path.join(inputDir, file), 'utf8');
  const parsed = parseBook(content, code);
  const chapterNumbers = Object.keys(parsed.chapters).map(Number).sort((a, b) => a - b);
  const book = {
    code,
    name,
    asciiName,
    chapters: parsed.chapters
  };
  await fs.writeFile(path.join(outputDir, `${code}.json`), `${JSON.stringify(book, null, 2)}\n`, 'utf8');
  generatedBooks.push({
    code,
    name,
    asciiName,
    chapters: chapterNumbers.length,
    chapterNumbers,
    order: generatedBooks.length + 1
  });
}

const metadata = {
  id: 'rv1909',
  abbreviation: 'RV1909',
  name: 'Reina-Valera 1909',
  language: 'es',
  provider: 'local',
  offline: true,
  license: 'Public Domain',
  source: 'eBible.org',
  sourceUrl: 'https://ebible.org/spaRV1909/copyright.htm',
  books: generatedBooks
};

await fs.writeFile(path.join(outputDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(`Generated ${generatedBooks.length} RV1909 books in ${outputDir}`);

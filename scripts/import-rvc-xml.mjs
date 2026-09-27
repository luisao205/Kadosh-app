import fs from 'node:fs/promises';
import path from 'node:path';
import { parseStringPromise } from 'xml2js';

const sourceFile = process.argv[2] || path.join('bibles-source', 'xml', 'Reina-Valera Contemporanea.xml');
const outputDirectory = process.argv[3] || path.join('public', 'bibles', 'rvc');

const BOOKS = [
  ['GEN','Genesis'],['EXO','Exodo'],['LEV','Levitico'],['NUM','Numeros'],['DEU','Deuteronomio'],
  ['JOS','Josue'],['JDG','Jueces'],['RUT','Rut'],['1SA','1 Samuel'],['2SA','2 Samuel'],
  ['1KI','1 Reyes'],['2KI','2 Reyes'],['1CH','1 Cronicas'],['2CH','2 Cronicas'],['EZR','Esdras'],
  ['NEH','Nehemias'],['EST','Ester'],['JOB','Job'],['PSA','Salmos'],['PRO','Proverbios'],
  ['ECC','Eclesiastes'],['SNG','Cantares'],['ISA','Isaias'],['JER','Jeremias'],['LAM','Lamentaciones'],
  ['EZK','Ezequiel'],['DAN','Daniel'],['HOS','Oseas'],['JOL','Joel'],['AMO','Amos'],
  ['OBA','Abdias'],['JON','Jonas'],['MIC','Miqueas'],['NAM','Nahum'],['HAB','Habacuc'],
  ['ZEP','Sofonias'],['HAG','Hageo'],['ZEC','Zacarias'],['MAL','Malaquias'],['MAT','Mateo'],
  ['MRK','Marcos'],['LUK','Lucas'],['JHN','Juan'],['ACT','Hechos'],['ROM','Romanos'],
  ['1CO','1 Corintios'],['2CO','2 Corintios'],['GAL','Galatas'],['EPH','Efesios'],['PHP','Filipenses'],
  ['COL','Colosenses'],['1TH','1 Tesalonicenses'],['2TH','2 Tesalonicenses'],['1TI','1 Timoteo'],['2TI','2 Timoteo'],
  ['TIT','Tito'],['PHM','Filemon'],['HEB','Hebreos'],['JAS','Santiago'],['1PE','1 Pedro'],
  ['2PE','2 Pedro'],['1JN','1 Juan'],['2JN','2 Juan'],['3JN','3 Juan'],['JUD','Judas'],['REV','Apocalipsis']
];

const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const textValue = (node) => typeof node === 'string' ? node : String(node?._ || '');
const cleanText = (value = '') => String(value).replace(/\r\n?/g, '\n').trim();
const lineBreakPositions = (text) => [...text].reduce((positions, ch, index) => ch === '\n' ? [...positions, index] : positions, []);

const source = await fs.readFile(sourceFile, 'utf8');
const xml = await parseStringPromise(source, {
  attrkey: '$',
  charkey: '_',
  explicitArray: true,
  explicitCharkey: true,
  trim: false,
  normalize: false
});

const sourceBooks = asArray(xml?.XMLBIBLE?.BIBLEBOOK);
if (sourceBooks.length !== 66) throw new Error(`RVC: se esperaban 66 libros y se encontraron ${sourceBooks.length}.`);

await fs.rm(outputDirectory, { recursive: true, force: true });
await fs.mkdir(outputDirectory, { recursive: true });

const metadataBooks = [];
let chapterCount = 0;
let verseCount = 0;

for (let index = 0; index < sourceBooks.length; index += 1) {
  const sourceBook = sourceBooks[index];
  const expectedBookNumber = index + 1;
  const actualBookNumber = Number(sourceBook?.$?.bnumber);
  if (actualBookNumber !== expectedBookNumber) {
    throw new Error(`RVC: orden canonico inesperado en libro ${expectedBookNumber}; bnumber=${actualBookNumber}.`);
  }

  const [code, asciiName] = BOOKS[index];
  const name = String(sourceBook?.$?.bname || asciiName).trim();
  const chapters = {};
  const sourceChapters = asArray(sourceBook?.CHAPTER);

  for (const chapterNode of sourceChapters) {
    const chapterNumber = Number(chapterNode?.$?.cnumber);
    if (!Number.isFinite(chapterNumber) || chapterNumber < 1) throw new Error(`${name}: capitulo invalido.`);
    const verses = {};
    const sourceVerses = asArray(chapterNode?.VERS);

    for (const verseNode of sourceVerses) {
      const verseNumber = Number(verseNode?.$?.vnumber);
      if (!Number.isFinite(verseNumber) || verseNumber < 1) throw new Error(`${name} ${chapterNumber}: versiculo invalido.`);
      const rawText = cleanText(textValue(verseNode));
      verses[String(verseNumber)] = {
        number: verseNumber,
        rawText,
        text: rawText,
        lineBreaks: lineBreakPositions(rawText),
        editorial: { headingCandidates: [], verseRangeHint: null },
        annotations: [],
        sourceState: { empty: !rawText, containsOmittedText: false }
      };
      verseCount += 1;
    }

    chapters[String(chapterNumber)] = verses;
    chapterCount += 1;
  }

  const chapterNumbers = Object.keys(chapters).map(Number).sort((a, b) => a - b);
  await fs.writeFile(path.join(outputDirectory, `${code}.json`), `${JSON.stringify({ code, name, asciiName, chapters })}\n`, 'utf8');
  metadataBooks.push({ code, name, asciiName, chapters: chapterNumbers.length, chapterNumbers, order: index + 1 });
}

if (chapterCount !== 1189) throw new Error(`RVC: se esperaban 1189 capitulos y se encontraron ${chapterCount}.`);
if (verseCount !== 31102) throw new Error(`RVC: se esperaban 31102 versiculos y se encontraron ${verseCount}.`);

const metadata = {
  id: 'rvc',
  abbreviation: 'RVC',
  name: 'Reina-Valera Contemporanea',
  language: 'es',
  provider: 'local',
  offline: true,
  license: 'Verify distribution license before public release.',
  source: 'Local XMLBIBLE import',
  importSchemaVersion: 2,
  sourceStats: { books: 66, chapters: chapterCount, verseNodes: verseCount, emptyVerses: 0, annotations: 0, omittedText: 0, groupedRanges: 0 },
  books: metadataBooks
};
await fs.writeFile(path.join(outputDirectory, 'metadata.json'), `${JSON.stringify(metadata)}\n`, 'utf8');
console.log(`RVC OK: 66 libros, ${chapterCount} capitulos, ${verseCount} versiculos -> ${outputDirectory}`);

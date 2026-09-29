import { calcularOffsetSemitonos, isValidChordToken, traducirAcorde, transponerNota } from './musicCore';
import { parsearCancion } from './songParser';
import { getSongBaseKey } from './songAssignments';

export const SONG_PRINT_MODES = Object.freeze({
  LYRICS: 'lyrics',
  CHORDS: 'chords',
  COMBINED: 'combined',
  STRUCTURE: 'structure'
});

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const cleanText = (value) => String(value || '').replace(/\u00a0/g, ' ').trim();

const formatChord = (chord, { offset = 0, chordFormat = 'american', notation = 'sharps' } = {}) => {
  if (!isValidChordToken(chord)) return String(chord || '');
  const transposed = transponerNota(chord, offset);
  return traducirAcorde(transposed, chordFormat, notation);
};

const structuredLineToText = (line = []) => line
  .map((word) => word.map((segment) => cleanText(segment.texto)).join(''))
  .filter(Boolean)
  .join(' ')
  .trim();

const structuredLineToChords = (line = [], options = {}) => {
  const chords = [];
  line.forEach((word) => word.forEach((segment) => {
    if (segment.acorde) chords.push(formatChord(segment.acorde, options));
  }));
  return chords;
};

const structuredLineToCombined = (line = [], options = {}) => line
  .map((word) => word.map((segment) => {
    const chord = segment.acorde ? `[${formatChord(segment.acorde, options)}]` : '';
    return `${chord}${cleanText(segment.texto)}`;
  }).join(''))
  .filter(Boolean)
  .join(' ')
  .trim();

export const getSongSectionsForPrint = (song = {}, options = {}) => {
  const raw = song.letraRaw || song.letra || '';
  const baseKey = getSongBaseKey(song);
  const targetKey = options.targetKey || baseKey;
  const offset = calcularOffsetSemitonos(baseKey, targetKey);
  const formatting = {
    offset,
    chordFormat: options.chordFormat || 'american',
    notation: options.notation || 'sharps'
  };

  return parsearCancion(raw).map((section, sectionIndex) => ({
    index: sectionIndex,
    title: section.titulo,
    items: (section.items || []).map((item) => {
      if (item.type === 'cue') return { type: 'cue', text: item.text };
      if (item.type === 'blank') return { type: 'blank' };
      const line = item.line || [];
      return {
        type: 'lyrics',
        lyrics: structuredLineToText(line),
        chords: structuredLineToChords(line, formatting),
        combined: structuredLineToCombined(line, formatting)
      };
    })
  }));
};

export const buildSongPrintModel = (song = {}, options = {}) => {
  const baseKey = getSongBaseKey(song);
  const targetKey = options.targetKey || baseKey;
  return {
    title: song.titulo || 'Canción sin título',
    artist: song.artista || 'Sin artista',
    key: targetKey,
    originalKey: baseKey,
    bpm: song.bpm || '',
    mode: options.mode || SONG_PRINT_MODES.COMBINED,
    sections: getSongSectionsForPrint(song, options)
  };
};

export const getSongPreviewLines = (song, options = {}) => {
  const model = buildSongPrintModel(song, options);
  const lines = [];

  model.sections.forEach((section, index) => {
    if (model.mode === SONG_PRINT_MODES.STRUCTURE) {
      lines.push(`${String(index + 1).padStart(2, '0')} ${section.title}`);
      section.items.filter((item) => item.type === 'cue').forEach((item) => lines.push(`   ${item.text}`));
      return;
    }

    lines.push(`[${section.title}]`);
    section.items.forEach((item) => {
      if (item.type === 'blank') lines.push('');
      else if (item.type === 'cue') lines.push(`{cue: ${item.text}}`);
      else if (model.mode === SONG_PRINT_MODES.LYRICS) lines.push(item.lyrics);
      else if (model.mode === SONG_PRINT_MODES.CHORDS) lines.push(item.chords.join('  '));
      else lines.push(item.combined);
    });
    lines.push('');
  });

  return lines;
};

const trimOuterBlankItems = (items = []) => {
  let start = 0;
  let end = items.length;
  while (start < end && items[start]?.type === 'blank') start += 1;
  while (end > start && items[end - 1]?.type === 'blank') end -= 1;
  return items.slice(start, end);
};

const renderSection = (section, mode, sectionIndex) => {
  if (mode === SONG_PRINT_MODES.STRUCTURE) {
    const cues = section.items
      .filter((item) => item.type === 'cue')
      .map((item) => `<div class="structure-cue">${escapeHtml(item.text)}</div>`)
      .join('');
    return `<section class="structure-row"><div class="structure-number">${String(sectionIndex + 1).padStart(2, '0')}</div><div><div class="structure-title">${escapeHtml(section.title)}</div>${cues}</div></section>`;
  }

  const body = trimOuterBlankItems(section.items).map((item) => {
    if (item.type === 'blank') return '<div class="blank-line"></div>';
    if (item.type === 'cue') return `<div class="cue">${escapeHtml(item.text)}</div>`;
    if (mode === SONG_PRINT_MODES.LYRICS) return `<div class="lyrics-line">${escapeHtml(item.lyrics)}</div>`;
    if (mode === SONG_PRINT_MODES.CHORDS) return `<div class="chords-line">${escapeHtml(item.chords.join('  '))}</div>`;
    return `<div class="combined-line">${escapeHtml(item.combined)}</div>`;
  }).join('');

  return `<section class="song-section"><h2>${escapeHtml(section.title)}</h2>${body}</section>`;
};

export const buildSongPrintHtml = (song, options = {}) => {
  const model = buildSongPrintModel(song, options);
  const body = model.sections.map((section, index) => renderSection(section, model.mode, index)).join('');
  const modeTitle = {
    [SONG_PRINT_MODES.LYRICS]: 'Solo letra',
    [SONG_PRINT_MODES.CHORDS]: 'Solo acordes',
    [SONG_PRINT_MODES.COMBINED]: 'Letra + acordes',
    [SONG_PRINT_MODES.STRUCTURE]: 'Estructura'
  }[model.mode] || 'Canción';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.title)} — ${escapeHtml(modeTitle)}</title>
<style>
@page { size: A4; margin: 16mm 17mm 17mm; }
* { box-sizing: border-box; }
html { background: #27272a; }
body { margin: 0; color: #18181b; font-family: Arial, Helvetica, sans-serif; font-size: 10.25pt; line-height: 1.32; background: transparent; }
.print-sheet { background: #fff; }
header { border-bottom: 1.5px solid #18181b; padding-bottom: 7px; margin-bottom: 11px; }
.brand { font-size: 7pt; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: #71717a; }
h1 { margin: 3px 0 1px; font-size: 21pt; line-height: 1.05; }
.artist { font-size: 9.5pt; color: #52525b; font-weight: 700; }
.meta { display: flex; flex-wrap: wrap; gap: 5px 14px; margin-top: 6px; font-size: 8pt; font-weight: 700; }
.meta span { white-space: nowrap; }
.song-section { break-inside: auto; page-break-inside: auto; margin: 0 0 10px; }
.song-section h2 { break-after: avoid-page; page-break-after: avoid; margin: 0 0 4px; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .07em; border-bottom: 1px solid #e4e4e7; padding-bottom: 2px; }
.lyrics-line, .chords-line, .combined-line, .cue { break-inside: avoid; page-break-inside: avoid; }
.lyrics-line { min-height: 1.32em; orphans: 2; widows: 2; }
.chords-line, .combined-line { font-family: "Courier New", monospace; white-space: pre-wrap; font-weight: 700; }
.chords-line { color: #3f3f46; }
.combined-line { line-height: 1.4; }
.cue { margin: 2px 0; font-size: 8.25pt; font-style: italic; color: #71717a; }
.blank-line { height: .25em; }
.structure-row { display: grid; grid-template-columns: 32px 1fr; gap: 8px; padding: 5px 0; border-bottom: 1px solid #e4e4e7; break-inside: avoid; page-break-inside: avoid; }
.structure-number { font-size: 8.5pt; font-weight: 900; color: #71717a; }
.structure-title { font-size: 9.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; }
.structure-cue { margin-top: 1px; font-size: 8pt; color: #71717a; font-style: italic; }
@media screen {
  body { min-height: 100vh; padding: 24px; }
  .print-sheet { width: min(210mm, 100%); min-height: 297mm; margin: 0 auto; padding: 15mm 16mm 18mm; box-shadow: 0 15px 50px rgba(0,0,0,.28); }
}
@media print {
  html, body { background: #fff; }
  .print-sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
}
</style>
</head>
<body>
<div class="print-sheet">
<header>
  <div class="brand">Kadosh App · Repertorio</div>
  <h1>${escapeHtml(model.title)}</h1>
  <div class="artist">${escapeHtml(model.artist)}</div>
  <div class="meta">
    <span>Documento: ${escapeHtml(modeTitle)}</span>
    <span>Tono: ${escapeHtml(model.key)}</span>
    ${model.bpm ? `<span>BPM: ${escapeHtml(model.bpm)}</span>` : ''}
    ${model.key !== model.originalKey ? `<span>Original: ${escapeHtml(model.originalKey)}</span>` : ''}
  </div>
</header>
<main>${body}</main>
</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 150));</script>
</body>
</html>`;
};

export const printSongPdf = (song, options = {}) => {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('El navegador bloqueó la ventana de impresión.');
  popup.opener = null;
  popup.document.open();
  popup.document.write(buildSongPrintHtml(song, options));
  popup.document.close();
};
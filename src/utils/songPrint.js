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

const renderSection = (section, mode, sectionIndex) => {
  if (mode === SONG_PRINT_MODES.STRUCTURE) {
    const cues = section.items
      .filter((item) => item.type === 'cue')
      .map((item) => `<div class="structure-cue">${escapeHtml(item.text)}</div>`)
      .join('');
    return `<section class="structure-row"><div class="structure-number">${String(sectionIndex + 1).padStart(2, '0')}</div><div><div class="structure-title">${escapeHtml(section.title)}</div>${cues}</div></section>`;
  }

  const body = section.items.map((item) => {
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
@page { size: A4; margin: 16mm 15mm 17mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #18181b; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45; }
header { border-bottom: 2px solid #18181b; padding-bottom: 10px; margin-bottom: 18px; }
.brand { font-size: 8pt; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; color: #52525b; }
h1 { margin: 5px 0 2px; font-size: 24pt; line-height: 1.08; }
.artist { font-size: 11pt; color: #52525b; font-weight: 700; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 10px; font-size: 9pt; font-weight: 700; }
.meta span { white-space: nowrap; }
.song-section { break-inside: avoid; margin: 0 0 18px; }
.song-section h2 { margin: 0 0 7px; font-size: 11pt; text-transform: uppercase; letter-spacing: .08em; border-bottom: 1px solid #d4d4d8; padding-bottom: 3px; }
.lyrics-line { min-height: 1.45em; }
.chords-line, .combined-line { font-family: "Courier New", monospace; white-space: pre-wrap; font-weight: 700; }
.chords-line { color: #3f3f46; }
.combined-line { line-height: 1.55; }
.cue { margin: 4px 0; font-size: 9pt; font-style: italic; color: #52525b; }
.blank-line { height: .8em; }
.structure-row { display: grid; grid-template-columns: 38px 1fr; gap: 10px; padding: 7px 0; border-bottom: 1px solid #e4e4e7; break-inside: avoid; }
.structure-number { font-size: 10pt; font-weight: 900; color: #71717a; }
.structure-title { font-size: 11pt; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; }
.structure-cue { margin-top: 2px; font-size: 9pt; color: #52525b; font-style: italic; }
footer { position: fixed; bottom: -11mm; left: 0; right: 0; border-top: 1px solid #e4e4e7; padding-top: 4px; font-size: 7.5pt; color: #71717a; display: flex; justify-content: space-between; }
@media screen { body { max-width: 820px; margin: 24px auto; padding: 24px; box-shadow: 0 15px 50px rgba(0,0,0,.12); } footer { display: none; } }
</style>
</head>
<body>
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
<footer><span>Kadosh App</span><span>${escapeHtml(model.title)}</span></footer>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 150));</script>
</body>
</html>`;
};

export const printSongPdf = (song, options = {}) => {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('El navegador bloqueó la ventana de impresión.');
  popup.document.open();
  popup.document.write(buildSongPrintHtml(song, options));
  popup.document.close();
};

"use strict";

// ChordPro used by Kadosh keeps chords and lyrics in one string. These helpers
// compare the two independently without accepting a lossy client-side claim.
// Mirrors the accepted Kadosh chord tokens, including diminished/half-diminished
// notation and slash basses. Section labels such as [Verso] do not match.
const CHORD = /^[A-G](?:#|b)?(?:m(?!aj)|maj|min|dim|aug|sus|add|M|ø|°)?(?:\d{0,2})?(?:[#b]?\d{0,2})?(?:\([^\)\]\r\n]*\))?(?:\/[A-G](?:#|b)?)?$/i;
const DIRECTIVE = /^\{[^\r\n]*\}$/;
// Kadosh uses whole-line slash markers for repetitions. They are presentation
// structure, not lyric text, and must remain unchanged for limited editors.
const REPETITION = /^\/{2,}[^\r\n]*\/{2,}$/;

const normalize = (value) => String(value || "").replace(/\r\n?/g, "\n");
const bracketToken = /\[([^\]\r\n]+)\]/g;
const isChord = (token) => CHORD.test(String(token || "").trim());

const parseLine = (line) => {
  const chords = [];
  let text = "";
  let structure = "";
  let offset = 0;
  bracketToken.lastIndex = 0;
  let match;
  while ((match = bracketToken.exec(line))) {
    const before = line.slice(offset, match.index);
    text += before;
    structure += before ? "T" : "";
    const token = match[1].trim();
    if (isChord(token)) {
      chords.push(token.replace(/\s+/g, ""));
      structure += "C";
    } else {
      text += match[0];
      structure += `B:${token}`;
    }
    offset = match.index + match[0].length;
  }
  const tail = line.slice(offset);
  text += tail;
  structure += tail ? "T" : "";
  const trimmed = line.trim();
  return {
    text,
    chords,
    structure,
    directive: DIRECTIVE.test(trimmed) ? trimmed : null,
    section: trimmed.startsWith("#") ? trimmed : null,
    repetition: REPETITION.test(trimmed) ? trimmed : null
  };
};

const analyseChordPro = (value) => normalize(value).split("\n").map(parseLine);

const stable = (value) => JSON.stringify(value);

const lyricsSignature = (value) => stable(analyseChordPro(value).map(({ text }) => text));
const chordSignature = (value) => stable(analyseChordPro(value).map(({ chords, structure, directive, section, repetition }) => ({ chords, structure, directive, section, repetition })));

const canEditChordsOnly = (before, after) => lyricsSignature(before) === lyricsSignature(after);
const canEditLyricsOnly = (before, after) => chordSignature(before) === chordSignature(after);

module.exports = {
  analyseChordPro,
  lyricsSignature,
  chordSignature,
  canEditChordsOnly,
  canEditLyricsOnly
};

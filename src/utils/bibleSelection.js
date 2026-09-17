const clampVerse = (value, maxVerseNumber, fallback = 1) => {
  const maximum = Math.max(1, Number(maxVerseNumber) || 1);
  const parsed = Number.parseInt(String(value), 10);
  const safeValue = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(1, Math.min(safeValue, maximum));
};

export const createBibleSelection = (start = 1, end = start, active = false) => ({
  start: String(start),
  end: String(end),
  active
});

export const normalizeBibleSelection = (selection, maxVerseNumber) => {
  const startFallback = clampVerse(selection?.end, maxVerseNumber, 1);
  const endFallback = clampVerse(selection?.start, maxVerseNumber, 1);
  const start = clampVerse(selection?.start, maxVerseNumber, startFallback);
  const end = clampVerse(selection?.end, maxVerseNumber, endFallback);
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
    active: Boolean(selection?.active)
  };
};

export const updateBibleSelectionDraft = (selection, field, value) => {
  if (!['start', 'end'].includes(field) || !/^\d*$/.test(value)) return selection;
  return { ...selection, [field]: value, active: true };
};

export const commitBibleSelectionField = (selection, field, maxVerseNumber) => {
  const normalized = normalizeBibleSelection(selection, maxVerseNumber);
  const editedValue = clampVerse(selection?.[field], maxVerseNumber, field === 'start' ? normalized.start : normalized.end);
  const otherField = field === 'start' ? 'end' : 'start';
  const otherValue = clampVerse(selection?.[otherField], maxVerseNumber, editedValue);
  const start = field === 'start' ? editedValue : Math.min(otherValue, editedValue);
  const end = field === 'end' ? editedValue : Math.max(otherValue, editedValue);
  return createBibleSelection(start, end, true);
};

export const selectBibleVerse = (selection, number, maxVerseNumber) => {
  const verse = clampVerse(number, maxVerseNumber, 1);
  const current = normalizeBibleSelection(selection, maxVerseNumber);
  if (!current.active) return createBibleSelection(verse, verse, true);
  if (current.start === current.end) {
    return createBibleSelection(Math.min(current.start, verse), Math.max(current.end, verse), true);
  }
  if (verse === current.start) return createBibleSelection(current.end, current.end, true);
  if (verse === current.end) return createBibleSelection(current.start, current.start, true);
  if (verse < current.start) return createBibleSelection(verse, current.end, true);
  if (verse > current.end) return createBibleSelection(current.start, verse, true);
  return createBibleSelection(current.start, verse, true);
};

export const getBibleVerseNumbers = (selection, maxVerseNumber) => {
  const range = normalizeBibleSelection(selection, maxVerseNumber);
  return Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index);
};

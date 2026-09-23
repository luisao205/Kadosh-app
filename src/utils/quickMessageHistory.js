export const QUICK_MESSAGE_HISTORY_LIMIT = 8;

export const createQuickMessageHistoryId = () => (
  globalThis.crypto?.randomUUID?.() || `quick-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

export const addQuickMessageHistoryEntry = (history = [], message, id = createQuickMessageHistoryId()) => [
  { ...message, id },
  ...history.filter((item) => item.content !== message.content)
].slice(0, QUICK_MESSAGE_HISTORY_LIMIT);

export const replaceQuickMessageHistoryEntry = (history = [], entryId, message) => (
  history.map((item) => item.id === entryId ? { ...message, id: entryId } : item)
);

export const removeQuickMessageHistoryEntry = (history = [], entryId) => (
  history.filter((item) => item.id !== entryId)
);

export const clearQuickMessageHistory = () => [];

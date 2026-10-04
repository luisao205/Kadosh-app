import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const projectQuickMessageCallable = httpsCallable(functions, 'projectQuickMessage');
const clearQuickMessageProjectionCallable = httpsCallable(functions, 'clearQuickMessageProjection');
const updateQuickMessageHistoryCallable = httpsCallable(functions, 'updateQuickMessageHistory');

export const projectQuickMessage = async ({ eventoId, presentationType, segments, historyEntryId = null, targets = null }) => {
  const payload = { eventoId, presentationType, segments };
  if (historyEntryId) payload.historyEntryId = historyEntryId;
  if (targets) payload.targets = targets;
  const result = await projectQuickMessageCallable(payload);
  return result.data;
};

export const clearQuickMessageProjection = async ({ eventoId, projectionActionId }) => {
  const result = await clearQuickMessageProjectionCallable({ eventoId, projectionActionId });
  return result.data;
};

export const updateQuickMessageHistory = async ({ eventoId, operation, entryId = null }) => {
  const payload = { eventoId, operation };
  if (operation === 'remove') payload.entryId = entryId;
  const result = await updateQuickMessageHistoryCallable(payload);
  return result.data;
};

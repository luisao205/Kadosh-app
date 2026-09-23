import { normalizeRole } from './rolePermissions';
import { PERMISSIONS, hasPermission, isOwnerUser } from './permissions.js';

export const MEDIA_LIBRARY_ACTIONS = Object.freeze({
  ACCESS: 'access',
  SELECT_FOR_PREACHING: 'select_for_preaching',
  SYNC: 'sync',
  ADD: 'add',
  EDIT: 'edit',
  REUSE: 'reuse',
  DELETE_FOREVER: 'delete_forever',
  TRASH: 'trash',
  DEPENDENCIES: 'dependencies',
  ADMINISTRATION: 'administration'
});

export const isMediaLibraryOwner = isOwnerUser;

export const canAccessMediaLibrary = (user = {}) => hasPermission(user, PERMISSIONS.MULTIMEDIA_LIBRARY_VIEW);

export const canSelectSharedMediaForPreaching = (user = {}, preaching = {}) => {
  const role = normalizeRole(user?.rol || user?.role);
  if (canAccessMediaLibrary(user)) return true;
  return role === 'pastor'
    && preaching?.preacherType === 'user'
    && preaching?.preacherId === user?.uid;
};

export const canPerformMediaLibraryAction = (user = {}, action, context = {}) => {
  if (action === MEDIA_LIBRARY_ACTIONS.SELECT_FOR_PREACHING) {
    return canSelectSharedMediaForPreaching(user, context.preaching);
  }

  if (!canAccessMediaLibrary(user)) return false;

  if (action === MEDIA_LIBRARY_ACTIONS.SYNC) return isMediaLibraryOwner(user);
  if (action === MEDIA_LIBRARY_ACTIONS.ADD) return hasPermission(user, PERMISSIONS.MULTIMEDIA_UPLOAD);
  if (action === MEDIA_LIBRARY_ACTIONS.EDIT) return hasPermission(user, PERMISSIONS.MULTIMEDIA_EDIT);
  if ([MEDIA_LIBRARY_ACTIONS.DELETE_FOREVER, MEDIA_LIBRARY_ACTIONS.TRASH].includes(action)) return hasPermission(user, PERMISSIONS.MULTIMEDIA_DELETE);
  return canAccessMediaLibrary(user);
};

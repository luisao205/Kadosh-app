import { normalizeRole } from './rolePermissions';

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

export const isMediaLibraryOwner = (user = {}) => {
  const role = normalizeRole(user?.rol || user?.role);
  return role === 'dueno' || role === 'dueño';
};

export const canAccessMediaLibrary = (user = {}) => {
  const role = normalizeRole(user?.rol || user?.role);
  return isMediaLibraryOwner(user) || role === 'admin' || role === 'multimedia';
};

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

  if (action === MEDIA_LIBRARY_ACTIONS.SYNC) {
    return isMediaLibraryOwner(user);
  }

  return true;
};

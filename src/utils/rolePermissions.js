import { normalizeRole } from './rolePermissionsBase.js';
import { PERMISSIONS, hasAnyPermission, hasPermission, isOwnerUser } from './permissions.js';

export { normalizeRole };

export const isOwner = isOwnerUser;

export const isAdmin = (user = {}) => normalizeRole(user?.rol || user?.role) === 'admin';

export const isMultimedia = (user = {}) => normalizeRole(user?.rol || user?.role) === 'multimedia';

export const isMusician = (user = {}) => normalizeRole(user?.rol || user?.role) === 'musico';

export const isPreacher = (user = {}) => normalizeRole(user?.rol || user?.role) === 'predicador';

export const isPastor = (user = {}) => normalizeRole(user?.rol || user?.role) === 'pastor';

export const isPreacherLegacy = (user = {}) => isPreacher(user);

export const hasAnyRole = (user = {}, roles = []) => {
  const role = normalizeRole(user?.rol || user?.role);
  return roles.map(normalizeRole).includes(role);
};

export const canManageTeam = (user = {}) => isOwner(user);

export const canManageSongs = (user = {}) => hasAnyPermission(user, [
  PERMISSIONS.SONGS_CREATE,
  PERMISSIONS.SONGS_EDIT_LYRICS,
  PERMISSIONS.SONGS_EDIT_CHORDS,
  PERMISSIONS.SONGS_EDIT_METADATA
]);

export const canAccessMultimediaTools = (user = {}) => hasPermission(user, PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS);

export const canAccessController = (user = {}) => hasAnyPermission(user, [
  PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS,
  PERMISSIONS.MULTIMEDIA_PROJECT,
  PERMISSIONS.BIBLE_PROJECT,
  PERMISSIONS.SERMONS_PROJECT
]);
export const canManageAnnouncements = (user = {}) => hasAnyPermission(user, [
  PERMISSIONS.ANNOUNCEMENTS_VIEW,
  PERMISSIONS.ANNOUNCEMENTS_CREATE,
  PERMISSIONS.ANNOUNCEMENTS_EDIT,
  PERMISSIONS.ANNOUNCEMENTS_DELETE,
  PERMISSIONS.ANNOUNCEMENTS_PROJECT
]);

export const canViewEventsAndSetlists = (user = {}) => hasAnyPermission(user, [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.SETLISTS_VIEW]);

export const canAccessPreachings = (user = {}) => hasPermission(user, PERMISSIONS.SERMONS_VIEW);

export const canManageAnyPreaching = (user = {}) => hasAnyPermission(user, [PERMISSIONS.SERMONS_CREATE, PERMISSIONS.SERMONS_EDIT]);

export const canCreatePreaching = (user = {}) => hasPermission(user, PERMISSIONS.SERMONS_CREATE);

export const canUsePreachingMedia = (user = {}, preaching = {}) => {
  if (canManageAnyPreaching(user)) return true;
  return isPastor(user)
    && preaching?.preacherType === 'user'
    && preaching?.preacherId === user?.uid;
};

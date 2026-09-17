export const normalizeRole = (role = '') => String(role)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

export const isOwner = (user = {}) => normalizeRole(user?.rol || user?.role) === 'dueno';

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

export const canManageSongs = (user = {}) => isOwner(user) || isAdmin(user) || isMultimedia(user);

export const canAccessMultimediaTools = (user = {}) => isOwner(user) || isAdmin(user) || isMultimedia(user);

export const canAccessController = (user = {}) => canAccessMultimediaTools(user);
export const canManageAnnouncements = (user = {}) => isOwner(user);

export const canViewEventsAndSetlists = (user = {}) => hasAnyRole(user, [
  'dueño',
  'dueno',
  'admin',
  'multimedia',
  'musico',
  'predicador',
  'pastor'
]);

export const canAccessPreachings = (user = {}) => hasAnyRole(user, [
  'dueño',
  'dueno',
  'admin',
  'multimedia',
  'predicador',
  'pastor'
]);

export const canManageAnyPreaching = (user = {}) => isOwner(user) || isMultimedia(user);

export const canCreatePreaching = (user = {}) => isOwner(user) || isMultimedia(user) || isPastor(user);

export const canUsePreachingMedia = (user = {}, preaching = {}) => {
  if (canManageAnyPreaching(user)) return true;
  return isPastor(user)
    && preaching?.preacherType === 'user'
    && preaching?.preacherId === user?.uid;
};

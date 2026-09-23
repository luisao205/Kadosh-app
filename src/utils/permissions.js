import { normalizeRole } from './rolePermissionsBase.js';

export const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: 'dashboard.view', EVENTS_VIEW: 'events.view', EVENTS_CREATE: 'events.create', EVENTS_EDIT: 'events.edit', EVENTS_DELETE: 'events.delete',
  SETLISTS_VIEW: 'setlists.view', SETLISTS_ADD_SONG: 'setlists.addSong', SETLISTS_REMOVE_SONG: 'setlists.removeSong', SETLISTS_REORDER: 'setlists.reorder', SETLISTS_CONTROL: 'setlists.control', SETLISTS_MANAGE: 'setlists.manage',
  SONGS_VIEW: 'songs.view', SONGS_CREATE: 'songs.create', SONGS_EDIT_LYRICS: 'songs.editLyrics', SONGS_EDIT_CHORDS: 'songs.editChords', SONGS_EDIT_METADATA: 'songs.editMetadata', SONGS_MANAGE_MEDIA: 'songs.manageMedia', SONGS_ARCHIVE: 'songs.archive', SONGS_DELETE: 'songs.delete',
  REHEARSAL_ACCESS: 'rehearsal.access', REHEARSAL_CONTROL: 'rehearsal.control', BIBLE_VIEW: 'bible.view', BIBLE_PROJECT: 'bible.project', BIBLE_QUICK_PROJECTION: 'bible.quickProjection',
  SERMONS_VIEW: 'sermons.view', SERMONS_CREATE: 'sermons.create', SERMONS_EDIT: 'sermons.edit', SERMONS_DELETE: 'sermons.delete', SERMONS_PROJECT: 'sermons.project',
  MULTIMEDIA_LIBRARY_VIEW: 'multimedia.libraryView', MULTIMEDIA_UPLOAD: 'multimedia.upload', MULTIMEDIA_EDIT: 'multimedia.edit', MULTIMEDIA_DELETE: 'multimedia.delete', MULTIMEDIA_CENTRAL_ACCESS: 'multimedia.centralAccess', MULTIMEDIA_CONTROL_OUTPUTS: 'multimedia.controlOutputs', MULTIMEDIA_PROJECT: 'multimedia.project',
  ANNOUNCEMENTS_VIEW: 'announcements.view', ANNOUNCEMENTS_CREATE: 'announcements.create', ANNOUNCEMENTS_EDIT: 'announcements.edit', ANNOUNCEMENTS_DELETE: 'announcements.delete', ANNOUNCEMENTS_PROJECT: 'announcements.project',
  TEAM_VIEW: 'team.view', TEAM_EDIT: 'team.edit', TEAM_MANAGE_ROLES: 'team.manageRoles', TEAM_MANAGE_PERMISSIONS: 'team.managePermissions',
  DEVOTIONALS_VIEW: 'devotionals.view', DEVOTIONALS_MANAGE: 'devotionals.manage', DEVOTIONALS_CONFIRM: 'devotionals.confirm', PROFILE_EDIT_OWN: 'profile.editOwn'
});

export const PERMISSION_GROUPS = Object.freeze([
  { id: 'dashboard', label: 'Dashboard', permissions: [PERMISSIONS.DASHBOARD_VIEW] },
  { id: 'events', label: 'Eventos y Setlists', permissions: [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_EDIT, PERMISSIONS.EVENTS_DELETE, PERMISSIONS.SETLISTS_VIEW, PERMISSIONS.SETLISTS_ADD_SONG, PERMISSIONS.SETLISTS_REMOVE_SONG, PERMISSIONS.SETLISTS_REORDER, PERMISSIONS.SETLISTS_CONTROL, PERMISSIONS.SETLISTS_MANAGE] },
  { id: 'songs', label: 'Canciones', permissions: [PERMISSIONS.SONGS_VIEW, PERMISSIONS.SONGS_CREATE, PERMISSIONS.SONGS_EDIT_LYRICS, PERMISSIONS.SONGS_EDIT_CHORDS, PERMISSIONS.SONGS_EDIT_METADATA, PERMISSIONS.SONGS_MANAGE_MEDIA, PERMISSIONS.SONGS_ARCHIVE, PERMISSIONS.SONGS_DELETE] },
  { id: 'rehearsal', label: 'Ensayo', permissions: [PERMISSIONS.REHEARSAL_ACCESS, PERMISSIONS.REHEARSAL_CONTROL] },
  { id: 'bible', label: 'Biblia', permissions: [PERMISSIONS.BIBLE_VIEW, PERMISSIONS.BIBLE_PROJECT, PERMISSIONS.BIBLE_QUICK_PROJECTION] },
  { id: 'sermons', label: 'Prédicas', permissions: [PERMISSIONS.SERMONS_VIEW, PERMISSIONS.SERMONS_CREATE, PERMISSIONS.SERMONS_EDIT, PERMISSIONS.SERMONS_DELETE, PERMISSIONS.SERMONS_PROJECT] },
  { id: 'multimedia', label: 'Multimedia', permissions: [PERMISSIONS.MULTIMEDIA_LIBRARY_VIEW, PERMISSIONS.MULTIMEDIA_UPLOAD, PERMISSIONS.MULTIMEDIA_EDIT, PERMISSIONS.MULTIMEDIA_DELETE, PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS, PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS, PERMISSIONS.MULTIMEDIA_PROJECT] },
  { id: 'announcements', label: 'Anuncios', permissions: [PERMISSIONS.ANNOUNCEMENTS_VIEW, PERMISSIONS.ANNOUNCEMENTS_CREATE, PERMISSIONS.ANNOUNCEMENTS_EDIT, PERMISSIONS.ANNOUNCEMENTS_DELETE, PERMISSIONS.ANNOUNCEMENTS_PROJECT] },
  { id: 'team', label: 'Administración de equipo', permissions: [PERMISSIONS.TEAM_VIEW, PERMISSIONS.TEAM_EDIT, PERMISSIONS.TEAM_MANAGE_ROLES, PERMISSIONS.TEAM_MANAGE_PERMISSIONS] },
  { id: 'devotionals', label: 'Devocionales (reservado)', reserved: true, permissions: [PERMISSIONS.DEVOTIONALS_VIEW, PERMISSIONS.DEVOTIONALS_MANAGE, PERMISSIONS.DEVOTIONALS_CONFIRM] },
  { id: 'profile', label: 'Perfil', permissions: [PERMISSIONS.PROFILE_EDIT_OWN] }
]);

const labels = Object.fromEntries(PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => [permission, permission])));
Object.assign(labels, {
  'dashboard.view': 'Ver dashboard', 'events.view': 'Ver eventos', 'events.create': 'Crear eventos', 'events.edit': 'Editar eventos', 'events.delete': 'Eliminar eventos', 'setlists.view': 'Ver setlists', 'setlists.addSong': 'Agregar canción al setlist', 'setlists.removeSong': 'Quitar canción del setlist', 'setlists.reorder': 'Reordenar setlist', 'setlists.control': 'Controlar setlist', 'setlists.manage': 'Gestionar setlist', 'songs.view': 'Ver canciones', 'songs.create': 'Crear canciones', 'songs.editLyrics': 'Editar letras', 'songs.editChords': 'Editar acordes', 'songs.editMetadata': 'Editar datos de canciones', 'songs.delete': 'Eliminar canciones', 'rehearsal.access': 'Acceder a ensayo', 'rehearsal.control': 'Controlar ensayo', 'bible.view': 'Ver Biblia', 'bible.project': 'Proyectar Biblia', 'bible.quickProjection': 'Proyección rápida (reservado)', 'sermons.view': 'Ver prédicas', 'sermons.create': 'Crear prédicas', 'sermons.edit': 'Editar prédicas', 'sermons.delete': 'Eliminar prédicas', 'sermons.project': 'Proyectar prédicas', 'multimedia.libraryView': 'Ver Biblioteca Multimedia', 'multimedia.upload': 'Subir multimedia', 'multimedia.edit': 'Editar multimedia', 'multimedia.delete': 'Eliminar multimedia', 'multimedia.centralAccess': 'Acceder a Central Multimedia', 'multimedia.controlOutputs': 'Controlar salidas', 'multimedia.project': 'Proyectar multimedia', 'announcements.view': 'Ver anuncios', 'announcements.create': 'Crear anuncios', 'announcements.edit': 'Editar anuncios', 'announcements.delete': 'Eliminar anuncios', 'announcements.project': 'Proyectar anuncios', 'team.view': 'Ver equipo', 'team.edit': 'Editar integrantes', 'team.manageRoles': 'Gestionar roles', 'team.managePermissions': 'Gestionar permisos', 'devotionals.view': 'Ver devocionales', 'devotionals.manage': 'Gestionar devocionales', 'devotionals.confirm': 'Confirmar devocionales', 'profile.editOwn': 'Editar perfil propio'
});
Object.assign(labels, {
  'songs.manageMedia': 'Gestionar archivos de canciones',
  'songs.archive': 'Archivar y restaurar canciones'
});
export const permissionLabel = (permission) => labels[permission] || permission;
export const ROLE_KEYS = Object.freeze(['dueno', 'admin', 'multimedia', 'musico', 'cantante', 'pastor', 'predicador']);
const allow = (...permissions) => Object.fromEntries(permissions.map((permission) => [permission, true]));
const sharedViewer = [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SONGS_VIEW, PERMISSIONS.REHEARSAL_ACCESS, PERMISSIONS.BIBLE_VIEW, PERMISSIONS.PROFILE_EDIT_OWN];
export const ROLE_PERMISSION_DEFAULTS = Object.freeze({
  dueno: {},
  admin: allow(...sharedViewer, PERMISSIONS.EVENTS_VIEW, PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_EDIT, PERMISSIONS.EVENTS_DELETE, PERMISSIONS.SETLISTS_VIEW, PERMISSIONS.SETLISTS_ADD_SONG, PERMISSIONS.SETLISTS_REMOVE_SONG, PERMISSIONS.SETLISTS_REORDER, PERMISSIONS.SETLISTS_CONTROL, PERMISSIONS.SETLISTS_MANAGE, PERMISSIONS.SONGS_CREATE, PERMISSIONS.SONGS_EDIT_LYRICS, PERMISSIONS.SONGS_EDIT_CHORDS, PERMISSIONS.SONGS_EDIT_METADATA, PERMISSIONS.SONGS_MANAGE_MEDIA, PERMISSIONS.SONGS_ARCHIVE, PERMISSIONS.SONGS_DELETE, PERMISSIONS.REHEARSAL_CONTROL, PERMISSIONS.BIBLE_PROJECT, PERMISSIONS.SERMONS_VIEW, PERMISSIONS.MULTIMEDIA_LIBRARY_VIEW, PERMISSIONS.MULTIMEDIA_UPLOAD, PERMISSIONS.MULTIMEDIA_EDIT, PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS, PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS, PERMISSIONS.MULTIMEDIA_PROJECT),
  multimedia: allow(...sharedViewer, PERMISSIONS.EVENTS_VIEW, PERMISSIONS.SETLISTS_VIEW, PERMISSIONS.SETLISTS_ADD_SONG, PERMISSIONS.SETLISTS_REMOVE_SONG, PERMISSIONS.SETLISTS_REORDER, PERMISSIONS.SETLISTS_CONTROL, PERMISSIONS.SETLISTS_MANAGE, PERMISSIONS.SONGS_CREATE, PERMISSIONS.SONGS_EDIT_LYRICS, PERMISSIONS.SONGS_EDIT_CHORDS, PERMISSIONS.SONGS_EDIT_METADATA, PERMISSIONS.SONGS_MANAGE_MEDIA, PERMISSIONS.SONGS_ARCHIVE, PERMISSIONS.REHEARSAL_CONTROL, PERMISSIONS.BIBLE_PROJECT, PERMISSIONS.SERMONS_VIEW, PERMISSIONS.SERMONS_CREATE, PERMISSIONS.SERMONS_EDIT, PERMISSIONS.SERMONS_PROJECT, PERMISSIONS.MULTIMEDIA_LIBRARY_VIEW, PERMISSIONS.MULTIMEDIA_UPLOAD, PERMISSIONS.MULTIMEDIA_EDIT, PERMISSIONS.MULTIMEDIA_CENTRAL_ACCESS, PERMISSIONS.MULTIMEDIA_CONTROL_OUTPUTS, PERMISSIONS.MULTIMEDIA_PROJECT),
  musico: allow(...sharedViewer, PERMISSIONS.EVENTS_VIEW, PERMISSIONS.SETLISTS_VIEW), cantante: allow(...sharedViewer),
  pastor: allow(...sharedViewer, PERMISSIONS.EVENTS_VIEW, PERMISSIONS.SETLISTS_VIEW, PERMISSIONS.BIBLE_PROJECT, PERMISSIONS.SERMONS_VIEW, PERMISSIONS.SERMONS_CREATE, PERMISSIONS.SERMONS_EDIT, PERMISSIONS.SERMONS_PROJECT),
  predicador: allow(...sharedViewer, PERMISSIONS.EVENTS_VIEW, PERMISSIONS.SETLISTS_VIEW, PERMISSIONS.SERMONS_VIEW)
});
export const isOwnerUser = (user = {}) => normalizeRole(user?.rol || user?.role) === 'dueno';
export const getRoleKey = (userOrRole = {}) => normalizeRole(typeof userOrRole === 'string' ? userOrRole : userOrRole?.rol || userOrRole?.role);
export const getRoleDefaults = (role, configuredDefaults = {}) => ({ ...(ROLE_PERMISSION_DEFAULTS[getRoleKey(role)] || {}), ...(configuredDefaults?.[getRoleKey(role)] || {}) });
export const getPermissionOverride = (user = {}, permission) => typeof user?.permissionOverrides?.[permission] === 'boolean' ? user.permissionOverrides[permission] : undefined;
export const hasPermission = (user = {}, permission) => {
  if (isOwnerUser(user)) return true;
  const override = getPermissionOverride(user, permission);
  return override === undefined
    ? getRoleDefaults(user, user?.permissionRoleDefaults)[permission] === true
    : override;
};
export const hasAnyPermission = (user, permissions = []) => permissions.some((permission) => hasPermission(user, permission));
export const hasAllPermissions = (user, permissions = []) => permissions.every((permission) => hasPermission(user, permission));
export const overrideCount = (user = {}) => Object.values(user?.permissionOverrides || {}).filter((value) => typeof value === 'boolean').length;
export const sanitizeOverrides = (overrides = {}) => Object.fromEntries(Object.entries(overrides).filter(([permission, value]) => Object.values(PERMISSIONS).includes(permission) && typeof value === 'boolean'));

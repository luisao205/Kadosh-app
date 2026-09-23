import { PERMISSIONS, hasAnyPermission, hasPermission } from './permissions.js';

export const canViewAnnouncements = (user = {}) => hasAnyPermission(user, [PERMISSIONS.ANNOUNCEMENTS_VIEW, PERMISSIONS.ANNOUNCEMENTS_PROJECT]);
export const canCreateAnnouncements = (user = {}) => hasPermission(user, PERMISSIONS.ANNOUNCEMENTS_CREATE);
export const canEditAnnouncements = (user = {}) => hasPermission(user, PERMISSIONS.ANNOUNCEMENTS_EDIT);
export const canDeleteAnnouncements = (user = {}) => hasPermission(user, PERMISSIONS.ANNOUNCEMENTS_DELETE);
export const canProjectAnnouncements = (user = {}) => hasPermission(user, PERMISSIONS.ANNOUNCEMENTS_PROJECT);
export const canManageAnnouncements = canViewAnnouncements;

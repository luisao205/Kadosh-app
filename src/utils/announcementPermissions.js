import { isOwner } from './rolePermissions.js';

export const canManageAnnouncements = (user = {}) => isOwner(user);
export const canDeleteAnnouncements = (user = {}) => isOwner(user);

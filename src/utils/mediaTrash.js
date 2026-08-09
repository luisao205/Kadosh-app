export const MEDIA_TRASH_RETENTION_DAYS = 30;

export const isMediaTrashed = (media = {}) => media.deleted === true || media.status === 'trashed';

export const toDateSafe = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') return value.toDate();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getTrashExpiration = (deletedAt) => {
  const deletedDate = toDateSafe(deletedAt);

  if (!deletedDate) {
    return {
      deletedDate: null,
      expiresAt: null,
      daysRemaining: null,
      isExpired: false
    };
  }

  const expiresAt = new Date(deletedDate.getTime() + MEDIA_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const msRemaining = expiresAt.getTime() - Date.now();

  return {
    deletedDate,
    expiresAt,
    daysRemaining: Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000))),
    isExpired: msRemaining <= 0
  };
};

export const getDeletedByLabel = (deletedBy = {}) => (
  deletedBy?.name || deletedBy?.nombre || deletedBy?.email || deletedBy?.uid || 'Usuario no registrado'
);

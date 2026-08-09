export const getMediaUsageCount = (media) => {
  if (!media || typeof media !== 'object') return 0;

  const usageCount = Number(media.usageCount);
  const countFromField = Number.isFinite(usageCount) ? Math.max(0, usageCount) : 0;
  const countFromList = Array.isArray(media.usedBy) ? media.usedBy.length : 0;

  return Math.max(countFromField, countFromList);
};

export const isMediaResourceInUse = (media) => getMediaUsageCount(media) > 0;

export const normalizeMediaUsage = (usage = {}, index = 0) => {
  const safeUsage = usage && typeof usage === 'object' ? usage : {};

  return {
    id: [
    safeUsage.type || safeUsage.entityType || 'song',
    safeUsage.songId || safeUsage.entityId || safeUsage.eventId || 'unknown',
    safeUsage.location || 'unknown',
    safeUsage.sectionKey || '',
    safeUsage.resourceId || '',
    index
  ].join('|'),
    type: safeUsage.type || safeUsage.entityType || (safeUsage.eventId ? 'event' : 'song'),
    songId: safeUsage.songId || null,
    eventId: safeUsage.eventId || null,
    entityId: safeUsage.entityId || safeUsage.songId || safeUsage.eventId || null,
    title: safeUsage.songTitle || safeUsage.entityTitle || safeUsage.eventTitle || safeUsage.title || '',
    location: safeUsage.location || '',
    sectionKey: safeUsage.sectionKey || '',
    sectionTitle: safeUsage.sectionTitle || '',
    resourceTitle: safeUsage.resourceTitle || '',
    instrument: safeUsage.instrument || '',
    raw: safeUsage
  };
};

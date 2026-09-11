export const createSetlistSongItem = (songId, prefix = 'song') => ({
  idLocal: `${prefix}_${songId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  type: 'song',
  value: songId
});

export const getEventSetlistItems = (event = {}) => {
  if (Array.isArray(event?.setlist)) {
    return event.setlist.map((item, index) => ({
      ...item,
      idLocal: item?.idLocal || item?.setlistItemId || `${item?.value || item?.songId || item?.id || 'item'}_${index}`,
      type: item?.type || 'song',
      value: item?.value || item?.songId || item?.id
    })).filter(item => item.value || item.type === 'note');
  }

  if (Array.isArray(event?.canciones)) {
    return event.canciones
      .map((item, index) => {
        const songId = typeof item === 'string' ? item : item?.id || item?.songId || item?.value;
        if (!songId) return null;
        return {
          idLocal: `legacy_${songId}_${index}`,
          type: 'song',
          value: songId
        };
      })
      .filter(Boolean);
  }

  return [];
};

export const getSetlistSongIds = (setlistItems = []) => (
  (setlistItems || [])
    .filter(item => item?.type === 'song')
    .map(item => item.value || item.songId || item.id)
    .filter(Boolean)
);

export const getEventSongIds = (event = {}) => getSetlistSongIds(getEventSetlistItems(event));

export const hasSongInSetlist = (eventOrItems = {}, songId) => {
  const items = Array.isArray(eventOrItems) ? eventOrItems : getEventSetlistItems(eventOrItems);
  return getSetlistSongIds(items).includes(songId);
};

export const appendSongToSetlist = (eventOrItems = {}, songId, options = {}) => {
  const items = Array.isArray(eventOrItems) ? eventOrItems : getEventSetlistItems(eventOrItems);
  return [...items, createSetlistSongItem(songId, options.prefix || 'song')];
};

export const buildEventSetlistUpdate = (setlistItems = []) => ({
  setlist: setlistItems,
  canciones: getSetlistSongIds(setlistItems)
});

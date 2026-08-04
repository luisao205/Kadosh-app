import {
  createMediaLibraryDocument,
  extractCloudinaryPublicId,
  extractFirebaseStoragePath,
  normalizeLegacyMediaResource
} from './mediaLibrary.js';

export const MEDIA_USAGE_LOCATIONS = Object.freeze({
  BACKGROUND: 'background',
  SECTION: 'section',
  RESOURCE: 'resource'
});

const normalizeUrlForKey = (url = '') => {
  const value = String(url).trim();
  if (!value) return '';

  try {
    const parsed = new URL(value);
    parsed.hash = '';

    const removableParams = ['token', 'alt', 'X-Goog-Signature', 'X-Goog-Credential', 'X-Goog-Date', 'X-Goog-Expires'];
    removableParams.forEach(param => parsed.searchParams.delete(param));

    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return value.replace(/\/$/, '').toLowerCase();
  }
};

export const getMediaIdentityKey = (resource = {}) => {
  if (resource.mediaId) return `mediaId:${resource.mediaId}`;

  const cloudinaryPublicId = resource.cloudinaryPublicId || resource.publicId || extractCloudinaryPublicId(resource.url);
  if (cloudinaryPublicId) return `cloudinary:${cloudinaryPublicId}`;

  const storagePath = resource.storagePath || extractFirebaseStoragePath(resource.url);
  if (storagePath) return `storage:${storagePath}`;

  const normalizedUrl = normalizeUrlForKey(resource.url);
  if (normalizedUrl) return `url:${normalizedUrl}`;

  return null;
};

const getSongTitle = (song = {}) => song.titulo || song.title || song.nombre || 'Cancion sin titulo';

const normalizeResourceForSync = (resource = {}, fallback = {}) => {
  const normalized = normalizeLegacyMediaResource({
    ...resource,
    title: resource.title || resource.name || resource.titulo || fallback.title,
    type: resource.type || resource.tipo || fallback.type,
    source: resource.source || fallback.source || 'legacy'
  });

  return {
    ...normalized,
    id: resource.id || resource.mediaId || normalized.mediaId || null,
    mediaId: resource.mediaId || normalized.mediaId || null,
    cloudinaryPublicId: resource.cloudinaryPublicId || resource.publicId || extractCloudinaryPublicId(normalized.url),
    storagePath: resource.storagePath || extractFirebaseStoragePath(normalized.url),
    category: resource.category || resource.categoria || fallback.category || '',
    tags: resource.tags || resource.etiquetas || fallback.tags || [],
    metadata: resource.metadata || {}
  };
};

const createUsage = (song, location, extra = {}) => ({
  songId: song.id || song.uid || null,
  songTitle: getSongTitle(song),
  location,
  ...extra
});

export const scanSongMediaResources = (song = {}) => {
  const found = [];

  if (song.fondoUrl) {
    found.push({
      resource: normalizeResourceForSync(
        { url: song.fondoUrl, title: `Fondo - ${getSongTitle(song)}` },
        { source: 'song_background', category: 'Fondos' }
      ),
      usage: createUsage(song, MEDIA_USAGE_LOCATIONS.BACKGROUND)
    });
  }

  if (Array.isArray(song.recursos)) {
    song.recursos.forEach((resource, index) => {
      if (!resource?.url) return;
      found.push({
        resource: normalizeResourceForSync(resource, {
          title: resource.titulo || resource.title || resource.name || `Recurso ${index + 1}`,
          source: 'song_resource',
          category: 'Recursos'
        }),
        usage: createUsage(song, MEDIA_USAGE_LOCATIONS.RESOURCE, {
          resourceId: resource.id || null,
          resourceTitle: resource.titulo || resource.title || resource.name || `Recurso ${index + 1}`,
          instrument: resource.instrumento || resource.instrument || null
        })
      });
    });
  }

  if (song.sectionMedia && typeof song.sectionMedia === 'object') {
    Object.entries(song.sectionMedia).forEach(([sectionKey, resources]) => {
      if (!Array.isArray(resources)) return;

      resources.forEach((resource, index) => {
        if (!resource?.url) return;
        found.push({
          resource: normalizeResourceForSync(resource, {
            title: resource.title || resource.name || `Multimedia de seccion ${index + 1}`,
            source: 'section_media',
            category: 'Secciones'
          }),
          usage: createUsage(song, MEDIA_USAGE_LOCATIONS.SECTION, {
            sectionKey,
            sectionTitle: resource.sectionTitle || sectionKey,
            resourceId: resource.id || null,
            resourceTitle: resource.title || resource.name || `Multimedia de seccion ${index + 1}`
          })
        });
      });
    });
  }

  return found;
};

const mergeUniqueUsage = (currentUsages, usage) => {
  const key = [
    usage.songId,
    usage.location,
    usage.sectionKey || '',
    usage.resourceId || '',
    usage.resourceTitle || ''
  ].join('|');

  if (currentUsages.some(item => [
    item.songId,
    item.location,
    item.sectionKey || '',
    item.resourceId || '',
    item.resourceTitle || ''
  ].join('|') === key)) {
    return currentUsages;
  }

  return [...currentUsages, usage];
};

export const buildMediaLibrarySyncPlan = (songs = [], options = {}) => {
  const now = options.now || Date.now();
  const grouped = new Map();
  const invalidResources = [];

  songs.forEach(song => {
    scanSongMediaResources(song).forEach(({ resource, usage }) => {
      const identityKey = getMediaIdentityKey(resource);
      if (!identityKey) {
        invalidResources.push({ songId: song.id || null, songTitle: getSongTitle(song), resource, usage });
        return;
      }

      const existing = grouped.get(identityKey);
      if (!existing) {
        const document = createMediaLibraryDocument({
          ...resource,
          source: resource.source || 'legacy',
          createdAt: null,
          lastUsedAt: null
        }, { now, userId: options.userId || null });

        grouped.set(identityKey, {
          identityKey,
          document: {
            ...document,
            usageCount: 1,
            usedBy: [usage],
            firstUsedAt: usage.usedAt || null,
            lastUsedAt: usage.usedAt || null
          },
          duplicateSources: [resource]
        });
        return;
      }

      const usedBy = mergeUniqueUsage(existing.document.usedBy || [], usage);
      const usedAtValues = usedBy.map(item => item.usedAt).filter(Boolean).sort();

      grouped.set(identityKey, {
        ...existing,
        document: {
          ...existing.document,
          usageCount: usedBy.length,
          usedBy,
          firstUsedAt: usedAtValues[0] || existing.document.firstUsedAt || null,
          lastUsedAt: usedAtValues[usedAtValues.length - 1] || existing.document.lastUsedAt || null,
          updatedAt: now
        },
        duplicateSources: [...existing.duplicateSources, resource]
      });
    });
  });

  const mediaDocuments = [...grouped.values()].map(item => item.document);
  const duplicates = [...grouped.values()]
    .filter(item => item.duplicateSources.length > 1)
    .map(item => ({
      identityKey: item.identityKey,
      count: item.duplicateSources.length,
      usedBy: item.document.usedBy
    }));

  return {
    generatedAt: now,
    mediaDocuments,
    duplicates,
    invalidResources,
    stats: {
      totalSongsScanned: songs.length,
      totalMediaDocuments: mediaDocuments.length,
      totalUsages: mediaDocuments.reduce((total, media) => total + (media.usageCount || 0), 0),
      duplicateGroups: duplicates.length,
      invalidResources: invalidResources.length
    }
  };
};

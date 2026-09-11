import {
  MEDIA_TYPES,
  createMediaReference,
  detectMediaProvider,
  detectMediaTypeFromUrl,
  normalizeLegacyMediaResource
} from './mediaLibrary';

const DEFAULT_BROKEN_REASON = 'missing_url';

const toArray = (value) => (Array.isArray(value) ? value : []);

const createLibraryIndex = (mediaLibraryItems = []) => {
  const index = new Map();

  toArray(mediaLibraryItems).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const ids = [item.id, item.mediaId].filter(Boolean);
    ids.forEach((id) => index.set(String(id), item));
  });

  return index;
};

const hasUsableUrl = (resource = {}) => Boolean(String(resource.url || '').trim());

const isConfirmedLibraryReference = (resource = {}) => (
  resource?.source === 'library'
  || resource?.source === 'mediaLibrary'
  || resource?.fromMediaLibrary === true
  || resource?.library === true
);

const getResourceMediaId = (resource = {}) => {
  if (resource?.mediaId) return resource.mediaId;
  if (resource?.id && isConfirmedLibraryReference(resource)) return resource.id;
  return null;
};

const getBrokenState = (resource = {}, reason = DEFAULT_BROKEN_REASON) => {
  const fallbackAvailable = hasUsableUrl(resource);

  if (!reason) {
    return {
      broken: false,
      severity: null,
      fallbackAvailable
    };
  }

  return {
    broken: true,
    severity: fallbackAvailable ? 'recoverable' : 'critical',
    fallbackAvailable
  };
};

const normalizeResolvedResource = (resource = {}, overrides = {}) => {
  const normalized = normalizeLegacyMediaResource({
    ...resource,
    ...overrides
  });
  const merged = {
    ...resource,
    ...normalized,
    ...overrides
  };
  const brokenReason = hasUsableUrl(merged) ? null : DEFAULT_BROKEN_REASON;
  const brokenState = getBrokenState(merged, brokenReason);

  return {
    ...merged,
    title: overrides.title || normalized.title || resource.title || resource.name || resource.titulo || 'Recurso multimedia',
    name: overrides.name || resource.name || overrides.title || normalized.title || resource.title || resource.titulo || 'Recurso multimedia',
    type: overrides.type || normalized.type || detectMediaTypeFromUrl(resource.url),
    provider: overrides.provider || normalized.provider || detectMediaProvider(resource.url),
    url: String(overrides.url || normalized.url || resource.url || '').trim(),
    thumbnailUrl: overrides.thumbnailUrl || normalized.thumbnailUrl || resource.thumbnailUrl || resource.thumbnail || '',
    source: overrides.source || normalized.source || resource.source || 'legacy',
    broken: brokenState.broken,
    brokenReason,
    severity: brokenState.severity,
    fallbackAvailable: brokenState.fallbackAvailable
  };
};

export const resolveMediaResource = (resource = {}, mediaLibraryItems = []) => {
  const libraryIndex = mediaLibraryItems instanceof Map
    ? mediaLibraryItems
    : createLibraryIndex(mediaLibraryItems);
  const mediaId = getResourceMediaId(resource);
  const libraryResource = mediaId ? libraryIndex.get(String(mediaId)) : null;

  if (libraryResource) {
    return normalizeResolvedResource(resource, {
      ...createMediaReference({
        ...libraryResource,
        id: libraryResource.id || libraryResource.mediaId || mediaId,
        mediaId: libraryResource.mediaId || libraryResource.id || mediaId
      }),
      id: resource.id || libraryResource.id || mediaId,
      mediaId: libraryResource.mediaId || libraryResource.id || mediaId,
      source: 'library',
      title: libraryResource.title || resource.title || resource.name || 'Recurso multimedia',
      name: libraryResource.title || resource.name || resource.title || 'Recurso multimedia',
      url: libraryResource.url || resource.url || '',
      thumbnailUrl: libraryResource.thumbnailUrl || resource.thumbnailUrl || '',
      provider: libraryResource.provider || resource.provider || detectMediaProvider(libraryResource.url || resource.url),
      type: libraryResource.type || resource.type || detectMediaTypeFromUrl(libraryResource.url || resource.url)
    });
  }

  const resolved = normalizeResolvedResource(resource, {
    mediaId,
    source: mediaId ? 'missing-library' : (resource?.source || 'legacy')
  });

  if (mediaId && !libraryResource) {
    const brokenState = getBrokenState(resolved, 'missing_library_document');
    return {
      ...resolved,
      broken: true,
      brokenReason: 'missing_library_document',
      severity: brokenState.severity,
      fallbackAvailable: brokenState.fallbackAvailable
    };
  }

  return resolved;
};

export const resolveMediaList = (resources = [], mediaLibraryItems = []) => {
  const libraryIndex = mediaLibraryItems instanceof Map
    ? mediaLibraryItems
    : createLibraryIndex(mediaLibraryItems);

  return toArray(resources)
    .map((resource) => resolveMediaResource(resource, libraryIndex))
    .filter((resource) => resource.url || resource.mediaId);
};

export const resolveSectionMedia = (sectionMedia = {}, mediaLibraryItems = []) => {
  const libraryIndex = createLibraryIndex(mediaLibraryItems);
  const safeSectionMedia = sectionMedia && typeof sectionMedia === 'object' ? sectionMedia : {};

  return Object.fromEntries(
    Object.entries(safeSectionMedia).map(([sectionKey, resources]) => [
      sectionKey,
      resolveMediaList(resources, libraryIndex)
    ])
  );
};

export const resolveSectionMediaForKey = (sectionMedia = {}, sectionKey = '', mediaLibraryItems = []) => {
  const resources = sectionMedia && typeof sectionMedia === 'object'
    ? sectionMedia[sectionKey]
    : [];
  return resolveMediaList(resources, mediaLibraryItems);
};

export const resolveSongBackground = (song = {}, mediaLibraryItems = []) => {
  const candidates = [
    song?.fondoMedia,
    song?.backgroundMedia,
    song?.fondoMediaId ? { mediaId: song.fondoMediaId, title: song.titulo ? `Fondo - ${song.titulo}` : 'Fondo de cancion' } : null,
    song?.backgroundMediaId ? { mediaId: song.backgroundMediaId, title: song.titulo ? `Fondo - ${song.titulo}` : 'Fondo de cancion' } : null,
    song?.fondoUrl ? {
      title: song.titulo ? `Fondo - ${song.titulo}` : 'Fondo de cancion',
      name: song.titulo ? `Fondo - ${song.titulo}` : 'Fondo de cancion',
      type: detectMediaTypeFromUrl(song.fondoUrl),
      url: song.fondoUrl,
      source: 'legacy-background',
      provider: detectMediaProvider(song.fondoUrl)
    } : null
  ].filter(Boolean);

  const resolved = candidates
    .map((candidate) => resolveMediaResource(candidate, mediaLibraryItems))
    .find((candidate) => candidate.url || candidate.mediaId);

  return resolved || null;
};

export const resolveSongResources = (song = {}, mediaLibraryItems = []) => (
  resolveMediaList(song?.recursos || [], mediaLibraryItems).map((resource) => ({
    ...resource,
    location: 'resource',
    instrument: resource.instrumento || resource.instrument || '',
    tipo: resource.tipo || resource.type
  }))
);

export const resolveSongAudio = (song = {}, mediaLibraryItems = []) => {
  const candidates = [
    song?.audioMedia,
    song?.audioMediaId ? { mediaId: song.audioMediaId, title: `Audio - ${song.titulo || 'Cancion'}`, type: MEDIA_TYPES.AUDIO } : null,
    song?.audioUrl ? {
      title: `Audio - ${song.titulo || 'Cancion'}`,
      name: `Audio - ${song.titulo || 'Cancion'}`,
      type: MEDIA_TYPES.AUDIO,
      url: song.audioUrl,
      source: 'legacy-audio',
      provider: detectMediaProvider(song.audioUrl)
    } : null
  ].filter(Boolean);

  return candidates
    .map((candidate) => resolveMediaResource(candidate, mediaLibraryItems))
    .find((candidate) => candidate.url || candidate.mediaId) || null;
};

export const findBrokenMediaReferences = ({
  song = {},
  sectionMedia = song?.sectionMedia,
  mediaLibraryItems = []
} = {}) => {
  const broken = [];
  const background = resolveSongBackground(song, mediaLibraryItems);
  const audio = resolveSongAudio(song, mediaLibraryItems);
  const resources = resolveSongResources(song, mediaLibraryItems);
  const sections = resolveSectionMedia(sectionMedia, mediaLibraryItems);

  if (background?.broken) broken.push({ location: 'background', resource: background });
  if (audio?.broken) broken.push({ location: 'audio', resource: audio });

  resources.forEach((resource) => {
    if (resource?.broken) broken.push({ location: 'resource', resource });
  });

  Object.entries(sections).forEach(([sectionKey, items]) => {
    items.forEach((resource) => {
      if (resource?.broken) {
        broken.push({
          location: 'section',
          sectionKey,
          sectionTitle: resource.sectionTitle || sectionKey,
          resource
        });
      }
    });
  });

  return broken;
};

export const resolveSongMedia = (song = {}, mediaLibraryItems = []) => ({
  background: resolveSongBackground(song, mediaLibraryItems),
  sectionMedia: resolveSectionMedia(song?.sectionMedia || {}, mediaLibraryItems),
  resources: resolveSongResources(song, mediaLibraryItems),
  audio: resolveSongAudio(song, mediaLibraryItems),
  brokenReferences: findBrokenMediaReferences({ song, mediaLibraryItems })
});

export const MEDIA_LIBRARY_COLLECTION = 'mediaLibrary';

export const MEDIA_TYPES = Object.freeze({
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  PDF: 'pdf',
  LINK: 'link'
});

export const MEDIA_PROVIDERS = Object.freeze({
  CLOUDINARY: 'cloudinary',
  FIREBASE_STORAGE: 'firebase_storage',
  URL: 'url',
  UNKNOWN: 'unknown'
});

export const MEDIA_STATUS = Object.freeze({
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  PENDING_DELETE: 'pending_delete',
  DELETED: 'deleted'
});

const SUPPORTED_MEDIA_TYPES = new Set(Object.values(MEDIA_TYPES));
const SUPPORTED_PROVIDERS = new Set(Object.values(MEDIA_PROVIDERS));
const SUPPORTED_STATUSES = new Set(Object.values(MEDIA_STATUS));

export const normalizeMediaText = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

export const normalizeMediaTags = (tags = []) => {
  if (!Array.isArray(tags)) return [];
  const normalized = tags
    .map(tag => normalizeMediaText(tag))
    .filter(Boolean);
  return [...new Set(normalized)];
};

export const detectMediaTypeFromUrl = (url = '') => {
  const cleanUrl = String(url).split('?')[0].toLowerCase();

  if (/\.(mp4|webm|mov|m4v|avi)$/.test(cleanUrl) || cleanUrl.includes('/video/upload/')) {
    return MEDIA_TYPES.VIDEO;
  }

  if (/\.(mp3|wav|m4a|aac|ogg)$/.test(cleanUrl)) {
    return MEDIA_TYPES.AUDIO;
  }

  if (/\.pdf$/.test(cleanUrl)) {
    return MEDIA_TYPES.PDF;
  }

  if (/\.(jpg|jpeg|png|gif|webp|avif|svg)$/.test(cleanUrl) || cleanUrl.includes('/image/upload/')) {
    return MEDIA_TYPES.IMAGE;
  }

  return MEDIA_TYPES.LINK;
};

export const detectMediaProvider = (url = '') => {
  const value = String(url).toLowerCase();

  if (value.includes('res.cloudinary.com')) return MEDIA_PROVIDERS.CLOUDINARY;
  if (value.includes('firebasestorage.googleapis.com')) return MEDIA_PROVIDERS.FIREBASE_STORAGE;
  if (value.startsWith('http://') || value.startsWith('https://')) return MEDIA_PROVIDERS.URL;

  return MEDIA_PROVIDERS.UNKNOWN;
};

export const extractCloudinaryPublicId = (url = '') => {
  const value = String(url);
  const marker = '/upload/';
  const uploadIndex = value.indexOf(marker);
  if (uploadIndex === -1) return null;

  const afterUpload = value.slice(uploadIndex + marker.length).split('?')[0];
  const withoutTransforms = afterUpload.replace(/^v\d+\//, '');
  return withoutTransforms.replace(/\.[a-z0-9]+$/i, '') || null;
};

export const extractFirebaseStoragePath = (url = '') => {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/o\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
};

export const createMediaLibraryDocument = (resource = {}, meta = {}) => {
  const url = String(resource.url || '').trim();
  const type = SUPPORTED_MEDIA_TYPES.has(resource.type) ? resource.type : detectMediaTypeFromUrl(url);
  const provider = SUPPORTED_PROVIDERS.has(resource.provider) ? resource.provider : detectMediaProvider(url);
  const title = String(resource.title || resource.name || resource.titulo || 'Recurso multimedia').trim();
  const tags = normalizeMediaTags(resource.tags || resource.etiquetas || []);
  const category = String(resource.category || resource.categoria || '').trim();
  const status = SUPPORTED_STATUSES.has(resource.status) ? resource.status : MEDIA_STATUS.ACTIVE;

  return {
    version: 1,
    title,
    normalizedTitle: normalizeMediaText(title),
    type,
    url,
    thumbnailUrl: resource.thumbnailUrl || resource.thumbnail || '',
    provider,
    source: resource.source || 'library',
    folder: resource.folder || '',
    category,
    normalizedCategory: normalizeMediaText(category),
    tags,
    favoriteBy: Array.isArray(resource.favoriteBy) ? resource.favoriteBy : [],
    usageCount: Number.isFinite(resource.usageCount) ? resource.usageCount : 0,
    lastUsedAt: resource.lastUsedAt || null,
    createdAt: resource.createdAt || meta.now || Date.now(),
    createdBy: resource.createdBy || meta.userId || null,
    updatedAt: meta.now || Date.now(),
    deletedAt: resource.deletedAt || null,
    status,
    cloudinaryPublicId: resource.cloudinaryPublicId || resource.publicId || extractCloudinaryPublicId(url),
    cloudinaryResourceType: resource.cloudinaryResourceType || (provider === MEDIA_PROVIDERS.CLOUDINARY ? type : null),
    storagePath: resource.storagePath || extractFirebaseStoragePath(url),
    metadata: {
      ...(resource.metadata || {}),
      width: resource.metadata?.width || resource.width || null,
      height: resource.metadata?.height || resource.height || null,
      duration: resource.metadata?.duration || resource.duration || null,
      size: resource.metadata?.size || resource.size || null,
      mimeType: resource.metadata?.mimeType || resource.mimeType || resource.mime || null,
      fps: resource.metadata?.fps || resource.fps || null,
      bitrate: resource.metadata?.bitrate || resource.bitrate || null,
      thumbnail: resource.metadata?.thumbnail || resource.thumbnail || resource.thumbnailUrl || null
    }
  };
};

export const validateMediaLibraryDocument = (media = {}) => {
  const errors = [];

  if (!String(media.title || '').trim()) errors.push('title_required');
  if (!String(media.url || '').trim()) errors.push('url_required');
  if (!SUPPORTED_MEDIA_TYPES.has(media.type)) errors.push('invalid_type');
  if (!SUPPORTED_PROVIDERS.has(media.provider)) errors.push('invalid_provider');
  if (!SUPPORTED_STATUSES.has(media.status)) errors.push('invalid_status');

  return {
    valid: errors.length === 0,
    errors
  };
};

export const createMediaReference = (media = {}) => ({
  mediaId: media.id || media.mediaId || null,
  title: media.title || media.name || 'Recurso multimedia',
  type: SUPPORTED_MEDIA_TYPES.has(media.type) ? media.type : detectMediaTypeFromUrl(media.url),
  url: media.url || '',
  source: media.mediaId || media.id ? 'library' : (media.source || 'url'),
  thumbnailUrl: media.thumbnailUrl || '',
  provider: SUPPORTED_PROVIDERS.has(media.provider) ? media.provider : detectMediaProvider(media.url)
});

export const normalizeLegacyMediaResource = (resource = {}) => {
  const url = String(resource.url || '').trim();
  return createMediaReference({
    mediaId: resource.mediaId || null,
    title: resource.title || resource.name || resource.titulo || 'Recurso multimedia',
    type: resource.type || resource.tipo || detectMediaTypeFromUrl(url),
    url,
    source: resource.source || (resource.mediaId ? 'library' : 'legacy'),
    thumbnailUrl: resource.thumbnailUrl || resource.thumbnail || '',
    provider: resource.provider || detectMediaProvider(url)
  });
};

import { uploadToCloudinary } from './cloudinaryUpload.js';
import { MEDIA_PROVIDERS, MEDIA_TYPES } from './mediaLibrary.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']);

export const validateMediaLibraryFile = (file) => {
  if (!file) throw new Error('media_file_required');
  const mimeType = String(file.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(mimeType) && !ALLOWED_VIDEO_TYPES.has(mimeType)) {
    throw new Error('media_file_type_not_allowed');
  }
  return ALLOWED_VIDEO_TYPES.has(mimeType) ? MEDIA_TYPES.VIDEO : MEDIA_TYPES.IMAGE;
};

export const uploadMediaLibraryFile = async (file, options = {}) => {
  const type = validateMediaLibraryFile(file);
  const upload = options.upload || uploadToCloudinary;
  const register = options.register || (await import('./mediaLibraryFirestoreSync.js')).createOrReuseMediaLibraryResource;
  const folder = options.folder || 'general';
  const uploaded = await upload(file, `kadosh/${folder}`);
  const resource = {
    title: options.title || file.name,
    originalName: file.name,
    type,
    url: uploaded.url,
    thumbnailUrl: uploaded.thumbnailUrl || (type === MEDIA_TYPES.IMAGE ? uploaded.url : ''),
    provider: MEDIA_PROVIDERS.CLOUDINARY,
    source: 'library',
    folder,
    category: options.category || '',
    cloudinaryPublicId: uploaded.publicId,
    cloudinaryResourceType: uploaded.type,
    metadata: {
      size: uploaded.bytes || file.size || null,
      width: uploaded.width,
      height: uploaded.height,
      duration: uploaded.duration,
      mimeType: file.type || null,
      sourceContext: options.sourceContext || 'library',
      preachingId: options.preachingId || null,
      preachingTitle: options.preachingTitle || null
    }
  };
  const result = await register(resource, { userId: options.userId || null });
  return { ...result, mediaId: result.id, media: { ...result.media, mediaId: result.id } };
};

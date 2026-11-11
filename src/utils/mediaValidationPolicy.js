export const MEBIBYTE = 1024 * 1024;

export const MEDIA_VALIDATION_VERSION = 1;

export const MEDIA_VALIDATION_STATUS = Object.freeze({
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  REQUIRES_INSPECTION: 'requires-inspection',
  LEGACY_UNVERIFIED: 'legacy-unverified',
});

export const MEDIA_RESOURCE_TYPES = Object.freeze({
  IMAGE_BACKGROUND: 'image-background',
  ANIMATED_BACKGROUND: 'animated-background',
  FOREGROUND_VIDEO: 'foreground-video',
  THUMBNAIL: 'thumbnail',
});

const IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const VIDEO_MIME_TYPES = Object.freeze(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']);

export const MEDIA_VALIDATION_POLICIES = Object.freeze({
  [MEDIA_RESOURCE_TYPES.IMAGE_BACKGROUND]: Object.freeze({
    allowedMimeTypes: Object.freeze([...IMAGE_MIME_TYPES, 'image/gif']),
    allowedExtensions: Object.freeze(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif']),
    maxBytes: 15 * MEBIBYTE,
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    maxWidth: 4096,
    maxHeight: 4096,
    requiresDuration: false,
    requiresCodec: false,
  }),
  [MEDIA_RESOURCE_TYPES.ANIMATED_BACKGROUND]: Object.freeze({
    allowedMimeTypes: VIDEO_MIME_TYPES,
    allowedExtensions: Object.freeze(['mp4', 'webm', 'mov', 'm4v']),
    maxBytes: 100 * MEBIBYTE,
    durationWarningSeconds: 90,
    maxDurationSeconds: 5 * 60,
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    maxWidth: 3840,
    maxHeight: 2160,
    targetBitrate: 8_000_000,
    maxFps: 60,
    requiresDuration: true,
    requiresResolution: true,
    requiresCodec: true,
  }),
  [MEDIA_RESOURCE_TYPES.FOREGROUND_VIDEO]: Object.freeze({
    allowedMimeTypes: VIDEO_MIME_TYPES,
    allowedExtensions: Object.freeze(['mp4', 'webm', 'mov', 'm4v']),
    maxBytes: 500 * MEBIBYTE,
    maxDurationSeconds: 2 * 60 * 60,
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    maxWidth: 3840,
    maxHeight: 2160,
    targetBitrate: 12_000_000,
    maxFps: 60,
    requiresDuration: true,
    requiresResolution: true,
    requiresCodec: true,
  }),
  [MEDIA_RESOURCE_TYPES.THUMBNAIL]: Object.freeze({
    allowedMimeTypes: IMAGE_MIME_TYPES,
    allowedExtensions: Object.freeze(['jpg', 'jpeg', 'png', 'webp', 'avif']),
    maxBytes: 2 * MEBIBYTE,
    recommendedWidth: 1280,
    recommendedHeight: 720,
    maxWidth: 1920,
    maxHeight: 1080,
    requiresDuration: false,
    requiresCodec: false,
  }),
});

export const VERIFIED_BROWSER_VIDEO_CODECS = Object.freeze([
  'h264', 'avc1', 'vp8', 'vp9', 'av1',
]);

export const getMediaValidationPolicy = (resourceType) => MEDIA_VALIDATION_POLICIES[resourceType] || null;

import {
  MEDIA_RESOURCE_TYPES,
  MEDIA_VALIDATION_STATUS,
  MEDIA_VALIDATION_VERSION,
  VERIFIED_BROWSER_VIDEO_CODECS,
  getMediaValidationPolicy,
} from './mediaValidationPolicy.js';

const SIGNATURES = Object.freeze([
  { kind: 'jpeg', mimeTypes: ['image/jpeg'], extensions: ['jpg', 'jpeg'], matches: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { kind: 'png', mimeTypes: ['image/png'], extensions: ['png'], matches: bytes => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value) },
  { kind: 'gif', mimeTypes: ['image/gif'], extensions: ['gif'], matches: bytes => String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a' || String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a' },
  { kind: 'webp', mimeTypes: ['image/webp'], extensions: ['webp'], matches: bytes => String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' },
  { kind: 'avif', mimeTypes: ['image/avif'], extensions: ['avif'], matches: bytes => String.fromCharCode(...bytes.slice(4, 12)).includes('ftypavif') },
  { kind: 'mp4', mimeTypes: ['video/mp4', 'video/quicktime', 'video/x-m4v'], extensions: ['mp4', 'mov', 'm4v'], matches: bytes => String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp' },
  { kind: 'webm', mimeTypes: ['video/webm'], extensions: ['webm'], matches: bytes => [0x1a, 0x45, 0xdf, 0xa3].every((value, index) => bytes[index] === value) },
]);

const normalize = value => String(value || '').trim().toLowerCase();
const getExtension = name => normalize(name).split(/[?#]/)[0].split('.').pop() || '';
const finitePositive = value => Number.isFinite(value) && value > 0;
const addUnique = (items, value) => { if (!items.includes(value)) items.push(value); };

export const inspectMediaSignature = (input) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  if (bytes.length < 4) return { recognized: false, kind: null, mimeTypes: [], extensions: [] };
  const signature = SIGNATURES.find(candidate => candidate.matches(bytes));
  return signature
    ? { recognized: true, kind: signature.kind, mimeTypes: [...signature.mimeTypes], extensions: [...signature.extensions] }
    : { recognized: false, kind: null, mimeTypes: [], extensions: [] };
};

export const validateExternalMediaUrl = (value, { legacy = false, maxLength = 2048 } = {}) => {
  const errors = [];
  const warnings = [];
  const raw = String(value || '').trim();
  if (legacy) {
    return { version: MEDIA_VALIDATION_VERSION, status: MEDIA_VALIDATION_STATUS.LEGACY_UNVERIFIED, errors, warnings: ['legacy_url_not_revalidated'], normalizedUrl: raw };
  }
  if (!raw) errors.push('url_required');
  if (raw.length > maxLength) errors.push('url_too_long');
  let parsed = null;
  try { parsed = new URL(raw); } catch { errors.push('url_malformed'); }
  if (parsed) {
    if (parsed.protocol !== 'https:') errors.push('url_https_required');
    if (parsed.username || parsed.password) errors.push('url_credentials_forbidden');
    if (parsed.hash) warnings.push('url_fragment_present');
    const signedKeys = ['token', 'signature', 'x-goog-signature', 'x-amz-signature', 'expires'];
    if ([...parsed.searchParams.keys()].some(key => signedKeys.includes(key.toLowerCase()))) warnings.push('url_may_be_temporary');
  }
  return {
    version: MEDIA_VALIDATION_VERSION,
    status: errors.length ? MEDIA_VALIDATION_STATUS.REJECTED : MEDIA_VALIDATION_STATUS.ACCEPTED,
    errors,
    warnings,
    normalizedUrl: parsed?.toString() || raw,
  };
};

export const validateMediaCandidate = ({ resourceType, file = {}, metadata = {}, legacy = false } = {}) => {
  const policy = getMediaValidationPolicy(resourceType);
  const errors = [];
  const warnings = [];
  const inspections = [];
  const declaredMime = normalize(file.type || metadata.mimeType);
  const extension = getExtension(file.name || metadata.fileName);
  const signature = inspectMediaSignature(file.bytes || metadata.bytes);

  if (legacy) {
    return {
      version: MEDIA_VALIDATION_VERSION,
      resourceType,
      status: MEDIA_VALIDATION_STATUS.LEGACY_UNVERIFIED,
      errors,
      warnings: ['legacy_resource_not_blocked'],
      inspections,
      declaredMime,
      extension,
      signature,
    };
  }
  if (!policy) errors.push('resource_type_invalid');
  if (policy && !policy.allowedMimeTypes.includes(declaredMime)) errors.push('mime_not_allowed');
  if (policy && !policy.allowedExtensions.includes(extension)) errors.push('extension_not_allowed');
  if (!signature.recognized) errors.push('signature_unrecognized');
  if (signature.recognized && declaredMime && !signature.mimeTypes.includes(declaredMime)) errors.push('mime_signature_mismatch');
  if (signature.recognized && extension && !signature.extensions.includes(extension)) errors.push('extension_signature_mismatch');

  const size = Number(file.size ?? metadata.size);
  if (!Number.isFinite(size) || size < 0) errors.push('size_invalid');
  else if (policy && size > policy.maxBytes) errors.push('size_exceeded');

  const duration = Number(metadata.duration);
  if (policy?.requiresDuration && !finitePositive(duration)) addUnique(inspections, 'duration_requires_provider_inspection');
  if (finitePositive(duration) && policy?.maxDurationSeconds && duration > policy.maxDurationSeconds) errors.push('duration_exceeded');
  if (finitePositive(duration) && policy?.durationWarningSeconds && duration > policy.durationWarningSeconds) warnings.push('duration_above_recommended');

  const width = Number(metadata.width);
  const height = Number(metadata.height);
  if (policy?.requiresResolution && (!finitePositive(width) || !finitePositive(height))) addUnique(inspections, 'resolution_requires_provider_inspection');
  if (finitePositive(width) && finitePositive(height) && policy) {
    if (width > policy.maxWidth || height > policy.maxHeight) errors.push('resolution_exceeded');
    else if (width > policy.recommendedWidth || height > policy.recommendedHeight) {
      warnings.push('optimized_variant_recommended');
      if (metadata.optimizedVariantAvailable !== true) addUnique(inspections, 'optimized_variant_requires_provider_inspection');
    }
  }

  const bitrate = Number(metadata.bitrate);
  if (finitePositive(bitrate) && policy?.targetBitrate && bitrate > policy.targetBitrate) warnings.push('bitrate_above_target');
  const fps = Number(metadata.fps);
  if (finitePositive(fps) && policy?.maxFps && fps > policy.maxFps) warnings.push('fps_above_recommended');

  const codec = normalize(metadata.codec);
  if (policy?.requiresCodec && !codec) addUnique(inspections, 'codec_requires_provider_inspection');
  if (codec && !VERIFIED_BROWSER_VIDEO_CODECS.some(candidate => codec.includes(candidate))) addUnique(inspections, 'codec_compatibility_unverified');

  const status = errors.length
    ? MEDIA_VALIDATION_STATUS.REJECTED
    : inspections.length
      ? MEDIA_VALIDATION_STATUS.REQUIRES_INSPECTION
      : MEDIA_VALIDATION_STATUS.ACCEPTED;

  return {
    version: MEDIA_VALIDATION_VERSION,
    resourceType,
    status,
    errors,
    warnings,
    inspections,
    declaredMime,
    extension,
    signature,
    observed: { size, duration: finitePositive(duration) ? duration : null, width: finitePositive(width) ? width : null, height: finitePositive(height) ? height : null, fps: finitePositive(fps) ? fps : null, bitrate: finitePositive(bitrate) ? bitrate : null, codec: codec || null },
  };
};

export const MEDIA_VALIDATION_CAPABILITIES = Object.freeze({
  clientValidationAuthorizesUpload: false,
  performsNetworkRequests: false,
  inspectsCompleteFileContent: false,
  supportedResourceTypes: Object.freeze(Object.values(MEDIA_RESOURCE_TYPES)),
});

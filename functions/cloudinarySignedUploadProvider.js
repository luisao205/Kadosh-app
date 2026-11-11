/* global Buffer, module, require */
const { createHash, timingSafeEqual } = require('crypto');

const SIGNATURE_ALGORITHMS = new Set(['sha1', 'sha256']);
const FOLDER_MODES = new Set(['legacy-fixed', 'dynamic']);
const CLOUDINARY_RESOURCE_TYPES = Object.freeze({
  'image-background': 'image',
  thumbnail: 'image',
  'animated-background': 'video',
  'foreground-video': 'video',
});
const ALLOWED_FORMATS = Object.freeze({
  'image-background': Object.freeze(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']),
  thumbnail: Object.freeze(['jpg', 'jpeg', 'png', 'webp', 'avif']),
  'animated-background': Object.freeze(['mp4', 'webm', 'mov', 'm4v']),
  'foreground-video': Object.freeze(['mp4', 'webm', 'mov', 'm4v']),
});
const MIME_BY_FORMAT = Object.freeze({
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v',
});

class CloudinaryProviderError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CloudinaryProviderError';
    this.code = code;
  }
}

const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const canonicalValue = value => Array.isArray(value) ? value.join(',') : String(value);
const canonicalizeParameters = (parameters) => Object.entries(parameters)
  .filter(([, value]) => value !== undefined && value !== null && value !== '')
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${key}=${canonicalValue(value)}`)
  .join('&');

const signParameters = ({ parameters, apiSecret, algorithm = 'sha256' }) => {
  if (!SIGNATURE_ALGORITHMS.has(algorithm)) throw new CloudinaryProviderError('signature_algorithm_invalid');
  if (!nonEmpty(apiSecret)) throw new CloudinaryProviderError('api_secret_required');
  return createHash(algorithm).update(`${canonicalizeParameters(parameters)}${apiSecret}`).digest('hex');
};

const safeSignatureEqual = (left, right) => {
  if (!nonEmpty(left) || !nonEmpty(right)) return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length > 0 && leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyResponseSignature = ({ publicId, version, signature, apiSecret, algorithm = 'sha256' }) => {
  if (!nonEmpty(publicId) || !Number.isInteger(version) || version <= 0) return false;
  const expected = signParameters({ parameters: { public_id: publicId, version }, apiSecret, algorithm });
  return safeSignatureEqual(signature, expected);
};

const validateCloudinaryUrl = (secureUrl, cloudName) => {
  try {
    const parsed = new URL(secureUrl);
    return parsed.protocol === 'https:'
      && parsed.hostname === 'res.cloudinary.com'
      && parsed.pathname.split('/').filter(Boolean)[0] === cloudName;
  } catch {
    return false;
  }
};

const assertConfiguration = (configuration) => {
  if (!nonEmpty(configuration.cloudName) || !nonEmpty(configuration.apiKey) || !nonEmpty(configuration.apiSecret)) {
    throw new CloudinaryProviderError('provider_credentials_required');
  }
  if (!SIGNATURE_ALGORITHMS.has(configuration.signatureAlgorithm)) throw new CloudinaryProviderError('signature_algorithm_invalid');
  if (!FOLDER_MODES.has(configuration.folderMode)) throw new CloudinaryProviderError('folder_mode_required');
  if (typeof configuration.inspectResource !== 'function' && typeof configuration.adminInspector?.inspectResource !== 'function') {
    throw new CloudinaryProviderError('resource_inspector_required');
  }
};

const createCloudinarySignedUploadProvider = ({
  cloudName,
  apiKey,
  apiSecret,
  signedUploadPreset,
  folderMode,
  signatureAlgorithm = 'sha256',
  inspectResource,
  adminInspector,
  now = () => Date.now(),
}) => {
  const configuration = { cloudName, apiKey, apiSecret, signedUploadPreset, folderMode, signatureAlgorithm, inspectResource, adminInspector };
  assertConfiguration(configuration);

  const createAuthorization = async (request) => {
    const cloudinaryResourceType = CLOUDINARY_RESOURCE_TYPES[request.resourceType];
    if (!cloudinaryResourceType) throw new CloudinaryProviderError('resource_type_invalid');
    if (!nonEmpty(request.folder) || !nonEmpty(request.publicId) || request.publicId !== `${request.folder}/asset`) {
      throw new CloudinaryProviderError('upload_scope_invalid');
    }
    if (!Number.isFinite(request.issuedAt) || Math.abs(now() - request.issuedAt) > 30_000) throw new CloudinaryProviderError('authorization_clock_invalid');
    if (!Number.isFinite(request.expiresAt) || request.expiresAt <= request.issuedAt || request.expiresAt - request.issuedAt > 5 * 60 * 1000) {
      throw new CloudinaryProviderError('authorization_ttl_invalid');
    }

    const timestamp = Math.floor(request.issuedAt / 1000);
    const parameters = {
      allowed_formats: ALLOWED_FORMATS[request.resourceType],
      overwrite: false,
      public_id: folderMode === 'legacy-fixed' ? 'asset' : request.publicId,
      timestamp,
      unique_filename: false,
      use_filename: false,
      upload_preset: signedUploadPreset || undefined,
      ...(folderMode === 'legacy-fixed' ? { folder: request.folder } : { asset_folder: request.folder }),
    };
    const signature = signParameters({ parameters, apiSecret, algorithm: signatureAlgorithm });
    return {
      mode: 'cloudinary-signed',
      provider: 'cloudinary',
      cloudName,
      apiKey,
      resourceType: cloudinaryResourceType,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${cloudinaryResourceType}/upload`,
      timestamp,
      signature,
      signatureAlgorithm,
      parameters,
      signedParameterNames: Object.keys(parameters).filter(key => parameters[key] !== undefined).sort(),
      expiresAt: request.expiresAt,
      cloudinaryTimestampValiditySeconds: 3600,
    };
  };

  const validateUploadResponse = (response, expected) => {
    if (!response || response.public_id !== expected.publicId) throw new CloudinaryProviderError('response_public_id_mismatch');
    if (response.resource_type !== CLOUDINARY_RESOURCE_TYPES[expected.resourceType]) throw new CloudinaryProviderError('response_resource_type_mismatch');
    if (!nonEmpty(response.asset_id)) throw new CloudinaryProviderError('response_asset_id_invalid');
    if (!validateCloudinaryUrl(response.secure_url, cloudName)) throw new CloudinaryProviderError('response_url_invalid');
    if (!verifyResponseSignature({ publicId: response.public_id, version: response.version, signature: response.signature, apiSecret, algorithm: signatureAlgorithm })) {
      throw new CloudinaryProviderError('response_signature_invalid');
    }
    return { publicId: response.public_id, assetId: response.asset_id, resourceType: expected.resourceType };
  };

  const inspectTrustedResource = async (request) => {
    const cloudinaryResourceType = CLOUDINARY_RESOURCE_TYPES[request.resourceType];
    if (!cloudinaryResourceType || request.publicId !== `${request.folder}/asset`) throw new CloudinaryProviderError('inspection_scope_invalid');
    if (adminInspector) {
      return adminInspector.inspectResource({ ...request, deliveryType: 'upload' });
    }
    const raw = await inspectResource({
      ...request,
      publicId: request.publicId,
      resourceType: cloudinaryResourceType,
      deliveryType: 'upload',
    });
    if (!raw) return { exists: false };
    if (raw.public_id !== request.publicId) throw new CloudinaryProviderError('inspection_public_id_mismatch');
    if (raw.resource_type !== cloudinaryResourceType || raw.type !== 'upload') throw new CloudinaryProviderError('inspection_resource_type_mismatch');
    if (!nonEmpty(raw.asset_id)) throw new CloudinaryProviderError('inspection_asset_id_invalid');
    if (!validateCloudinaryUrl(raw.secure_url, cloudName)) throw new CloudinaryProviderError('inspection_url_invalid');
    if (!Number.isInteger(raw.bytes) || raw.bytes < 0 || !nonEmpty(raw.format)) throw new CloudinaryProviderError('inspection_metadata_invalid');
    const createdAt = Date.parse(raw.created_at);
    if (!Number.isFinite(createdAt) || createdAt < request.issuedAt - 1000) throw new CloudinaryProviderError('inspection_resource_stale');
    return {
      exists: true,
      provider: 'cloudinary',
      publicId: raw.public_id,
      folder: request.folder,
      resourceType: request.resourceType,
      assetId: raw.asset_id,
      secureUrl: raw.secure_url,
      verifiedAt: now(),
      metadata: {
        mimeType: MIME_BY_FORMAT[String(raw.format).toLowerCase()] || `${cloudinaryResourceType}/${String(raw.format).toLowerCase()}`,
        size: raw.bytes,
        width: raw.width,
        height: raw.height,
        duration: raw.duration,
        codec: raw.video?.codec || raw.codec,
        format: String(raw.format).toLowerCase(),
      },
    };
  };

  return {
    createAuthorization,
    inspectResource: inspectTrustedResource,
    validateUploadResponse,
  };
};

module.exports = {
  ALLOWED_FORMATS,
  CLOUDINARY_RESOURCE_TYPES,
  CloudinaryProviderError,
  canonicalizeParameters,
  createCloudinarySignedUploadProvider,
  signParameters,
  verifyResponseSignature,
};

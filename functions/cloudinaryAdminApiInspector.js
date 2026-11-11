/* global module */

const FOLDER_MODES = new Set(['legacy-fixed', 'dynamic']);
const TRANSIENT_STATUS = new Set([420, 429, 500, 502, 503, 504]);
const TRANSIENT_NETWORK_CODES = new Set(['ECONNABORTED', 'ECONNRESET', 'EAI_AGAIN', 'ENETUNREACH', 'ETIMEDOUT']);
const RESOURCE_TYPES = Object.freeze({
  'image-background': 'image',
  thumbnail: 'image',
  'animated-background': 'video',
  'foreground-video': 'video',
});
const MIME_BY_FORMAT = Object.freeze({
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v',
});

class CloudinaryInspectionError extends Error {
  constructor(code, { transient = false, status = null, retryAfterMs = null } = {}) {
    super(code);
    this.name = 'CloudinaryInspectionError';
    this.code = code;
    this.transient = transient;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const finitePositive = value => Number.isFinite(value) && value > 0;
const normalizeFormat = value => nonEmpty(value) ? value.trim().toLowerCase() : null;
const metadataField = (value, applicable = true) => ({
  status: !applicable ? 'not-applicable' : value === undefined || value === null || value === '' ? 'missing' : 'verified',
  ...(value !== undefined ? { value } : {}),
});

const classifyTransportError = (error) => {
  if (error instanceof CloudinaryInspectionError) return error;
  const status = Number(error?.status || error?.statusCode || error?.http_code) || null;
  const networkCode = error?.causeCode || error?.code;
  if (status === 404) return new CloudinaryInspectionError('resource_not_found', { status });
  if (status === 401 || status === 403) return new CloudinaryInspectionError('provider_authentication_failed', { status });
  if (status === 400) return new CloudinaryInspectionError('provider_bad_request', { status });
  if (status === 409) return new CloudinaryInspectionError('provider_conflict', { status });
  if (status === 420 || status === 429) return new CloudinaryInspectionError('provider_rate_limited', { transient: true, status, retryAfterMs: Number(error?.retryAfterMs) || null });
  if (TRANSIENT_STATUS.has(status)) return new CloudinaryInspectionError('provider_unavailable', { transient: true, status });
  if (TRANSIENT_NETWORK_CODES.has(networkCode) || error?.name === 'AbortError') {
    return new CloudinaryInspectionError('provider_timeout', { transient: true });
  }
  return new CloudinaryInspectionError('provider_request_failed', { status });
};

const validateConfiguration = ({ cloudName, folderMode, transport, deliveryHosts, retry }) => {
  if (!nonEmpty(cloudName)) throw new CloudinaryInspectionError('cloud_name_required');
  if (!FOLDER_MODES.has(folderMode)) throw new CloudinaryInspectionError('folder_mode_unverified');
  if (!transport || typeof transport.getByPublicId !== 'function' || typeof transport.getByAssetId !== 'function') {
    throw new CloudinaryInspectionError('admin_transport_required');
  }
  if (!Array.isArray(deliveryHosts) || deliveryHosts.length === 0 || deliveryHosts.some(host => !nonEmpty(host) || host.includes('/'))) {
    throw new CloudinaryInspectionError('delivery_hosts_invalid');
  }
  if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 1 || retry.maxAttempts > 4) throw new CloudinaryInspectionError('retry_policy_invalid');
};

const createCloudinaryAdminApiInspector = ({
  cloudName,
  folderMode,
  transport,
  deliveryHosts = ['res.cloudinary.com'],
  now = () => Date.now(),
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  retry = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 },
}) => {
  validateConfiguration({ cloudName, folderMode, transport, deliveryHosts, retry });
  const allowedHosts = new Set(deliveryHosts.map(host => host.toLowerCase()));

  const withRetry = async operation => {
    let lastError;
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (rawError) {
        const error = classifyTransportError(rawError);
        if (error.code === 'resource_not_found') return null;
        lastError = error;
        if (!error.transient || attempt === retry.maxAttempts) throw error;
        const suggestedDelay = error.retryAfterMs ?? retry.baseDelayMs * (2 ** (attempt - 1));
        await sleep(Math.max(0, Math.min(suggestedDelay, retry.maxDelayMs)));
      }
    }
    throw lastError;
  };

  const validateDeliveryUrl = (secureUrl, expected) => {
    let parsed;
    try { parsed = new URL(secureUrl); } catch { throw new CloudinaryInspectionError('secure_url_invalid'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !allowedHosts.has(parsed.hostname.toLowerCase())) {
      throw new CloudinaryInspectionError('secure_url_invalid');
    }
    if (parsed.hostname.toLowerCase() === 'res.cloudinary.com') {
      const path = parsed.pathname.split('/').filter(Boolean);
      if (path[0] !== cloudName || path[1] !== expected.cloudinaryResourceType || path[2] !== expected.deliveryType) {
        throw new CloudinaryInspectionError('secure_url_identity_mismatch');
      }
    }
  };

  const validateScope = request => {
    const cloudinaryResourceType = RESOURCE_TYPES[request.resourceType];
    if (!cloudinaryResourceType) throw new CloudinaryInspectionError('resource_type_invalid');
    if (!nonEmpty(request.uid) || !nonEmpty(request.operationId) || !nonEmpty(request.folder) || !nonEmpty(request.publicId)) {
      throw new CloudinaryInspectionError('inspection_scope_invalid');
    }
    const expectedFolder = `kadosh/uploads/${request.uid}/${request.operationId}`;
    if (request.folder !== expectedFolder || request.publicId !== `${expectedFolder}/asset`) {
      throw new CloudinaryInspectionError('inspection_scope_invalid');
    }
    if (!Number.isFinite(request.issuedAt) || !Number.isFinite(request.expiresAt) || request.expiresAt <= request.issuedAt) {
      throw new CloudinaryInspectionError('operation_time_invalid');
    }
    if (request.expiresAt <= now()) throw new CloudinaryInspectionError('operation_expired');
    return { ...request, cloudinaryResourceType, deliveryType: request.deliveryType || 'upload' };
  };

  const normalize = (raw, expected) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CloudinaryInspectionError('provider_response_malformed');
    if (nonEmpty(raw.cloud_name) && raw.cloud_name !== cloudName) throw new CloudinaryInspectionError('cloud_name_mismatch');
    if (!nonEmpty(raw.asset_id)) throw new CloudinaryInspectionError('asset_id_missing');
    if (expected.assetId && raw.asset_id !== expected.assetId) throw new CloudinaryInspectionError('asset_id_mismatch');
    if (raw.public_id !== expected.publicId) throw new CloudinaryInspectionError('public_id_mismatch');
    if (raw.resource_type !== expected.cloudinaryResourceType) throw new CloudinaryInspectionError('resource_type_mismatch');
    if (raw.type !== expected.deliveryType) throw new CloudinaryInspectionError('delivery_type_mismatch');

    if (folderMode === 'dynamic') {
      if (raw.asset_folder !== expected.folder) throw new CloudinaryInspectionError('asset_folder_mismatch');
    } else if (!raw.public_id.startsWith(`${expected.folder}/`)) {
      throw new CloudinaryInspectionError('fixed_folder_mismatch');
    }
    if (raw.status && !['active', 'approved'].includes(String(raw.status).toLowerCase())) {
      throw new CloudinaryInspectionError('resource_processing_pending', { transient: true });
    }
    validateDeliveryUrl(raw.secure_url, expected);

    const createdAt = Date.parse(raw.created_at);
    if (!Number.isFinite(createdAt)) throw new CloudinaryInspectionError('created_at_missing');
    if (createdAt < expected.issuedAt - 1000 || createdAt > now() + 60_000) throw new CloudinaryInspectionError('created_at_inconsistent');
    if (!Number.isInteger(raw.bytes) || raw.bytes < 0 || !nonEmpty(raw.format)) throw new CloudinaryInspectionError('provider_metadata_invalid');

    const isVideo = expected.cloudinaryResourceType === 'video';
    const format = normalizeFormat(raw.format);
    const codec = raw.video?.codec || raw.codec;
    const bitrate = raw.bit_rate ?? raw.bitrate;
    const duration = raw.duration;
    const width = raw.width;
    const height = raw.height;
    const fieldStatus = {
      bytes: metadataField(raw.bytes),
      format: metadataField(format),
      width: metadataField(width),
      height: metadataField(height),
      duration: metadataField(duration, isVideo),
      codec: metadataField(codec, isVideo),
      bitrate: metadataField(bitrate, isVideo),
      createdAt: metadataField(createdAt),
      secureUrl: metadataField(raw.secure_url),
    };
    if (isVideo && (!finitePositive(duration) || !nonEmpty(codec))) {
      throw new CloudinaryInspectionError('required_metadata_unavailable', { transient: true });
    }
    if ((width !== undefined && !finitePositive(width)) || (height !== undefined && !finitePositive(height))) {
      throw new CloudinaryInspectionError('provider_metadata_invalid');
    }

    return {
      exists: true,
      provider: 'cloudinary',
      publicId: raw.public_id,
      folder: expected.folder,
      resourceType: expected.resourceType,
      assetId: raw.asset_id,
      secureUrl: raw.secure_url,
      verifiedAt: now(),
      metadata: {
        mimeType: MIME_BY_FORMAT[format] || `${expected.cloudinaryResourceType}/${format}`,
        size: raw.bytes,
        width,
        height,
        duration: isVideo ? duration : undefined,
        codec: isVideo ? codec : undefined,
        bitrate: isVideo && finitePositive(bitrate) ? bitrate : undefined,
        format,
      },
      verification: {
        account: 'verified-by-configured-transport',
        identity: 'verified',
        folderMode,
        fields: fieldStatus,
      },
    };
  };

  const inspectResource = async request => {
    const expected = validateScope(request);
    const raw = await withRetry(() => expected.assetId
      ? transport.getByAssetId({ assetId: expected.assetId })
      : transport.getByPublicId({ publicId: expected.publicId, resourceType: expected.cloudinaryResourceType, deliveryType: expected.deliveryType }));
    return raw ? normalize(raw, expected) : { exists: false };
  };

  return Object.freeze({ inspectResource });
};

module.exports = {
  CloudinaryInspectionError,
  RESOURCE_TYPES,
  classifyTransportError,
  createCloudinaryAdminApiInspector,
};

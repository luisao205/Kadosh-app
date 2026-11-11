/* global Buffer, module */

class CloudinaryAdminTransportError extends Error {
  constructor(code, { status = null, retryAfterMs = null } = {}) {
    super(code);
    this.name = 'CloudinaryAdminTransportError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const normalizeHeaders = headers => Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
const parseRetryAfter = (value, now) => {
  if (value === undefined || value === null || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now()) : null;
};

const createCloudinaryAdminHttpTransport = ({
  cloudName,
  apiKey,
  apiSecret,
  request,
  timeoutMs = 5000,
  now = () => Date.now(),
}) => {
  if (!nonEmpty(cloudName) || !nonEmpty(apiKey) || !nonEmpty(apiSecret)) throw new CloudinaryAdminTransportError('provider_credentials_required');
  if (typeof request !== 'function') throw new CloudinaryAdminTransportError('http_request_adapter_required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 15_000) throw new CloudinaryAdminTransportError('http_timeout_invalid');

  const origin = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}`;
  const authorization = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;

  const execute = async path => {
    let response;
    try {
      response = await request({
        method: 'GET',
        url: `${origin}${path}`,
        headers: { accept: 'application/json', authorization },
        timeoutMs,
        redirect: 'error',
      });
    } catch (error) {
      if (error instanceof CloudinaryAdminTransportError) throw error;
      const wrapped = new CloudinaryAdminTransportError('admin_api_connection_failed');
      wrapped.causeCode = nonEmpty(error?.code) ? error.code : null;
      throw wrapped;
    }

    const status = Number(response?.status);
    const headers = normalizeHeaders(response?.headers);
    if (!Number.isInteger(status)) throw new CloudinaryAdminTransportError('admin_api_response_malformed');
    if (status !== 200) {
      throw new CloudinaryAdminTransportError('admin_api_http_error', {
        status,
        retryAfterMs: parseRetryAfter(headers['retry-after'], now),
      });
    }
    const body = response.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CloudinaryAdminTransportError('admin_api_response_malformed');
    return structuredClone(body);
  };

  const getByAssetId = ({ assetId }) => {
    if (!nonEmpty(assetId)) throw new CloudinaryAdminTransportError('asset_id_required');
    return execute(`/resources/${encodeURIComponent(assetId)}`);
  };

  const getByPublicId = ({ publicId, resourceType, deliveryType }) => {
    if (!nonEmpty(publicId) || !['image', 'video'].includes(resourceType) || !nonEmpty(deliveryType)) {
      throw new CloudinaryAdminTransportError('resource_identity_required');
    }
    return execute(`/resources/${encodeURIComponent(resourceType)}/${encodeURIComponent(deliveryType)}/${encodeURIComponent(publicId)}`);
  };

  return Object.freeze({ getByAssetId, getByPublicId });
};

module.exports = {
  CloudinaryAdminTransportError,
  createCloudinaryAdminHttpTransport,
  parseRetryAfter,
};

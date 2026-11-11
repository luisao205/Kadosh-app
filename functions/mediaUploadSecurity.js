/* global module, require */
const { createHash } = require('crypto');

const CONTRACT_VERSION = 1;
const AUTH_TTL_MS = 5 * 60 * 1000;
const OPERATION_ID = /^media_[a-z0-9][a-z0-9_-]{15,127}$/;
const AUTH_FIELDS = new Set(['operationId', 'resourceType', 'fileName', 'declaredMime', 'size']);
const FINALIZE_FIELDS = new Set(['operationId', 'provider', 'publicId']);

const POLICIES = Object.freeze({
  'image-background': Object.freeze({ maxBytes: 15 * 1024 * 1024, mimeTypes: Object.freeze(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']) }),
  'animated-background': Object.freeze({ maxBytes: 100 * 1024 * 1024, mimeTypes: Object.freeze(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']), maxDuration: 300, maxWidth: 3840, maxHeight: 2160 }),
  'foreground-video': Object.freeze({ maxBytes: 500 * 1024 * 1024, mimeTypes: Object.freeze(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']), maxDuration: 7200, maxWidth: 3840, maxHeight: 2160 }),
  thumbnail: Object.freeze({ maxBytes: 2 * 1024 * 1024, mimeTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/avif']), maxWidth: 1920, maxHeight: 1080 }),
});

class MediaUploadSecurityError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'MediaUploadSecurityError';
    this.code = code;
    this.details = details;
  }
}

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const assertExactFields = (value, fields) => {
  if (!isPlainObject(value)) throw new MediaUploadSecurityError('payload_invalid');
  if (Object.keys(value).some(key => !fields.has(key))) throw new MediaUploadSecurityError('unknown_fields');
};
const stableSerialize = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const fingerprint = value => createHash('sha256').update(stableSerialize(value)).digest('hex');
const activeAccount = value => value === undefined || value === 'active' || value === 'Activa';

const validateAuthorizationPayload = (data) => {
  assertExactFields(data, AUTH_FIELDS);
  if (!OPERATION_ID.test(String(data.operationId || ''))) throw new MediaUploadSecurityError('operation_id_invalid');
  const policy = POLICIES[data.resourceType];
  if (!policy) throw new MediaUploadSecurityError('resource_type_invalid');
  if (typeof data.fileName !== 'string' || !data.fileName.trim() || data.fileName.length > 255) throw new MediaUploadSecurityError('file_name_invalid');
  const declaredMime = String(data.declaredMime || '').trim().toLowerCase();
  if (!policy.mimeTypes.includes(declaredMime)) throw new MediaUploadSecurityError('mime_not_allowed');
  if (!Number.isInteger(data.size) || data.size < 0 || data.size > policy.maxBytes) throw new MediaUploadSecurityError('size_not_allowed');
  return { operationId: data.operationId, resourceType: data.resourceType, fileName: data.fileName.trim(), declaredMime, size: data.size };
};

const validateProviderResource = (resource, operation) => {
  if (!isPlainObject(resource) || resource.exists !== true) throw new MediaUploadSecurityError('provider_resource_missing');
  if (resource.provider !== 'cloudinary') throw new MediaUploadSecurityError('provider_mismatch');
  if (resource.publicId !== operation.expectedPublicId) throw new MediaUploadSecurityError('public_id_mismatch');
  if (resource.folder !== operation.folder) throw new MediaUploadSecurityError('provider_folder_mismatch');
  if (resource.resourceType !== operation.resourceType) throw new MediaUploadSecurityError('resource_type_mismatch');
  if (typeof resource.assetId !== 'string' || !resource.assetId.trim()) throw new MediaUploadSecurityError('provider_asset_id_invalid');
  if (!Number.isFinite(resource.verifiedAt) || resource.verifiedAt < operation.issuedAt) throw new MediaUploadSecurityError('provider_result_stale');
  if (!isPlainObject(resource.metadata)) throw new MediaUploadSecurityError('provider_metadata_invalid');
  const policy = POLICIES[operation.resourceType];
  const metadata = resource.metadata;
  if (!policy.mimeTypes.includes(String(metadata.mimeType || '').toLowerCase())) throw new MediaUploadSecurityError('provider_mime_invalid');
  if (String(metadata.mimeType || '').toLowerCase() !== operation.request.declaredMime) throw new MediaUploadSecurityError('provider_mime_mismatch');
  if (!Number.isInteger(metadata.size) || metadata.size < 0 || metadata.size > policy.maxBytes) throw new MediaUploadSecurityError('provider_size_invalid');
  if (metadata.size !== operation.request.size) throw new MediaUploadSecurityError('provider_size_mismatch');
  if (policy.maxDuration && (!Number.isFinite(metadata.duration) || metadata.duration <= 0 || metadata.duration > policy.maxDuration)) throw new MediaUploadSecurityError('provider_duration_invalid');
  if (policy.maxWidth && (!Number.isFinite(metadata.width) || !Number.isFinite(metadata.height) || metadata.width <= 0 || metadata.height <= 0 || metadata.width > policy.maxWidth || metadata.height > policy.maxHeight)) throw new MediaUploadSecurityError('provider_resolution_invalid');
  if (operation.resourceType.includes('video') || operation.resourceType === 'animated-background') {
    if (typeof metadata.codec !== 'string' || !metadata.codec.trim()) throw new MediaUploadSecurityError('provider_codec_unverified');
  }
  if (typeof resource.secureUrl !== 'string' || !resource.secureUrl.startsWith('https://res.cloudinary.com/')) throw new MediaUploadSecurityError('provider_url_invalid');
  return { ...resource, metadata: { ...metadata } };
};

const createMediaUploadSecurityService = ({ repository, provider, loadActor, now = () => Date.now() }) => {
  if (!repository?.runTransaction || !provider?.createAuthorization || !provider?.inspectResource || typeof loadActor !== 'function') {
    throw new Error('media_upload_security_dependencies_required');
  }

  const requireAuthorizedActor = async (uid, transaction) => {
    const actor = transaction?.getActorAuthorization
      ? await transaction.getActorAuthorization(uid)
      : await loadActor(uid);
    if (!actor || !activeAccount(actor.accountStatus)) throw new MediaUploadSecurityError('account_inactive');
    if (!Array.isArray(actor.permissions) || !actor.permissions.includes('multimedia.upload')) throw new MediaUploadSecurityError('permission_denied');
    return actor;
  };

  const authorizeUpload = async ({ auth, data }) => {
    if (!auth?.uid) throw new MediaUploadSecurityError('unauthenticated');
    const request = validateAuthorizationPayload(data);

    const issuedAt = now();
    const expiresAt = issuedAt + AUTH_TTL_MS;
    const requestFingerprint = fingerprint(request);
    const folder = `kadosh/uploads/${auth.uid}/${request.operationId}`;
    const expectedPublicId = `${folder}/asset`;
    const operation = await repository.runTransaction(async transaction => {
      await requireAuthorizedActor(auth.uid, transaction);
      const existing = await transaction.getOperation(request.operationId);
      if (existing) {
        if (existing.uid !== auth.uid) throw new MediaUploadSecurityError('operation_owned_by_another_user');
        if (existing.requestFingerprint !== requestFingerprint) throw new MediaUploadSecurityError('operation_payload_conflict');
        if (existing.status === 'active') return { ...existing, idempotent: true };
        if (existing.status === 'pending' && existing.expiresAt > issuedAt) return { ...existing, idempotent: true };
      }
      const next = {
        version: CONTRACT_VERSION,
        operationId: request.operationId,
        uid: auth.uid,
        status: 'pending',
        provider: 'cloudinary',
        resourceType: request.resourceType,
        request,
        requestFingerprint,
        folder,
        expectedPublicId,
        issuedAt,
        expiresAt,
        attempts: (existing?.attempts || 0) + 1,
        lastError: null,
      };
      await transaction.setOperation(request.operationId, next);
      await transaction.appendAudit({ operationId: request.operationId, uid: auth.uid, action: existing ? 'authorization_retried' : 'authorization_created', at: issuedAt });
      return { ...next, idempotent: false };
    });

    if (operation.status === 'active') return { operationId: operation.operationId, status: 'active', idempotent: true, resourceId: operation.resourceId };
    const providerAuthorization = await provider.createAuthorization({ operationId: operation.operationId, uid: operation.uid, folder: operation.folder, publicId: operation.expectedPublicId, resourceType: operation.resourceType, issuedAt: operation.issuedAt, expiresAt: operation.expiresAt });
    return { operationId: operation.operationId, status: operation.status, expiresAt: operation.expiresAt, folder: operation.folder, publicId: operation.expectedPublicId, provider: operation.provider, providerAuthorization, idempotent: operation.idempotent };
  };

  const finalizeUpload = async ({ auth, data }) => {
    if (!auth?.uid) throw new MediaUploadSecurityError('unauthenticated');
    assertExactFields(data, FINALIZE_FIELDS);
    if (!OPERATION_ID.test(String(data.operationId || ''))) throw new MediaUploadSecurityError('operation_id_invalid');
    if (data.provider !== 'cloudinary') throw new MediaUploadSecurityError('provider_mismatch');

    const operation = await repository.runTransaction(async transaction => {
      await requireAuthorizedActor(auth.uid, transaction);
      const current = await transaction.getOperation(data.operationId);
      if (!current) throw new MediaUploadSecurityError('operation_not_found');
      if (current.uid !== auth.uid) throw new MediaUploadSecurityError('operation_owned_by_another_user');
      if (data.publicId !== current.expectedPublicId) throw new MediaUploadSecurityError('public_id_mismatch');
      if (current.status === 'active') return current;
      if (current.status !== 'pending') throw new MediaUploadSecurityError('operation_not_pending');
      if (current.expiresAt <= now()) throw new MediaUploadSecurityError('operation_expired');
      return current;
    });
    if (operation.status === 'active') return { operationId: operation.operationId, status: 'active', resourceId: operation.resourceId, idempotent: true };

    const providerResult = validateProviderResource(await provider.inspectResource({
      provider: 'cloudinary',
      operationId: operation.operationId,
      uid: operation.uid,
      publicId: operation.expectedPublicId,
      folder: operation.folder,
      resourceType: operation.resourceType,
      issuedAt: operation.issuedAt,
      expiresAt: operation.expiresAt,
    }), operation);
    return repository.runTransaction(async transaction => {
      await requireAuthorizedActor(auth.uid, transaction);
      const current = await transaction.getOperation(operation.operationId);
      if (!current) throw new MediaUploadSecurityError('operation_not_found');
      if (current.uid !== auth.uid) throw new MediaUploadSecurityError('operation_owned_by_another_user');
      if (current.status === 'active') {
        if (current.providerFingerprint !== fingerprint(providerResult)) throw new MediaUploadSecurityError('finalization_conflict');
        return { operationId: current.operationId, status: 'active', resourceId: current.resourceId, idempotent: true };
      }
      if (current.status !== 'pending' || current.expiresAt <= now()) throw new MediaUploadSecurityError('operation_not_finalizable');
      const resourceId = `media_${createHash('sha256').update(`${current.uid}:${current.operationId}`).digest('hex').slice(0, 24)}`;
      const resource = {
        version: CONTRACT_VERSION,
        id: resourceId,
        status: 'active',
        provider: 'cloudinary',
        type: current.resourceType,
        url: providerResult.secureUrl,
        cloudinaryPublicId: providerResult.publicId,
        cloudinaryAssetId: providerResult.assetId,
        metadata: providerResult.metadata,
        createdBy: current.uid,
        createdAt: now(),
        uploadOperationId: current.operationId,
      };
      await transaction.createResource(resourceId, resource);
      await transaction.setOperation(current.operationId, { ...current, status: 'active', resourceId, completedAt: now(), providerFingerprint: fingerprint(providerResult), lastError: null });
      await transaction.appendAudit({ operationId: current.operationId, uid: current.uid, action: 'upload_finalized', resourceId, at: now() });
      return { operationId: current.operationId, status: 'active', resourceId, idempotent: false };
    });
  };

  return { authorizeUpload, finalizeUpload };
};

module.exports = {
  AUTH_TTL_MS,
  CONTRACT_VERSION,
  MediaUploadSecurityError,
  POLICIES,
  createMediaUploadSecurityService,
  stableSerialize,
  validateAuthorizationPayload,
  validateProviderResource,
};

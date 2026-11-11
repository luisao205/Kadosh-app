import { MEDIA_RESOURCE_TYPES, MEDIA_VALIDATION_VERSION, getMediaValidationPolicy } from './mediaValidationPolicy.js';

const OPERATION_ID_PATTERN = /^media_[a-z0-9][a-z0-9_-]{15,127}$/;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const AUTHORIZATION_KEYS = Object.freeze(['operationId', 'resourceType', 'fileName', 'declaredMime', 'size']);
const FINALIZATION_KEYS = Object.freeze(['operationId', 'provider', 'publicId', 'resourceType', 'url', 'metadata']);

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unknownKeys = (value, allowed) => Object.keys(value).filter(key => !allowed.includes(key));

export const stableSerializeMediaContract = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableSerializeMediaContract).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerializeMediaContract(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const validateUploadOperationId = value => OPERATION_ID_PATTERN.test(String(value || ''));

export const validateUploadAuthorizationRequest = (payload = {}) => {
  const errors = [];
  if (!isPlainObject(payload)) return { valid: false, errors: ['payload_invalid'] };
  if (unknownKeys(payload, AUTHORIZATION_KEYS).length) errors.push('unknown_fields');
  if (stableSerializeMediaContract(payload).length > 4096) errors.push('payload_too_large');
  if (!validateUploadOperationId(payload.operationId)) errors.push('operation_id_invalid');
  if (!getMediaValidationPolicy(payload.resourceType)) errors.push('resource_type_invalid');
  if (typeof payload.fileName !== 'string' || !payload.fileName.trim() || payload.fileName.length > 255) errors.push('file_name_invalid');
  if (typeof payload.declaredMime !== 'string' || payload.declaredMime.length > 100) errors.push('declared_mime_invalid');
  if (!Number.isInteger(payload.size) || payload.size < 0) errors.push('size_invalid');
  return { valid: errors.length === 0, errors, normalized: errors.length ? null : { ...payload, fileName: payload.fileName.trim(), declaredMime: payload.declaredMime.trim().toLowerCase() } };
};

export const describeSignedUploadAuthorization = ({ uid, accountStatus, permissions = [], request, issuedAt, expiresAt } = {}) => {
  const requestValidation = validateUploadAuthorizationRequest(request);
  const errors = [...requestValidation.errors];
  if (!SAFE_ID_PATTERN.test(String(uid || ''))) errors.push('authenticated_user_required');
  if (!['active', 'Activa'].includes(accountStatus)) errors.push('active_account_required');
  if (!permissions.includes('multimedia.upload')) errors.push('upload_permission_required');
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt || expiresAt - issuedAt > 10 * 60 * 1000) errors.push('authorization_expiry_invalid');
  const operationId = requestValidation.normalized?.operationId || request?.operationId || '';
  const resourceType = requestValidation.normalized?.resourceType || request?.resourceType || '';
  return {
    version: MEDIA_VALIDATION_VERSION,
    authorized: errors.length === 0,
    errors,
    operationId,
    resourceType,
    idempotencyKey: errors.length ? null : `${uid}:${operationId}`,
    controlledFolder: errors.length ? null : `kadosh/uploads/${uid}/${operationId}`,
    providerSignatureRequired: true,
    providerEnforcementPending: true,
    restrictions: getMediaValidationPolicy(resourceType),
  };
};

export const validateUploadFinalizationRequest = (payload = {}, authorization = {}) => {
  const errors = [];
  if (!isPlainObject(payload)) return { valid: false, errors: ['payload_invalid'] };
  if (unknownKeys(payload, FINALIZATION_KEYS).length) errors.push('unknown_fields');
  if (stableSerializeMediaContract(payload).length > 16_384) errors.push('payload_too_large');
  if (!authorization.authorized) errors.push('authorization_required');
  if (payload.operationId !== authorization.operationId) errors.push('operation_mismatch');
  if (payload.resourceType !== authorization.resourceType) errors.push('resource_type_mismatch');
  if (payload.provider !== 'cloudinary') errors.push('provider_invalid');
  if (typeof payload.publicId !== 'string' || !authorization.controlledFolder || !payload.publicId.startsWith(`${authorization.controlledFolder}/`)) errors.push('public_id_out_of_scope');
  if (typeof payload.url !== 'string' || !payload.url.startsWith('https://res.cloudinary.com/')) errors.push('provider_url_invalid');
  if (!isPlainObject(payload.metadata)) errors.push('metadata_invalid');
  return { valid: errors.length === 0, errors, requiresProviderLookup: true, createMode: 'create-only', physicalDeletionAllowed: false };
};

export const SIGNED_UPLOAD_MIGRATION = Object.freeze({
  currentUnsignedUploaderChanged: false,
  phases: Object.freeze([
    'observe-and-validate-without-blocking',
    'introduce-signed-upload-for-one-surface',
    'finalize-server-side-and-reconcile-orphans',
    'migrate-remaining-surfaces',
    'disable-unsigned-preset-after-inventory',
  ]),
});

export const SUPPORTED_SIGNED_UPLOAD_TYPES = Object.freeze(Object.values(MEDIA_RESOURCE_TYPES));

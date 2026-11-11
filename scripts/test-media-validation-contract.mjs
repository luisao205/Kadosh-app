import assert from 'node:assert/strict';
import {
  MEDIA_VALIDATION_CAPABILITIES,
  inspectMediaSignature,
  validateExternalMediaUrl,
  validateMediaCandidate,
} from '../src/utils/mediaValidation.js';
import {
  MEDIA_RESOURCE_TYPES,
  MEDIA_VALIDATION_POLICIES,
  MEDIA_VALIDATION_STATUS,
  MEBIBYTE,
} from '../src/utils/mediaValidationPolicy.js';
import {
  describeSignedUploadAuthorization,
  stableSerializeMediaContract,
  validateUploadAuthorizationRequest,
  validateUploadFinalizationRequest,
  validateUploadOperationId,
} from '../src/utils/mediaUploadContract.js';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f]);
const validVideoMetadata = { duration: 60, width: 1920, height: 1080, fps: 30, bitrate: 6_000_000, codec: 'h264' };

const candidate = (resourceType, file, metadata = {}) => validateMediaCandidate({ resourceType, file, metadata });

// 1-4: valid media and allowed MIME contracts.
assert.equal(candidate(MEDIA_RESOURCE_TYPES.IMAGE_BACKGROUND, { name: 'background.png', type: 'image/png', size: 100, bytes: png }).status, MEDIA_VALIDATION_STATUS.ACCEPTED);
assert.equal(candidate(MEDIA_RESOURCE_TYPES.ANIMATED_BACKGROUND, { name: 'loop.mp4', type: 'video/mp4', size: 100, bytes: mp4 }, validVideoMetadata).status, MEDIA_VALIDATION_STATUS.ACCEPTED);
assert.equal(candidate(MEDIA_RESOURCE_TYPES.THUMBNAIL, { name: 'poster.jpg', type: 'image/jpeg', size: 100, bytes: jpeg }).status, MEDIA_VALIDATION_STATUS.ACCEPTED);
assert.ok(MEDIA_VALIDATION_POLICIES[MEDIA_RESOURCE_TYPES.FOREGROUND_VIDEO].allowedMimeTypes.includes('video/webm'));

// 5-10: forbidden/spoofed MIME, deceptive extension, signatures and corruption.
assert.ok(candidate(MEDIA_RESOURCE_TYPES.IMAGE_BACKGROUND, { name: 'x.svg', type: 'image/svg+xml', size: 100, bytes: png }).errors.includes('mime_not_allowed'));
assert.ok(candidate(MEDIA_RESOURCE_TYPES.IMAGE_BACKGROUND, { name: 'x.png', type: 'image/png', size: 100, bytes: mp4 }).errors.includes('mime_signature_mismatch'));
assert.ok(candidate(MEDIA_RESOURCE_TYPES.ANIMATED_BACKGROUND, { name: 'x.jpg', type: 'video/mp4', size: 100, bytes: mp4 }, validVideoMetadata).errors.includes('extension_not_allowed'));
assert.equal(inspectMediaSignature(webm).kind, 'webm');
assert.equal(inspectMediaSignature(new Uint8Array([1, 2, 3, 4])).recognized, false);
assert.ok(candidate(MEDIA_RESOURCE_TYPES.FOREGROUND_VIDEO, { name: 'broken.mp4', type: 'video/mp4', size: 10, bytes: new Uint8Array([1, 2, 3, 4]) }, validVideoMetadata).errors.includes('signature_unrecognized'));

// 11-17: size, duration, resolution, bitrate and incomplete metadata.
assert.equal(candidate(MEDIA_RESOURCE_TYPES.THUMBNAIL, { name: 'x.png', type: 'image/png', size: 2 * MEBIBYTE, bytes: png }).status, MEDIA_VALIDATION_STATUS.ACCEPTED);
assert.ok(candidate(MEDIA_RESOURCE_TYPES.THUMBNAIL, { name: 'x.png', type: 'image/png', size: 2 * MEBIBYTE + 1, bytes: png }).errors.includes('size_exceeded'));
assert.ok(candidate(MEDIA_RESOURCE_TYPES.ANIMATED_BACKGROUND, { name: 'x.mp4', type: 'video/mp4', size: 100, bytes: mp4 }, { ...validVideoMetadata, duration: 301 }).errors.includes('duration_exceeded'));
assert.ok(candidate(MEDIA_RESOURCE_TYPES.FOREGROUND_VIDEO, { name: 'x.mp4', type: 'video/mp4', size: 100, bytes: mp4 }, { ...validVideoMetadata, width: 7680 }).errors.includes('resolution_exceeded'));
assert.ok(candidate(MEDIA_RESOURCE_TYPES.ANIMATED_BACKGROUND, { name: 'x.mp4', type: 'video/mp4', size: 100, bytes: mp4 }, { ...validVideoMetadata, bitrate: 9_000_000 }).warnings.includes('bitrate_above_target'));
assert.equal(candidate(MEDIA_RESOURCE_TYPES.ANIMATED_BACKGROUND, { name: 'x.mp4', type: 'video/mp4', size: 100, bytes: mp4 }).status, MEDIA_VALIDATION_STATUS.REQUIRES_INSPECTION);
assert.ok(candidate(MEDIA_RESOURCE_TYPES.FOREGROUND_VIDEO, { name: 'x.mp4', type: 'video/mp4', size: 100, bytes: mp4 }, { ...validVideoMetadata, codec: '' }).inspections.includes('codec_requires_provider_inspection'));

// 18-22: URL and legacy behavior.
assert.equal(validateExternalMediaUrl('https://cdn.example.test/video.mp4').status, MEDIA_VALIDATION_STATUS.ACCEPTED);
assert.ok(validateExternalMediaUrl('javascript:alert(1)').errors.includes('url_https_required'));
assert.ok(validateExternalMediaUrl('https://user:password@cdn.example.test/video.mp4').errors.includes('url_credentials_forbidden'));
assert.equal(validateExternalMediaUrl('http://legacy.example.test/video.mp4', { legacy: true }).status, MEDIA_VALIDATION_STATUS.LEGACY_UNVERIFIED);
assert.equal(validateMediaCandidate({ resourceType: MEDIA_RESOURCE_TYPES.ANIMATED_BACKGROUND, legacy: true }).status, MEDIA_VALIDATION_STATUS.LEGACY_UNVERIFIED);

const authorizationPayload = { operationId: 'media_1234567890abcdef', resourceType: MEDIA_RESOURCE_TYPES.ANIMATED_BACKGROUND, fileName: 'loop.mp4', declaredMime: 'video/mp4', size: 100 };

// 23-25: bounded payloads, unknown fields and deterministic serialization.
assert.ok(validateUploadAuthorizationRequest({ ...authorizationPayload, fileName: 'x'.repeat(5000) }).errors.includes('payload_too_large'));
assert.ok(validateUploadAuthorizationRequest({ ...authorizationPayload, admin: true }).errors.includes('unknown_fields'));
assert.equal(stableSerializeMediaContract({ b: 2, a: 1 }), stableSerializeMediaContract({ a: 1, b: 2 }));

// 26-29: idempotency, operation identity, authorization separation and Node compatibility.
const authorizationA = describeSignedUploadAuthorization({ uid: 'user_1', accountStatus: 'active', permissions: ['multimedia.upload'], request: authorizationPayload, issuedAt: 1000, expiresAt: 61_000 });
const authorizationB = describeSignedUploadAuthorization({ uid: 'user_1', accountStatus: 'active', permissions: ['multimedia.upload'], request: authorizationPayload, issuedAt: 1000, expiresAt: 61_000 });
assert.equal(authorizationA.idempotencyKey, authorizationB.idempotencyKey);
assert.equal(validateUploadOperationId('bad'), false);
assert.equal(MEDIA_VALIDATION_CAPABILITIES.clientValidationAuthorizesUpload, false);
assert.equal(typeof validateMediaCandidate, 'function');

// 30: the contract is pure and performs no network or persistence operation.
let externalCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { externalCalls += 1; throw new Error('network_forbidden'); };
try {
  validateMediaCandidate({ resourceType: MEDIA_RESOURCE_TYPES.IMAGE_BACKGROUND, file: { name: 'x.png', type: 'image/png', size: 100, bytes: png } });
  validateExternalMediaUrl('https://cdn.example.test/image.png');
  assert.equal(externalCalls, 0);
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(authorizationA.authorized, true);
assert.equal(describeSignedUploadAuthorization({ uid: 'user_1', accountStatus: 'suspended', permissions: ['multimedia.upload'], request: authorizationPayload, issuedAt: 1000, expiresAt: 61_000 }).authorized, false);
assert.equal(describeSignedUploadAuthorization({ uid: 'user_1', accountStatus: 'active', permissions: [], request: authorizationPayload, issuedAt: 1000, expiresAt: 61_000 }).authorized, false);

const finalization = validateUploadFinalizationRequest({
  operationId: authorizationA.operationId,
  provider: 'cloudinary',
  publicId: `${authorizationA.controlledFolder}/asset`,
  resourceType: authorizationA.resourceType,
  url: 'https://res.cloudinary.com/test/video/upload/asset.mp4',
  metadata: validVideoMetadata,
}, authorizationA);
assert.equal(finalization.valid, true);
assert.equal(finalization.requiresProviderLookup, true);
assert.equal(finalization.createMode, 'create-only');
assert.equal(finalization.physicalDeletionAllowed, false);

console.log('media validation and signed upload contracts: 30 synthetic scenarios PASS');

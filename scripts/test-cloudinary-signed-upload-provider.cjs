const assert = require('assert/strict');
const {
  CloudinaryProviderError,
  canonicalizeParameters,
  createCloudinarySignedUploadProvider,
  signParameters,
  verifyResponseSignature,
} = require('../functions/cloudinarySignedUploadProvider');
const { createMediaUploadSecurityService, validateProviderResource } = require('../functions/mediaUploadSecurity');
const { InMemoryMediaUploadRepository } = require('../functions/testing/mockMediaUploadInfrastructure');

const NOW = 1_800_000_000_000;
const SECRET = 'synthetic_secret_never_real';
const CLOUD_NAME = 'synthetic-kadosh';
const API_KEY = 'synthetic-key';
const request = Object.freeze({
  operationId: 'media_cloudinary_000001',
  uid: 'e2e-cloudinary-user',
  folder: 'kadosh/uploads/e2e-cloudinary-user/media_cloudinary_000001',
  publicId: 'kadosh/uploads/e2e-cloudinary-user/media_cloudinary_000001/asset',
  resourceType: 'foreground-video',
  issuedAt: NOW,
  expiresAt: NOW + 5 * 60 * 1000,
});

const validRawResource = Object.freeze({
  public_id: request.publicId,
  asset_id: 'synthetic_asset_0123456789',
  resource_type: 'video',
  type: 'upload',
  secure_url: `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/v1800000000/${request.publicId}.webm`,
  bytes: 4096,
  format: 'webm',
  width: 1920,
  height: 1080,
  duration: 45,
  video: { codec: 'vp9' },
  created_at: new Date(NOW).toISOString(),
});

const expectCode = async (code, action) => {
  await assert.rejects(action, error => error instanceof CloudinaryProviderError && error.code === code);
};

const createProvider = (options = {}) => {
  let rawResource = options.rawResource === undefined ? validRawResource : options.rawResource;
  const inspections = [];
  const provider = createCloudinarySignedUploadProvider({
    cloudName: CLOUD_NAME,
    apiKey: API_KEY,
    apiSecret: SECRET,
    folderMode: options.folderMode || 'legacy-fixed',
    signedUploadPreset: options.signedUploadPreset,
    signatureAlgorithm: options.signatureAlgorithm || 'sha256',
    now: () => options.now === undefined ? NOW : options.now,
    inspectResource: async input => {
      inspections.push(input);
      if (options.inspectionError) throw options.inspectionError;
      return rawResource ? structuredClone(rawResource) : null;
    },
  });
  return { provider, inspections, setRawResource: value => { rawResource = value; } };
};

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('matches the official Cloudinary SHA-1 documentation vector', () => {
  assert.equal(signParameters({ parameters: { timestamp: 1315060510 }, apiSecret: 'abcd', algorithm: 'sha1' }), 'a21ad0f63beb4de2e5575204b79ab90bffb02c10');
  assert.equal(signParameters({ parameters: { public_id: 'sample_image', timestamp: 1315060510 }, apiSecret: 'abcd', algorithm: 'sha1' }), 'b4ad47fb4e25c7bf5f92a20089f9db59bc302313');
});

test('canonicalizes signed fields and array values deterministically', () => {
  assert.equal(canonicalizeParameters({ timestamp: 2, allowed_formats: ['webm', 'mp4'], folder: 'safe' }), 'allowed_formats=webm,mp4&folder=safe&timestamp=2');
});

test('creates a controlled signed authorization without exposing the secret', async () => {
  const { provider } = createProvider({ signedUploadPreset: 'synthetic-signed-preset' });
  const authorization = await provider.createAuthorization(request);
  assert.equal(authorization.parameters.folder, request.folder);
  assert.equal(authorization.parameters.public_id, 'asset');
  assert.equal(authorization.parameters.overwrite, false);
  assert.equal(authorization.parameters.upload_preset, 'synthetic-signed-preset');
  assert.equal(authorization.resourceType, 'video');
  assert.equal(authorization.cloudinaryTimestampValiditySeconds, 3600);
  assert.ok(!JSON.stringify(authorization).includes(SECRET));
  assert.equal(authorization.signature, signParameters({ parameters: authorization.parameters, apiSecret: SECRET, algorithm: 'sha256' }));
});

test('supports explicit dynamic-folder semantics without changing expected public ID', async () => {
  const { provider } = createProvider({ folderMode: 'dynamic' });
  const authorization = await provider.createAuthorization(request);
  assert.equal(authorization.parameters.asset_folder, request.folder);
  assert.equal(authorization.parameters.public_id, request.publicId);
  assert.equal(authorization.parameters.folder, undefined);
});

test('modified parameters, overwrite, preset, public ID, or folder invalidate the signature', async () => {
  const { provider } = createProvider({ signedUploadPreset: 'signed-preset' });
  const authorization = await provider.createAuthorization(request);
  for (const mutation of [
    { overwrite: true },
    { upload_preset: 'other-preset' },
    { public_id: 'other' },
    { folder: 'other/folder' },
  ]) {
    const changed = { ...authorization.parameters, ...mutation };
    assert.notEqual(signParameters({ parameters: changed, apiSecret: SECRET, algorithm: 'sha256' }), authorization.signature);
  }
  assert.equal(authorization.resourceType, 'video');
  assert.ok(!authorization.signedParameterNames.includes('resource_type'));
});

test('rejects invalid KADOSH timestamp, TTL, scope, and configuration', async () => {
  await expectCode('authorization_clock_invalid', () => createProvider({ now: NOW + 31_000 }).provider.createAuthorization(request));
  await expectCode('authorization_ttl_invalid', () => createProvider().provider.createAuthorization({ ...request, expiresAt: NOW + 301_000 }));
  await expectCode('upload_scope_invalid', () => createProvider().provider.createAuthorization({ ...request, publicId: 'attacker/asset' }));
  assert.throws(() => createCloudinarySignedUploadProvider({ cloudName: CLOUD_NAME, apiKey: API_KEY, apiSecret: SECRET, folderMode: 'unknown', inspectResource: async () => null }), error => error.code === 'folder_mode_required');
});

test('verifies signed upload responses and rejects falsified responses', async () => {
  const { provider } = createProvider();
  const version = 1800000000;
  const response = {
    public_id: request.publicId,
    asset_id: validRawResource.asset_id,
    resource_type: 'video',
    secure_url: validRawResource.secure_url,
    version,
    signature: signParameters({ parameters: { public_id: request.publicId, version }, apiSecret: SECRET, algorithm: 'sha256' }),
  };
  assert.equal(provider.validateUploadResponse(response, request).assetId, validRawResource.asset_id);
  assert.equal(verifyResponseSignature({ publicId: request.publicId, version, signature: response.signature, apiSecret: SECRET, algorithm: 'sha256' }), true);
  for (const [code, mutation] of [
    ['response_signature_invalid', { signature: `${response.signature[0] === '0' ? '1' : '0'}${response.signature.slice(1)}` }],
    ['response_public_id_mismatch', { public_id: 'other' }],
    ['response_resource_type_mismatch', { resource_type: 'image' }],
    ['response_asset_id_invalid', { asset_id: '' }],
    ['response_url_invalid', { secure_url: 'https://res.cloudinary.com/other/video/upload/file.webm' }],
  ]) await expectCode(code, async () => provider.validateUploadResponse({ ...response, ...mutation }, request));
});

test('normalizes only trusted Admin API inspection results', async () => {
  const { provider, inspections } = createProvider();
  const result = await provider.inspectResource(request);
  assert.equal(result.assetId, validRawResource.asset_id);
  assert.equal(result.metadata.mimeType, 'video/webm');
  assert.equal(inspections[0].publicId, request.publicId);
  assert.equal(inspections[0].deliveryType, 'upload');
  assert.ok(!JSON.stringify(inspections).includes(SECRET));
});

test('rejects missing, out-of-scope, malformed, stale, and oversized provider results', async () => {
  assert.deepEqual(await createProvider({ rawResource: null }).provider.inspectResource(request), { exists: false });
  const cases = [
    ['inspection_public_id_mismatch', { public_id: 'other' }],
    ['inspection_resource_type_mismatch', { resource_type: 'image' }],
    ['inspection_asset_id_invalid', { asset_id: '' }],
    ['inspection_url_invalid', { secure_url: 'http://res.cloudinary.com/synthetic-kadosh/file' }],
    ['inspection_metadata_invalid', { bytes: -1 }],
    ['inspection_resource_stale', { created_at: new Date(NOW - 5000).toISOString() }],
  ];
  for (const [code, mutation] of cases) {
    const { provider } = createProvider({ rawResource: { ...validRawResource, ...mutation } });
    await expectCode(code, () => provider.inspectResource(request));
  }
  const { provider } = createProvider({ rawResource: { ...validRawResource, bytes: 600 * 1024 * 1024 } });
  const inspected = await provider.inspectResource(request);
  assert.equal(inspected.metadata.size, 600 * 1024 * 1024);
  const operation = {
    expectedPublicId: request.publicId,
    folder: request.folder,
    resourceType: request.resourceType,
    issuedAt: request.issuedAt,
    request: { size: 4096, declaredMime: 'video/webm' },
  };
  assert.throws(() => validateProviderResource(inspected, operation), error => error.code === 'provider_size_invalid');
  assert.throws(() => validateProviderResource({ ...inspected, metadata: { ...inspected.metadata, size: 4096, mimeType: 'video/mp4' } }, operation), error => error.code === 'provider_mime_mismatch');
  assert.throws(() => validateProviderResource({ ...inspected, metadata: { ...inspected.metadata, size: 4096, duration: 7201 } }, operation), error => error.code === 'provider_duration_invalid');
});

test('propagates simulated provider and network failures without activating a resource', async () => {
  const repository = new InMemoryMediaUploadRepository();
  const { provider } = createProvider({ inspectionError: new Error('synthetic_network_timeout') });
  const service = createMediaUploadSecurityService({
    repository,
    provider,
    loadActor: async () => ({ accountStatus: 'active', permissions: ['multimedia.upload'] }),
    now: () => NOW,
  });
  const authorization = await service.authorizeUpload({
    auth: { uid: request.uid },
    data: { operationId: request.operationId, resourceType: request.resourceType, fileName: 'video.webm', declaredMime: 'video/webm', size: 4096 },
  });
  await assert.rejects(() => service.finalizeUpload({ auth: { uid: request.uid }, data: { operationId: request.operationId, provider: 'cloudinary', publicId: authorization.publicId } }), /synthetic_network_timeout/);
  assert.equal(repository.resources.size, 0);
  assert.equal(repository.operations.get(request.operationId).status, 'pending');
});

test('integrates signed authorization and trusted inspection with finalization', async () => {
  const repository = new InMemoryMediaUploadRepository();
  const { provider } = createProvider();
  const service = createMediaUploadSecurityService({
    repository,
    provider,
    loadActor: async () => ({ accountStatus: 'active', permissions: ['multimedia.upload'] }),
    now: () => NOW,
  });
  const authorization = await service.authorizeUpload({
    auth: { uid: request.uid },
    data: { operationId: request.operationId, resourceType: request.resourceType, fileName: 'video.webm', declaredMime: 'video/webm', size: 4096 },
  });
  assert.equal(authorization.providerAuthorization.mode, 'cloudinary-signed');
  const finalized = await service.finalizeUpload({
    auth: { uid: request.uid },
    data: { operationId: request.operationId, provider: 'cloudinary', publicId: authorization.publicId },
  });
  assert.equal(finalized.status, 'active');
  const resource = repository.resources.get(finalized.resourceId);
  assert.equal(resource.cloudinaryAssetId, validRawResource.asset_id);
  assert.equal(resource.metadata.mimeType, 'video/webm');
});

(async () => {
  for (const entry of tests) {
    await entry.run();
    console.log(`PASS ${entry.name}`);
  }
  console.log(`CLOUDINARY_SIGNED_UPLOAD_PROVIDER=${tests.length}/${tests.length} PASS`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

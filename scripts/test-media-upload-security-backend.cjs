const assert = require('assert/strict');
const {
  AUTH_TTL_MS,
  MediaUploadSecurityError,
  createMediaUploadSecurityService,
} = require('../functions/mediaUploadSecurity');
const {
  InMemoryMediaUploadRepository,
  MockMediaProvider,
} = require('../functions/testing/mockMediaUploadInfrastructure');

const UID = 'e2e-media-operator';
const OTHER_UID = 'e2e-media-other';
const baseRequest = Object.freeze({
  operationId: 'media_0123456789abcdef',
  resourceType: 'foreground-video',
  fileName: 'fixture.webm',
  declaredMime: 'video/webm',
  size: 1024,
});

const actors = new Map([
  [UID, { accountStatus: 'active', permissions: ['multimedia.upload'] }],
  [OTHER_UID, { accountStatus: 'active', permissions: ['multimedia.upload'] }],
  ['suspended-user', { accountStatus: 'suspended', permissions: ['multimedia.upload'] }],
  ['unprivileged-user', { accountStatus: 'active', permissions: [] }],
]);

const createHarness = (initialTime = 1_800_000_000_000, actorSource = actors) => {
  let time = initialTime;
  const repository = new InMemoryMediaUploadRepository();
  const provider = new MockMediaProvider();
  const service = createMediaUploadSecurityService({
    repository,
    provider,
    loadActor: async uid => actorSource.get(uid),
    now: () => time,
  });
  return { repository, provider, service, advance: milliseconds => { time += milliseconds; } };
};

const expectCode = async (code, action) => {
  await assert.rejects(action, error => error instanceof MediaUploadSecurityError && error.code === code);
};

const authorize = (harness, request = baseRequest, uid = UID) => harness.service.authorizeUpload({
  auth: uid ? { uid } : null,
  data: { ...request },
});

const validProviderMetadata = Object.freeze({
  mimeType: baseRequest.declaredMime,
  size: baseRequest.size,
  duration: 60,
  width: 1920,
  height: 1080,
  codec: 'vp9',
});

const providerResource = (authorization, overrides = {}) => ({
  exists: true,
  provider: 'cloudinary',
  publicId: authorization.publicId,
  folder: authorization.folder,
  resourceType: baseRequest.resourceType,
  assetId: 'asset_e2e_0123456789',
  verifiedAt: authorization.providerAuthorization.timestamp,
  secureUrl: `https://res.cloudinary.com/e2e/video/upload/${authorization.publicId}.webm`,
  metadata: { ...validProviderMetadata },
  ...overrides,
});

const finalize = (harness, authorization, data = {}, uid = UID) => harness.service.finalizeUpload({
  auth: uid ? { uid } : null,
  data: {
    operationId: authorization.operationId,
    provider: 'cloudinary',
    publicId: authorization.publicId,
    ...data,
  },
});

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('valid authorization derives all privileged provider fields server-side', async () => {
  const harness = createHarness();
  const result = await authorize(harness);
  assert.equal(result.status, 'pending');
  assert.equal(result.publicId, `kadosh/uploads/${UID}/${baseRequest.operationId}/asset`);
  assert.equal(result.providerAuthorization.mode, 'mock-only');
  assert.equal(result.providerAuthorization.signature, null);
  assert.equal(harness.repository.operations.get(baseRequest.operationId).status, 'pending');
});

test('rejects unauthenticated, inactive, and unauthorized actors', async () => {
  await expectCode('unauthenticated', () => authorize(createHarness(), baseRequest, null));
  await expectCode('account_inactive', () => authorize(createHarness(), baseRequest, 'suspended-user'));
  await expectCode('permission_denied', () => authorize(createHarness(), baseRequest, 'unprivileged-user'));
});

test('rejects invalid MIME, excessive size, and unsupported resource type', async () => {
  await expectCode('mime_not_allowed', () => authorize(createHarness(), { ...baseRequest, declaredMime: 'text/html' }));
  await expectCode('size_not_allowed', () => authorize(createHarness(), { ...baseRequest, size: 501 * 1024 * 1024 }));
  await expectCode('resource_type_invalid', () => authorize(createHarness(), { ...baseRequest, resourceType: 'admin-file' }));
});

test('rejects client-controlled folder, publicId, provider, URL, metadata, and active status', async () => {
  for (const [field, value] of [
    ['folder', 'users/other'],
    ['publicId', 'arbitrary'],
    ['provider', 'other'],
    ['url', 'https://example.invalid/file'],
    ['metadata', { size: 1 }],
    ['status', 'active'],
  ]) {
    await expectCode('unknown_fields', () => authorize(createHarness(), { ...baseRequest, [field]: value }));
  }
});

test('authorization is idempotent and operation IDs are globally owned', async () => {
  const harness = createHarness();
  const first = await authorize(harness);
  const repeated = await authorize(harness);
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.publicId, first.publicId);
  await expectCode('operation_payload_conflict', () => authorize(harness, { ...baseRequest, size: 2048 }));
  await expectCode('operation_owned_by_another_user', () => authorize(harness, baseRequest, OTHER_UID));
});

test('expired authorization cannot finalize and identical authorization can be retried', async () => {
  const harness = createHarness();
  const first = await authorize(harness);
  harness.advance(AUTH_TTL_MS + 1);
  harness.provider.setResource(providerResource(first));
  await expectCode('operation_expired', () => finalize(harness, first));
  const retried = await authorize(harness);
  assert.equal(retried.idempotent, false);
  assert.equal(harness.repository.operations.get(baseRequest.operationId).attempts, 2);
});

test('finalization requires the original owner, provider, publicId, and no client metadata', async () => {
  const harness = createHarness();
  const authorization = await authorize(harness);
  harness.provider.setResource(providerResource(authorization));
  await expectCode('operation_owned_by_another_user', () => finalize(harness, authorization, {}, OTHER_UID));
  await expectCode('provider_mismatch', () => finalize(harness, authorization, { provider: 'firebase' }));
  await expectCode('public_id_mismatch', () => finalize(harness, authorization, { publicId: 'other/public-id' }));
  await expectCode('unknown_fields', () => finalize(harness, authorization, { url: 'https://res.cloudinary.com/fake' }));
  await expectCode('unknown_fields', () => finalize(harness, authorization, { metadata: { size: 1 } }));
  await expectCode('unknown_fields', () => finalize(harness, authorization, { status: 'active' }));
});

test('trusted provider lookup must exist and match the authorization policy', async () => {
  const cases = [
    ['provider_resource_missing', null],
    ['provider_mismatch', { provider: 'other' }],
    ['public_id_mismatch', { publicId: 'wrong' }],
    ['provider_folder_mismatch', { folder: 'wrong/folder' }],
    ['resource_type_mismatch', { resourceType: 'image-background' }],
    ['provider_mime_mismatch', { metadata: { ...validProviderMetadata, mimeType: 'video/mp4' } }],
    ['provider_size_mismatch', { metadata: { ...validProviderMetadata, size: 2048 } }],
    ['provider_url_invalid', { secureUrl: 'https://example.invalid/file.webm' }],
    ['provider_result_stale', { verifiedAt: 1 }],
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const harness = createHarness();
    const request = { ...baseRequest, operationId: `media_provider_case_${String(index).padStart(2, '0')}` };
    const authorization = await authorize(harness, request);
    const [code, override] = cases[index];
    if (override) {
      harness.provider.resources.set(
        authorization.publicId,
        structuredClone(providerResource(authorization, override)),
      );
    }
    await expectCode(code, () => finalize(harness, authorization));
    assert.equal(harness.repository.resources.size, 0);
  }
});

test('valid finalization creates one active resource and an audit trail', async () => {
  const harness = createHarness();
  const authorization = await authorize(harness);
  harness.provider.setResource(providerResource(authorization));
  const result = await finalize(harness, authorization);
  assert.equal(result.status, 'active');
  assert.equal(result.idempotent, false);
  assert.equal(harness.repository.resources.size, 1);
  assert.equal(harness.repository.operations.get(baseRequest.operationId).status, 'active');
  assert.deepEqual(harness.repository.audit.map(entry => entry.action), ['authorization_created', 'upload_finalized']);
});

test('duplicate and concurrent finalizations create exactly one resource', async () => {
  const harness = createHarness();
  const authorization = await authorize(harness);
  harness.provider.setResource(providerResource(authorization));
  const results = await Promise.all([
    finalize(harness, authorization),
    finalize(harness, authorization),
  ]);
  assert.equal(harness.repository.resources.size, 1);
  assert.equal(results.filter(result => result.idempotent === false).length, 1);
  assert.equal(results.filter(result => result.idempotent === true).length, 1);
  await expectCode('public_id_mismatch', () => finalize(harness, authorization, { publicId: 'changed-after-active' }));
});

test('transaction failure leaves no partial resource and a retry succeeds', async () => {
  const harness = createHarness();
  const authorization = await authorize(harness);
  harness.provider.setResource(providerResource(authorization));
  harness.repository.failNextCommit = true;
  await assert.rejects(() => finalize(harness, authorization), /simulated_transaction_failure/);
  assert.equal(harness.repository.resources.size, 0);
  assert.equal(harness.repository.operations.get(baseRequest.operationId).status, 'pending');
  const retry = await finalize(harness, authorization);
  assert.equal(retry.status, 'active');
  assert.equal(harness.repository.resources.size, 1);
});

test('authorization commit failure leaves no pending operation and a retry succeeds', async () => {
  const harness = createHarness();
  harness.repository.failNextCommit = true;
  await assert.rejects(() => authorize(harness), /simulated_transaction_failure/);
  assert.equal(harness.repository.operations.size, 0);
  assert.equal(harness.repository.audit.length, 0);
  const retry = await authorize(harness);
  assert.equal(retry.status, 'pending');
  assert.equal(harness.repository.operations.size, 1);
});

test('finalization rechecks account status and upload permission', async () => {
  const actorSource = new Map(actors);
  const harness = createHarness(1_800_000_000_000, actorSource);
  const authorization = await authorize(harness);
  harness.provider.setResource(providerResource(authorization));
  actorSource.set(UID, { accountStatus: 'suspended', permissions: ['multimedia.upload'] });
  await expectCode('account_inactive', () => finalize(harness, authorization));
  actorSource.set(UID, { accountStatus: 'active', permissions: [] });
  await expectCode('permission_denied', () => finalize(harness, authorization));
  assert.equal(harness.repository.operations.get(baseRequest.operationId).status, 'pending');
  assert.equal(harness.repository.resources.size, 0);
});

test('concurrent authorization retries preserve one pending operation', async () => {
  const harness = createHarness();
  const results = await Promise.all(Array.from({ length: 8 }, () => authorize(harness)));
  assert.equal(harness.repository.operations.size, 1);
  assert.equal(harness.repository.operations.get(baseRequest.operationId).attempts, 1);
  assert.equal(results.filter(result => result.idempotent === false).length, 1);
  assert.equal(results.filter(result => result.idempotent === true).length, 7);
});

test('mock infrastructure performs no real external calls', async () => {
  const harness = createHarness();
  const authorization = await authorize(harness);
  harness.provider.setResource(providerResource(authorization));
  await finalize(harness, authorization);
  assert.equal(harness.provider.externalCalls, 0);
});

(async () => {
  let passed = 0;
  for (const entry of tests) {
    await entry.run();
    passed += 1;
    console.log(`PASS ${entry.name}`);
  }
  console.log(`MEDIA_UPLOAD_SECURITY_BACKEND=${passed}/${tests.length} PASS`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

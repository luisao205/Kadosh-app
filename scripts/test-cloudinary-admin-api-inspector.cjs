const assert = require('assert/strict');
const {
  CloudinaryInspectionError,
  createCloudinaryAdminApiInspector,
} = require('../functions/cloudinaryAdminApiInspector');
const { createCloudinarySignedUploadProvider } = require('../functions/cloudinarySignedUploadProvider');
const { createMediaUploadSecurityService } = require('../functions/mediaUploadSecurity');
const { MockCloudinaryAdminTransport } = require('../functions/testing/mockCloudinaryAdminTransport');
const { InMemoryMediaUploadRepository } = require('../functions/testing/mockMediaUploadInfrastructure');

const NOW = 1_800_000_000_000;
const UID = 'e2e-admin-inspector';
const OPERATION_ID = 'media_admin_inspector_0001';
const FOLDER = `kadosh/uploads/${UID}/${OPERATION_ID}`;
const PUBLIC_ID = `${FOLDER}/asset`;
const CLOUD_NAME = 'synthetic-kadosh';
const ASSET_ID = 'asset_immutable_0123456789';
const request = Object.freeze({
  operationId: OPERATION_ID, uid: UID, folder: FOLDER, publicId: PUBLIC_ID,
  resourceType: 'foreground-video', deliveryType: 'upload', issuedAt: NOW,
  expiresAt: NOW + 300_000,
});
const validResource = Object.freeze({
  cloud_name: CLOUD_NAME,
  asset_id: ASSET_ID,
  public_id: PUBLIC_ID,
  resource_type: 'video',
  type: 'upload',
  asset_folder: FOLDER,
  secure_url: `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/v1800000000/${PUBLIC_ID}.webm`,
  bytes: 4096,
  format: 'webm',
  width: 1920,
  height: 1080,
  duration: 30,
  video: { codec: 'vp9' },
  created_at: new Date(NOW).toISOString(),
  status: 'active',
});

const transportError = (status, code) => Object.assign(new Error(`synthetic_${status || code}`), { status, code });
const harness = (options = {}) => {
  const transport = options.transport || new MockCloudinaryAdminTransport();
  const delays = [];
  const inspector = createCloudinaryAdminApiInspector({
    cloudName: options.cloudName || CLOUD_NAME,
    folderMode: options.folderMode || 'dynamic',
    transport,
    deliveryHosts: options.deliveryHosts || ['res.cloudinary.com'],
    now: () => options.now ?? NOW,
    sleep: async delay => { delays.push(delay); },
    retry: options.retry || { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50 },
  });
  return { inspector, transport, delays };
};
const inspect = async (resource = validResource, options = {}) => {
  const setup = harness(options);
  setup.transport.enqueuePublicId(resource);
  return { ...setup, result: await setup.inspector.inspectResource(options.request || request) };
};
const expectCode = async (code, action) => assert.rejects(action, error => error instanceof CloudinaryInspectionError && error.code === code);
const tests = [];
const test = (name, run) => tests.push({ name, run });

test('01 valid asset ID is verified and normalized', async () => {
  const setup = harness(); setup.transport.enqueueAssetId(validResource);
  const result = await setup.inspector.inspectResource({ ...request, assetId: ASSET_ID });
  assert.equal(result.assetId, ASSET_ID);
  assert.equal(result.verification.identity, 'verified');
  assert.deepEqual(setup.transport.calls[0], { method: 'assetId', request: { assetId: ASSET_ID } });
});
test('02 asset ID mismatch is rejected when immutable ID is expected', async () => {
  const setup = harness(); setup.transport.enqueueAssetId({ ...validResource, asset_id: 'other' });
  await expectCode('asset_id_mismatch', () => setup.inspector.inspectResource({ ...request, assetId: ASSET_ID }));
});
test('03 valid public ID uses the typed public-ID lookup', async () => {
  const { transport } = await inspect();
  assert.deepEqual(transport.calls[0], { method: 'publicId', request: { publicId: PUBLIC_ID, resourceType: 'video', deliveryType: 'upload' } });
});
test('04 changed public ID is rejected', async () => expectCode('public_id_mismatch', () => inspect({ ...validResource, public_id: `${FOLDER}/other` })));
test('05 different resource type is rejected', async () => expectCode('resource_type_mismatch', () => inspect({ ...validResource, resource_type: 'image' })));
test('06 different delivery type is rejected', async () => expectCode('delivery_type_mismatch', () => inspect({ ...validResource, type: 'authenticated' })));
test('07 missing resource returns a permanent absent result without retry', async () => {
  const setup = harness(); setup.transport.enqueuePublicId(transportError(404));
  assert.deepEqual(await setup.inspector.inspectResource(request), { exists: false });
  assert.equal(setup.transport.calls.length, 1);
});
test('08 wrong configured account response is rejected', async () => expectCode('cloud_name_mismatch', () => inspect({ ...validResource, cloud_name: 'other-cloud' })));
test('09 unauthorized namespace is rejected before transport', async () => {
  const setup = harness();
  await expectCode('inspection_scope_invalid', () => setup.inspector.inspectResource({ ...request, folder: 'kadosh/uploads/other/op', publicId: 'kadosh/uploads/other/op/asset' }));
  assert.equal(setup.transport.calls.length, 0);
});
test('10 incompatible folder mode metadata is rejected', async () => expectCode('asset_folder_mismatch', () => inspect({ ...validResource, asset_folder: 'other' })));
test('10b fixed folder mode validates the public ID namespace without requiring asset_folder', async () => {
  const { result } = await inspect({ ...validResource, asset_folder: undefined }, { folderMode: 'legacy-fixed' });
  assert.equal(result.verification.folderMode, 'legacy-fixed');
});
test('11 manipulated external delivery URL is rejected', async () => expectCode('secure_url_invalid', () => inspect({ ...validResource, secure_url: 'https://attacker.example/file.webm' })));
test('12 non-HTTPS delivery URL is rejected', async () => expectCode('secure_url_invalid', () => inspect({ ...validResource, secure_url: `http://res.cloudinary.com/${CLOUD_NAME}/video/upload/file.webm` })));
test('13 complete metadata is marked verified', async () => {
  const { result } = await inspect();
  assert.equal(result.verification.fields.duration.status, 'verified');
  assert.equal(result.metadata.codec, 'vp9');
});
test('13b image metadata marks duration and codec not applicable', async () => {
  const imageRequest = { ...request, resourceType: 'image-background' };
  const image = { ...validResource, resource_type: 'image', format: 'webp', secure_url: validResource.secure_url.replace('/video/', '/image/'), duration: undefined, video: undefined };
  const { result } = await inspect(image, { request: imageRequest });
  assert.equal(result.metadata.mimeType, 'image/webp');
  assert.equal(result.verification.fields.duration.status, 'not-applicable');
  assert.equal(result.verification.fields.codec.status, 'not-applicable');
});
test('14 malformed base metadata is rejected', async () => expectCode('provider_metadata_invalid', () => inspect({ ...validResource, bytes: undefined })));
test('15 missing required video duration requires inspection', async () => expectCode('required_metadata_unavailable', () => inspect({ ...validResource, duration: undefined })));
test('16 unknown video codec requires inspection', async () => expectCode('required_metadata_unavailable', () => inspect({ ...validResource, video: {} })));
test('17 oversized bytes remain trusted for policy-layer rejection', async () => {
  const { result } = await inspect({ ...validResource, bytes: 600 * 1024 * 1024 });
  assert.equal(result.metadata.size, 600 * 1024 * 1024);
});
test('18 oversized resolution remains trusted for policy-layer rejection', async () => {
  const { result } = await inspect({ ...validResource, width: 7680 });
  assert.equal(result.metadata.width, 7680);
});
test('19 inconsistent creation time is rejected', async () => expectCode('created_at_inconsistent', () => inspect({ ...validResource, created_at: new Date(NOW - 5000).toISOString() })));
test('20 processing resource remains pending', async () => expectCode('resource_processing_pending', () => inspect({ ...validResource, status: 'pending' })));
test('21 Cloudinary HTTP 420 rate limit retries within the bounded policy', async () => {
  const setup = harness(); setup.transport.enqueuePublicId(transportError(420), validResource);
  assert.equal((await setup.inspector.inspectResource(request)).exists, true);
  assert.equal(setup.transport.calls.length, 2); assert.deepEqual(setup.delays, [10]);
});
test('21b intermediary HTTP 429 rate limit retries within the bounded policy', async () => {
  const setup = harness(); setup.transport.enqueuePublicId(transportError(429), validResource);
  assert.equal((await setup.inspector.inspectResource(request)).exists, true);
  assert.equal(setup.transport.calls.length, 2); assert.deepEqual(setup.delays, [10]);
});
test('22 HTTP 500, 502, 503, and 504 retry within the bounded policy', async () => {
  for (const status of [500, 502, 503, 504]) {
    const setup = harness(); setup.transport.enqueuePublicId(transportError(status), validResource);
    assert.equal((await setup.inspector.inspectResource(request)).exists, true);
    assert.equal(setup.transport.calls.length, 2);
  }
});
test('23 timeout retries and remains classified transient after exhaustion', async () => {
  const setup = harness(); setup.transport.enqueuePublicId(transportError(null, 'ETIMEDOUT'), transportError(null, 'ETIMEDOUT'), transportError(null, 'ETIMEDOUT'));
  await assert.rejects(() => setup.inspector.inspectResource(request), error => error.code === 'provider_timeout' && error.transient === true);
  assert.equal(setup.transport.calls.length, 3);
});
test('24 malformed response is rejected without retry', async () => {
  const setup = harness(); setup.transport.enqueuePublicId('bad');
  await expectCode('provider_response_malformed', () => setup.inspector.inspectResource(request));
  assert.equal(setup.transport.calls.length, 1);
});
test('24b permanent HTTP errors are classified without retry', async () => {
  for (const [status, code] of [[400, 'provider_bad_request'], [401, 'provider_authentication_failed'], [403, 'provider_authentication_failed'], [409, 'provider_conflict']]) {
    const setup = harness(); setup.transport.enqueuePublicId(transportError(status));
    await expectCode(code, () => setup.inspector.inspectResource(request));
    assert.equal(setup.transport.calls.length, 1);
  }
});
test('25 safe retry returns one normalized result', async () => {
  const setup = harness(); setup.transport.enqueuePublicId(transportError(500), transportError(503), validResource);
  const result = await setup.inspector.inspectResource(request);
  assert.equal(result.assetId, ASSET_ID); assert.equal(setup.transport.calls.length, 3);
});

const createIntegratedService = ({ inspector, repository = new InMemoryMediaUploadRepository(), now = NOW } = {}) => {
  const provider = createCloudinarySignedUploadProvider({
    cloudName: CLOUD_NAME, apiKey: 'synthetic-key', apiSecret: 'synthetic-secret',
    folderMode: 'dynamic', adminInspector: inspector, now: () => now,
  });
  const service = createMediaUploadSecurityService({
    repository, provider, now: () => now,
    loadActor: async () => ({ accountStatus: 'active', permissions: ['multimedia.upload'] }),
  });
  return { service, repository };
};
const authorizationPayload = { operationId: OPERATION_ID, resourceType: 'foreground-video', fileName: 'fixture.webm', declaredMime: 'video/webm', size: 4096 };
const authorize = service => service.authorizeUpload({ auth: { uid: UID }, data: authorizationPayload });
const finalize = (service, authorization) => service.finalizeUpload({ auth: { uid: UID }, data: { operationId: OPERATION_ID, provider: 'cloudinary', publicId: authorization.publicId } });

test('26 duplicate finalization is idempotent and does not reinspect', async () => {
  const setup = harness(); setup.transport.enqueuePublicId(validResource);
  const integrated = createIntegratedService({ inspector: setup.inspector });
  const authorization = await authorize(integrated.service);
  assert.equal((await finalize(integrated.service, authorization)).idempotent, false);
  assert.equal((await finalize(integrated.service, authorization)).idempotent, true);
  assert.equal(setup.transport.calls.length, 1);
});
test('27 concurrent finalization creates one active resource', async () => {
  const setup = harness(); setup.transport.enqueuePublicId(validResource, validResource);
  const integrated = createIntegratedService({ inspector: setup.inspector });
  const authorization = await authorize(integrated.service);
  const results = await Promise.all([finalize(integrated.service, authorization), finalize(integrated.service, authorization)]);
  assert.equal(results.filter(result => result.idempotent === false).length, 1);
  assert.equal(integrated.repository.resources.size, 1);
});
test('28 expired operation is rejected before provider lookup', async () => {
  let currentTime = NOW;
  const setup = harness();
  const repository = new InMemoryMediaUploadRepository();
  const provider = createCloudinarySignedUploadProvider({ cloudName: CLOUD_NAME, apiKey: 'key', apiSecret: 'secret', folderMode: 'dynamic', adminInspector: setup.inspector, now: () => currentTime });
  const service = createMediaUploadSecurityService({ repository, provider, now: () => currentTime, loadActor: async () => ({ accountStatus: 'active', permissions: ['multimedia.upload'] }) });
  const authorization = await authorize(service); currentTime = authorization.expiresAt + 1;
  await assert.rejects(() => finalize(service, authorization), error => error.code === 'operation_expired');
  assert.equal(setup.transport.calls.length, 0);
});
test('29 revoked permission blocks finalization before provider lookup', async () => {
  const setup = harness(); const repository = new InMemoryMediaUploadRepository(); let allowed = true;
  const provider = createCloudinarySignedUploadProvider({ cloudName: CLOUD_NAME, apiKey: 'key', apiSecret: 'secret', folderMode: 'dynamic', adminInspector: setup.inspector, now: () => NOW });
  const service = createMediaUploadSecurityService({ repository, provider, now: () => NOW, loadActor: async () => ({ accountStatus: 'active', permissions: allowed ? ['multimedia.upload'] : [] }) });
  const authorization = await authorize(service); allowed = false;
  await assert.rejects(() => finalize(service, authorization), error => error.code === 'permission_denied');
  assert.equal(setup.transport.calls.length, 0);
});
test('30 suspended account blocks finalization before provider lookup', async () => {
  const setup = harness(); const repository = new InMemoryMediaUploadRepository(); let active = true;
  const provider = createCloudinarySignedUploadProvider({ cloudName: CLOUD_NAME, apiKey: 'key', apiSecret: 'secret', folderMode: 'dynamic', adminInspector: setup.inspector, now: () => NOW });
  const service = createMediaUploadSecurityService({ repository, provider, now: () => NOW, loadActor: async () => ({ accountStatus: active ? 'active' : 'suspended', permissions: ['multimedia.upload'] }) });
  const authorization = await authorize(service); active = false;
  await assert.rejects(() => finalize(service, authorization), error => error.code === 'account_inactive');
  assert.equal(setup.transport.calls.length, 0);
});
test('31 external failure before transaction never activates resource', async () => {
  const setup = harness(); setup.transport.enqueuePublicId(transportError(503), transportError(503), transportError(503));
  const integrated = createIntegratedService({ inspector: setup.inspector }); const authorization = await authorize(integrated.service);
  await assert.rejects(() => finalize(integrated.service, authorization));
  assert.equal(integrated.repository.resources.size, 0); assert.equal(integrated.repository.operations.get(OPERATION_ID).status, 'pending');
});
test('32 transaction failure after inspection leaves no active resource and permits retry', async () => {
  const setup = harness(); setup.transport.enqueuePublicId(validResource, validResource);
  const repository = new InMemoryMediaUploadRepository(); const integrated = createIntegratedService({ inspector: setup.inspector, repository });
  const authorization = await authorize(integrated.service); repository.failNextCommit = true;
  await assert.rejects(() => finalize(integrated.service, authorization), /simulated_transaction_failure/);
  assert.equal(repository.resources.size, 0); assert.equal(repository.operations.get(OPERATION_ID).status, 'pending');
  assert.equal((await finalize(integrated.service, authorization)).status, 'active');
});
test('33 errors and normalized output do not expose secrets or response bodies', async () => {
  const secret = 'never-log-this-secret'; const setup = harness();
  setup.transport.enqueuePublicId(Object.assign(new Error(secret), { status: 401, authorization: secret }));
  try { await setup.inspector.inspectResource(request); assert.fail('expected rejection'); } catch (error) {
    assert.equal(JSON.stringify({ name: error.name, code: error.code, status: error.status }).includes(secret), false);
  }
});
test('34 all inspector tests use an in-memory transport without Internet requests', async () => {
  const setup = harness(); setup.transport.enqueuePublicId(validResource);
  await setup.inspector.inspectResource(request);
  assert.equal(setup.transport.externalCalls, 0);
});
test('35 legacy assets remain unverified and cannot be attached to a new operation', async () => {
  await expectCode('asset_id_missing', () => inspect({ ...validResource, asset_id: undefined, asset_folder: undefined }, { folderMode: 'legacy-fixed' }));
});

(async () => {
  for (const entry of tests) {
    await entry.run();
    console.log(`PASS ${entry.name}`);
  }
  console.log(`CLOUDINARY_ADMIN_API_INSPECTOR=${tests.length}/${tests.length} PASS`);
  console.log('REAL_PROVIDER_CALLS=0');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

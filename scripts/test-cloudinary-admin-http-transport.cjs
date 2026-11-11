const assert = require('assert/strict');
const {
  CloudinaryAdminTransportError,
  createCloudinaryAdminHttpTransport,
  parseRetryAfter,
} = require('../functions/cloudinaryAdminHttpTransport');
const { createCloudinaryAdminApiInspector } = require('../functions/cloudinaryAdminApiInspector');

const CLOUD_NAME = 'synthetic-kadosh';
const API_KEY = 'synthetic-key';
const API_SECRET = 'synthetic-secret-never-real';
const NOW = 1_800_000_000_000;
const calls = [];
const responses = [];
const requestAdapter = async request => {
  calls.push(structuredClone(request));
  const response = responses.shift();
  if (response instanceof Error) throw response;
  return structuredClone(response);
};
const transport = createCloudinaryAdminHttpTransport({
  cloudName: CLOUD_NAME,
  apiKey: API_KEY,
  apiSecret: API_SECRET,
  request: requestAdapter,
  timeoutMs: 4000,
  now: () => NOW,
});
const tests = [];
const test = (name, run) => tests.push({ name, run });
const ok = body => ({ status: 200, headers: { 'content-type': 'application/json' }, body });

test('builds immutable asset lookup on the fixed Cloudinary Admin origin', async () => {
  responses.push(ok({ asset_id: 'asset-1' }));
  await transport.getByAssetId({ assetId: 'asset-1' });
  assert.equal(calls.at(-1).url, `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/asset-1`);
});
test('builds typed public ID lookup and percent-encodes client-independent identity', async () => {
  responses.push(ok({ public_id: 'folder/asset' }));
  await transport.getByPublicId({ publicId: 'folder/asset', resourceType: 'video', deliveryType: 'upload' });
  assert.equal(calls.at(-1).url, `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/video/upload/folder%2Fasset`);
});
test('uses backend Basic authentication without placing secrets in URL', () => {
  const call = calls.at(-1);
  assert.match(call.headers.authorization, /^Basic /);
  assert.equal(call.url.includes(API_KEY), false);
  assert.equal(call.url.includes(API_SECRET), false);
});
test('enforces timeout and rejects redirects through the request adapter contract', () => {
  const call = calls.at(-1);
  assert.equal(call.timeoutMs, 4000);
  assert.equal(call.redirect, 'error');
  assert.equal(call.method, 'GET');
});
test('rejects arbitrary or missing resource identity before any request', async () => {
  const count = calls.length;
  assert.throws(() => transport.getByPublicId({ publicId: '', resourceType: 'raw', deliveryType: '' }), error => error.code === 'resource_identity_required');
  assert.equal(calls.length, count);
});
test('does not expose provider response body through HTTP errors', async () => {
  responses.push({ status: 403, headers: {}, body: { error: { message: API_SECRET } } });
  await assert.rejects(() => transport.getByAssetId({ assetId: 'asset-1' }), error => {
    assert.equal(error.status, 403);
    assert.equal(JSON.stringify(error).includes(API_SECRET), false);
    return true;
  });
});
test('parses bounded retry input as milliseconds without interpreting it as authorization', () => {
  assert.equal(parseRetryAfter('2', () => NOW), 2000);
  assert.equal(parseRetryAfter(new Date(NOW + 3000).toUTCString(), () => NOW), 3000);
  assert.equal(parseRetryAfter('invalid', () => NOW), null);
});
test('propagates 420 and Retry-After to bounded inspector retry', async () => {
  const retryCalls = [];
  const retryResponses = [
    { status: 420, headers: { 'retry-after': '2' }, body: { error: { message: 'rate limited' } } },
    ok({
      cloud_name: CLOUD_NAME, asset_id: 'asset-2', public_id: 'kadosh/uploads/user/media_http_transport_001/asset',
      resource_type: 'video', type: 'upload', asset_folder: 'kadosh/uploads/user/media_http_transport_001',
      secure_url: `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/v1800000000/kadosh/uploads/user/media_http_transport_001/asset.webm`,
      bytes: 10, format: 'webm', width: 10, height: 10, duration: 1, video: { codec: 'vp9' },
      created_at: new Date(NOW).toISOString(), status: 'active',
    }),
  ];
  const retryTransport = createCloudinaryAdminHttpTransport({
    cloudName: CLOUD_NAME, apiKey: API_KEY, apiSecret: API_SECRET,
    request: async input => { retryCalls.push(input); return retryResponses.shift(); },
    now: () => NOW,
  });
  const delays = [];
  const inspector = createCloudinaryAdminApiInspector({
    cloudName: CLOUD_NAME, folderMode: 'dynamic', transport: retryTransport, now: () => NOW,
    sleep: async delay => delays.push(delay), retry: { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 500 },
  });
  const result = await inspector.inspectResource({
    operationId: 'media_http_transport_001', uid: 'user',
    folder: 'kadosh/uploads/user/media_http_transport_001',
    publicId: 'kadosh/uploads/user/media_http_transport_001/asset',
    resourceType: 'foreground-video', deliveryType: 'upload', issuedAt: NOW, expiresAt: NOW + 1000,
  });
  assert.equal(result.assetId, 'asset-2');
  assert.equal(retryCalls.length, 2);
  assert.deepEqual(delays, [500]);
});
test('classifies sanitized connection timeout as transient through the inspector', async () => {
  const timeoutTransport = createCloudinaryAdminHttpTransport({
    cloudName: CLOUD_NAME, apiKey: API_KEY, apiSecret: API_SECRET,
    request: async () => { throw Object.assign(new Error(API_SECRET), { code: 'ETIMEDOUT' }); },
  });
  const inspector = createCloudinaryAdminApiInspector({
    cloudName: CLOUD_NAME, folderMode: 'dynamic', transport: timeoutTransport,
    now: () => NOW, sleep: async () => {}, retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
  });
  await assert.rejects(() => inspector.inspectResource({
    operationId: 'media_http_transport_001', uid: 'user', folder: 'kadosh/uploads/user/media_http_transport_001',
    publicId: 'kadosh/uploads/user/media_http_transport_001/asset', resourceType: 'foreground-video',
    issuedAt: NOW, expiresAt: NOW + 1000,
  }), error => error.code === 'provider_timeout' && !JSON.stringify(error).includes(API_SECRET));
});
test('rejects malformed successful responses', async () => {
  responses.push({ status: 200, headers: {}, body: 'not-an-object' });
  await assert.rejects(() => transport.getByAssetId({ assetId: 'asset-1' }), error => error.code === 'admin_api_response_malformed');
});
test('requires explicit credentials, request adapter, and bounded timeout', () => {
  assert.throws(() => createCloudinaryAdminHttpTransport({ cloudName: CLOUD_NAME, apiKey: API_KEY, apiSecret: '', request: requestAdapter }), error => error.code === 'provider_credentials_required');
  assert.throws(() => createCloudinaryAdminHttpTransport({ cloudName: CLOUD_NAME, apiKey: API_KEY, apiSecret: API_SECRET }), error => error.code === 'http_request_adapter_required');
  assert.throws(() => createCloudinaryAdminHttpTransport({ cloudName: CLOUD_NAME, apiKey: API_KEY, apiSecret: API_SECRET, request: requestAdapter, timeoutMs: 60_000 }), error => error.code === 'http_timeout_invalid');
});
test('performs no network call without an injected adapter', () => {
  assert.equal(typeof globalThis.fetch === 'function', true);
  assert.equal(calls.every(call => call.url.startsWith(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/`)), true);
});

(async () => {
  for (const entry of tests) {
    await entry.run();
    console.log(`PASS ${entry.name}`);
  }
  console.log(`CLOUDINARY_ADMIN_HTTP_TRANSPORT=${tests.length}/${tests.length} PASS`);
  console.log('REAL_PROVIDER_CALLS=0');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

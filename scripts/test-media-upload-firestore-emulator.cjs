/* global process */
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const admin = require('../functions/node_modules/firebase-admin');
const {
  createMediaUploadSecurityService,
  MediaUploadSecurityError,
} = require('../functions/mediaUploadSecurity');
const {
  COLLECTIONS,
  createFirestoreMediaUploadRepository,
} = require('../functions/firestoreMediaUploadRepository');
const { MockMediaProvider } = require('../functions/testing/mockMediaUploadInfrastructure');

const PROJECT_ID = 'demo-kadosh-e2e';
const EXPECTED_HOST = '127.0.0.1:8185';
const UID = 'e2e-media-firestore-user';
const OTHER_UID = 'e2e-media-firestore-other';
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');

if (process.env.FIRESTORE_EMULATOR_HOST !== EXPECTED_HOST) throw new Error('isolated_firestore_host_required');
if (process.env.GCLOUD_PROJECT !== PROJECT_ID || process.env.KADOSH_E2E_PROJECT_ID !== PROJECT_ID) throw new Error('demo_project_required');
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('real_credentials_forbidden');

const initializeAdmin = name => {
  const app = admin.initializeApp({ projectId: PROJECT_ID }, name);
  return { app, firestore: admin.firestore(app) };
};

const restartProbe = async operationId => {
  const { app, firestore } = initializeAdmin(`restart-${process.pid}`);
  const snapshot = await firestore.collection(COLLECTIONS.operations).doc(operationId).get();
  assert.equal(snapshot.exists, true);
  assert.equal(snapshot.get('status'), 'pending');
  await app.delete();
};

if (process.argv[2] === '--restart-probe') {
  restartProbe(process.argv[3]).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
} else {
  const requestFor = suffix => ({
    operationId: `media_firestore_${suffix}`,
    resourceType: 'foreground-video',
    fileName: `${suffix}.webm`,
    declaredMime: 'video/webm',
    size: 4096,
  });

  const expectCode = async (code, action) => {
    await assert.rejects(action, error => error instanceof MediaUploadSecurityError && error.code === code);
  };

  const run = async () => {
    const { initializeTestEnvironment, assertFails } = await import('@firebase/rules-unit-testing');
    const { deleteDoc, doc, setDoc, updateDoc } = await import('firebase/firestore');
    const { app, firestore } = initializeAdmin(`main-${process.pid}`);
    const repository = createFirestoreMediaUploadRepository({ firestore });
    const provider = new MockMediaProvider();
    let now = 1_800_000_000_000;
    const service = createMediaUploadSecurityService({
      repository,
      provider,
      loadActor: async () => { throw new Error('firestore_transaction_actor_loader_expected'); },
      now: () => now,
    });

    const actorRef = firestore.collection('usuarios').doc(UID);
    const otherActorRef = firestore.collection('usuarios').doc(OTHER_UID);
    const permissionsRef = firestore.collection('sistema').doc('permissionRoles');
    await Promise.all([
      actorRef.set({ rol: 'multimedia', accountStatus: 'active' }),
      otherActorRef.set({ rol: 'multimedia', accountStatus: 'active' }),
      permissionsRef.set({ roleDefaults: { multimedia: { 'multimedia.upload': true } } }),
    ]);

    const authorize = (request, uid = UID) => service.authorizeUpload({ auth: { uid }, data: request });
    const finalize = (authorization, overrides = {}, uid = UID) => service.finalizeUpload({
      auth: { uid },
      data: { operationId: authorization.operationId, provider: 'cloudinary', publicId: authorization.publicId, ...overrides },
    });
    const setProviderResource = (authorization, overrides = {}) => provider.setResource({
      exists: true,
      provider: 'cloudinary',
      publicId: authorization.publicId,
      folder: authorization.folder,
      resourceType: 'foreground-video',
      assetId: 'asset_e2e_firestore_0123456789',
      verifiedAt: now,
      secureUrl: `https://res.cloudinary.com/e2e/video/upload/${authorization.publicId}.webm`,
      metadata: { mimeType: 'video/webm', size: 4096, duration: 30, width: 1920, height: 1080, codec: 'vp9' },
      ...overrides,
    });

    const firstRequest = requestFor('authorization_0001');
    const first = await authorize(firstRequest);
    assert.equal(first.status, 'pending');
    const repeated = await authorize(firstRequest);
    assert.equal(repeated.idempotent, true);
    await expectCode('operation_payload_conflict', () => authorize({ ...firstRequest, size: 4097 }));
    await expectCode('operation_owned_by_another_user', () => authorize(firstRequest, OTHER_UID));

    const concurrentRequest = requestFor('concurrent_000001');
    const concurrent = await Promise.all(Array.from({ length: 8 }, () => authorize(concurrentRequest)));
    assert.equal(concurrent.filter(item => item.idempotent === false).length, 1);
    assert.equal(concurrent.filter(item => item.idempotent === true).length, 7);

    const restartRequest = requestFor('restart_000000001');
    await authorize(restartRequest);
    const child = spawnSync(process.execPath, [__filename, '--restart-probe', restartRequest.operationId], {
      env: { ...process.env },
      encoding: 'utf8',
    });
    assert.equal(child.status, 0, child.stderr || child.stdout);

    const finalRequest = requestFor('finalize_00000001');
    const finalAuthorization = await authorize(finalRequest);
    setProviderResource(finalAuthorization);
    const finalResults = await Promise.all([
      finalize(finalAuthorization),
      finalize(finalAuthorization),
    ]);
    assert.equal(finalResults.filter(item => item.idempotent === false).length, 1);
    assert.equal(finalResults.filter(item => item.idempotent === true).length, 1);
    const resourceSnapshot = await firestore.collection(COLLECTIONS.resources).doc(finalResults[0].resourceId).get();
    assert.equal(resourceSnapshot.exists, true);
    assert.equal(resourceSnapshot.get('status'), 'active');
    setProviderResource(finalAuthorization, { metadata: { mimeType: 'video/webm', size: 4096, duration: 45, width: 1280, height: 720, codec: 'vp8' } });
    const stableDuplicate = await finalize(finalAuthorization);
    assert.equal(stableDuplicate.idempotent, true);
    assert.equal((await firestore.collection(COLLECTIONS.resources).doc(finalResults[0].resourceId).get()).get('metadata.duration'), 30);
    await expectCode('public_id_mismatch', () => finalize(finalAuthorization, { publicId: 'changed/resource' }));

    const expiredRequest = requestFor('expired_000000001');
    const expired = await authorize(expiredRequest);
    setProviderResource(expired);
    now = expired.expiresAt + 1;
    await expectCode('operation_expired', () => finalize(expired));
    now += 1;

    const revokedRequest = requestFor('revoked_000000001');
    const revoked = await authorize(revokedRequest);
    setProviderResource(revoked);
    await actorRef.update({ accountStatus: 'suspended' });
    await expectCode('account_inactive', () => finalize(revoked));
    await actorRef.update({ accountStatus: 'active', permissionOverrides: { 'multimedia.upload': false } });
    await expectCode('permission_denied', () => finalize(revoked));
    await actorRef.update({ permissionOverrides: { 'multimedia.upload': true } });

    const providerFailureRequest = requestFor('provider_fail_0001');
    const providerFailure = await authorize(providerFailureRequest);
    provider.failInspectionWith(new Error('simulated_provider_timeout'));
    await assert.rejects(() => finalize(providerFailure), /simulated_provider_timeout/);
    provider.failInspectionWith(null);
    setProviderResource(providerFailure);
    assert.equal((await finalize(providerFailure)).status, 'active');

    const inconsistentRequest = requestFor('invalid_state_00001');
    const inconsistent = await authorize(inconsistentRequest);
    await firestore.collection(COLLECTIONS.operations).doc(inconsistent.operationId).update({ status: 'corrupt' });
    await expectCode('operation_not_pending', () => finalize(inconsistent));

    const testEnvironment = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync(RULES_PATH, 'utf8') },
    });
    const client = testEnvironment.authenticatedContext(UID).firestore();
    const protectedPaths = [
      `${COLLECTIONS.operations}/client-create`,
      `${COLLECTIONS.resources}/client-active`,
      `${COLLECTIONS.audit}/client-audit`,
    ];
    for (const documentPath of protectedPaths) {
      await assertFails(setDoc(doc(client, documentPath), { status: 'active', uid: UID, publicId: 'forged', provider: 'cloudinary' }));
    }
    await assertFails(updateDoc(doc(client, COLLECTIONS.operations, first.operationId), { uid: OTHER_UID }));
    await assertFails(updateDoc(doc(client, COLLECTIONS.operations, first.operationId), { expectedPublicId: 'forged' }));
    await assertFails(updateDoc(doc(client, COLLECTIONS.operations, first.operationId), { requestFingerprint: 'forged' }));
    await assertFails(updateDoc(doc(client, COLLECTIONS.operations, first.operationId), { status: 'active' }));
    await assertFails(deleteDoc(doc(client, COLLECTIONS.operations, first.operationId)));
    await testEnvironment.cleanup();

    const auditSnapshot = await firestore.collection(COLLECTIONS.audit).get();
    assert.ok(auditSnapshot.size >= 1);
    assert.equal(provider.externalCalls, 0);
    console.log('FIRESTORE_TRANSACTIONAL_AUTHORIZATION=PASS');
    console.log('FIRESTORE_TRANSACTIONAL_FINALIZATION=PASS');
    console.log('FIRESTORE_CONCURRENCY=PASS');
    console.log('PROCESS_RESTART_RECOVERY=PASS');
    console.log('FIRESTORE_RULES_CLIENT_DENIAL=PASS');
    console.log('PROVIDER_MOCK_FAILURE_RECOVERY=PASS');
    console.log('MEDIA_UPLOAD_FIRESTORE_EMULATOR=PASS');
    await app.delete();
  };

  run().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

const assert = require('node:assert/strict');
const firebaseFunctionsTest = require('../functions/node_modules/firebase-functions-test');
const admin = require('../functions/node_modules/firebase-admin');
const handlers = require('../functions/index');
const { resolveCanvaInput } = require('../functions/canvaLinkResolver');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST es obligatorio para esta prueba.');
}

const fft = firebaseFunctionsTest();
const projectSavedCanva = fft.wrap(handlers.projectSavedCanva);
const projectTemporaryCanva = fft.wrap(handlers.projectTemporaryCanva);
const restoreProjectionUndo = fft.wrap(handlers.restoreProjectionUndo);
const db = admin.firestore();
const eventId = (name) => `canva-function-${name}`;
const requestId = (name) => `request_${name}_1234567890`;
const auth = (uid) => ({ auth: { uid } });
const baseEvent = (overrides = {}) => ({
  projectorState: { type: 'lyrics', contentType: 'lyrics' },
  canvaOutputs: {},
  mediaOutputs: {},
  canvaPageMemory: {},
  ...overrides
});
const canva = (id, setlistId) => ({
  title: `Canva ${id}`,
  inputUrl: 'https://www.canva.com/design/DAFtest/view',
  sourceUrl: 'https://www.canva.com/design/DAFtest/view',
  embedUrl: 'https://www.canva.com/design/DAFtest/view?embed',
  pageCount: 8,
  defaultTargets: { projector: true, singers: false, musicians: false },
  setlistId,
  createdAt: 1,
  createdBy: 'owner',
  updatedAt: 1,
  updatedBy: 'owner'
});
const payload = (name, overrides = {}) => ({
  eventId: eventId(name),
  canvaId: `canva-${name}`,
  page: 3,
  destinations: ['projector'],
  requestId: requestId(name),
  ...overrides
});
const temporaryPayload = (name, overrides = {}) => ({
  eventId: eventId(`temporary-${name}`),
  rawUrl: 'https://www.canva.com/design/DAFtemporary/view',
  title: 'Canva temporal',
  page: 1,
  pageCount: 8,
  destinations: ['projector'],
  requestId: requestId(`temporary-${name}`),
  ...overrides
});
const seed = async (name, { event = {}, presentation = null } = {}) => {
  const request = payload(name);
  await db.collection('eventos').doc(request.eventId).set(baseEvent(event));
  await db.collection('canvaPresentations').doc(request.canvaId).set(presentation || canva(request.canvaId, request.eventId));
  return request;
};
const assertCode = async (promise, code) => assert.rejects(promise, (error) => error?.code === code);

(async () => {
  const directResolved = await resolveCanvaInput('https://www.canva.com/design/DAFdirect/view?foo=1#9');
  assert.equal(directResolved.sourceUrl, 'https://www.canva.com/design/DAFdirect/view?foo=1');
  assert.equal(directResolved.embedUrl, 'https://www.canva.com/design/DAFdirect/view?embed');
  const iframeResolved = await resolveCanvaInput('<iframe src="https://www.canva.com/design/DAFiframe/view"></iframe>');
  assert.equal(iframeResolved.embedUrl, 'https://www.canva.com/design/DAFiframe/view?embed');
  const shortResolved = await resolveCanvaInput('https://canva.link/temporary-test', {
    resolveShortLink: async () => 'https://www.canva.com/design/DAFshort/view'
  });
  assert.equal(shortResolved.sourceUrl, 'https://www.canva.com/design/DAFshort/view');
  await assert.rejects(resolveCanvaInput('https://example.test/design/DAF/view'));
  await assert.rejects(resolveCanvaInput('not a url'));
  await assert.rejects(resolveCanvaInput('https://canva.link/redirect-out', {
    resolveShortLink: async () => 'https://example.test/not-canva'
  }));

  await Promise.all([
    db.collection('usuarios').doc('owner').set({ rol: 'dueno', nombre: 'Owner' }),
    db.collection('usuarios').doc('operator').set({ rol: 'multimedia', nombre: 'Operator' }),
    db.collection('usuarios').doc('canva-only').set({ rol: 'canvaOnly', nombre: 'Canva only' }),
    db.collection('usuarios').doc('canva-only-other').set({ rol: 'canvaOnly', nombre: 'Canva only other' }),
    db.collection('usuarios').doc('none').set({ rol: 'musico', nombre: 'None' }),
    db.collection('sistema').doc('permissionRoles').set({
      roleDefaults: {
        multimedia: { 'canva.project': true, 'multimedia.project': true },
        canvaonly: { 'canva.project': true }
      }
    })
  ]);

  await assertCode(projectSavedCanva(payload('no-auth')), 'unauthenticated');
  const noPermission = await seed('no-permission');
  await assertCode(projectSavedCanva(noPermission, auth('none')), 'permission-denied');

  for (const [name, destinations] of [
    ['projector', ['projector']],
    ['singers', ['singers']],
    ['musicians', ['musicians']],
    ['two', ['projector', 'singers']],
    ['three', ['projector', 'singers', 'musicians']]
  ]) {
    const request = await seed(name);
    request.destinations = destinations;
    const result = await projectSavedCanva(request, auth('owner'));
    assert.equal(result.ok, true);
    const event = (await db.collection('eventos').doc(request.eventId).get()).data();
    destinations.forEach((target) => {
      assert.equal(event.canvaOutputs[target].presentationId, request.canvaId);
      assert.equal(event.canvaOutputs[target].projectionOperationId, result.operationId);
    });
    assert.deepEqual(Object.keys(event.mediaOutputs), []);
  }

  const mediaRequest = await seed('media-selected', {
    event: { mediaOutputs: { projector: { active: true, url: 'https://example.test/video.mp4' } } }
  });
  mediaRequest.destinations = ['singers'];
  await projectSavedCanva(mediaRequest, auth('owner'));
  let mediaEvent = (await db.collection('eventos').doc(mediaRequest.eventId).get()).data();
  assert.equal(mediaEvent.mediaOutputs.projector.url, 'https://example.test/video.mp4');
  assert.equal(mediaEvent.canvaOutputs.singers.presentationId, mediaRequest.canvaId);

  const normal = await seed('undo-normal', {
    event: { mediaOutputs: { projector: { active: true, url: 'https://example.test/previous.mp4' } } }
  });
  const normalProjection = await projectSavedCanva(normal, auth('owner'));
  const normalRestore = await restoreProjectionUndo({ eventId: normal.eventId, operationId: normalProjection.operationId }, auth('owner'));
  assert.equal(normalRestore.status, 'restored');
  let normalEvent = (await db.collection('eventos').doc(normal.eventId).get()).data();
  assert.equal(normalEvent.mediaOutputs.projector.url, 'https://example.test/previous.mp4');
  assert.equal(normalEvent.canvaOutputs.projector, undefined);
  assert.equal((await restoreProjectionUndo({ eventId: normal.eventId, operationId: normalProjection.operationId }, auth('owner'))).status, 'already_restored');

  const mediaTimestamp = admin.firestore.Timestamp.fromMillis(1735689600123);
  const historicalMedia = {
    active: true,
    mediaKey: 'media-historical',
    mediaId: 'media-historical',
    name: 'Media A',
    url: 'https://example.test/media-a.mp4',
    type: 'video',
    mode: 'foreground',
    playing: true,
    volume: 0.8,
    loop: true,
    updatedAt: mediaTimestamp,
    updatedBy: 'Multimedia'
  };
  const historical = await seed('undo-historical-media', {
    event: { mediaOutputs: { projector: historicalMedia } }
  });
  const historicalProjection = await projectSavedCanva(historical, auth('owner'));
  const historicalOperation = await db.collection('eventos').doc(historical.eventId)
    .collection('undoOperations').doc(historicalProjection.operationId).get();
  assert(historicalOperation.get('groups.route_projector.before.mediaOutput.value.updatedAt') instanceof admin.firestore.Timestamp);
  await restoreProjectionUndo({ eventId: historical.eventId, operationId: historicalProjection.operationId }, auth('owner'));
  const historicalRestored = (await db.collection('eventos').doc(historical.eventId).get()).data().mediaOutputs.projector;
  assert(historicalRestored.updatedAt instanceof admin.firestore.Timestamp);
  assert.equal(historicalRestored.updatedAt.seconds, mediaTimestamp.seconds);
  assert.equal(historicalRestored.updatedAt.nanoseconds, mediaTimestamp.nanoseconds);
  assert.deepEqual(historicalRestored, historicalMedia);

  const timestampCas = await seed('timestamp-cas');
  const timestampCasProjection = await projectSavedCanva(timestampCas, auth('owner'));
  const timestampCasOperationRef = db.collection('eventos').doc(timestampCas.eventId)
    .collection('undoOperations').doc(timestampCasProjection.operationId);
  const timestampCasOperation = (await timestampCasOperationRef.get()).data();
  const expectedTimestamp = admin.firestore.Timestamp.fromMillis(1735689600456);
  const currentTimestamp = admin.firestore.Timestamp.fromMillis(1735689600456);
  assert.notEqual(expectedTimestamp, currentTimestamp);
  timestampCasOperation.groups.route_projector.expectedAfter.canvaOutput.value.updatedAt = expectedTimestamp;
  await timestampCasOperationRef.update({ groups: timestampCasOperation.groups });
  await db.collection('eventos').doc(timestampCas.eventId).update({
    'canvaOutputs.projector.updatedAt': currentTimestamp
  });
  assert.equal((await restoreProjectionUndo({ eventId: timestampCas.eventId, operationId: timestampCasProjection.operationId }, auth('owner'))).status, 'restored');

  const navigation = await seed('undo-after-navigation', {
    event: { mediaOutputs: { projector: { active: true, url: 'https://example.test/video-before.mp4' } } }
  });
  const navigationProjection = await projectSavedCanva(navigation, auth('owner'));
  const navigationEventRef = db.collection('eventos').doc(navigation.eventId);
  const navigationProjected = (await navigationEventRef.get()).data();
  const navigationRoute = navigationProjected.canvaOutputs.projector;
  await navigationEventRef.update({
    'canvaOutputs.projector': {
      ...navigationRoute,
      page: 3,
      embedUrl: `${navigationRoute.sourceUrl}?embed#page=3`,
      updatedAt: 3,
      updatedBy: 'Otro operador'
    },
    canvaPageMemory: { projector: { [`id:${navigation.canvaId}`]: 3 } }
  });
  const navigationRestore = await restoreProjectionUndo({
    eventId: navigation.eventId,
    operationId: navigationProjection.operationId
  }, auth('owner'));
  assert.equal(navigationRestore.status, 'restored');
  const navigationRestored = (await navigationEventRef.get()).data();
  assert.equal(navigationRestored.mediaOutputs.projector.url, 'https://example.test/video-before.mp4');
  assert.equal(navigationRestored.canvaOutputs.projector, undefined);
  assert.equal(navigationRestored.canvaPageMemory.projector[`id:${navigation.canvaId}`], 3);

  const replacement = await seed('replacement');
  const replacementX = await projectSavedCanva(replacement, auth('owner'));
  const replacementCanvaId = `${replacement.canvaId}-b`;
  await db.collection('canvaPresentations').doc(replacementCanvaId).set(canva(replacementCanvaId, replacement.eventId));
  const replacementY = await projectSavedCanva({
    ...replacement,
    canvaId: replacementCanvaId,
    requestId: requestId('replacement-b')
  }, auth('operator'));
  const replacementUndo = await restoreProjectionUndo({ eventId: replacement.eventId, operationId: replacementX.operationId }, auth('owner'));
  assert.equal(replacementUndo.status, 'skipped');
  assert.equal(replacementUndo.skipped[0].reason, 'expected_after_mismatch');
  const replacementCurrent = (await db.collection('eventos').doc(replacement.eventId).get()).data().canvaOutputs.projector;
  assert.equal(replacementCurrent.presentationId, replacementCanvaId);
  assert.equal(replacementCurrent.projectionOperationId, replacementY.operationId);

  const reprojection = await seed('same-canva-reprojection');
  const reprojectionX = await projectSavedCanva(reprojection, auth('owner'));
  const reprojectionY = await projectSavedCanva({
    ...reprojection,
    requestId: requestId('same-canva-reprojection-later')
  }, auth('operator'));
  assert.notEqual(reprojectionX.operationId, reprojectionY.operationId);
  const reprojectionUndo = await restoreProjectionUndo({ eventId: reprojection.eventId, operationId: reprojectionX.operationId }, auth('owner'));
  assert.equal(reprojectionUndo.status, 'skipped');
  assert.equal(reprojectionUndo.skipped[0].reason, 'expected_after_mismatch');
  assert.equal((await db.collection('eventos').doc(reprojection.eventId).get()).data().canvaOutputs.projector.projectionOperationId, reprojectionY.operationId);

  const previousCanva = await seed('restore-previous-canva', {
    event: {
      canvaOutputs: {
        projector: {
          active: true,
          presentationId: 'canva-before',
          projectionOperationId: 'previous-instance-x',
          title: 'Canva anterior',
          sourceUrl: 'https://www.canva.com/design/DAFbefore/view',
          embedUrl: 'https://www.canva.com/design/DAFbefore/view?embed#page=4',
          page: 4,
          pageCount: 8,
          updatedAt: 1,
          updatedBy: 'Owner'
        }
      },
      canvaPageMemory: { projector: { 'id:canva-before': 4 } }
    }
  });
  const previousCanvaY = await projectSavedCanva(previousCanva, auth('owner'));
  const previousCanvaRef = db.collection('eventos').doc(previousCanva.eventId);
  const previousCanvaCurrent = (await previousCanvaRef.get()).data().canvaOutputs.projector;
  await previousCanvaRef.update({
    'canvaOutputs.projector': { ...previousCanvaCurrent, page: 3, updatedAt: 3, updatedBy: 'Otro operador' },
    canvaPageMemory: { projector: { [`id:${previousCanva.canvaId}`]: 3, 'id:canva-before': 4 } }
  });
  assert.equal((await restoreProjectionUndo({ eventId: previousCanva.eventId, operationId: previousCanvaY.operationId }, auth('owner'))).status, 'restored');
  const previousCanvaRestored = (await previousCanvaRef.get()).data();
  assert.equal(previousCanvaRestored.canvaOutputs.projector.page, 4);
  assert.equal(previousCanvaRestored.canvaOutputs.projector.projectionOperationId, 'previous-instance-x');
  assert.equal(previousCanvaRestored.canvaPageMemory.projector[`id:${previousCanva.canvaId}`], 3);

  const legacyOperation = await seed('legacy-operation');
  const legacyOperationProjection = await projectSavedCanva(legacyOperation, auth('owner'));
  const legacyOperationRef = db.collection('eventos').doc(legacyOperation.eventId)
    .collection('undoOperations').doc(legacyOperationProjection.operationId);
  await legacyOperationRef.update({
    'groups.route_projector.expectedAfter.canvaOutput.value.projectionOperationId': admin.firestore.FieldValue.delete()
  });
  const legacyOperationUndo = await restoreProjectionUndo({ eventId: legacyOperation.eventId, operationId: legacyOperationProjection.operationId }, auth('owner'));
  assert.equal(legacyOperationUndo.status, 'skipped');
  assert.equal(legacyOperationUndo.skipped[0].reason, 'unsupported_legacy_operation');

  const partial = await seed('undo-partial');
  partial.destinations = ['projector', 'singers'];
  const partialProjection = await projectSavedCanva(partial, auth('owner'));
  await db.collection('eventos').doc(partial.eventId).update({ 'canvaOutputs.singers': { active: true, presentationId: 'other' } });
  const partialRestore = await restoreProjectionUndo({ eventId: partial.eventId, operationId: partialProjection.operationId }, auth('owner'));
  assert.equal(partialRestore.status, 'partial');
  assert.deepEqual(partialRestore.restored, ['route_projector']);
  assert.equal(partialRestore.skipped[0].group, 'route_singers');

  const skipped = await seed('undo-skipped');
  const skippedProjection = await projectSavedCanva(skipped, auth('owner'));
  await db.collection('eventos').doc(skipped.eventId).update({ 'canvaOutputs.projector': { active: true, presentationId: 'other' } });
  assert.equal((await restoreProjectionUndo({ eventId: skipped.eventId, operationId: skippedProjection.operationId }, auth('owner'))).status, 'skipped');

  const retry = await seed('retry');
  const firstRetry = await projectSavedCanva(retry, auth('owner'));
  const secondRetry = await projectSavedCanva(retry, auth('owner'));
  assert.equal(secondRetry.operationId, firstRetry.operationId);
  assert.equal(secondRetry.idempotent, true);
  const deliberateRepeat = await projectSavedCanva({
    ...retry,
    requestId: requestId('retry-deliberate-new-click')
  }, auth('owner'));
  assert.notEqual(deliberateRepeat.operationId, firstRetry.operationId);
  const doubleClick = await seed('double-click');
  const [clickOne, clickTwo] = await Promise.all([
    projectSavedCanva(doubleClick, auth('owner')),
    projectSavedCanva(doubleClick, auth('owner'))
  ]);
  assert.equal(clickOne.operationId, clickTwo.operationId);
  assert.equal([clickOne.idempotent, clickTwo.idempotent].filter(Boolean).length, 1);
  const doubleClickOperations = await db.collection('eventos').doc(doubleClick.eventId).collection('undoOperations').get();
  assert.equal(doubleClickOperations.size, 1);
  const doubleClickEvent = (await db.collection('eventos').doc(doubleClick.eventId).get()).data();
  const doubleClickOperation = doubleClickOperations.docs[0].data();
  assert.equal(doubleClickEvent.canvaOutputs.projector.updatedAt, doubleClickOperation.groups.route_projector.expectedAfter.canvaOutput.value.updatedAt);
  await assertCode(projectSavedCanva({ ...retry, page: 4 }, auth('owner')), 'already-exists');

  const otherOperator = await seed('other-operator');
  const otherProjection = await projectSavedCanva(otherOperator, auth('owner'));
  assert.equal((await restoreProjectionUndo({ eventId: otherOperator.eventId, operationId: otherProjection.operationId }, auth('operator'))).status, 'restored');

  const noRestorePermission = await seed('no-restore-permission');
  const noRestoreProjection = await projectSavedCanva(noRestorePermission, auth('owner'));
  await assertCode(restoreProjectionUndo({ eventId: noRestorePermission.eventId, operationId: noRestoreProjection.operationId }, auth('none')), 'permission-denied');
  const mediaRestorePermission = await seed('media-restore-permission', {
    event: { mediaOutputs: { projector: { active: true, url: 'https://example.test/previous.mp4' } } }
  });
  const mediaRestoreProjection = await projectSavedCanva(mediaRestorePermission, auth('owner'));
  await assertCode(restoreProjectionUndo({ eventId: mediaRestorePermission.eventId, operationId: mediaRestoreProjection.operationId }, auth('canva-only')), 'permission-denied');

  const expired = await seed('expired');
  const expiredProjection = await projectSavedCanva(expired, auth('owner'));
  await db.collection('eventos').doc(expired.eventId).collection('undoOperations').doc(expiredProjection.operationId).update({ expiresAt: Date.now() - 1 });
  await assertCode(restoreProjectionUndo({ eventId: expired.eventId, operationId: expiredProjection.operationId }, auth('owner')), 'failed-precondition');
  await assertCode(restoreProjectionUndo({ eventId: eventId('different-event'), operationId: expiredProjection.operationId }, auth('owner')), 'not-found');

  const missingCanva = await seed('missing-canva');
  await db.collection('canvaPresentations').doc(missingCanva.canvaId).delete();
  await assertCode(projectSavedCanva(missingCanva, auth('owner')), 'not-found');
  const foreign = await seed('foreign', { presentation: canva('canva-foreign', eventId('another')) });
  await assertCode(projectSavedCanva(foreign, auth('owner')), 'permission-denied');
  const invalidTarget = await seed('invalid-target');
  await assertCode(projectSavedCanva({ ...invalidTarget, destinations: ['invalid'] }, auth('owner')), 'invalid-argument');
  const duplicateTarget = await seed('duplicate-target');
  await assertCode(projectSavedCanva({ ...duplicateTarget, destinations: ['projector', 'projector'] }, auth('owner')), 'invalid-argument');
  const invalidPage = await seed('invalid-page');
  await assertCode(projectSavedCanva({ ...invalidPage, page: 9 }, auth('owner')), 'invalid-argument');
  const extraPayload = await seed('extra-payload');
  await assertCode(projectSavedCanva({ ...extraPayload, extra: true }, auth('owner')), 'invalid-argument');

  const legacy = await seed('legacy', { event: { projectorState: { type: 'canva', contentType: 'canva' } } });
  const legacyBefore = (await db.collection('eventos').doc(legacy.eventId).get()).data();
  const legacyResult = await projectSavedCanva(legacy, auth('owner'));
  assert.deepEqual(legacyResult, { ok: false, code: 'LEGACY_CANVA_ACTIVE' });
  assert.deepEqual((await db.collection('eventos').doc(legacy.eventId).get()).data(), legacyBefore);
  assert.equal((await db.collection('eventos').doc(legacy.eventId).collection('undoOperations').get()).empty, true);

  const legacyRetry = await seed('legacy-retry', {
    event: {
      projectorState: {
        type: 'canva', contentType: 'canva',
        previousProjectorState: { type: 'lyrics', contentType: 'lyrics' }
      }
    }
  });
  assert.deepEqual(await projectSavedCanva(legacyRetry, auth('owner')), { ok: false, code: 'LEGACY_CANVA_ACTIVE' });
  await db.collection('eventos').doc(legacyRetry.eventId).update({
    projectorState: { type: 'lyrics', contentType: 'lyrics' }
  });
  const legacyRetryApplied = await projectSavedCanva(legacyRetry, auth('owner'));
  const legacyRetryDuplicate = await projectSavedCanva(legacyRetry, auth('owner'));
  assert.equal(legacyRetryApplied.ok, true);
  assert.equal(legacyRetryDuplicate.operationId, legacyRetryApplied.operationId);
  assert.equal(legacyRetryDuplicate.idempotent, true);
  const legacyRetryEvent = (await db.collection('eventos').doc(legacyRetry.eventId).get()).data();
  assert.equal(legacyRetryEvent.projectorState.contentType, 'lyrics');
  assert.equal(legacyRetryEvent.canvaOutputs.projector.projectionOperationId, legacyRetryApplied.operationId);
  assert.equal((await db.collection('eventos').doc(legacyRetry.eventId).collection('undoOperations').get()).size, 1);

  const temporaryMedia = {
    active: true, mediaKey: 'video-a', mediaId: 'video-a', name: 'Video A',
    url: 'https://example.test/video-a.mp4', type: 'video', mode: 'foreground',
    playing: true, volume: 0.8, loop: true, updatedAt: 1, updatedBy: 'Owner'
  };
  const temporary = temporaryPayload('media');
  await db.collection('eventos').doc(temporary.eventId).set(baseEvent({ mediaOutputs: { projector: temporaryMedia } }));
  const temporaryProjection = await projectTemporaryCanva(temporary, auth('canva-only'));
  let temporaryEvent = (await db.collection('eventos').doc(temporary.eventId).get()).data();
  assert.equal(temporaryEvent.canvaOutputs.projector.presentationId, '');
  assert.equal(temporaryEvent.canvaOutputs.projector.projectionOperationId, temporaryProjection.operationId);
  assert.equal(temporaryEvent.mediaOutputs.projector, undefined);
  const temporaryOperationRef = db.collection('eventos').doc(temporary.eventId).collection('undoOperations').doc(temporaryProjection.operationId);
  assert.equal((await temporaryOperationRef.get()).get('canvaKind'), 'temporary');
  const temporaryUndo = await restoreProjectionUndo({ eventId: temporary.eventId, operationId: temporaryProjection.operationId }, auth('canva-only'));
  assert.equal(temporaryUndo.status, 'restored');
  temporaryEvent = (await db.collection('eventos').doc(temporary.eventId).get()).data();
  assert.deepEqual(temporaryEvent.mediaOutputs.projector, temporaryMedia);

  const temporaryNavigation = temporaryPayload('navigation');
  await db.collection('eventos').doc(temporaryNavigation.eventId).set(baseEvent({ mediaOutputs: { projector: temporaryMedia } }));
  const temporaryNavigationProjection = await projectTemporaryCanva(temporaryNavigation, auth('canva-only'));
  const temporaryNavigationRef = db.collection('eventos').doc(temporaryNavigation.eventId);
  const temporaryNavigationRoute = (await temporaryNavigationRef.get()).data().canvaOutputs.projector;
  await temporaryNavigationRef.update({
    'canvaOutputs.projector': { ...temporaryNavigationRoute, page: 5, embedUrl: `${temporaryNavigationRoute.sourceUrl}?embed#5`, updatedAt: 5, updatedBy: 'Otro operador' },
    canvaPageMemory: { projector: { [`url:${temporaryNavigationRoute.sourceUrl}`]: 5 } }
  });
  await restoreProjectionUndo({ eventId: temporaryNavigation.eventId, operationId: temporaryNavigationProjection.operationId }, auth('canva-only'));
  const temporaryNavigationRestored = (await temporaryNavigationRef.get()).data();
  assert.deepEqual(temporaryNavigationRestored.mediaOutputs.projector, temporaryMedia);
  assert.equal(temporaryNavigationRestored.canvaPageMemory.projector[`url:${temporaryNavigationRoute.sourceUrl}`], 5);

  const temporaryReprojection = temporaryPayload('reprojection');
  await db.collection('eventos').doc(temporaryReprojection.eventId).set(baseEvent());
  const temporaryX = await projectTemporaryCanva(temporaryReprojection, auth('owner'));
  const temporaryY = await projectTemporaryCanva({ ...temporaryReprojection, requestId: requestId('temporary-reprojection-y') }, auth('operator'));
  assert.notEqual(temporaryX.operationId, temporaryY.operationId);
  const temporaryXUndo = await restoreProjectionUndo({ eventId: temporaryReprojection.eventId, operationId: temporaryX.operationId }, auth('owner'));
  assert.equal(temporaryXUndo.status, 'skipped');
  assert.equal((await db.collection('eventos').doc(temporaryReprojection.eventId).get()).data().canvaOutputs.projector.projectionOperationId, temporaryY.operationId);

  const beforeSaved = {
    active: true, presentationId: 'saved-b', projectionOperationId: 'saved-b1', title: 'Saved B',
    sourceUrl: 'https://www.canva.com/design/DAFsaved/view', embedUrl: 'https://www.canva.com/design/DAFsaved/view?embed#4',
    page: 4, pageCount: 8, updatedAt: 4, updatedBy: 'Owner'
  };
  const temporaryOverSaved = temporaryPayload('over-saved');
  await db.collection('eventos').doc(temporaryOverSaved.eventId).set(baseEvent({ canvaOutputs: { projector: beforeSaved } }));
  const temporaryOverSavedProjection = await projectTemporaryCanva(temporaryOverSaved, auth('owner'));
  await restoreProjectionUndo({ eventId: temporaryOverSaved.eventId, operationId: temporaryOverSavedProjection.operationId }, auth('owner'));
  assert.deepEqual((await db.collection('eventos').doc(temporaryOverSaved.eventId).get()).data().canvaOutputs.projector, beforeSaved);

  const beforeTemporary = { ...beforeSaved, presentationId: '', projectionOperationId: 'temporary-b1', title: 'Temporal B' };
  const temporaryOverTemporary = temporaryPayload('over-temporary');
  await db.collection('eventos').doc(temporaryOverTemporary.eventId).set(baseEvent({ canvaOutputs: { projector: beforeTemporary } }));
  const temporaryOverTemporaryProjection = await projectTemporaryCanva(temporaryOverTemporary, auth('owner'));
  await restoreProjectionUndo({ eventId: temporaryOverTemporary.eventId, operationId: temporaryOverTemporaryProjection.operationId }, auth('owner'));
  assert.deepEqual((await db.collection('eventos').doc(temporaryOverTemporary.eventId).get()).data().canvaOutputs.projector, beforeTemporary);

  const temporaryThree = temporaryPayload('three', { destinations: ['projector', 'singers', 'musicians'] });
  await db.collection('eventos').doc(temporaryThree.eventId).set(baseEvent({ mediaOutputs: { projector: temporaryMedia, singers: temporaryMedia, musicians: temporaryMedia } }));
  const temporaryThreeProjection = await projectTemporaryCanva(temporaryThree, auth('canva-only'));
  const temporaryThreeRef = db.collection('eventos').doc(temporaryThree.eventId);
  await temporaryThreeRef.update({ 'canvaOutputs.singers': { active: true, presentationId: '', projectionOperationId: 'other-instance' } });
  const temporaryThreeUndo = await restoreProjectionUndo({ eventId: temporaryThree.eventId, operationId: temporaryThreeProjection.operationId }, auth('canva-only'));
  assert.equal(temporaryThreeUndo.status, 'partial');
  const temporaryThreeEvent = (await temporaryThreeRef.get()).data();
  assert.deepEqual(temporaryThreeEvent.mediaOutputs.projector, temporaryMedia);
  assert.deepEqual(temporaryThreeEvent.mediaOutputs.musicians, temporaryMedia);
  assert.equal(temporaryThreeEvent.canvaOutputs.singers.projectionOperationId, 'other-instance');

  const temporaryRetry = temporaryPayload('retry');
  await db.collection('eventos').doc(temporaryRetry.eventId).set(baseEvent());
  const temporaryRetryOne = await projectTemporaryCanva(temporaryRetry, auth('owner'));
  const temporaryRetryTwo = await projectTemporaryCanva(temporaryRetry, auth('owner'));
  assert.equal(temporaryRetryTwo.operationId, temporaryRetryOne.operationId);
  assert.equal(temporaryRetryTwo.idempotent, true);
  const temporaryNewClick = await projectTemporaryCanva({ ...temporaryRetry, requestId: requestId('temporary-retry-new-click') }, auth('owner'));
  assert.notEqual(temporaryNewClick.operationId, temporaryRetryOne.operationId);

  const temporaryOtherActor = temporaryPayload('other-actor');
  await db.collection('eventos').doc(temporaryOtherActor.eventId).set(baseEvent({ mediaOutputs: { projector: temporaryMedia } }));
  const temporaryOtherActorProjection = await projectTemporaryCanva(temporaryOtherActor, auth('owner'));
  await assertCode(restoreProjectionUndo({ eventId: temporaryOtherActor.eventId, operationId: temporaryOtherActorProjection.operationId }, auth('canva-only-other')), 'permission-denied');

  console.log('canva projection functions: OK');
})().finally(() => fft.cleanup());

import { expect, test } from '@playwright/test';
import process from 'node:process';
import {
  createE2ESongWithId,
  deleteE2EResource,
  readFirestoreDocument,
} from '../helpers/firestoreAdmin.js';

const mode = process.env.KADOSH_V21_CLEANUP_PROBE || '';
const fixtureId = `e2e-v21-cleanup-${mode || 'disabled'}`;
const fixtureTitle = `E2E-QA-V21-CLEANUP-${mode || 'DISABLED'}`;
let tracked = false;

test.afterEach(async () => {
  if (!tracked) return;
  await deleteE2EResource('canciones', fixtureId);
  tracked = false;
});

test('controlled assertion failure runs exact-fixture cleanup', async () => {
  test.skip(mode !== 'assertion', 'Probe opt-in only.');
  await createE2ESongWithId(fixtureId, { titulo: fixtureTitle });
  tracked = true;
  expect(true).toBe(false);
});

test('controlled timeout runs exact-fixture cleanup', async () => {
  test.skip(mode !== 'timeout', 'Probe opt-in only.');
  test.setTimeout(1_000);
  await createE2ESongWithId(fixtureId, { titulo: fixtureTitle });
  tracked = true;
  await new Promise(() => {});
});

test('next run recovers only its exact known fixture', async () => {
  test.skip(mode !== 'recovery', 'Probe opt-in only.');
  const stale = await readFirestoreDocument('canciones', fixtureId);
  expect(stale).toMatchObject({ titulo: fixtureTitle });
  await deleteE2EResource('canciones', fixtureId);
  expect(await readFirestoreDocument('canciones', fixtureId)).toBeNull();
});

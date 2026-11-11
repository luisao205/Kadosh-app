import { expect } from '@playwright/test';
import { login, test, USERS } from '../fixtures/app.js';
import { createE2ESong, deleteE2EResource, e2eId } from '../helpers/firestoreAdmin.js';

const validParts = [
  { songId: 'source-a', originalKey: 'F#', materializedKey: 'E' },
  { songId: 'source-b', originalKey: 'A', materializedKey: 'E' },
];

test('SONG-LOGIC-001 exposes current, legacy and review status and labels archived search results', async ({ page }) => {
  const current = await createE2ESong({
    titulo: e2eId('STATUS-CURRENT'),
    medleyConfig: { materializationVersion: 2, transposeMode: 'UNIFIED', unifiedKey: 'E', songs: validParts, sectionPartIndexes: [0, 1] },
  });
  const legacy = await createE2ESong({
    titulo: e2eId('STATUS-LEGACY'),
    medleyConfig: { transposeMode: 'UNIFIED', unifiedKey: 'E', songs: validParts, sectionPartIndexes: [0, 1] },
  });
  const repair = await createE2ESong({
    titulo: e2eId('STATUS-REPAIR'),
    medleyConfig: { materializationVersion: 2, transposeMode: 'UNIFIED', unifiedKey: 'E', songs: [{ ...validParts[0] }, { ...validParts[1], materializedKey: 'A' }], sectionPartIndexes: [0, 1] },
  });
  const archived = await createE2ESong({ titulo: e2eId('STATUS-ARCHIVED'), estado: 'archived', archived: true });
  try {
    await login(page, USERS.owner);
    await page.goto('/canciones');
    await expect(page.getByTestId(`song-card-${current.id}`)).toHaveText(/actual/i);
    await expect(page.getByTestId(`song-card-${legacy.id}`)).toHaveText(/legacy/i);
    await expect(page.getByTestId(`song-card-${repair.id}`)).toHaveText(/revisar/i);
    const search = page.getByPlaceholder(/buscar por titulo, artista o letra/i);
    await search.fill(archived.titulo);
    await expect(page.getByTestId(`song-card-${archived.id}`)).toContainText(/archivada/i);
  } finally {
    await Promise.all([current, legacy, repair, archived].map((song) => deleteE2EResource('canciones', song.id)));
  }
});

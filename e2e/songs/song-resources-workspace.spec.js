import { expect } from '@playwright/test';
import { login, test, USERS } from '../fixtures/app.js';
import { createE2ESong, deleteE2EResource, e2eId } from '../helpers/firestoreAdmin.js';

const viewports = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1366, height: 768 },
];

test('SONG-WORKSPACE-001 opens multitrack and rehearsal workspaces without narrowing EditSong', async ({ page }) => {
  const song = await createE2ESong({
    titulo: e2eId('SONG-WORKSPACE'),
    letraRaw: '# Intro\n[C]Contenido',
    multitracks: [{ id: 'e2e-click', nombre: 'Click', fileName: 'click.wav', url: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' }],
    recursos: [{ id: 'e2e-pdf', titulo: 'Partitura E2E', tipo: 'pdf', instrumento: 'General', url: 'data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK' }],
  });

  try {
    await login(page, USERS.owner);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`/editar/${song.id}`);
      await expect(page.getByTestId('projection-background-panel')).toBeVisible();
      const panelOrder = await page.getByTestId('projection-background-panel').evaluate((background) => {
        const card = background.closest('.kp-card');
        if (!card) return { tagsBeforeBackground: false, backgroundBeforeAudio: false };
        const labels = [...card.querySelectorAll('label')];
        const tags = labels.find((label) => label.textContent?.includes('Etiquetas'));
        const audio = labels.find((label) => label.textContent?.includes('Pista o Secuencia de Audio'));
        return {
          tagsBeforeBackground: Boolean(tags && background && (tags.compareDocumentPosition(background) & Node.DOCUMENT_POSITION_FOLLOWING)),
          backgroundBeforeAudio: Boolean(background && audio && (background.compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING)),
        };
      });
      expect(panelOrder).toEqual({ tagsBeforeBackground: true, backgroundBeforeAudio: true });
      await page.getByRole('button', { name: /administrar pistas/i }).click();
      const tracks = page.getByRole('dialog', { name: /pistas multitrack/i });
      await expect(tracks.getByText('Click', { exact: true })).toBeVisible();
      await expect(await tracks.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      const trackBounds = await tracks.boundingBox();
      expect(trackBounds).not.toBeNull();
      if (viewport.width < 768) {
        expect(Math.round(trackBounds.x)).toBe(0);
        expect(Math.round(trackBounds.y)).toBe(0);
        expect(Math.round(trackBounds.height)).toBe(viewport.height);
      } else {
        expect(trackBounds.width).toBeGreaterThan(viewport.width * 0.84);
        expect(trackBounds.height).toBeGreaterThan(viewport.height * 0.84);
      }
      await tracks.getByRole('button', { name: /cerrar pistas multitrack/i }).click();

      await page.getByRole('button', { name: /administrar recursos/i }).click();
      const resources = page.getByRole('dialog', { name: /recursos de ensayo/i });
      await expect(resources.getByText('Partitura E2E', { exact: true })).toBeVisible();
      await expect(await resources.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await resources.getByRole('button', { name: /cerrar recursos de ensayo/i }).click();
    }
  } finally {
    await deleteE2EResource('canciones', song.id);
  }
});

import { expect } from '@playwright/test';
import { test, CONTROLLER_EVENT_ID, login, USERS } from '../fixtures/app.js';
import {
  createE2ESong,
  deleteE2EResource,
  readFirestoreDocument,
  resetControllerE2EEvent,
  updateControllerE2EEvent,
} from '../helpers/firestoreAdmin.js';

const controllerPath = `/control-proyector/${CONTROLLER_EVENT_ID}`;
const projectorPath = `/proyector/${CONTROLLER_EVENT_ID}`;

async function saveEditor(page) {
  await page.getByRole('button', { name: /^guardar cambios$/i }).last().click();
  await expect(page.getByText(/canci.n actualizada exitosamente/i)).toBeVisible({ timeout: 30_000 });
}

test.describe.serial('Projection style persistence', () => {
  let originalEvent;

  test.beforeAll(async () => {
    originalEvent = await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID);
    if (!originalEvent) throw new Error('Falta el seed e2e-controller-event.');
  });

  test.afterEach(async () => {
    await resetControllerE2EEvent(originalEvent);
  });

  test('PROJECTION-STYLE-001 persists song default and motion through reload', async ({ page }) => {
    const song = await createE2ESong({ letraRaw: '# Verso\n[C]Estilo persistente' });
    try {
      await login(page, USERS.owner);
      await page.goto(`/editar/${song.id}`);
      const panel = page.getByLabel(/estilo de proyecci.n/i);
      await panel.getByLabel('Preset').selectOption('cinematic');
      await panel.getByLabel('Movimiento').selectOption('soft');
      const preview = panel.locator('.projection-style-preview');
      await expect(preview.locator('.projection-style-preview-text')).toHaveText('Tu gracia es suficienteTu presencia es mi hogar');
      await expect(preview).toHaveClass(/projection-preset-cinematic/);
      await expect(preview).toHaveClass(/projection-motion-soft/);
      await panel.getByRole('button', { name: /vista previa/i }).click();
      await saveEditor(page);
      await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.projectionStyle).toEqual({
        preset: 'cinematic', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto',
      });

      await page.reload();
      await expect(panel.getByLabel('Preset')).toHaveValue('cinematic');
      await expect(panel.getByLabel('Movimiento')).toHaveValue('soft');
    } finally {
      await deleteE2EResource('canciones', song.id);
    }
  });

  test('PROJECTION-STYLE-002 resolves the clean fallback for a legacy song', async ({ page }) => {
    const song = await createE2ESong({ letraRaw: '# Verso\n[C]Fallback legacy' });
    try {
      await updateControllerE2EEvent({
        setlist: [{ idLocal: 'e2e-projection-style', type: 'song', value: song.id }],
        canciones: [song.id],
        songProjectionStyleOverrides: {},
      });
      await login(page, USERS.owner);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: new RegExp(song.titulo) }).click();

      await expect(page.getByText(/estilo: limpio/i)).toBeVisible();
      await expect(page.getByText(/fallback global/i)).toBeVisible();
      await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.projectionStyle).toBeUndefined();
    } finally {
      await deleteE2EResource('canciones', song.id);
    }
  });

  test('PROJECTION-STYLE-003 persists an event override without mutating the song and restores its default', async ({ page }) => {
    const song = await createE2ESong({
      letraRaw: '# Verso\n[C]Estilo de evento',
      projectionStyle: { preset: 'cinematic', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' },
    });
    try {
      await updateControllerE2EEvent({
        setlist: [{ idLocal: 'e2e-projection-style', type: 'song', value: song.id }],
        canciones: [song.id],
        songProjectionStyleOverrides: {},
      });
      await login(page, USERS.owner);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: new RegExp(song.titulo) }).click();
      await expect(page.getByText(/predeterminado de canci.n/i)).toBeVisible();
      await expect(page.getByLabel('Preset').last()).toHaveValue('cinematic');

      const preset = page.getByLabel('Preset').last();
      await preset.selectOption('impact');
      await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.songProjectionStyleOverrides?.[song.id]).toEqual({
        preset: 'impact', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto',
      });
      await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.projectionStyle).toEqual({
        preset: 'cinematic', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto',
      });

      await page.reload();
      await page.getByRole('button', { name: new RegExp(song.titulo) }).click();
      await expect(page.getByText(/personalizado para este evento/i)).toBeVisible();
      await expect(page.getByLabel('Preset').last()).toHaveValue('impact');

      await page.getByRole('button', { name: /restaurar predeterminado/i }).click();
      await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.songProjectionStyleOverrides?.[song.id]).toBeUndefined();
      await expect(page.getByText(/predeterminado de canci.n/i)).toBeVisible();
      await expect(page.getByLabel('Preset').last()).toHaveValue('cinematic');
    } finally {
      await deleteE2EResource('canciones', song.id);
    }
  });

  test('PROJECTION-STYLE-004 renders all presets on the real projector output', async ({ page, browser }) => {
    const song = await createE2ESong({ letraRaw: '# Verso\n[C]Estilo visual E2E' });
    const outputContext = await browser.newContext();
    const output = await outputContext.newPage();
    try {
      await updateControllerE2EEvent({
        setlist: [{ idLocal: 'e2e-projection-style-visual', type: 'song', value: song.id }],
        canciones: [song.id],
        songProjectionStyleOverrides: {},
        proyectorApagado: false,
      });
      await login(output, USERS.owner);
      await output.goto(projectorPath);
      await login(page, USERS.owner);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: new RegExp(song.titulo) }).click();
      const slide = page.getByText('Estilo visual E2E', { exact: true }).first();

      for (const preset of ['clean', 'cinematic', 'worship', 'impact', 'minimal']) {
        await page.getByLabel('Preset').last().selectOption(preset);
        await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.songProjectionStyleOverrides?.[song.id]?.preset).toBe(preset);
        await slide.dblclick();
        await expect(output.locator(`[data-projection-transition-id].projection-preset-${preset}`)).toBeVisible({ timeout: 15_000 });
        await expect(output.getByText('Estilo visual E2E', { exact: true })).toBeVisible();
      }
    } finally {
      await outputContext.close();
      await deleteE2EResource('canciones', song.id);
    }
  });

  test('PROJECTION-STYLE-005 honors reduced motion without delaying content', async ({ page, browser }) => {
    const song = await createE2ESong({ letraRaw: '# Verso\n[C]Movimiento reducido E2E' });
    const outputContext = await browser.newContext();
    const output = await outputContext.newPage();
    try {
      await updateControllerE2EEvent({
        setlist: [{ idLocal: 'e2e-projection-style-reduced', type: 'song', value: song.id }],
        canciones: [song.id],
        songProjectionStyleOverrides: {},
        proyectorApagado: false,
      });
      await login(output, USERS.owner);
      await output.goto(projectorPath);
      await output.emulateMedia({ reducedMotion: 'reduce' });
      await login(page, USERS.owner);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: new RegExp(song.titulo) }).click();
      await page.getByLabel('Preset').last().selectOption('impact');
      await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))?.songProjectionStyleOverrides?.[song.id]?.preset).toBe('impact');
      await page.getByText('Movimiento reducido E2E', { exact: true }).first().dblclick();

      const slide = output.locator('[data-projection-transition-id].projection-preset-impact');
      await expect(slide).toBeVisible({ timeout: 15_000 });
      await expect(output.getByText('Movimiento reducido E2E', { exact: true })).toBeVisible();
      await expect(await slide.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
    } finally {
      await outputContext.close();
      await deleteE2EResource('canciones', song.id);
    }
  });

  test('PROJECTION-STYLE-006 preserves text contrast for every preset and motion', async ({ page, browser }) => {
    test.setTimeout(60_000);
    const song = await createE2ESong({ letraRaw: '# Verso\n[C]Contraste persistente E2E' });
    const outputContext = await browser.newContext();
    const output = await outputContext.newPage();
    try {
      await updateControllerE2EEvent({
        setlist: [{ idLocal: 'e2e-projection-style-contrast', type: 'song', value: song.id }],
        canciones: [song.id],
        songProjectionStyleOverrides: {},
        proyectorApagado: false,
      });
      await login(output, USERS.owner);
      await output.goto(projectorPath);
      await login(page, USERS.owner);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: new RegExp(song.titulo) }).click();
      const slide = page.getByText('Contraste persistente E2E', { exact: true }).first();
      const presetSelect = page.getByLabel('Preset').last();
      const motionSelect = page.getByLabel('Movimiento').last();

      for (const preset of ['clean', 'cinematic', 'worship', 'impact', 'minimal']) {
        for (const motion of ['none', 'soft', 'dynamic']) {
          await presetSelect.selectOption(preset);
          await motionSelect.selectOption(motion);
          await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))
            ?.songProjectionStyleOverrides?.[song.id]).toMatchObject({ preset, motion });
          await slide.dblclick();

          const projected = output.locator(`[data-projection-transition-id].projection-preset-${preset}.projection-motion-${motion}`);
          await expect(projected).toBeVisible({ timeout: 15_000 });
          const text = projected.locator('.projection-lyric-text');
          await expect(text).toBeVisible();
          await expect.poll(() => text.evaluate((element) => getComputedStyle(element).textShadow)).not.toBe('none');
        }
      }
    } finally {
      await outputContext.close();
      await deleteE2EResource('canciones', song.id);
    }
  });

  test('PROJECTION-STYLE-007 serializes rapid event style changes and restore', async ({ page }) => {
    test.setTimeout(60_000);
    const song = await createE2ESong({
      letraRaw: '# Verso\n[C]Carrera de estilo E2E',
      projectionStyle: { preset: 'cinematic', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' },
    });
    try {
      await updateControllerE2EEvent({
        setlist: [{ idLocal: 'e2e-projection-style-race', type: 'song', value: song.id }],
        canciones: [song.id],
        songProjectionStyleOverrides: {},
      });
      await login(page, USERS.owner);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: new RegExp(song.titulo) }).click();
      const preset = page.getByLabel('Preset').last();
      const motion = page.getByLabel('Movimiento').last();
      const restore = page.getByRole('button', { name: /restaurar predeterminado/i });
      const eventStyle = () => readFirestoreDocument('eventos', CONTROLLER_EVENT_ID)
        .then((event) => event?.songProjectionStyleOverrides?.[song.id]);

      // No waits between controls: each handler must consume the optimistic draft.
      await preset.selectOption('cinematic');
      await motion.selectOption('none');
      await expect.poll(eventStyle).toMatchObject({ preset: 'cinematic', motion: 'none' });
      await expect(preset).toHaveValue('cinematic');
      await expect(motion).toHaveValue('none');

      await preset.selectOption('impact');
      await motion.selectOption('dynamic');
      await expect.poll(eventStyle).toMatchObject({ preset: 'impact', motion: 'dynamic' });

      await preset.selectOption('worship');
      await motion.selectOption('soft');
      await preset.selectOption('minimal');
      await motion.selectOption('none');
      await preset.selectOption('impact');
      await motion.selectOption('dynamic');
      await expect.poll(eventStyle).toMatchObject({ preset: 'impact', motion: 'dynamic' });

      await restore.click();
      await preset.selectOption('impact');
      await expect.poll(eventStyle).toMatchObject({ preset: 'impact', motion: 'soft' });
      await expect.poll(async () => (await readFirestoreDocument('canciones', song.id))?.projectionStyle)
        .toEqual({ preset: 'cinematic', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' });
      await expect(preset).toHaveValue('impact');
      await expect(motion).toHaveValue('soft');
    } finally {
      await deleteE2EResource('canciones', song.id);
    }
  });

  test('PROJECTION-STYLE-008 keeps a local video background playing through preset and page changes', async ({ page, browser }) => {
    test.setTimeout(60_000);
    const song = await createE2ESong({
      letraRaw: '# Verso\n[C]Video de fondo E2E\n# Coro\n[G]La segunda página sigue visible',
      fondoUrl: '/e2e-projection-style-video.webm',
    });
    const outputContext = await browser.newContext();
    const output = await outputContext.newPage();
    try {
      await updateControllerE2EEvent({
        setlist: [{ idLocal: 'e2e-projection-style-video', type: 'song', value: song.id }],
        canciones: [song.id],
        songProjectionStyleOverrides: {},
        proyectorApagado: false,
      });
      await login(output, USERS.owner);
      await output.goto(projectorPath);
      await login(page, USERS.owner);
      await page.goto(controllerPath);
      await page.getByRole('button', { name: new RegExp(song.titulo) }).click();
      await page.getByText('Video de fondo E2E', { exact: true }).first().dblclick();

      const backgroundVideo = output.locator('video[src*="e2e-projection-style-video.webm"]');
      await expect(backgroundVideo).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => backgroundVideo.evaluate((video) => video.readyState >= 2 && !video.paused)).toBe(true);
      const initialTime = await backgroundVideo.evaluate((video) => video.currentTime);

      const slide = page.getByText('Video de fondo E2E', { exact: true }).first();
      for (const preset of ['clean', 'cinematic', 'worship', 'impact', 'minimal']) {
        await page.getByLabel('Preset').last().selectOption(preset);
        await expect.poll(async () => (await readFirestoreDocument('eventos', CONTROLLER_EVENT_ID))
          ?.songProjectionStyleOverrides?.[song.id]?.preset).toBe(preset);
        await slide.dblclick();
        await expect(output.locator(`[data-projection-transition-id].projection-preset-${preset}`)).toBeVisible();
        await expect(backgroundVideo).toBeVisible();
        await expect.poll(() => backgroundVideo.evaluate((video) => !video.paused && video.readyState >= 2)).toBe(true);
      }

      await page.getByText('La segunda página sigue visible', { exact: true }).first().dblclick();
      await expect(output.getByText('La segunda página sigue visible', { exact: true })).toBeVisible();
      await expect.poll(() => backgroundVideo.evaluate((video) => video.currentTime > 0 && !video.paused)).toBe(true);
      await expect.poll(() => backgroundVideo.evaluate((video) => video.currentTime)).toBeGreaterThan(initialTime);
    } finally {
      await outputContext.close();
      await deleteE2EResource('canciones', song.id);
    }
  });
});

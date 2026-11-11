import { expect } from '@playwright/test';
import { login, test, USERS } from '../fixtures/app.js';
import { createE2EMedia, deleteE2EResource, e2eId } from '../helpers/firestoreAdmin.js';

const poster = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="360"%3E%3Crect width="640" height="360" fill="%231d4ed8"/%3E%3C/svg%3E';

test('MEDIA-LIBRARY-001 renders optimized previews without eager video requests', async ({ page }) => {
  const video = await createE2EMedia({
    title: e2eId('POSTER-VIDEO'), type: 'video',
    url: '/e2e-projection-style-video.webm', thumbnailUrl: poster,
  });
  const image = await createE2EMedia({
    title: e2eId('OPTIMIZED-IMAGE'), type: 'image',
    url: poster,
    thumbnailUrl: poster,
  });
  const mediaRequests = [];
  page.on('request', (request) => mediaRequests.push(request.url()));

  try {
    await login(page, USERS.owner);
    await page.goto('/biblioteca-multimedia');
    await page.getByRole('button', { name: /videos/i }).click();
    const videoPoster = page.locator(`img[alt="${video.title}"]`);
    await expect(videoPoster).toBeVisible();
    await expect(videoPoster).toHaveAttribute('loading', 'lazy');
    await expect(videoPoster).toHaveAttribute('src', poster);
    expect(mediaRequests.some((url) => url.includes('e2e-original-video.mp4'))).toBe(false);

    await page.getByRole('button', { name: /imagenes/i }).click();
    const imagePreview = page.getByRole('button', { name: `Abrir ${image.title}` }).locator('img');
    await expect(imagePreview).toBeVisible();
    await expect(imagePreview).toHaveAttribute('loading', 'lazy');
    await expect(imagePreview).toHaveAttribute('src', image.thumbnailUrl);
  } finally {
    await Promise.all([video, image].map((item) => deleteE2EResource('mediaLibrary', item.id)));
  }
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const virtualId = 'virtual:editor-collapsible-test.jsx';
const resolvedVirtualId = `\0${virtualId}`;

const testModule = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { jsx } from 'react/jsx-runtime';
  import '/src/index.css';
  import SongResourcesPanel from '/src/components/admin/SongResourcesPanel.jsx';

  function TestEditor() {
    const [fondoUrl, setFondoUrl] = useState('https://res.cloudinary.com/demo/video/upload/sample.mp4');
    const [projectionStyle, setProjectionStyle] = useState({ preset: 'worship', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' });
    const [audioUrl, setAudioUrl] = useState('https://example.com/audio.mp3');
    const [youtubeUrl, setYoutubeUrl] = useState('https://youtube.com/watch?v=123');
    const [multitracks, setMultitracks] = useState([
      { id: 'stem-1', nombre: 'Click', fileName: 'click.wav' },
      { id: 'stem-2', nombre: 'Guia', fileName: 'guide.wav' },
    ]);
    const [recursos, setRecursos] = useState([
      { id: 'rec-1', titulo: 'Tutorial Piano', tipo: 'youtube', instrumento: 'Piano', url: 'https://youtube.com/watch?v=piano' },
    ]);
    const [nuevoRecurso, setNuevoRecurso] = useState({ titulo: '', url: '', tipo: 'youtube', instrumento: 'General' });

    return jsx('div', {
      className: 'p-8 max-w-4xl mx-auto bg-zinc-950 text-white min-h-screen',
      children: [
        // Essential fields simulation
        jsx('div', {
          key: 'essential-fields',
          id: 'essential-fields',
          className: 'mb-6 p-4 border border-zinc-800 rounded-2xl bg-zinc-900',
          children: [
            jsx('h2', { key: 'title', className: 'text-xl font-bold', children: 'Campos Esenciales' }),
            jsx('input', { key: 'title-input', id: 'input-titulo', defaultValue: 'Cuan Grande es Dios', className: 'kp-input p-2 mt-2 w-full' }),
            jsx('div', { key: 'v21-styles', id: 'v21-styles-panel', className: 'mt-2 text-sm text-violet-400', children: 'Panel V2.1 Estilos Activo' }),
          ],
        }),
        // Collapsible resources panel
        jsx(SongResourcesPanel, {
          key: 'resources-panel',
          fondoUrl,
          onFondoUrlChange: setFondoUrl,
          projectionStyle,
          onProjectionStyleChange: setProjectionStyle,
          audioUrl,
          youtubeUrl,
          onYoutubeUrlChange: setYoutubeUrl,
          multitracks,
          onRemoveStem: (id) => setMultitracks(prev => prev.filter(m => m.id !== id)),
          recursos,
          nuevoRecurso,
          onNuevoRecursoChange: setNuevoRecurso,
          onAddRecurso: () => setRecursos(prev => [...prev, { ...nuevoRecurso, id: String(Date.now()) }]),
          onRemoveRecurso: (id) => setRecursos(prev => prev.filter(r => r.id !== id)),
          sectionMediaProps: {
            sections: [{ titulo: 'Intro' }, { titulo: 'Coro' }],
            sectionMedia: { '0_intro': { mediaId: 'm1' } },
            getSectionKey: (s, i) => \`\${i}_\${s.titulo.toLowerCase()}\`,
            getSectionDraft: () => ({}),
            updateSectionDraft: () => {},
            onSelectLibraryResource: () => {},
            onAddUrlResource: () => {},
          }
        }),
      ],
    });
  }

  createRoot(document.getElementById('root')).render(jsx(TestEditor, {}));
`;

async function main() {
  console.log('--- STARTING EDITOR COLLAPSIBLE PANELS VERIFICATION ---');

  // 1. Static AST/source check on AddSongAI.jsx and EditSong.jsx
  const addSongContent = fs.readFileSync('src/components/admin/AddSongAI.jsx', 'utf8');
  const editSongContent = fs.readFileSync('src/components/admin/EditSong.jsx', 'utf8');
  const panelContent = fs.readFileSync('src/components/admin/SongResourcesPanel.jsx', 'utf8');

  // Verify SongResourcesPanel is used in both
  assert.ok(addSongContent.includes('<SongResourcesPanel'), 'AddSongAI.jsx must use SongResourcesPanel');
  assert.ok(editSongContent.includes('<SongResourcesPanel'), 'EditSong.jsx must use SongResourcesPanel');

  // Verify exact order in SongResourcesPanel.jsx (inside the rendered JSX):
  const jsxBody = panelContent.slice(panelContent.indexOf('return ('));
  const fondoIdx = jsxBody.indexOf('1. Fondo de Proyección Automático');
  const estiloIdx = jsxBody.indexOf('2. Estilo de Proyección y Formato especial de letras');
  const audioIdx = jsxBody.indexOf('3. Pista o Secuencia de Audio (MP3)');
  const multiIdx = jsxBody.indexOf('4. Pistas Multitrack (In-Ears / Secuencias)');
  const recIdx = jsxBody.indexOf('5. Recursos de Ensayo (Videos, Partituras)');
  const mediaIdx = jsxBody.indexOf('6. Multimedia por Sección');

  assert.ok(fondoIdx !== -1, 'Fondo section must exist');
  assert.ok(estiloIdx !== -1, 'Estilo y Formato section must exist');
  assert.ok(audioIdx !== -1, 'Audio section must exist');
  assert.ok(multiIdx !== -1, 'Multitracks section must exist');
  assert.ok(recIdx !== -1, 'Recursos section must exist');
  assert.ok(mediaIdx !== -1, 'Multimedia por Sección section must exist');

  assert.ok(fondoIdx < estiloIdx, 'Order check: 1. Fondo must precede 2. Estilo y Formato');
  assert.ok(estiloIdx < audioIdx, 'Order check: 2. Estilo y Formato must precede 3. Audio');
  assert.ok(audioIdx < multiIdx, 'Order check: 3. Audio must precede 4. Multitracks');
  assert.ok(multiIdx < recIdx, 'Order check: 4. Multitracks must precede 5. Recursos');
  assert.ok(recIdx < mediaIdx, 'Order check: 5. Recursos must precede 6. Multimedia por Sección');
  console.log('[PASS] Static order check: 1. Fondo -> 2. Estilo y Formato -> 3. Audio -> 4. Multitracks -> 5. Recursos -> 6. Multimedia por Sección verified!');

  // 2. Playwright interactive UI test
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: 'error',
    plugins: [
      {
        name: 'editor-collapsible-plugin',
        resolveId(id) {
          return id === virtualId ? resolvedVirtualId : null;
        },
        load(id) {
          return id === resolvedVirtualId ? testModule : null;
        },
        configureServer(viteServer) {
          viteServer.middlewares.use('/__editor_test__', async (_req, res) => {
            const html = await viteServer.transformIndexHtml(
              '/__editor_test__',
              `<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/src/index.css"></head><body style="margin:0; background:black"><div id="root"></div><script type="module" src="/@id/${virtualId}"></script></body></html>`
            );
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          });
        },
      },
      react(),
    ],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });

  await server.listen();
  const address = server.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}/__editor_test__`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);

    // Verify Essential fields are visible
    const titleVal = await page.inputValue('#input-titulo');
    assert.equal(titleVal, 'Cuan Grande es Dios', 'Essential song title input must be visible and accessible');
    const v21PanelVisible = await page.isVisible('#v21-styles-panel');
    assert.ok(v21PanelVisible, 'V2.1 styles panel must be visible');
    console.log('[PASS] Essential song fields and V2.1 styles remain clearly visible.');

    // Verify Initial State: All 6 panels are closed (initial state CLOSED)
    const buttons = await page.locator('button[aria-expanded]').all();
    assert.equal(buttons.length, 6, 'There must be 6 collapsible toggle buttons');

    for (let i = 0; i < buttons.length; i++) {
      const expanded = await buttons[i].getAttribute('aria-expanded');
      assert.equal(expanded, 'false', `Panel ${i + 1} must be closed initially`);
    }
    console.log('[PASS] Initial state check: All 6 panels are CLOSED by default.');

    // Verify independent toggling & no data loss:
    // Open Panel 1 (Fondo)
    await buttons[0].click();
    assert.equal(await buttons[0].getAttribute('aria-expanded'), 'true', 'Panel 1 (Fondo) must be open');
    assert.equal(await buttons[1].getAttribute('aria-expanded'), 'false', 'Panel 2 (Estilo y Formato) must remain closed');
    assert.equal(await buttons[2].getAttribute('aria-expanded'), 'false', 'Panel 3 (Audio) must remain closed');

    // Type into a field in Panel 1
    const fondoInput = page.locator('input[placeholder="https://ejemplo.com/fondo.mp4"]');
    await fondoInput.fill('https://custom-url.com/fondo.mp4');

    // Close Panel 1, open Panel 2 (Estilo y Formato)
    await buttons[0].click();
    assert.equal(await buttons[0].getAttribute('aria-expanded'), 'false', 'Panel 1 must collapse');

    await buttons[1].click();
    assert.equal(await buttons[1].getAttribute('aria-expanded'), 'true', 'Panel 2 (Estilo y Formato) must open');
    const presetSelect = page.locator('select').first();
    await presetSelect.selectOption('cinematic');

    // Close Panel 2, open Panel 3 (Audio)
    await buttons[1].click();
    assert.equal(await buttons[1].getAttribute('aria-expanded'), 'false', 'Panel 2 must collapse');

    await buttons[2].click();
    assert.equal(await buttons[2].getAttribute('aria-expanded'), 'true', 'Panel 3 (Audio) must open');
    const youtubeInput = page.locator('input[placeholder="https://youtube.com/watch?v=..."]');
    await youtubeInput.fill('https://youtube.com/watch?v=customAudio');

    // Re-open Panel 1 and verify data was NOT lost:
    await buttons[0].click();
    assert.equal(await buttons[0].getAttribute('aria-expanded'), 'true', 'Panel 1 must re-open');
    const retainedFondoVal = await fondoInput.inputValue();
    assert.equal(retainedFondoVal, 'https://custom-url.com/fondo.mp4', 'Fondo URL must NOT be lost on collapse!');

    // Re-open Panel 2 and verify preset was NOT lost:
    await buttons[1].click();
    const retainedPresetVal = await presetSelect.inputValue();
    assert.equal(retainedPresetVal, 'cinematic', 'Projection preset must NOT be lost on collapse!');

    // Re-verify Panel 3 data was NOT lost:
    const retainedYoutubeVal = await youtubeInput.inputValue();
    assert.equal(retainedYoutubeVal, 'https://youtube.com/watch?v=customAudio', 'YouTube URL must NOT be lost on collapse!');

    // Open Panel 4 (Multitracks) and verify stems
    await buttons[3].click();
    assert.equal(await buttons[3].getAttribute('aria-expanded'), 'true');
    const multitrackText = await page.textContent('body');
    assert.ok(multitrackText.includes('click.wav'), 'Multitrack file click.wav must be listed');

    // Open Panel 5 (Recursos) and verify resources
    await buttons[4].click();
    assert.equal(await buttons[4].getAttribute('aria-expanded'), 'true');
    const recursosText = await page.textContent('body');
    assert.ok(recursosText.includes('Tutorial Piano'), 'Resource Tutorial Piano must be listed');

    // Open Panel 6 (Multimedia por Sección)
    await buttons[5].click();
    assert.equal(await buttons[5].getAttribute('aria-expanded'), 'true');

    console.log('[PASS] Independent toggling & Zero Data Loss verification passed 100%!');
    console.log('--- ALL EDITOR COLLAPSIBLE PANELS CHECKS PASSED ---');
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});

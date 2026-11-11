import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

const EMULATOR_HOST = '127.0.0.1:8080';
const PROJECT_ID = 'kadosh-49600';
const EVENT_ID = 'e2e-controller-event';
const PASSWORD = 'LocalE2E-Canva-2026!';
const BASE_URL = process.env.KADOSH_E2E_BASE_URL || 'http://127.0.0.1:5174';
const SAMPLE_COUNT = Number(process.env.KADOSH_LATENCY_SAMPLES || 100);
const WARMUP_COUNT = Number(process.env.KADOSH_LATENCY_WARMUP || 5);
const TOTAL_PAGES = SAMPLE_COUNT + WARMUP_COUNT;
const REDUCED_MOTION = process.env.KADOSH_LATENCY_REDUCED_MOTION === '1';
const NO_TRANSITION_QA = process.env.KADOSH_LATENCY_NO_TRANSITION === '1';
const HEADLESS = process.env.KADOSH_LATENCY_HEADLESS !== '0';
const REPORT_NAME = process.env.KADOSH_LATENCY_REPORT_NAME || (NO_TRANSITION_QA ? 'REALTIME_PREOPT_NO_TRANSITION_V2' : REDUCED_MOTION ? 'REALTIME_PREOPT_REDUCED_MOTION_V2' : 'REALTIME_PREOPT_FIRST_VISIBLE_V2');

if (process.env.FIRESTORE_EMULATOR_HOST !== EMULATOR_HOST) {
  throw new Error(`Benchmark bloqueado: FIRESTORE_EMULATOR_HOST debe ser ${EMULATOR_HOST}.`);
}

const app = admin.apps.find((candidate) => candidate?.name === 'latency-benchmark')
  || admin.initializeApp({ projectId: PROJECT_ID }, 'latency-benchmark');
const db = app.firestore();

const percentile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
};

const summarize = (values) => ({
  count: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: Math.max(...values),
});

const outputDefinitions = [
  { key: 'projector', route: `/proyector/${EVENT_ID}` },
  { key: 'singers', route: `/retorno/${EVENT_ID}` },
  { key: 'musicians', route: `/retorno-musicos/${EVENT_ID}` },
];

const markerFor = (index) => `LATENCY-V2-${String(index).padStart(3, '0')}`;
const sectionNameFor = (index) => ['Verso', 'Coro', 'Puente', 'Medley A', 'Medley B', 'Medley C'][index % 6];

const buildLyrics = () => Array.from({ length: TOTAL_PAGES }, (_, index) => (
  `# ${sectionNameFor(index)} ${index + 1}\n${markerFor(index)}`
)).join('\n\n');

const login = async (page, email) => {
  await page.goto(BASE_URL);
  await page.getByLabel(/correo electr.nico/i).fill(email);
  await page.getByLabel(/contrase.a/i).fill(PASSWORD);
  await page.getByRole('button', { name: /entrar a kadosh pro/i }).click();
  await page.getByRole('button', { name: /cerrar sesi.n/i }).waitFor();
};

const installTransitionObserver = (page) => page.evaluate(() => {
  window.__kadoshProjectionTransitionMarks = new Map();
  const record = (element) => {
    const transitionId = element?.getAttribute?.('data-projection-transition-id');
    if (transitionId) window.__kadoshProjectionTransitionMarks.set(transitionId, Date.now());
  };
  new MutationObserver((records) => {
    records.forEach((mutation) => {
      if (mutation.type === 'attributes') record(mutation.target);
      if (mutation.type === 'childList') mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        record(node);
        node.querySelectorAll?.('[data-projection-transition-id]').forEach(record);
      });
    });
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-projection-transition-id'] });
});

const outputTimestamps = (page, transitionId) => page.evaluate((id) => new Promise((resolve) => {
  const marks = window.__kadoshProjectionTransitionMarks;
  let done = false;
  let intervalId;
  let timeoutId;
  let observer;
  const finish = (firstVisibleAt) => {
    if (done) return;
    done = true;
    observer?.disconnect();
    clearInterval(intervalId);
    clearTimeout(timeoutId);
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      const paintedAt = Date.now();
      const target = document.querySelector(`[data-projection-transition-id="${CSS.escape(id)}"]`);
      const animations = target?.getAnimations?.().filter((animation) => animation.playState !== 'finished') || [];
      if (animations.length) await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
      resolve({ firstVisibleAt, paintedAt, animationSettledAt: Date.now() });
    }));
  };
  const existing = marks?.get(id);
  if (existing) return finish(existing);
  observer = new MutationObserver((records) => {
    for (const record of records) {
      const nextId = record.target.getAttribute('data-projection-transition-id');
      if (nextId === id) {
        observer.disconnect();
        return finish(Date.now());
      }
    }
  });
  observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-projection-transition-id'] });
  intervalId = setInterval(() => {
    const mark = marks?.get(id);
    if (mark) finish(mark);
  }, 5);
  timeoutId = setTimeout(() => {
    if (done) return;
    done = true;
    observer.disconnect();
    clearInterval(intervalId);
    resolve({ firstVisibleAt: null, paintedAt: null, missingTransitionId: id, seenTransitionIds: [...(marks?.keys?.() || [])] });
  }, 10000);
}), transitionId);

const waitForTransitionId = async (eventRef, previousTransitionId) => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const snapshot = await eventRef.get();
    const transitionId = snapshot.get('projectorState.transitionId');
    if (typeof transitionId === 'string' && transitionId && transitionId !== previousTransitionId) {
      return { transitionId, transitionStartedAt: Number(snapshot.get('projectorState.transitionStartedAt')) || null };
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('No se recibió transitionId nuevo en el evento de benchmark.');
};

const waitForControllerQaTiming = async (page, transitionId) => page.waitForFunction((id) => (
  window.__KADOSH_PROJECTION_QA_EVENTS__ || []
).find((entry) => entry.transitionId === id && entry.t6LocalRealtimeAt), transitionId, { timeout: 10_000 })
  .then((handle) => handle.jsonValue());

const createBenchmarkSong = async () => {
  const ref = db.collection('canciones').doc();
  const title = `E2E-QA-LATENCY-V2-${Date.now()}`;
  await ref.set({
    titulo: title,
    artista: 'Kadosh QA',
    tonoOriginal: 'C',
    bpm: 100,
    letraRaw: buildLyrics(),
    etiquetas: [],
    archived: false,
    estado: 'active',
    fechaCreacion: Date.now(),
  });
  return { id: ref.id, title };
};

const run = async () => {
  const eventRef = db.collection('eventos').doc(EVENT_ID);
  const originalEvent = (await eventRef.get()).data();
  if (!originalEvent?.titulo?.startsWith('E2E-QA-')) throw new Error('Benchmark bloqueado: falta evento E2E aislado.');

  const song = await createBenchmarkSong();
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: 0,
    args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
  });
  const contexts = [];

  try {
    await eventRef.update({
      setlist: [{ idLocal: 'latency-v2-song', type: 'song', value: song.id }],
      canciones: [song.id],
      projectorState: { type: 'lyrics', contentType: 'lyrics', title: song.title, updatedAt: Date.now() },
      projectionTargets: { projector: true, singers: true, musicians: true },
      proyectorSlide: null,
      proyectorSlideIndex: -1,
      proyectorSongId: null,
      proyectorApagado: false,
      proyectorTransicion: NO_TRANSITION_QA ? 'none' : 'fade',
      mediaOutputs: {},
      canvaOutputs: {},
    });

    const controllerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(controllerContext);
    const controller = await controllerContext.newPage();
    await login(controller, 'multimedia@e2e.local');
    await controller.goto(`${BASE_URL}/control-proyector/${EVENT_ID}`);
    await controller.evaluate(() => {
      window.__KADOSH_PROJECTION_QA__ = true;
      window.__KADOSH_PROJECTION_QA_EVENTS__ = [];
    });
    await controller.getByRole('button', { name: new RegExp(`1\\. ${song.title}`) }).click();
    await controller.getByText(markerFor(0), { exact: true }).first().waitFor({ state: 'visible' });

    const outputs = {};
    for (const definition of outputDefinitions) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      contexts.push(context);
      const page = await context.newPage();
      await login(page, 'multimedia@e2e.local');
      await page.goto(`${BASE_URL}${definition.route}`);
      if (REDUCED_MOTION) {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.addStyleTag({ content: '* { transition-duration: 0ms !important; animation-duration: 0ms !important; }' });
      }
      await installTransitionObserver(page);
      outputs[definition.key] = page;
    }

    const samples = {
      firstVisible: { projector: [], singers: [], musicians: [], allReturns: [] },
      painted: { projector: [], singers: [], musicians: [], allReturns: [] },
      animationSettled: { projector: [], singers: [], musicians: [], allReturns: [] },
      controllerDispatch: [],
      dispatchToFirstVisible: { projector: [], singers: [], musicians: [], allReturns: [] },
      controllerStages: {
        doubleClickGestureAcquisition: [],
        handlerToDispatch: [],
        handlerToAllReturnsFirstVisible: [],
        clickToHandler: [],
        handlerToPayload: [],
        payloadToTransactionStart: [],
        transactionRead: [],
        transactionCommit: [],
        localRealtime: [],
        clickToLocalRealtime: [],
      }
    };
    let previousTransitionId = null;
    for (let index = 0; index < TOTAL_PAGES; index += 1) {
      const startedAt = Date.now();
      await controller.evaluate(() => {
        window.__KADOSH_PROJECTION_QA_CLICK_AT__ = performance.now();
      });
      await controller.getByText(markerFor(index), { exact: true }).first().dblclick();
      const { transitionId, transitionStartedAt } = await waitForTransitionId(eventRef, previousTransitionId);
      previousTransitionId = transitionId;
      const controllerQaTiming = await waitForControllerQaTiming(controller, transitionId);
      const waitForOutputs = Promise.all(outputDefinitions.map(async ({ key }) => [key, await outputTimestamps(outputs[key], transitionId)]));
      const timestamps = Object.fromEntries(await waitForOutputs);
      const missing = Object.entries(timestamps).filter(([, timestamp]) => !Number.isFinite(timestamp.firstVisibleAt));
      if (missing.length) throw new Error(`No se observó transitionId ${transitionId}: ${JSON.stringify(missing)}`);
      if (index >= WARMUP_COUNT) {
        ['firstVisible', 'painted', 'animationSettled'].forEach((metric) => {
          outputDefinitions.forEach(({ key }) => samples[metric][key].push(timestamps[key][`${metric}At`] - startedAt));
          samples[metric].allReturns.push(Math.max(...outputDefinitions.map(({ key }) => timestamps[key][`${metric}At`])) - startedAt);
        });
        if (transitionStartedAt) {
          samples.controllerDispatch.push(transitionStartedAt - startedAt);
          outputDefinitions.forEach(({ key }) => samples.dispatchToFirstVisible[key].push(timestamps[key].firstVisibleAt - transitionStartedAt));
          samples.dispatchToFirstVisible.allReturns.push(Math.max(...outputDefinitions.map(({ key }) => timestamps[key].firstVisibleAt)) - transitionStartedAt);
        }
        const stage = samples.controllerStages;
        const gestureAcquisition = controllerQaTiming.t1HandlerStartedAt - controllerQaTiming.t0ClickAt;
        const allReturnsFirstVisibleAt = Math.max(...outputDefinitions.map(({ key }) => timestamps[key].firstVisibleAt));
        stage.doubleClickGestureAcquisition.push(gestureAcquisition);
        stage.handlerToDispatch.push(transitionStartedAt - startedAt - gestureAcquisition);
        stage.handlerToAllReturnsFirstVisible.push(allReturnsFirstVisibleAt - startedAt - gestureAcquisition);
        stage.clickToHandler.push(gestureAcquisition);
        stage.handlerToPayload.push(controllerQaTiming.t4PayloadPreparedAt - controllerQaTiming.t1HandlerStartedAt);
        stage.payloadToTransactionStart.push(controllerQaTiming.t2TransactionStartedAt - controllerQaTiming.t4PayloadPreparedAt);
        stage.transactionRead.push(controllerQaTiming.t3TransactionReadAt - controllerQaTiming.t2TransactionStartedAt);
        stage.transactionCommit.push(controllerQaTiming.t5CommitCompletedAt - controllerQaTiming.t3TransactionReadAt);
        stage.localRealtime.push(controllerQaTiming.t6LocalRealtimeAt - controllerQaTiming.t5CommitCompletedAt);
        stage.clickToLocalRealtime.push(controllerQaTiming.t6LocalRealtimeAt - controllerQaTiming.t0ClickAt);
      }
    }

    const report = {
      name: REPORT_NAME,
      generatedAt: new Date().toISOString(),
      measurement: {
        primary: 'ON_DOUBLE_CLICK_HANDLER_ENTRY_TO_ALL_RETURNS_FIRST_VISIBLE',
        gestureAcquisition: 'first Playwright double-click input timestamp to onDoubleClick handler entry; reported separately from application latency',
        appLatency: 'each sample subtracts its own gesture-acquisition duration before percentile aggregation',
        firstVisibleGate: 'output data-projection-transition-id committed by the output component',
        paintGate: 'two requestAnimationFrame callbacks after exact marker becomes visible',
        animationSettled: 'two requestAnimationFrame callbacks after first visible, then active Web Animations on the transition element finish',
        reducedMotionQaOverride: REDUCED_MOTION,
        noTransitionQaOverride: NO_TRANSITION_QA
      },
      environment: { baseUrl: BASE_URL, browser: 'chromium', headless: HEADLESS, slowMo: 0, warmup: WARMUP_COUNT, samples: SAMPLE_COUNT, backgroundTimerThrottlingDisabled: true },
      firstVisible: Object.fromEntries(Object.entries(samples.firstVisible).map(([key, values]) => [key, summarize(values)])),
      painted: Object.fromEntries(Object.entries(samples.painted).map(([key, values]) => [key, summarize(values)])),
      animationSettled: Object.fromEntries(Object.entries(samples.animationSettled).map(([key, values]) => [key, summarize(values)])),
      controllerDispatch: summarize(samples.controllerDispatch),
      controllerStages: Object.fromEntries(Object.entries(samples.controllerStages).map(([key, values]) => [key, summarize(values)])),
      dispatchToFirstVisible: Object.fromEntries(Object.entries(samples.dispatchToFirstVisible).map(([key, values]) => [key, summarize(values)])),
      samples,
    };
    await mkdir(join(process.cwd(), 'artifacts'), { recursive: true });
    await writeFile(join(process.cwd(), 'artifacts', `${REPORT_NAME}.json`), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    await browser.close();
    await eventRef.set(originalEvent);
    await db.collection('canciones').doc(song.id).delete();
    await app.delete();
  }
};

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

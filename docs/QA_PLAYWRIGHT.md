# QA E2E con Playwright

## Arquitectura

Playwright ejecuta Chromium contra Vite en `127.0.0.1:5173`. Los emuladores de Firebase se levantan por separado para evitar que cada ejecución cree una segunda instancia. La suite usa un solo worker porque comparte datos del emulador.

Los datos iniciales son locales: `owner@e2e.local`, `admin@e2e.local`, `multimedia@e2e.local`, `musico@e2e.local`, `cantante@e2e.local`, `pastor@e2e.local`, `predicador@e2e.local`, `operator-a@e2e.local`, `operator-b@e2e.local` y el evento `e2e-canva-event`. El seed reutiliza `scripts/seed-canva-e2e.cjs`.

## Protección de producción

Los lanzadores E2E fuerzan y verifican simultáneamente `KADOSH_E2E_SAFE=true`, `KADOSH_E2E_TARGET=firebase-emulators`, `VITE_E2E_SAFE=true` y los endpoints locales exactos de Auth, Firestore y Functions. El navegador también aborta durante su inicio E2E si no está configurado para esos emuladores. Antes de cada smoke se comprueba que los tres puertos locales acepten conexiones.

No ejecute `npx playwright test` directamente para pruebas que escriban datos: use los scripts `npm run test:e2e*`. No use credenciales, Storage ni Cloudinary de producción.

## Flujo en Windows CMD

Terminal 1:

```cmd
firebase emulators:start --only auth,firestore,functions
```

Terminal 2:

```cmd
set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
npm run seed:e2e
npm run test:e2e:fixtures
```

Terminal 3:

```cmd
npm run test:e2e
npm run test:e2e:smoke
npm run test:e2e:visible
```

Playwright inicia Vite únicamente. Si el puerto 5173 ya está ocupado, falla de forma deliberada en lugar de reutilizar un servidor con una configuración Firebase desconocida.

## Artefactos

Los fallos conservan trace, screenshot y video en `test-results/`; el reporte HTML queda en `playwright-report/`. Ambos son artefactos ignorados por Git.

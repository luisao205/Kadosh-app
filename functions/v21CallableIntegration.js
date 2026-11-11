/* global module */

const DEMO_PROJECT_ID = 'demo-kadosh-e2e';
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const PRODUCTION_ENVIRONMENT = 'production';

const readFirebaseProjectId = env => {
  try {
    return JSON.parse(env.FIREBASE_CONFIG || '{}').projectId || null;
  } catch {
    return null;
  }
};

const evaluateV21EmulatorGate = (env = {}) => {
  const firebaseProjectId = readFirebaseProjectId(env);
  const projectIds = [env.GCLOUD_PROJECT, env.GOOGLE_CLOUD_PROJECT, firebaseProjectId];
  const reasons = [];
  if (env.KADOSH_V21_CALLABLES_ENABLED !== 'true') reasons.push('explicit-flag-disabled');
  if (env.FUNCTIONS_EMULATOR !== 'true') reasons.push('not-functions-emulator');
  if (projectIds.some(value => value !== DEMO_PROJECT_ID)) reasons.push('unexpected-project');
  if (!LOCAL_HOST.test(env.FIREBASE_EMULATOR_HUB || '')) reasons.push('invalid-emulator-hub');
  if (!LOCAL_HOST.test(env.FIRESTORE_EMULATOR_HOST || '')) reasons.push('invalid-firestore-emulator');
  if (!LOCAL_HOST.test(env.FIREBASE_AUTH_EMULATOR_HOST || '')) reasons.push('invalid-auth-emulator');
  if (env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_TOKEN || env.CLOUDSDK_AUTH_ACCESS_TOKEN) reasons.push('real-credentials-present');
  return { enabled: reasons.length === 0, projectId: projectIds[0] || null, reasons };
};

const readProductionGateConfig = env => {
  try {
    const value = JSON.parse(env.KADOSH_V21_PRODUCTION_GATE_CONFIG || 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value;
  } catch {
    return null;
  }
};

const evaluateV21ProductionGate = (env = {}, auth = null) => {
  const config = readProductionGateConfig(env);
  const firebaseProjectId = readFirebaseProjectId(env);
  const requiredProjectIds = [env.GCLOUD_PROJECT, firebaseProjectId];
  const optionalProjectIds = [env.GOOGLE_CLOUD_PROJECT].filter(Boolean);
  const accessMode = config?.accessMode;
  const canaryMode = accessMode === 'canary';
  const permissionsMode = accessMode === 'permissions';
  const reasons = [];

  if (env.KADOSH_V21_RUNTIME_ENV !== PRODUCTION_ENVIRONMENT) reasons.push('unauthorized-environment');
  if (!config) reasons.push('invalid-production-config');
  if (config?.schemaVersion !== 1) reasons.push('unsupported-config-version');
  if (config?.activationEnabled !== true) reasons.push('production-disabled');
  if (config?.killSwitchEnabled !== true) reasons.push('kill-switch-disabled');
  if (!canaryMode && !permissionsMode) reasons.push('unsupported-access-mode');
  if (canaryMode && config?.requireCanary !== true) reasons.push('canary-required');
  if (permissionsMode && config?.requireCanary !== false) reasons.push('permissions-mode-invalid');
  if (typeof config?.authorizedProjectId !== 'string' || !config.authorizedProjectId.trim()) reasons.push('authorized-project-required');
  if (canaryMode && (!Array.isArray(config?.canaryUids) || config.canaryUids.length === 0
    || config.canaryUids.some(uid => typeof uid !== 'string' || !uid.trim()))) reasons.push('invalid-canary-cohort');
  if (permissionsMode && (!Array.isArray(config?.canaryUids) || config.canaryUids.length !== 0)) reasons.push('permissions-mode-cohort-present');
  if (requiredProjectIds.some(value => !value || value !== config?.authorizedProjectId)
    || optionalProjectIds.some(value => value !== config?.authorizedProjectId)) reasons.push('unexpected-project');
  if (env.FUNCTIONS_EMULATOR === 'true' || env.FIREBASE_EMULATOR_HUB
    || env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST) reasons.push('emulator-environment-present');
  if (!auth?.uid) reasons.push('unauthenticated');
  if (canaryMode && auth?.uid && !config?.canaryUids?.includes(auth.uid)) reasons.push('uid-not-in-canary');

  return {
    enabled: reasons.length === 0,
    projectId: requiredProjectIds[0] || null,
    reasons,
    mode: PRODUCTION_ENVIRONMENT,
  };
};

const evaluateV21CallableGate = (env = {}, auth = null) => {
  const emulator = evaluateV21EmulatorGate(env);
  if (emulator.enabled) return { ...emulator, mode: 'emulator' };
  return evaluateV21ProductionGate(env, auth);
};

const evaluateV21DynamicControl = (control, expectedProjectId) => {
  const reasons = [];
  if (!control || typeof control !== 'object' || Array.isArray(control)) reasons.push('dynamic-control-missing');
  if (control?.schemaVersion !== 1) reasons.push('dynamic-control-invalid');
  if (control?.enabled !== true) reasons.push('dynamic-control-disabled');
  if (typeof control?.projectId !== 'string' || control.projectId !== expectedProjectId) reasons.push('dynamic-control-project-mismatch');
  return { enabled: reasons.length === 0, reasons };
};

const gateErrorCode = gate => {
  const configurationFailure = gate.reasons.some(reason => !['unauthenticated', 'uid-not-in-canary'].includes(reason));
  if (configurationFailure) return 'feature-disabled';
  if (gate.reasons.includes('unauthenticated')) return 'unauthenticated';
  if (gate.reasons.includes('uid-not-in-canary')) return 'permission-denied';
  return 'feature-disabled';
};

const ERROR_MAP = Object.freeze({
  unauthenticated: ['unauthenticated', 'Debes iniciar sesion.'],
  'permission-denied': ['permission-denied', 'No tienes permiso para realizar esta operacion.'],
  'invalid-argument': ['invalid-argument', 'La solicitud no es valida.'],
  'invalid-format': ['invalid-argument', 'El formato de letra no es valido.'],
  'invalid-song': ['invalid-argument', 'La cancion de origen no es valida.'],
  'payload-too-large': ['invalid-argument', 'La solicitud excede el limite permitido.'],
  'song-not-found': ['not-found', 'La cancion no existe.'],
  'media-not-found': ['failed-precondition', 'Una referencia multimedia ya no existe.'],
  'destination-conflict': ['already-exists', 'El destino de la copia ya existe.'],
  'stale-lyrics': ['failed-precondition', 'La letra cambio antes de guardar.'],
  'formatting-conflict': ['aborted', 'El formato cambio antes de guardar.'],
  'reconciliation-required': ['failed-precondition', 'El formato requiere reconciliacion.'],
  'unsupported-version': ['failed-precondition', 'La version del formato no es compatible.'],
  'idempotency-conflict': ['already-exists', 'El requestId ya fue utilizado con otra operacion.'],
  'formatted-song-requires-v21-save': ['failed-precondition', 'La cancion requiere el guardado Projection V2.1.'],
  'feature-disabled': ['failed-precondition', 'Projection V2.1 no esta habilitado en este entorno.'],
});

const safeError = (functions, error) => {
  if (error instanceof functions.https.HttpsError) return error;
  const internalCode = typeof error?.code === 'string' ? error.code : 'internal';
  const [code, message] = ERROR_MAP[internalCode] || ['internal', 'No se pudo completar la operacion.'];
  const details = internalCode === 'internal' ? undefined : { code: internalCode };
  return new functions.https.HttpsError(code, message, details);
};

const createV21CallableHandlers = ({ functions, env, dynamicGateReader, capabilityReader, lyricServiceFactory, duplicationServiceFactory }) => {
  if (!functions?.https?.HttpsError || typeof lyricServiceFactory !== 'function' || typeof duplicationServiceFactory !== 'function') {
    throw new Error('v21_callable_dependencies_required');
  }

  const assertAuthorized = async (context) => {
    const gate = evaluateV21CallableGate(env, context?.auth);
    if (!gate.enabled) throw safeError(functions, { code: gateErrorCode(gate) });
    if (gate.mode === PRODUCTION_ENVIRONMENT) {
      let control;
      try {
        control = typeof dynamicGateReader === 'function'
          ? await dynamicGateReader({ projectId: gate.projectId, uid: context.auth.uid })
          : null;
      } catch {
        throw safeError(functions, { code: 'feature-disabled' });
      }
      if (!evaluateV21DynamicControl(control, gate.projectId).enabled) {
        throw safeError(functions, { code: 'feature-disabled' });
      }
    }
    return gate;
  };

  const execute = async (factory, context, data, expectedKind = null) => {
    await assertAuthorized(context);
    try {
      if (expectedKind === 'format-only' && Object.hasOwn(data || {}, 'letraRaw')) throw { code: 'invalid-argument' };
      if (expectedKind === 'lyrics-and-format' && !Object.hasOwn(data || {}, 'letraRaw')) throw { code: 'invalid-argument' };
      return await factory().save({ auth: context.auth, data });
    } catch (error) {
      throw safeError(functions, error);
    }
  };

  return {
    assertAuthorized,
    getCapability: async (_data, context) => {
      try {
        await assertAuthorized(context);
        const capability = typeof capabilityReader === 'function'
          ? await capabilityReader({ uid: context.auth.uid })
          : null;
        return {
          enabled: capability?.active === true
            && (capability?.canEditFormatting === true || capability?.canEditProjectionStyle === true || capability?.canDuplicate === true),
          canEditFormatting: capability?.active === true && capability?.canEditFormatting === true,
          canEditProjectionStyle: capability?.active === true && capability?.canEditProjectionStyle === true,
          canDuplicate: capability?.active === true && capability?.canDuplicate === true,
        };
      } catch {
        return { enabled: false, canEditFormatting: false, canEditProjectionStyle: false, canDuplicate: false };
      }
    },
    saveLyricFormatting: (data, context) => execute(lyricServiceFactory, context, data, 'format-only'),
    saveLyricsAndFormatting: (data, context) => execute(lyricServiceFactory, context, data, 'lyrics-and-format'),
    duplicateSong: async (data, context) => {
      await assertAuthorized(context);
      try {
        return await duplicationServiceFactory().duplicate({ auth: context.auth, data });
      } catch (error) {
        throw safeError(functions, error);
      }
    },
  };
};

module.exports = {
  DEMO_PROJECT_ID,
  createV21CallableHandlers,
  evaluateV21CallableGate,
  evaluateV21DynamicControl,
  evaluateV21EmulatorGate,
  evaluateV21ProductionGate,
  safeError,
};

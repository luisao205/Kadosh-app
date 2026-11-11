import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../config/firebase';

const DEMO_PROJECT_ID = 'demo-kadosh-e2e';

const frontendEnvironmentAllowsV21 = () => (
  import.meta.env.VITE_V21_CALLABLES_ENABLED === 'true' && (
    (import.meta.env.VITE_E2E_SAFE === 'true'
      && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
      && import.meta.env.VITE_PROJECT_ID === DEMO_PROJECT_ID
      && import.meta.env.VITE_FIREBASE_EMULATOR_HOST === '127.0.0.1')
    || import.meta.env.VITE_V21_PRODUCTION_UI_ENABLED === 'true'
  )
);

const DISABLED_CAPABILITY = Object.freeze({ enabled: false, canEditFormatting: false, canEditProjectionStyle: false, canDuplicate: false });
let cachedCapability = DISABLED_CAPABILITY;
let cachedUid = null;
const listeners = new Set();

const publishCapability = (uid, capability) => {
  cachedUid = uid || null;
  cachedCapability = capability || DISABLED_CAPABILITY;
  listeners.forEach(listener => listener(cachedCapability));
  return cachedCapability;
};

export const refreshV21Capability = async () => {
  const uid = auth.currentUser?.uid || null;
  if (!frontendEnvironmentAllowsV21() || !uid) return publishCapability(uid, DISABLED_CAPABILITY);
  try {
    const response = await httpsCallable(functions, 'getV21Capability')({});
    if (auth.currentUser?.uid !== uid) return publishCapability(auth.currentUser?.uid, DISABLED_CAPABILITY);
    const data = response.data || {};
    return publishCapability(uid, {
      enabled: data.enabled === true,
      canEditFormatting: data.canEditFormatting === true,
      canEditProjectionStyle: data.canEditProjectionStyle === true,
      canDuplicate: data.canDuplicate === true,
    });
  } catch {
    return publishCapability(uid, DISABLED_CAPABILITY);
  }
};

export const useV21Capability = () => {
  const [capability, setCapability] = useState(
    auth.currentUser?.uid && cachedUid === auth.currentUser.uid ? cachedCapability : DISABLED_CAPABILITY
  );

  useEffect(() => {
    listeners.add(setCapability);
    const unsubscribeAuth = onAuthStateChanged(auth, () => {
      publishCapability(auth.currentUser?.uid, DISABLED_CAPABILITY);
      refreshV21Capability();
    });
    const refresh = () => refreshV21Capability();
    const handleVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = window.setInterval(refresh, 30000);
    refresh();
    return () => {
      listeners.delete(setCapability);
      unsubscribeAuth();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
    };
  }, []);

  return capability;
};

export const createV21RequestId = (operation) => {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new Error('v21-request-id-unavailable');
  return `${operation}:${id}`;
};

const callV21 = async (name, payload, scope) => {
  const capability = await refreshV21Capability();
  if (!capability.enabled || capability[scope] !== true) {
    const error = new Error('feature-disabled');
    error.code = 'functions/failed-precondition';
    error.details = { code: 'feature-disabled' };
    throw error;
  }
  try {
    const response = await httpsCallable(functions, name)(payload);
    return response.data;
  } catch (error) {
    const detailCode = error?.details?.code;
    if (error?.code === 'functions/permission-denied'
      || error?.code === 'functions/unauthenticated'
      || detailCode === 'feature-disabled') {
      publishCapability(auth.currentUser?.uid, DISABLED_CAPABILITY);
    }
    throw error;
  }
};

export const saveLyricFormattingV21 = payload => callV21('saveLyricFormattingV21', payload, 'canEditFormatting');
export const saveLyricsAndFormattingV21 = payload => callV21('saveLyricsAndFormattingV21', payload, 'canEditFormatting');
export const duplicateSongV21 = payload => callV21('duplicateSongV21', payload, 'canDuplicate');

const ERROR_MESSAGES = Object.freeze({
  unauthenticated: 'Debes iniciar sesion nuevamente.',
  'permission-denied': 'No tienes permiso o tu cuenta no esta activa.',
  'stale-lyrics': 'La letra cambio en otra sesion. Tus cambios siguen aqui; revisa antes de guardar.',
  'formatting-conflict': 'El formato cambio en otra sesion. Tus cambios siguen aqui; revisa antes de guardar.',
  'reconciliation-required': 'Hay secciones o diapositivas que debes reconciliar antes de guardar.',
  'unsupported-version': 'Esta version del formato no es compatible con el editor actual.',
  'payload-too-large': 'El formato excede el tamano permitido.',
  'idempotency-conflict': 'Este intento de guardado ya fue usado con otros cambios.',
  'formatted-song-requires-v21-save': 'Esta cancion requiere el guardado seguro de Projection V2.1.',
  'feature-disabled': 'Projection V2.1 esta deshabilitado. Tus cambios siguen sin guardar.',
  'invalid-format': 'El formato contiene datos invalidos o pendientes de reconciliacion.',
  'invalid-argument': 'La solicitud de guardado no es valida.',
  'not-found': 'La cancion ya no existe.',
  'already-exists': 'La operacion entra en conflicto con una copia existente.',
  aborted: 'Otro operador cambio la cancion. Tus cambios no fueron descartados.',
  internal: 'No se pudo completar la operacion. Tus cambios siguen sin guardar.',
});

export const describeV21CallableError = error => {
  const detail = error?.details?.code;
  const transport = String(error?.code || '').replace(/^functions\//, '');
  const key = detail || transport || 'internal';
  return { code: key, message: ERROR_MESSAGES[key] || ERROR_MESSAGES.internal };
};

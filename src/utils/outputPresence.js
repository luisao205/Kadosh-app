export const OUTPUT_HEARTBEAT_INTERVAL_MS = 10000;
export const OUTPUT_OFFLINE_AFTER_MS = 35000;
export const OUTPUT_SCREEN_TEST_DURATION_MS = 5000;

export const OUTPUT_TYPE_LABELS = {
  proyector: 'Proyector publico',
  preacher: 'Predicador',
  retorno: 'Retorno cantantes',
  musicos: 'Retorno musicos',
};

export const getOutputPresenceTimestamp = (output) => {
  const value = output?.lastSeenAt || output?.lastSeen || output?.heartbeatAt || output?.lastHeartbeatAt || output?.connectedAt;
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export const getOutputPresenceState = (output, now = Date.now()) => {
  const timestamp = getOutputPresenceTimestamp(output);

  if (!timestamp) {
    return {
      key: 'unknown',
      label: 'Por verificar',
      description: 'Sin senal de presencia registrada.',
    };
  }

  if (now - timestamp <= OUTPUT_OFFLINE_AFTER_MS) {
    return {
      key: 'online',
      label: 'En linea',
      description: 'Senal reciente recibida.',
    };
  }

  return {
    key: 'offline',
    label: 'Sin conexion',
    description: 'La ultima senal registrada ya no esta vigente.',
  };
};

export const formatOutputLastSignal = (timestamp, now = Date.now()) => {
  if (!timestamp) return 'Sin senal registrada';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return `Hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `Hace ${hours} h`;
};

export const isOutputScreenTestActive = (output, now = Date.now()) => {
  const until = Number(output?.screenTest?.until || 0);
  return Number.isFinite(until) && until > now;
};

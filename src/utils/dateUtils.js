export const parseAppDate = (value) => {
  if (!value) return null;

  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const ddmmyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (ddmmyyyy) {
    const [, day, month, year, hour = '12', minute = '00'] = ddmmyyyy;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatEventDate = (value, options) => {
  const date = parseAppDate(value);
  if (!date) return 'Fecha sin definir';
  return date.toLocaleDateString('es-ES', options);
};

export const formatEventTime = (value) => {
  const date = parseAppDate(value);
  if (!date) return '';
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

export const ACCOUNT_STATUSES = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DISABLED: 'disabled'
});

export const SUSPENSION_TYPES = Object.freeze({
  INDEFINITE: 'indefinite',
  UNTIL_DATE: 'until_date'
});

export const ACCOUNT_STATUS_OPTIONS = [
  { value: ACCOUNT_STATUSES.ACTIVE, label: 'Activa' },
  { value: ACCOUNT_STATUSES.SUSPENDED, label: 'Suspendida' },
  { value: ACCOUNT_STATUSES.DISABLED, label: 'Desactivada' }
];

export const SUSPENSION_TYPE_OPTIONS = [
  { value: SUSPENSION_TYPES.INDEFINITE, label: 'Indefinida' },
  { value: SUSPENSION_TYPES.UNTIL_DATE, label: 'Hasta una fecha' }
];

export const normalizeAccountStatus = (status) => {
  if (status === ACCOUNT_STATUSES.SUSPENDED || status === 'Suspendida') return ACCOUNT_STATUSES.SUSPENDED;
  if (status === ACCOUNT_STATUSES.DISABLED || status === 'Desactivada') return ACCOUNT_STATUSES.DISABLED;
  return ACCOUNT_STATUSES.ACTIVE;
};

export const getAccountStatusLabel = (status) => {
  const normalized = normalizeAccountStatus(status);
  return ACCOUNT_STATUS_OPTIONS.find(option => option.value === normalized)?.label || 'Activa';
};

export const isAccountAllowed = (status) => normalizeAccountStatus(status) === ACCOUNT_STATUSES.ACTIVE;


export const shouldUseLegacyCanvaFallback = (response) => (
  response?.ok === false && response?.code === 'LEGACY_CANVA_ACTIVE'
);

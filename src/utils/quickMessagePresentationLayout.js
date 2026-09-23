const HEADER_LABELS = {
  theme: 'TEMA',
  title: 'TITULO',
  point: 'PUNTO',
  phrase: 'FRASE',
  call: 'LLAMADO'
};

export const getQuickMessagePresentationLayout = ({ content = '', segments = [], presentationType = 'point' } = {}) => {
  const textLength = String(content).trim().length;
  const segmentCount = Array.isArray(segments) ? segments.length : 0;
  const density = textLength + Math.max(0, segmentCount - 1) * 18;
  const header = HEADER_LABELS[presentationType] || HEADER_LABELS.point;

  if (density <= 28) return { header, minFontSize: 58, maxFontSize: 320 };
  if (density <= 72) return { header, minFontSize: 52, maxFontSize: 260 };
  if (density <= 150) return { header, minFontSize: 44, maxFontSize: 210 };
  if (density <= 300) return { header, minFontSize: 34, maxFontSize: 160 };
  if (density <= 520) return { header, minFontSize: 28, maxFontSize: 118 };
  return { header, minFontSize: 24, maxFontSize: 84 };
};

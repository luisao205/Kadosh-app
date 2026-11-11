export const RICH_LYRIC_SCALE_FACTORS = Object.freeze({
  xs: 0.68,
  sm: 0.84,
  md: 1,
  lg: 1.24,
  xl: 1.56,
});

export const RICH_LYRIC_COLORS = Object.freeze({
  default: 'var(--rich-lyric-default, currentColor)',
  primary: 'var(--rich-lyric-primary, #ffffff)',
  secondary: 'var(--rich-lyric-secondary, #e4e4e7)',
  accent: 'var(--rich-lyric-accent, #fde68a)',
  muted: 'var(--rich-lyric-muted, #a1a1aa)',
});

export const RICH_LYRIC_SPACING = Object.freeze({
  compact: '0em',
  normal: '0.025em',
  relaxed: '0.075em',
});

const ALLOWED_TRANSFORMS = new Set(['none', 'uppercase']);

export const assertRichLyricRuns = (runs) => {
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new TypeError('Rich lyric runs must be a non-empty array.');
  }

  return runs.map((run, index) => {
    if (!run || typeof run !== 'object' || Array.isArray(run) || typeof run.text !== 'string') {
      throw new TypeError(`Rich lyric run ${index} is invalid.`);
    }
    const style = run.style ?? {};
    if (!style || typeof style !== 'object' || Array.isArray(style)) {
      throw new TypeError(`Rich lyric run ${index} style is invalid.`);
    }
    const unsupported = Object.keys(style).filter((key) => !['bold', 'transform', 'scale', 'color', 'spacing'].includes(key));
    if (unsupported.length) throw new TypeError(`Rich lyric run ${index} contains unsupported style properties.`);
    if ('bold' in style && typeof style.bold !== 'boolean') throw new TypeError(`Rich lyric run ${index} bold is invalid.`);
    if ('transform' in style && !ALLOWED_TRANSFORMS.has(style.transform)) throw new TypeError(`Rich lyric run ${index} transform is invalid.`);
    if ('scale' in style && !Object.hasOwn(RICH_LYRIC_SCALE_FACTORS, style.scale)) throw new TypeError(`Rich lyric run ${index} scale is invalid.`);
    if ('color' in style && !Object.hasOwn(RICH_LYRIC_COLORS, style.color)) throw new TypeError(`Rich lyric run ${index} color is invalid.`);
    if ('spacing' in style && !Object.hasOwn(RICH_LYRIC_SPACING, style.spacing)) throw new TypeError(`Rich lyric run ${index} spacing is invalid.`);
    return { text: run.text, style: { ...style } };
  });
};

export const richLyricRunStyle = (style = {}) => ({
  fontSize: `${RICH_LYRIC_SCALE_FACTORS[style.scale || 'md']}em`,
  fontWeight: style.bold === true ? 900 : 'inherit',
  textTransform: style.transform === 'uppercase' ? 'uppercase' : 'none',
  color: RICH_LYRIC_COLORS[style.color || 'default'],
  letterSpacing: RICH_LYRIC_SPACING[style.spacing || 'compact'],
});

export const calculateProportionalFit = ({
  minBaseFontSize,
  maxBaseFontSize,
  measure,
}) => {
  if (!Number.isFinite(minBaseFontSize) || !Number.isFinite(maxBaseFontSize) || minBaseFontSize <= 0 || maxBaseFontSize < minBaseFontSize) {
    throw new TypeError('Rich lyric font-size limits are invalid.');
  }
  if (typeof measure !== 'function') throw new TypeError('Rich lyric measure must be a function.');

  let low = Math.ceil(minBaseFontSize);
  let high = Math.floor(maxBaseFontSize);
  let best = low;
  const minimum = measure(low);
  if (!minimum.fits) return { baseFontSize: low, overflow: true, measurement: minimum };

  while (low <= high) {
    const candidate = Math.floor((low + high) / 2);
    const measurement = measure(candidate);
    if (measurement.fits) {
      best = candidate;
      low = candidate + 1;
    } else {
      high = candidate - 1;
    }
  }

  return { baseFontSize: best, overflow: false, measurement: measure(best) };
};


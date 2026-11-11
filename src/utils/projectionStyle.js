export const PROJECTION_STYLE_PRESETS = Object.freeze({
  clean: { label: 'Limpio', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' },
  cinematic: { label: 'Cinemático', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' },
  worship: { label: 'Adoración', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' },
  impact: { label: 'Impacto', motion: 'dynamic', alignment: 'center', backgroundTreatment: 'auto' },
  minimal: { label: 'Minimal', motion: 'none', alignment: 'center', backgroundTreatment: 'normal' }
});

export const PROJECTION_STYLE_PRESET_KEYS = Object.freeze(Object.keys(PROJECTION_STYLE_PRESETS));
export const PROJECTION_STYLE_MOTIONS = Object.freeze(['none', 'soft', 'dynamic']);
export const PROJECTION_STYLE_ALIGNMENTS = Object.freeze(['left', 'center', 'right']);
export const PROJECTION_STYLE_BACKGROUND_TREATMENTS = Object.freeze(['auto', 'normal']);
export const PROJECTION_TRANSITIONS = Object.freeze(['fade', 'slide', 'zoom', 'none']);

export const normalizeProjectionTransition = (value) => (
  PROJECTION_TRANSITIONS.includes(value) ? value : 'fade'
);

export const DEFAULT_PROJECTION_STYLE = Object.freeze({
  preset: 'clean',
  motion: 'soft',
  alignment: 'center',
  backgroundTreatment: 'auto'
});

export const normalizeProjectionStyle = (value) => {
  const preset = PROJECTION_STYLE_PRESET_KEYS.includes(value?.preset) ? value.preset : DEFAULT_PROJECTION_STYLE.preset;
  const presetDefaults = PROJECTION_STYLE_PRESETS[preset];
  return {
    preset,
    motion: PROJECTION_STYLE_MOTIONS.includes(value?.motion) ? value.motion : presetDefaults.motion,
    alignment: PROJECTION_STYLE_ALIGNMENTS.includes(value?.alignment) ? value.alignment : presetDefaults.alignment,
    backgroundTreatment: PROJECTION_STYLE_BACKGROUND_TREATMENTS.includes(value?.backgroundTreatment)
      ? value.backgroundTreatment
      : presetDefaults.backgroundTreatment
  };
};

export const getProjectionStyleLabel = (style) => PROJECTION_STYLE_PRESETS[normalizeProjectionStyle(style).preset].label;

export const resolveProjectionStyle = ({ song, event }) => {
  const override = song?.id && event?.songProjectionStyleOverrides?.[song.id];
  if (override) return { style: normalizeProjectionStyle(override), source: 'event' };
  if (song?.projectionStyle) return { style: normalizeProjectionStyle(song.projectionStyle), source: 'song' };
  return { style: DEFAULT_PROJECTION_STYLE, source: 'global' };
};

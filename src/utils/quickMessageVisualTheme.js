export const QUICK_MESSAGE_COLOR_THEMES = {
  white: {
    text: ['#FFFFFF', '#FFF8E8', '#DFEAFF'],
    glow: ['rgba(255, 255, 255, 0.035)', 'rgba(255, 248, 232, 0.07)', 'rgba(223, 234, 255, 0.045)'],
    particle: ['rgba(255, 255, 255, 0.28)', 'rgba(255, 248, 232, 0.36)', 'rgba(223, 234, 255, 0.24)'],
    phaseDelay: '0s'
  },
  blue: {
    text: ['#7DD3FC', '#38BDF8', '#2563EB'],
    glow: ['rgba(56, 189, 248, 0.23)', 'rgba(56, 189, 248, 0.29)', 'rgba(37, 99, 235, 0.2)'],
    particle: ['rgba(125, 211, 252, 0.38)', 'rgba(56, 189, 248, 0.48)', 'rgba(37, 99, 235, 0.32)'],
    phaseDelay: '-1.5s'
  },
  red: {
    text: ['#FF1F1F', '#FF3535', '#E91932'],
    glow: ['rgba(255, 31, 31, 0.28)', 'rgba(255, 53, 53, 0.34)', 'rgba(233, 25, 50, 0.24)'],
    particle: ['rgba(255, 93, 93, 0.42)', 'rgba(255, 53, 53, 0.52)', 'rgba(233, 25, 50, 0.36)'],
    phaseDelay: '-3s'
  },
  yellow: {
    text: ['#FDE047', '#FBBF24', '#F59E0B'],
    glow: ['rgba(250, 204, 21, 0.22)', 'rgba(251, 191, 36, 0.28)', 'rgba(245, 158, 11, 0.2)'],
    particle: ['rgba(253, 224, 71, 0.4)', 'rgba(251, 191, 36, 0.5)', 'rgba(245, 158, 11, 0.34)'],
    phaseDelay: '-4.5s'
  },
  green: {
    text: ['#6EE7B7', '#34D399', '#059669'],
    glow: ['rgba(52, 211, 153, 0.22)', 'rgba(52, 211, 153, 0.28)', 'rgba(5, 150, 105, 0.2)'],
    particle: ['rgba(110, 231, 183, 0.4)', 'rgba(52, 211, 153, 0.5)', 'rgba(5, 150, 105, 0.34)'],
    phaseDelay: '-6s'
  }
};

export const getQuickMessageColorTheme = (color) => QUICK_MESSAGE_COLOR_THEMES[color] || QUICK_MESSAGE_COLOR_THEMES.white;

export const getQuickMessageThemeStyle = (color) => {
  const theme = getQuickMessageColorTheme(color);
  return {
    '--quick-text-base': theme.text[0],
    '--quick-text-bright': theme.text[1],
    '--quick-text-deep': theme.text[2],
    '--quick-glow-base': theme.glow[0],
    '--quick-glow-bright': theme.glow[1],
    '--quick-glow-deep': theme.glow[2],
    '--quick-glow-active': theme.glow[0],
    '--quick-particle-base': theme.particle[0],
    '--quick-particle-bright': theme.particle[1],
    '--quick-particle-deep': theme.particle[2],
    '--quick-particle-active': theme.particle[0],
    '--quick-phase-delay': theme.phaseDelay
  };
};

const hash = (value) => Array.from(String(value)).reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
const randomAt = (seed, index) => ((hash(`${seed}:${index}`) % 10000) / 10000);
const asNumber = (value) => Number.parseFloat(value) || 0;
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

export const buildQuickMessageParticles = ({ glows = [], messageKey = '', reducedMotion = false, maxParticles = 32 } = {}) => {
  if (reducedMotion || !Array.isArray(glows) || !glows.length) return [];
  const count = Math.min(maxParticles, Math.max(20, glows.length * 8));
  return Array.from({ length: count }, (_, index) => {
    const glow = glows[index % glows.length];
    const seed = `${messageKey}:${glow.color}:${glow.left}:${glow.top}:${index}`;
    const horizontalRadius = asNumber(glow.width) * 0.42;
    const verticalRadius = asNumber(glow.height) * 0.42;
    return {
      id: `particle-${hash(seed)}`,
      color: glow.color,
      left: `${clamp(asNumber(glow.left) + ((randomAt(seed, 1) - 0.5) * horizontalRadius), 2, 98)}%`,
      top: `${clamp(asNumber(glow.top) + ((randomAt(seed, 2) - 0.5) * verticalRadius), 2, 98)}%`,
      size: `${1 + Math.round(randomAt(seed, 3) * 2)}px`,
      duration: `${10 + Math.round(randomAt(seed, 4) * 20)}s`,
      delay: `-${Math.round(randomAt(seed, 5) * 18)}s`,
      motion: index % 4
    };
  });
};

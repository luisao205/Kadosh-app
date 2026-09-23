const AMBIENT_COLOR_ORDER = ['blue', 'red', 'yellow', 'green', 'white'];
const DEFAULT_POSITIONS = [
  { left: 18, top: 22 },
  { left: 80, top: 72 },
  { left: 74, top: 20 },
  { left: 28, top: 78 }
];
const AMBIENT_COLORS = {
  white: 'rgba(255, 255, 255, 0.035)',
  blue: 'rgba(56, 189, 248, 0.23)',
  red: 'rgba(255, 31, 31, 0.28)',
  yellow: 'rgba(250, 204, 21, 0.22)',
  green: 'rgba(52, 211, 153, 0.22)'
};

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const isAmbientColor = (color) => AMBIENT_COLOR_ORDER.includes(color);
const isMeasuredBound = (bound) => isAmbientColor(bound?.color)
  && ['left', 'top', 'width', 'height'].every((key) => Number.isFinite(bound[key]))
  && bound.width > 0
  && bound.height > 0;

export const getQuickMessageAmbientColors = (segments = [], maxColors = 4) => {
  const selected = new Set(
    (Array.isArray(segments) ? segments : [])
      .map((segment) => segment?.color)
      .filter(isAmbientColor)
  );
  const ordered = AMBIENT_COLOR_ORDER.filter((color) => selected.has(color));
  const nonWhite = ordered.filter((color) => color !== 'white');
  const colors = [...nonWhite, ...(selected.has('white') ? ['white'] : [])];
  return (colors.length ? colors : ['white']).slice(0, maxColors);
};

const boundsAreNear = (first, second) => {
  const firstRight = first.left + first.width;
  const secondRight = second.left + second.width;
  const firstBottom = first.top + first.height;
  const secondBottom = second.top + second.height;
  const horizontalGap = Math.max(0, Math.max(first.left, second.left) - Math.min(firstRight, secondRight));
  const verticalGap = Math.max(0, Math.max(first.top, second.top) - Math.min(firstBottom, secondBottom));
  return horizontalGap <= 16 && verticalGap <= 15;
};

const buildHaloFromCluster = (color, cluster) => {
  const left = Math.min(...cluster.map((bound) => bound.left));
  const top = Math.min(...cluster.map((bound) => bound.top));
  const right = Math.max(...cluster.map((bound) => bound.left + bound.width));
  const bottom = Math.max(...cluster.map((bound) => bound.top + bound.height));
  const contentWidth = right - left;
  const contentHeight = bottom - top;
  return {
    color,
    left: clamp(left + contentWidth / 2, 0, 100),
    top: clamp(top + contentHeight / 2, 0, 100),
    width: clamp(contentWidth * 1.6 + 8, 22, 78),
    height: clamp(contentHeight * 2.4 + 12, 28, 66),
    area: contentWidth * contentHeight
  };
};

export const getAmbientHalosFromFragmentBounds = (fragmentBounds = [], maxHalos = 4) => {
  const byColor = new Map();
  (Array.isArray(fragmentBounds) ? fragmentBounds : [])
    .filter(isMeasuredBound)
    .forEach((bound) => {
      const bounds = byColor.get(bound.color) || [];
      bounds.push(bound);
      byColor.set(bound.color, bounds);
    });

  const halos = [];
  AMBIENT_COLOR_ORDER.forEach((color) => {
    const bounds = byColor.get(color) || [];
    const clusters = [];
    bounds.forEach((bound) => {
      const cluster = clusters.find((candidate) => candidate.some((item) => boundsAreNear(item, bound)));
      if (cluster) cluster.push(bound);
      else clusters.push([bound]);
    });
    clusters.forEach((cluster) => halos.push(buildHaloFromCluster(color, cluster)));
  });

  return halos
    .sort((first, second) => {
      const colorOrder = AMBIENT_COLOR_ORDER.indexOf(first.color) - AMBIENT_COLOR_ORDER.indexOf(second.color);
      return colorOrder || second.area - first.area;
    })
    .slice(0, maxHalos)
    .map(({ area, ...halo }) => halo);
};

const toGlow = ({ color, left, top, width, height }) => ({
  color,
  left: `${left}%`,
  top: `${top}%`,
  width: `${width}%`,
  height: `${height}%`,
  background: `radial-gradient(ellipse at center, ${AMBIENT_COLORS[color]} 0%, transparent 72%)`
});

export const getQuickMessageAmbientGlows = (segments = [], fragmentBounds = [], maxHalos = 4) => {
  const measuredHalos = getAmbientHalosFromFragmentBounds(fragmentBounds, maxHalos);
  if (measuredHalos.length) return measuredHalos.map(toGlow);

  return getQuickMessageAmbientColors(segments, maxHalos).map((color, index) => {
    const position = DEFAULT_POSITIONS[index];
    return toGlow({ color, ...position, width: 68, height: 72 });
  });
};

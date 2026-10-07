export const OUTPUT_TARGET_IDS = ['projector', 'singers', 'musicians'];
export const ABSENT = Symbol('projection-undo-absent');

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const clone = (value) => {
  if (value === ABSENT || value === undefined || value === null) return value;
  return structuredClone(value);
};

const stableValue = (value) => {
  if (value === ABSENT) return ['absent'];
  if (value === undefined) return ['undefined'];
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value.toJSON === 'function') return stableValue(value.toJSON());
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
};

export const sameProjectionValue = (left, right) => JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));

export const eventValue = (eventData = {}, field) => hasOwn(eventData, field) ? clone(eventData[field]) : ABSENT;

const mapValue = (eventData, mapName, key) => (
  hasOwn(eventData?.[mapName], key) ? clone(eventData[mapName][key]) : ABSENT
);

const delta = (before, expectedAfter) => (
  sameProjectionValue(before, expectedAfter) ? null : { before, expectedAfter }
);

export const createProjectionUndoOperation = ({
  action,
  beforeEvent,
  afterEvent,
  changedFields = [],
  targetIds = [],
  canvaMemoryKeys = {},
  quickMessageActionId = null,
} = {}) => {
  const fields = changedFields.reduce((result, field) => {
    const next = delta(eventValue(beforeEvent, field), eventValue(afterEvent, field));
    if (next) result[field] = next;
    return result;
  }, {});

  const routes = targetIds.reduce((result, targetId) => {
    if (!OUTPUT_TARGET_IDS.includes(targetId)) return result;
    const canva = delta(mapValue(beforeEvent, 'canvaOutputs', targetId), mapValue(afterEvent, 'canvaOutputs', targetId));
    const media = delta(mapValue(beforeEvent, 'mediaOutputs', targetId), mapValue(afterEvent, 'mediaOutputs', targetId));
    if (canva || media) result[targetId] = { ...(canva ? { canva } : {}), ...(media ? { media } : {}) };
    return result;
  }, {});

  const canvaMemory = Object.entries(canvaMemoryKeys).reduce((result, [targetId, memoryKey]) => {
    if (!OUTPUT_TARGET_IDS.includes(targetId) || !memoryKey) return result;
    const before = mapValue(beforeEvent?.canvaPageMemory || {}, targetId, memoryKey);
    const expectedAfter = mapValue(afterEvent?.canvaPageMemory || {}, targetId, memoryKey);
    const next = delta(before, expectedAfter);
    if (next) result[targetId] = { memoryKey, ...next };
    return result;
  }, {});

  return {
    kind: 'projection-delta',
    action,
    createdAt: Date.now(),
    fields,
    routes,
    canvaMemory,
    quickMessageActionId,
  };
};

export const matchingFieldDeltas = (eventData, fields = {}) => Object.entries(fields).reduce((matching, [field, value]) => {
  if (sameProjectionValue(eventValue(eventData, field), value.expectedAfter)) matching[field] = value;
  return matching;
}, {});

export const restoreFieldDeltas = (fields = {}, deleteValue) => Object.entries(fields).reduce((payload, [field, value]) => {
  payload[field] = value.before === ABSENT ? deleteValue() : clone(value.before);
  return payload;
}, {});

export const matchingRouteDeltas = (eventData, routes = {}) => Object.entries(routes).reduce((matching, [targetId, routeDelta]) => {
  const route = {};
  ['canva', 'media'].forEach((routeType) => {
    const value = routeDelta[routeType];
    const mapName = routeType === 'canva' ? 'canvaOutputs' : 'mediaOutputs';
    if (value && sameProjectionValue(mapValue(eventData, mapName, targetId), value.expectedAfter)) route[routeType] = value;
  });
  if (Object.keys(route).length) matching[targetId] = route;
  return matching;
}, {});

export const restoreRouteDeltas = (eventData = {}, routes = {}) => {
  const mediaOutputs = { ...(eventData.mediaOutputs || {}) };
  const canvaOutputs = { ...(eventData.canvaOutputs || {}) };

  Object.entries(routes).forEach(([targetId, route]) => {
    if (route.canva) {
      if (route.canva.before === ABSENT) delete canvaOutputs[targetId];
      else canvaOutputs[targetId] = clone(route.canva.before);
    }
    if (route.media) {
      if (route.media.before === ABSENT) delete mediaOutputs[targetId];
      else mediaOutputs[targetId] = clone(route.media.before);
    }
  });

  return { mediaOutputs, canvaOutputs };
};

export const matchingCanvaMemoryDeltas = (eventData, memory = {}) => Object.entries(memory).reduce((matching, [targetId, value]) => {
  const current = mapValue(eventData?.canvaPageMemory || {}, targetId, value.memoryKey);
  if (sameProjectionValue(current, value.expectedAfter)) matching[targetId] = value;
  return matching;
}, {});

export const restoreCanvaMemoryDeltas = (eventData = {}, memory = {}) => {
  const next = structuredClone(eventData.canvaPageMemory || {});
  Object.entries(memory).forEach(([targetId, value]) => {
    const targetMemory = { ...(next[targetId] || {}) };
    if (value.before === ABSENT) delete targetMemory[value.memoryKey];
    else targetMemory[value.memoryKey] = clone(value.before);
    next[targetId] = targetMemory;
  });
  return next;
};

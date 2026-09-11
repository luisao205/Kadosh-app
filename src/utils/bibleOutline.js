export const MAX_BIBLE_OUTLINE_ITEMS = 50;
export const MAX_BIBLE_OUTLINE_SLIDES_PER_ITEM = 50;
export const MAX_BIBLE_OUTLINE_BYTES = 350000;

const clone = (value) => JSON.parse(JSON.stringify(value));

const estimateBytes = (value) => {
  const serialized = JSON.stringify(value);
  return typeof TextEncoder === 'undefined'
    ? serialized.length
    : new TextEncoder().encode(serialized).length;
};

const stableItemId = () => {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `bible_${random}`;
};

export const normalizeBibleOutlineItems = (items) => (Array.isArray(items) ? items : [])
  .filter((item) => item && typeof item === 'object' && item.id && item.passage)
  .map((item, index) => ({
    ...clone(item),
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    slides: Array.isArray(item.slides) ? clone(item.slides) : []
  }))
  .sort((left, right) => left.order - right.order)
  .map((item, index) => ({ ...item, order: index }));

export const createBibleOutlineItem = ({ passage, slides, existingItem = null }) => {
  if (!passage || !Array.isArray(slides) || slides.length === 0) {
    throw new Error('Selecciona un pasaje biblico valido antes de guardarlo.');
  }
  if (slides.length > MAX_BIBLE_OUTLINE_SLIDES_PER_ITEM) {
    throw new Error(`Cada pasaje puede contener hasta ${MAX_BIBLE_OUTLINE_SLIDES_PER_ITEM} diapositivas.`);
  }

  return {
    id: existingItem?.id || stableItemId(),
    order: existingItem?.order ?? 0,
    passage: clone(passage),
    slides: clone(slides),
    createdAt: existingItem?.createdAt || Date.now()
  };
};

export const assertBibleOutlineSize = (items) => {
  const normalized = normalizeBibleOutlineItems(items);
  if (normalized.length > MAX_BIBLE_OUTLINE_ITEMS) {
    throw new Error(`El bosquejo admite hasta ${MAX_BIBLE_OUTLINE_ITEMS} pasajes por evento.`);
  }
  if (normalized.some((item) => item.slides.length > MAX_BIBLE_OUTLINE_SLIDES_PER_ITEM)) {
    throw new Error(`Cada pasaje puede contener hasta ${MAX_BIBLE_OUTLINE_SLIDES_PER_ITEM} diapositivas.`);
  }
  if (estimateBytes({ items: normalized }) > MAX_BIBLE_OUTLINE_BYTES) {
    throw new Error('El bosquejo es demasiado grande para guardarse de forma segura en este evento.');
  }
  return normalized;
};

export const buildBibleOutlineUpdate = (items) => ({
  bibleOutline: {
    items: assertBibleOutlineSize(items),
    updatedAt: Date.now()
  }
});

export const getBibleOutlinePreview = (item) => item ? {
  passage: item.passage,
  slides: item.slides,
  selectedIndex: 0
} : null;

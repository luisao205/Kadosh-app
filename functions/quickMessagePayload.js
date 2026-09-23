const QUICK_MESSAGE_TYPES = new Set(["theme", "title", "point", "phrase", "call"]);
const QUICK_MESSAGE_COLORS = new Set(["white", "blue", "red", "yellow", "green"]);
const QUICK_MESSAGE_MAX_SEGMENTS = 12;
const QUICK_MESSAGE_MAX_SEGMENT_LENGTH = 240;
const QUICK_MESSAGE_MAX_TEXT_LENGTH = 800;

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const invalid = (message) => {
  throw new Error(message);
};

const validateQuickMessagePayload = (data) => {
  if (!isPlainObject(data) || Object.keys(data).length !== 3
    || !["eventoId", "presentationType", "segments"].every((key) => Object.prototype.hasOwnProperty.call(data, key))) {
    invalid("Payload de punto invalido.");
  }
  const eventoId = typeof data.eventoId === "string" ? data.eventoId.trim() : "";
  if (!eventoId || eventoId.length > 256 || !QUICK_MESSAGE_TYPES.has(data.presentationType)) {
    invalid("Tipo de punto invalido.");
  }
  if (!Array.isArray(data.segments) || !data.segments.length || data.segments.length > QUICK_MESSAGE_MAX_SEGMENTS) {
    invalid("Cantidad de fragmentos invalida.");
  }
  const segments = data.segments.map((segment) => {
    if (!isPlainObject(segment) || Object.keys(segment).length !== 3
      || !["text", "color", "bold"].every((key) => Object.prototype.hasOwnProperty.call(segment, key))
      || typeof segment.text !== "string" || !segment.text.length || segment.text.length > QUICK_MESSAGE_MAX_SEGMENT_LENGTH
      || !QUICK_MESSAGE_COLORS.has(segment.color) || typeof segment.bold !== "boolean") {
      invalid("Fragmento de punto invalido.");
    }
    return { text: segment.text, color: segment.color, bold: segment.bold };
  });
  const content = segments.map((segment) => segment.text).join("");
  if (!content.length || content.length > QUICK_MESSAGE_MAX_TEXT_LENGTH) invalid("Texto del punto invalido.");
  return { eventoId, presentationType: data.presentationType, segments, content };
};

module.exports = {
  QUICK_MESSAGE_COLORS,
  QUICK_MESSAGE_MAX_SEGMENTS,
  QUICK_MESSAGE_MAX_SEGMENT_LENGTH,
  QUICK_MESSAGE_MAX_TEXT_LENGTH,
  validateQuickMessagePayload
};

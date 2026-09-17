const text = (content) => ({ id: crypto.randomUUID(), type: 'text', text: content, x: 8, y: 28, width: 84, height: 40, color: '#ffffff', fontSize: 64, fontWeight: 800, align: 'center', opacity: 1 });
const slide = (title, color) => ({ id: crypto.randomUUID(), transition: { type: 'fade', durationMs: 500 }, durationMs: 7000, background: { type: 'color', color }, elements: [text(title)] });

export const ANNOUNCEMENT_TEMPLATES = [
  ['Culto de Jovenes', '#312e81'], ['Culto General', '#18181b'], ['Evento Especial', '#7c2d12'],
  ['Escuela Biblica', '#064e3b'], ['Anuncio General', '#3f3f46']
].map(([name, color]) => ({ id: name.toLowerCase().replaceAll(' ', '-'), name, create: () => ({ title: name, status: 'draft', slides: [slide(name, color)] }) }));

export const createBlankAnnouncement = () => ({ title: 'Nuevo anuncio', status: 'draft', slides: [slide('Escribe tu anuncio', '#18181b')] });

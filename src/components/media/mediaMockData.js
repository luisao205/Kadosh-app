import { MEDIA_TYPES } from '../../utils/mediaLibrary';

export const MOCK_MEDIA_ITEMS = [
  {
    id: 'mock-blue-loop',
    title: 'Fondo Azul Loop',
    type: MEDIA_TYPES.VIDEO,
    url: 'https://res.cloudinary.com/demo/video/upload/dog.mp4',
    category: 'Fondos',
    tags: ['adoracion', 'loop'],
    provider: 'cloudinary',
    status: 'active',
    metadata: {
      duration: '00:15',
      mimeType: 'video/mp4'
    }
  },
  {
    id: 'mock-gold-texture',
    title: 'Textura Dorada',
    type: MEDIA_TYPES.IMAGE,
    url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    category: 'Fondos',
    tags: ['celebracion', 'imagen'],
    provider: 'cloudinary',
    status: 'active',
    metadata: {
      width: 1920,
      height: 1080,
      mimeType: 'image/jpeg'
    }
  },
  {
    id: 'mock-message-pdf',
    title: 'Bosquejo Domingo',
    type: MEDIA_TYPES.PDF,
    url: 'https://example.com/bosquejo.pdf',
    category: 'Predicacion',
    tags: ['pdf', 'notas'],
    provider: 'url',
    status: 'active',
    metadata: {
      mimeType: 'application/pdf'
    }
  },
  {
    id: 'mock-click-track',
    title: 'Click Intro',
    type: MEDIA_TYPES.AUDIO,
    url: 'https://example.com/click-intro.mp3',
    category: 'Audio',
    tags: ['ensayo', 'click'],
    provider: 'url',
    status: 'active',
    metadata: {
      duration: '00:45',
      mimeType: 'audio/mpeg'
    }
  },
  {
    id: 'mock-youtube-link',
    title: 'Referencia YouTube',
    type: MEDIA_TYPES.LINK,
    url: 'https://youtube.com',
    category: 'Enlaces',
    tags: ['referencia'],
    provider: 'url',
    status: 'active',
    metadata: {}
  }
];


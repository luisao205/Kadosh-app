/**
 * KADOSH Music AI — Oficiales de Gemini & ChatGPT
 * Gestión privada por usuario de chats favoritos, validación estricta de dominios HTTPS
 * oficiales y empaquetado de prompt maestro KADOSH PROJECTION V2.1.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { KADOSH_MUSIC_AI_SYSTEM_PROMPT } from './musicConverter.js';

export const OFFICIAL_CHAT_PROVIDERS = {
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    defaultUrl: 'https://gemini.google.com/app',
    allowedHosts: ['gemini.google.com'],
    description: 'Abre Google Gemini con tus cuentas y chats oficiales.',
    suggestedLabels: [
      'Gemini — Repertorio principal',
      'Gemini — Arreglos musicales',
    ],
  },
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    defaultUrl: 'https://chatgpt.com/',
    allowedHosts: ['chatgpt.com', 'chat.openai.com'],
    description: 'Abre OpenAI ChatGPT con tus cuentas y conversaciones oficiales.',
    suggestedLabels: [
      'ChatGPT — Transcripción KADOSH',
      'ChatGPT — Medleys',
    ],
  },
};

const ALL_ALLOWED_HOSTS = new Set([
  ...OFFICIAL_CHAT_PROVIDERS.gemini.allowedHosts,
  ...OFFICIAL_CHAT_PROVIDERS.chatgpt.allowedHosts,
]);

const MAX_FAVORITE_CHATS = 30;
const PRIVATE_CHAT_DOC_ID = 'music_ai_official_chats';

/**
 * Valida estrictamente que el enlace sea HTTPS y pertenezca únicamente a un dominio oficial admitido.
 */
export const validateOfficialChatUrl = (rawUrl = '', expectedProvider = null) => {
  const cleanInput = String(rawUrl || '').trim();
  if (!cleanInput) {
    return { valid: false, error: 'Ingresa un enlace HTTPS válido del chat oficial.' };
  }

  let parsed;
  try {
    parsed = new URL(cleanInput);
  } catch {
    return { valid: false, error: 'El formato del enlace no es válido. Debe iniciar con https://' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Por seguridad, solo se permiten enlaces HTTPS oficiales.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'El enlace no debe incluir credenciales embebidas.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALL_ALLOWED_HOSTS.has(host)) {
    return {
      valid: false,
      error: 'Solo se admiten dominios oficiales: gemini.google.com, chatgpt.com o chat.openai.com.',
    };
  }

  const detectedProvider = OFFICIAL_CHAT_PROVIDERS.gemini.allowedHosts.includes(host)
    ? 'gemini'
    : 'chatgpt';

  if (expectedProvider && detectedProvider !== expectedProvider) {
    const expectedName = OFFICIAL_CHAT_PROVIDERS[expectedProvider]?.name || expectedProvider;
    return {
      valid: false,
      error: `Este enlace pertenece a ${OFFICIAL_CHAT_PROVIDERS[detectedProvider].name}, pero seleccionaste ${expectedName}.`,
    };
  }

  return {
    valid: true,
    url: parsed.toString(),
    provider: detectedProvider,
    host,
  };
};

export const sanitizeFavoriteLabel = (label = '') => {
  return String(label || '').trim().replace(/\s+/g, ' ').slice(0, 80);
};

const getLocalStorageKey = (uid) => `kadosh_music_ai_official_chats_${String(uid || '').trim()}`;

export const sanitizeFavoriteChatEntry = (entry = {}) => {
  const check = validateOfficialChatUrl(entry.url, entry.provider || null);
  if (!check.valid) return null;

  const label = sanitizeFavoriteLabel(entry.label)
    || `${OFFICIAL_CHAT_PROVIDERS[check.provider].name} — Chat favorito`;

  return {
    id: String(entry.id || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    provider: check.provider,
    label,
    url: check.url,
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
};

/**
 * Carga las conversaciones favoritas privadas del usuario actual.
 * Usa Firestore subcolección privada `usuarios/{uid}/notas/__music_ai_official_chats__`
 * (protegida por reglas `request.auth.uid == userId`) y caché local aislada por UID.
 */
export const loadUserFavoriteChats = async (db, uid) => {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return [];

  let localChats = [];
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(getLocalStorageKey(cleanUid));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localChats = parsed.map(sanitizeFavoriteChatEntry).filter(Boolean);
        }
      }
    }
  } catch {
    localChats = [];
  }

  if (!db) return localChats.slice(0, MAX_FAVORITE_CHATS);

  try {
    const privateDocRef = doc(db, 'usuarios', cleanUid, 'notas', PRIVATE_CHAT_DOC_ID);
    const snap = await Promise.race([
      getDoc(privateDocRef),
      new Promise((resolve) => setTimeout(() => resolve(null), 1200)),
    ]);
    if (snap && snap.exists()) {
      const data = snap.data() || {};
      if (Array.isArray(data.favorites)) {
        const sanitized = data.favorites
          .map(sanitizeFavoriteChatEntry)
          .filter(Boolean)
          .slice(0, MAX_FAVORITE_CHATS);

        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(getLocalStorageKey(cleanUid), JSON.stringify(sanitized));
          }
        } catch {
          // Ignorar límite de localStorage
        }
        return sanitized;
      }
    }
  } catch {
    // En entorno offline/preview sin emulador activo, usar caché local del usuario
  }

  return localChats.slice(0, MAX_FAVORITE_CHATS);
};

/**
 * Guarda las conversaciones favoritas exclusivamente en el espacio privado del usuario.
 */
export const saveUserFavoriteChats = async (db, uid, favorites = []) => {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) throw new Error('Usuario no autenticado.');

  const sanitized = (Array.isArray(favorites) ? favorites : [])
    .map(sanitizeFavoriteChatEntry)
    .filter(Boolean)
    .slice(0, MAX_FAVORITE_CHATS);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(getLocalStorageKey(cleanUid), JSON.stringify(sanitized));
    }
  } catch {
    // Ignorar error local
  }

  if (db) {
    try {
      const privateDocRef = doc(db, 'usuarios', cleanUid, 'notas', PRIVATE_CHAT_DOC_ID);
      const writePromise = setDoc(privateDocRef, {
        ownerUid: cleanUid,
        kind: 'music_ai_official_chats',
        favorites: sanitized,
        updatedAt: new Date().toISOString(),
      });
      await Promise.race([
        writePromise,
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
      // Evitar rechazo no capturado si falla en segundo plano después del timeout
      writePromise.catch((err) => {
        if (err?.code === 'permission-denied') {
          console.warn('Permiso denegado guardando favoritos en Firestore:', err);
        }
      });
    } catch (err) {
      // Si falla red/firestore pero se guardó local, re-lanzar solo si es permission-denied real
      if (err?.code === 'permission-denied') throw err;
    }
  }

  return sanitized;
};

/**
 * Construye el paquete completo con Prompt Maestro KADOSH V2.1, metadatos musicales,
 * referencia de YouTube, indicaciones adicionales y letra/acordes actuales.
 */
export const buildOfficialChatPackage = ({
  titulo = '',
  artista = '',
  tonalidad = '',
  formaAcordes = '',
  capo = '',
  youtubeUrl = '',
  rawSong = '',
  currentDraft = '',
  additionalInstructions = '',
  targetProvider = 'gemini',
  isSwitch = false,
  previousProvider = null,
} = {}) => {
  const providerName = OFFICIAL_CHAT_PROVIDERS[targetProvider]?.name || 'Asistente Musical';
  const prevName = previousProvider ? (OFFICIAL_CHAT_PROVIDERS[previousProvider]?.name || previousProvider) : '';
  const musicSource = String(currentDraft || rawSong || '').trim();

  const metaLines = [];
  if (titulo.trim()) metaLines.push(`- Título: ${titulo.trim()}`);
  if (artista.trim()) metaLines.push(`- Artista: ${artista.trim()}`);
  if (tonalidad.trim()) metaLines.push(`- Tonalidad real: ${tonalidad.trim()}`);
  if (formaAcordes.trim()) metaLines.push(`- Forma de acordes / Armonía: ${formaAcordes.trim()}`);
  if (String(capo || '').trim() !== '') metaLines.push(`- Capo: Traste ${String(capo).trim()}`);
  if (youtubeUrl.trim()) {
    metaLines.push(`- Referencia musical en YouTube: ${youtubeUrl.trim()}`);
  }

  const sections = [
    `=== SOLICITUD DE PREPARACIÓN MUSICAL PARA ${providerName.toUpperCase()} (KADOSH PROJECTION V2.1) ===`,
    KADOSH_MUSIC_AI_SYSTEM_PROMPT,
  ];

  if (metaLines.length > 0) {
    sections.push(`DATOS MUSICALES DE LA CANCIÓN:\n${metaLines.join('\n')}`);
  }

  if (isSwitch && prevName) {
    sections.push(
      `CONTEXTO DE CONTINUACIÓN:\nEstoy continuando en ${providerName} un trabajo musical iniciado previamente en ${prevName}. Toma la versión actual proporcionada abajo como base aprobada, conserva sus secciones y correcciones, y aplica las nuevas indicaciones.`
    );
  }

  if (additionalInstructions.trim()) {
    sections.push(`INDICACIONES MUSICALES ADICIONALES:\n${additionalInstructions.trim()}`);
  }

  if (youtubeUrl.trim()) {
    sections.push(
      `INSTRUCCIÓN SOBRE EL ENLACE DE YOUTUBE:\nUsa la grabación oficial (${youtubeUrl.trim()}) si puedes analizarla para proponer orden de secciones y repeticiones. Conserva la letra y acordes provistos abajo como fuente principal. Si no puedes escuchar el video, indícalo con honestidad sin inventar acordes.`
    );
  }

  sections.push(
    musicSource
      ? `LETRA Y ACORDES A PREPARAR:\n${musicSource}`
      : 'LETRA Y ACORDES A PREPARAR:\n(El usuario pegará o describirá la canción a continuación).'
  );

  sections.push(
    `ENTREGA FINAL EXIGIDA:\nDevuelve obligatoriamente el resultado final completo dentro de un único bloque de código marcado con \`\`\`kadosh ... \`\`\`, con encabezados #, acordes entre corchetes [C] en la sílaba exacta, repeticiones con // ... // y pantallas separadas por una línea en blanco para poder importarlo directamente en KADOSH.`
  );

  return sections.join('\n\n');
};

/**
 * Copia el paquete de texto al portapapeles (si es posible) y abre el chat oficial en una pestaña nueva.
 * Nunca falsifica envíos automáticos ni evade bloqueos del navegador.
 */
export const copyAndOpenOfficialChat = async ({ text, targetUrl }) => {
  const urlCheck = validateOfficialChatUrl(targetUrl);
  if (!urlCheck.valid) {
    return {
      ok: false,
      clipboardCopied: false,
      windowOpened: false,
      error: urlCheck.error,
      targetUrl,
      text,
    };
  }

  let clipboardCopied = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      clipboardCopied = true;
    }
  } catch {
    clipboardCopied = false;
  }

  let windowOpened = false;
  try {
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      const win = window.open(urlCheck.url, '_blank', 'noopener,noreferrer');
      windowOpened = Boolean(win);
    }
  } catch {
    windowOpened = false;
  }

  return {
    ok: true,
    clipboardCopied,
    windowOpened,
    targetUrl: urlCheck.url,
    provider: urlCheck.provider,
    text,
  };
};

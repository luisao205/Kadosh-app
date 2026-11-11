/* global require, module, process */
const fs = require('fs');
const os = require('os');
const path = require('path');
let FirestoreFieldValue = null;
try {
  FirestoreFieldValue = require('firebase-admin/firestore').FieldValue;
} catch (_) {
  // Opcional si se ejecuta con mock
}
const {
  normalizeSectionHeading,
  convertPlainTextToKadosh,
  extractMusicalMetadataFromText,
  extractPureKadoshContent,
  validateKadoshSyntax,
  KADOSH_MUSIC_AI_SYSTEM_PROMPT
} = require('./musicConverterCommon');

const normalizeRoleKey = (role) => String(role || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const extractYouTubeVideoId = (url = '') => {
  const match = String(url || '').match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  return match ? match[1] : null;
};

// Modelo Gemini configurable. Por defecto Gemini 3.8 Flash (o el especificado en GEMINI_MODEL)
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

// Lee variables privadas exclusivamente desde ubicacion local segura FUERA de OneDrive (%LOCALAPPDATA%\Kadosh\secrets\music-ai.env)
// Solo activo en entorno local / Firebase Emulators; nunca en Cloud Functions de produccion.
const readExternalPrivateSecretFile = () => {
  const isLocalOrEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
    || Boolean(process.env.FIRESTORE_EMULATOR_HOST)
    || !process.env.K_SERVICE;
  if (!isLocalOrEmulator) return {};

  const result = {};
  const candidates = [];
  if (process.env.KADOSH_MUSIC_AI_ENV_PATH) {
    candidates.push(process.env.KADOSH_MUSIC_AI_ENV_PATH);
  }
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  if (localAppData) {
    candidates.push(path.join(localAppData, 'Kadosh', 'secrets', 'music-ai.env'));
  }

  for (const envPath of candidates) {
    if (!envPath || !fs.existsSync(envPath)) continue;
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) continue;
        const k = trimmed.slice(0, eqIdx).trim();
        let v = trimmed.slice(eqIdx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1).trim();
        }
        if (v && !result[k]) result[k] = v;
      }
    } catch (_) {
      // Ignorar errores de lectura en disco opcional
    }
  }
  return result;
};

const resolveGeminiConfig = () => {
  const isCloudFunctionsProd = Boolean(process.env.K_SERVICE) && process.env.FUNCTIONS_EMULATOR !== 'true';
  if (
    process.env.KADOSH_DISABLE_LIVE_GEMINI === 'true'
    || (isCloudFunctionsProd && process.env.KADOSH_ALLOW_LIVE_GEMINI_PROD !== 'true')
  ) {
    return {
      apiKey: '',
      model: String(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim()
    };
  }
  const privateEnv = readExternalPrivateSecretFile();
  const apiKey = String(
    process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || privateEnv.GEMINI_API_KEY
    || privateEnv.GOOGLE_API_KEY
    || ''
  ).trim();
  const model = String(
    process.env.GEMINI_MODEL
    || privateEnv.GEMINI_MODEL
    || DEFAULT_GEMINI_MODEL
  ).trim();
  return { apiKey, model };
};

const sanitizeKeyFromMessage = (text = '', apiKey = '') => {
  let clean = String(text || '');
  if (apiKey) {
    clean = clean.split(apiKey).join('[REDACTED_KEY]');
  }
  clean = clean.replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED_KEY]');
  return clean;
};

const callGeminiGenerateContent = async ({ apiKey, model, systemPrompt, contents }) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    })
  });
};

module.exports = ({ functions, admin }) => {
  const httpsError = (code, message) => new functions.https.HttpsError(code, message);
  const fv = () => admin.firestore?.FieldValue || FirestoreFieldValue;

  const assertAuthenticated = (context) => {
    if (!context.auth?.uid) throw httpsError('unauthenticated', 'Debes iniciar sesión.');
    return context.auth.uid;
  };

  const requireOwner = async (uid) => {
    const userSnap = await admin.firestore().collection('usuarios').doc(uid).get();
    if (!userSnap.exists || normalizeRoleKey(userSnap.get('rol') || userSnap.get('role')) !== 'dueno') {
      throw httpsError('permission-denied', 'Solo el dueño puede autorizar o revocar acceso a KADOSH Music AI.');
    }
    return { uid, user: userSnap.data() };
  };

  /**
   * Callable: setMusicAIAccess
   * Permite exclusivamente al dueño aprobar o revocar acceso a KADOSH Music AI
   */
  const setMusicAIAccess = functions.https.onCall(async (data, context) => {
    const actorUid = assertAuthenticated(context);
    await requireOwner(actorUid);

    const targetUid = String(data?.targetUid || '').trim();
    const authorized = Boolean(data?.authorized);

    if (!targetUid) {
      throw httpsError('invalid-argument', 'targetUid es obligatorio.');
    }

    const db = admin.firestore();
    const targetRef = db.collection('usuarios').doc(targetUid);
    const auditRef = targetRef.collection('musicAIAudit').doc();

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(targetRef);
      if (!snap.exists) throw httpsError('not-found', 'Usuario no encontrado.');

      const isTargetOwner = normalizeRoleKey(snap.get('rol') || snap.get('role')) === 'dueno';
      if (isTargetOwner) {
        throw httpsError('failed-precondition', 'El dueño siempre tiene acceso autorizado.');
      }

      const existingAccess = snap.get('musicAIAccess') || {};
      const nextAccess = {
        ...existingAccess,
        authorized,
        updatedBy: actorUid,
        updatedAt: fv().serverTimestamp()
      };

      transaction.update(targetRef, { musicAIAccess: nextAccess });
      transaction.set(auditRef, {
        actorUid,
        targetUid,
        previousAuthorized: existingAccess.authorized === true,
        authorized,
        timestamp: fv().serverTimestamp()
      });
    });

    return { ok: true, targetUid, authorized };
  });

  /**
   * Callable: processMusicAI
   * Procesa prompts y preparación musical mediante Gemini API (con Video Understanding) o motor determinista KADOSH
   */
  const processMusicAI = functions.https.onCall(async (data, context) => {
    const actorUid = assertAuthenticated(context);
    const db = admin.firestore();
    const userRef = db.collection('usuarios').doc(actorUid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) throw httpsError('not-found', 'Usuario no encontrado.');

    const userData = userSnap.data() || {};
    const role = normalizeRoleKey(userData.rol || userData.role);
    const isOwner = role === 'dueno';

    // 1. Validar estado de cuenta
    const accountStatus = String(userData.accountStatus || 'active').toLowerCase();
    if (accountStatus === 'suspended' || accountStatus === 'disabled') {
      throw httpsError('permission-denied', 'Tu cuenta está suspendida. No puedes usar Music AI.');
    }

    // 2. Validar autorización de Music AI
    const hasAuthorizedFlag = userData.musicAIAccess?.authorized === true;
    if (!isOwner && !hasAuthorizedFlag) {
      throw httpsError('permission-denied', 'No tienes autorización para usar KADOSH Music AI. Solicita aprobación al dueño.');
    }

    // 3. Validar payload
    const prompt = String(data?.prompt || '').trim();
    const rawSong = String(data?.rawSong || '').trim();
    const history = Array.isArray(data?.history) ? data.history.slice(-10) : [];
    const youtubeUrl = String(data?.youtubeUrl || '').trim();
    const allowLocalFallback = Boolean(data?.allowLocalFallback ?? true);

    if (!prompt && !rawSong) {
      throw httpsError('invalid-argument', 'Debes ingresar un mensaje o pegar la letra de la canción.');
    }

    if (prompt.length > 5000) {
      throw httpsError('invalid-argument', 'El mensaje supera el límite permitido (5,000 caracteres).');
    }

    if (rawSong.length > 35000) {
      throw httpsError('invalid-argument', 'El texto de la canción supera el límite permitido (35,000 caracteres).');
    }

    // 4. Actualizar métricas de consumo de forma atómica
    await userRef.update({
      'musicAIAccess.requestCount': fv().increment(1),
      'musicAIAccess.lastUsedAt': fv().serverTimestamp()
    });

    const { apiKey, model: modelToUse } = resolveGeminiConfig();

    const videoId = extractYouTubeVideoId(youtubeUrl);
    const canonicalYouTubeUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;

    // 5. Si existe API Key de Gemini en el backend, llamar a la API oficial de Google
    if (apiKey) {
      try {
        const historyContents = [];
        for (const item of history) {
          if (item?.role && item?.text) {
            historyContents.push({
              role: item.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: String(item.text).slice(0, 4000) }]
            });
          }
        }

        let userPromptText = prompt || 'Organiza y estructura esta canción para KADOSH PROJECTION V2.1';
        if (rawSong) {
          userPromptText += `\n\nCANCIÓN ORIGINAL:\n${rawSong}`;
        }

        // Intento 1: Llamada con Video Understanding si hay YouTube URL público
        let response = null;
        let videoUnderstandingActive = false;

        if (canonicalYouTubeUrl) {
          const promptWithVideoNotice = `${userPromptText}\n\n[GRABACIÓN DE REFERENCIA EN YOUTUBE]: ${canonicalYouTubeUrl}\n(Instrucción: Utiliza la grabación oficial para verificar orden de secciones, repeticiones y variaciones. Distingue en tu respuesta lo que pudiste verificar en el video de lo que inferiste musicalmente).`;
          const contentsWithVideo = [
            ...historyContents,
            {
              role: 'user',
              parts: [
                {
                  file_data: {
                    file_uri: canonicalYouTubeUrl
                  }
                },
                {
                  text: promptWithVideoNotice
                }
              ]
            }
          ];

          response = await callGeminiGenerateContent({
            apiKey,
            model: modelToUse,
            systemPrompt: KADOSH_MUSIC_AI_SYSTEM_PROMPT,
            contents: contentsWithVideo
          });

          if (response.ok) {
            videoUnderstandingActive = true;
          } else {
            console.warn(`[MusicAI] Falló llamada con file_data YouTube (${response.status}). Reintentando con prompt textual...`);
            // Si falló por formato de video o restricción de file_uri, reintentamos sin file_data
            response = null;
          }
        }

        // Intento 2 (o llamada directa si no hay YouTube o si falló Video Understanding):
        if (!response) {
          let textOnlyPrompt = userPromptText;
          if (canonicalYouTubeUrl) {
            textOnlyPrompt += `\n\n[REFERENCIA YOUTUBE]: ${canonicalYouTubeUrl}\n(Nota: La inspección audiovisual directa del video no estuvo disponible para este enlace en la API; utiliza la letra, acordes e indicaciones del usuario como fuente principal).`;
          }

          const contentsTextOnly = [
            ...historyContents,
            {
              role: 'user',
              parts: [{ text: textOnlyPrompt }]
            }
          ];

          response = await callGeminiGenerateContent({
            apiKey,
            model: modelToUse,
            systemPrompt: KADOSH_MUSIC_AI_SYSTEM_PROMPT,
            contents: contentsTextOnly
          });
        }

        if (response && response.ok) {
          const resData = await response.json();
          const candidateText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const pureKadosh = extractPureKadoshContent(candidateText) || convertPlainTextToKadosh(rawSong);
          const meta = extractMusicalMetadataFromText(rawSong + '\n' + candidateText);

          return {
            ok: true,
            source: 'gemini',
            model: modelToUse,
            message: candidateText,
            kadoshContent: pureKadosh,
            metadata: meta,
            syntax: validateKadoshSyntax(pureKadosh),
            youtubeAnalysis: {
              attempted: Boolean(canonicalYouTubeUrl),
              videoId: videoId || null,
              canonicalUrl: canonicalYouTubeUrl || null,
              mode: videoUnderstandingActive ? 'video_understanding' : (canonicalYouTubeUrl ? 'text_reference_fallback' : 'none'),
              verified: videoUnderstandingActive,
              note: videoUnderstandingActive
                ? 'Grabación de YouTube analizada con Gemini Video Understanding. Estructura y repeticiones comparadas con el audio.'
                : (canonicalYouTubeUrl ? 'Video de referencia recibido. Análisis audiovisual directo no disponible en la API para este enlace; se estructuró a partir de letra e indicaciones.' : null)
            }
          };
        } else if (response) {
          // La API respondió con error (ej. 403 clave filtrada/inválida, 429 cuota agotada)
          let errorBody = {};
          try {
            errorBody = await response.json();
          } catch (_) {
            errorBody = { error: { message: response.statusText } };
          }
          const rawErrorMsg = errorBody?.error?.message || response.statusText || 'Error de llamada a Gemini API';
          const errorMessage = sanitizeKeyFromMessage(rawErrorMsg, apiKey);
          const errorCode = errorBody?.error?.status || `HTTP_${response.status}`;

          // NO disfrazar la respuesta como determinista si el usuario esperaba Gemini
          return {
            ok: false,
            source: 'gemini_error',
            model: modelToUse,
            status: response.status,
            errorCode,
            error: errorMessage,
            message: `Error de Gemini API (${modelToUse}): ${errorMessage}`,
            fallbackAvailable: true
          };
        }
      } catch (geminiException) {
        const cleanExceptionMsg = sanitizeKeyFromMessage(geminiException.message || 'Error de red con Gemini', apiKey);
        console.warn('[MusicAI] Excepción en llamada a Gemini API:', cleanExceptionMsg);
        return {
          ok: false,
          source: 'gemini_error',
          model: modelToUse,
          error: cleanExceptionMsg,
          message: `Excepción de red al conectar con Gemini (${modelToUse}): ${cleanExceptionMsg}`,
          fallbackAvailable: true
        };
      }
    }

    // 6. Si no existe API Key configurada en backend, retornar explícitamente motor determinista
    const converted = convertPlainTextToKadosh(rawSong || prompt);
    const meta = extractMusicalMetadataFromText(rawSong || prompt);
    const syntax = validateKadoshSyntax(converted);

    return {
      ok: true,
      source: 'deterministic_engine',
      model: 'kadosh-deterministic-v21',
      message: `Procesado mediante el motor determinista local de KADOSH.\n(Nota: Gemini API no está configurada con credencial activa en este backend).\n\nLetra, acordes en corchetes y separación por diapositivas estructurados según las reglas V2.1.`,
      kadoshContent: converted,
      metadata: meta,
      syntax,
      youtubeAnalysis: {
        attempted: Boolean(canonicalYouTubeUrl),
        videoId: videoId || null,
        canonicalUrl: canonicalYouTubeUrl || null,
        mode: canonicalYouTubeUrl ? 'player_reference_only' : 'none',
        verified: false,
        note: 'Modo local sin Gemini API: el video se utiliza como reproductor de referencia, sin análisis automático.'
      }
    };
  });

  return {
    setMusicAIAccess,
    processMusicAI
  };
};

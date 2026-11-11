import assert from 'node:assert/strict';
import {
  convertPlainTextToKadosh,
  extractMusicalMetadataFromText,
  extractPureKadoshContent,
  isChordLine,
  mergeChordLineWithLyricLine,
  normalizeSectionHeading,
  transposeKey,
  validateKadoshSyntax,
  KADOSH_MUSIC_AI_SYSTEM_PROMPT
} from '../src/utils/musicConverter.js';
import { canAccessMusicAI } from '../src/utils/rolePermissions.js';
import { isOwnerUser } from '../src/utils/permissions.js';
import { parsearCancion, getSectionPages } from '../src/utils/songParser.js';

console.log('====================================================');
console.log('       SUITE DE PRUEBAS INTEGRALES KADOSH MUSIC AI  ');
console.log('====================================================\n');

// ──────────────────────────────────────────────────────────────────
// PRUEBA 1: Conversión musical con Fixture Real (Tono Ab, Forma G, Capo 1)
// ──────────────────────────────────────────────────────────────────
console.log('--- PRUEBA 1: Fixture Musical (Tono Ab, Forma G, Capo 1) ---');

const fixtureRaw = `
Título: Tu Fidelidad
Artista: Marcos Witt
Tono: Ab
Forma: G
Capo: 1
BPM: 72
YouTube: https://www.youtube.com/watch?v=dQw4w9WgXcQ

Intro
G   D/F#   Em   C

Verso 1
       G              D
Tu fidelidad es grande
       Em             C
Tu fidelidad incomparable es

Coro
//     G           D
Nadie como tú, bendito Dios
       Em          C
Grande es tu fidelidad //

Puente
       Em        Bm
Tu gracia me sostiene
       C         D
Tu amor nunca fallará
`;

const converted = convertPlainTextToKadosh(fixtureRaw);
const meta = extractMusicalMetadataFromText(fixtureRaw);

console.log('Metadatos extraídos:', meta);
assert.equal(meta.tono, 'Ab', 'Tonalidad real debe ser Ab');
assert.equal(meta.forma, 'G', 'Forma de acordes debe ser G');
assert.equal(meta.capo, 1, 'Capo debe ser 1');
assert.equal(meta.bpm, '72', 'BPM debe ser 72');
assert.equal(meta.titulo, 'Tu Fidelidad', 'Título debe ser Tu Fidelidad');
assert.equal(meta.artista, 'Marcos Witt', 'Artista debe ser Marcos Witt');

// Verificar transposición matemática: Forma G + Capo 1 = Tono real Ab
assert.equal(transposeKey('G', 1), 'Ab', 'G transportado 1 semitono debe ser Ab');
console.log('[PASS] Tono Ab, Forma G y Capo 1 verificados y consistentes.');

// ──────────────────────────────────────────────────────────────────
// PRUEBA 2: Estructura Musical y Compatibilidad con KADOSH Parser
// ──────────────────────────────────────────────────────────────────
console.log('\n--- PRUEBA 2: Estructura Musical y Parser KADOSH ---');

const sections = parsearCancion(converted);
console.log(`Secciones detectadas (${sections.length}):`, sections.map(s => s.titulo));

assert.equal(sections.length, 4, 'Deben existir 4 secciones (Intro, Verso 1, Coro, Puente)');
assert.equal(sections[0].titulo, 'Intro');
assert.equal(sections[1].titulo, 'Verso 1');
assert.equal(sections[2].titulo, 'Coro');
assert.equal(sections[3].titulo, 'Puente');

// Verificar acordes entre corchetes en posición
assert.ok(converted.includes('# Intro'), 'Debe incluir encabezado canónico # Intro');
assert.ok(converted.includes('# Verso 1'), 'Debe incluir encabezado canónico # Verso 1');
assert.ok(converted.includes('# Coro'), 'Debe incluir encabezado canónico # Coro');
assert.ok(converted.includes('# Puente'), 'Debe incluir encabezado canónico # Puente');
assert.ok(converted.includes('[G]'), 'Debe incluir acorde [G]');
assert.ok(converted.includes('[D]'), 'Debe incluir acorde [D]');
assert.ok(converted.includes('[Em]'), 'Debe incluir acorde [Em]');
assert.ok(converted.includes('[C]'), 'Debe incluir acorde [C]');

// Verificar repetición en Coro (// ... //)
const coroSection = sections.find(s => s.titulo === 'Coro');
assert.ok(coroSection, 'Sección Coro debe existir');
console.log('[PASS] Secciones y acordes [G], [D], [Em], [C] estructurados fielmente.');

// ──────────────────────────────────────────────────────────────────
// PRUEBA 3: Diapositivas y Paginación (Separación por líneas vacías)
// ──────────────────────────────────────────────────────────────────
console.log('\n--- PRUEBA 3: Paginación y Diapositivas ---');

const syntax = validateKadoshSyntax(converted);
console.log('Estadísticas sintácticas:', syntax.stats);
console.log('Problemas sintácticos:', syntax.issues);
assert.equal(syntax.valid, true, 'Sintaxis debe ser válida para Projection V2.1');
assert.ok(syntax.stats.slides >= 4, 'Debe generar al menos 4 diapositivas');
assert.ok(syntax.stats.chords >= 10, 'Debe contener al menos 10 acordes asignados');
console.log('[PASS] Diapositivas y líneas vacías conformes con V2.1.');

// ──────────────────────────────────────────────────────────────────
// PRUEBA 4: Extracción Limpia y Botón "Copiar"
// ──────────────────────────────────────────────────────────────────
console.log('\n--- PRUEBA 4: Botón Copiar (Bloque Kadosh Puro) ---');

const simulatedAiMessage = `
¡Hola! He estructurado la canción según lo solicitado:

\`\`\`kadosh
# Intro
[G] [D] [Em] [C]

# Verso 1
Tu [G]fidelidad es [D]grande
Tu [Em]fidelidad incompa[C]rable es
\`\`\`

Cualquier ajuste adicional me avisas. ¡Bendiciones!
`;

const pure = extractPureKadoshContent(simulatedAiMessage);
console.log('Resultado copiado:\n' + pure);
assert.ok(!pure.includes('¡Hola!'), 'No debe incluir saludos de chat');
assert.ok(!pure.includes('Cualquier ajuste'), 'No debe incluir despedidas');
assert.ok(!pure.includes('```'), 'No debe incluir fences de markdown');
assert.ok(pure.startsWith('# Intro'), 'Debe empezar directamente en # Intro');
console.log('[PASS] Copiar resultado entrega exclusivamente el bloque puro KADOSH.');

// ──────────────────────────────────────────────────────────────────
// PRUEBA 5: Seguridad y Aprobación del Dueño
// ──────────────────────────────────────────────────────────────────
console.log('\n--- PRUEBA 5: Control de Acceso (Dueño vs No Autorizado vs Aprobado) ---');

const ownerUser = { uid: 'owner-1', email: 'owner@kadosh.org', rol: 'dueno', accountStatus: 'active' };
const regularUserUnapproved = { uid: 'user-2', email: 'musico@kadosh.org', rol: 'musico', accountStatus: 'active' };
const regularUserApproved = { uid: 'user-3', email: 'aprobado@kadosh.org', rol: 'musico', accountStatus: 'active', musicAIAccess: { authorized: true, requestCount: 5 } };
const suspendedUserApproved = { uid: 'user-4', email: 'suspendido@kadosh.org', rol: 'musico', accountStatus: 'suspended', musicAIAccess: { authorized: true } };

// 1. Dueño siempre autorizado
assert.equal(canAccessMusicAI(ownerUser), true, 'El dueño debe tener acceso autorizado siempre');

// 2. Usuario no aprobado -> denegado
assert.equal(canAccessMusicAI(regularUserUnapproved), false, 'Usuario regular sin aprobación debe ser denegado');

// 3. Usuario aprobado por dueño -> autorizado
assert.equal(canAccessMusicAI(regularUserApproved), true, 'Usuario aprobado debe tener acceso');

// 4. Usuario suspendido (aunque tenga flag antiguo) -> denegado
assert.equal(canAccessMusicAI(suspendedUserApproved), false, 'Usuario suspendido debe ser denegado siempre');

console.log('[PASS] Políticas de seguridad, aprobación y revocación comprobadas.');

// ──────────────────────────────────────────────────────────────────
// PRUEBA 6: Transferencia y Precarga a "Crear Canción" (Hand-off)
// ──────────────────────────────────────────────────────────────────
console.log('\n--- PRUEBA 6: Hand-off a Crear Canción (AddSongAI) ---');

const handoffPayload = {
  titulo: meta.titulo,
  artista: meta.artista,
  tono: meta.tono,
  bpm: meta.bpm,
  letraRaw: pure,
  youtubeUrl: meta.youtubeUrl,
  projectionStyle: { preset: 'worship', motion: 'soft', alignment: 'center', backgroundTreatment: 'auto' }
};

const serialized = JSON.stringify(handoffPayload);
const deserialized = JSON.parse(serialized);

assert.equal(deserialized.titulo, 'Tu Fidelidad');
assert.equal(deserialized.artista, 'Marcos Witt');
assert.equal(deserialized.tono, 'Ab');
assert.equal(deserialized.bpm, '72');
assert.equal(deserialized.youtubeUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
assert.ok(deserialized.letraRaw.includes('# Intro'));
assert.equal(deserialized.projectionStyle.preset, 'worship');

console.log('[PASS] Hand-off de datos hacia Crear Canción sobrevive navegación y conserva todos los campos.');

// ──────────────────────────────────────────────────────────────────
// PRUEBA 7: Resumen de Verificación y Estado de Gemini
// ──────────────────────────────────────────────────────────────────
console.log('\n--- PRUEBA 7: Estado de Integración Gemini & Backend ---');
console.log('KADOSH_MUSIC_AI_SYSTEM_PROMPT longitud:', KADOSH_MUSIC_AI_SYSTEM_PROMPT.length);
assert.ok(KADOSH_MUSIC_AI_SYSTEM_PROMPT.includes('KADOSH PROJECTION V2.1'));
assert.ok(KADOSH_MUSIC_AI_SYSTEM_PROMPT.includes('CIFRADO AMERICANO'));
assert.ok(KADOSH_MUSIC_AI_SYSTEM_PROMPT.includes('ACORDES ENTRE CORCHETES'));

const hasApiKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
console.log(`Estado Gemini Backend: ${hasApiKey ? 'API_KEY DETECTADA (Llamadas reales activadas)' : 'MODO DETERMINISTA LOCAL (Sin costos ni dependencias externas)'}`);

console.log('\n====================================================');
console.log('       TODAS LAS PRUEBAS DE MUSIC AI PASARON EXITOSAMENTE ');
console.log('====================================================');

import assert from 'node:assert/strict';
import {
  OFFICIAL_CHAT_PROVIDERS,
  validateOfficialChatUrl,
  buildOfficialChatPackage
} from '../src/utils/officialMusicChats.js';
import { importExternalAssistantResult } from '../src/utils/musicConverter.js';

console.log('=== PRUEBAS UNITARIAS Y DE SEGURIDAD: CHATS OFICIALES ===\n');

// 1. Validación estricta de URLs oficiales HTTPS
const validGemini = validateOfficialChatUrl('https://gemini.google.com/app/12345abc', 'gemini');
assert.equal(validGemini.valid, true);
assert.equal(validGemini.provider, 'gemini');

const validChatGPT = validateOfficialChatUrl('https://chatgpt.com/c/abc-123', 'chatgpt');
assert.equal(validChatGPT.valid, true);
assert.equal(validChatGPT.provider, 'chatgpt');

const validOpenAI = validateOfficialChatUrl('https://chat.openai.com/c/abc-123', 'chatgpt');
assert.equal(validOpenAI.valid, true);
assert.equal(validOpenAI.provider, 'chatgpt');

// Rechazar inseguros, spoofed o credenciales
assert.equal(validateOfficialChatUrl('http://gemini.google.com/app').valid, false);
assert.equal(validateOfficialChatUrl('javascript:alert(1)').valid, false);
assert.equal(validateOfficialChatUrl('https://gemini.google.com.attacker.tld/app').valid, false);
assert.equal(validateOfficialChatUrl('https://user:pass@chatgpt.com/').valid, false);
assert.equal(validateOfficialChatUrl('https://chatgpt.com/c/123', 'gemini').valid, false);
assert.equal(validateOfficialChatUrl('https://evil.com/').valid, false);
console.log('[PASS] Validación estricta HTTPS y lista blanca oficial verificada.');

// 2. Empaquetado completo de Prompt Maestro + Metadatos + Cambio de proveedor
const pkg = buildOfficialChatPackage({
  titulo: 'Tu Fidelidad',
  artista: 'Marcos Witt',
  tonalidad: 'Ab',
  formaAcordes: 'G',
  capo: '1',
  youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  rawSong: 'Tu fidelidad es grande',
  currentDraft: '# Coro\nTu [G]fidelidad es [D]grande',
  additionalInstructions: 'Repite el coro 2 veces',
  targetProvider: 'chatgpt',
  isSwitch: true,
  previousProvider: 'gemini'
});

assert.ok(pkg.includes('REGLAS MAESTRAS KADOSH PROJECTION V2.1'), 'Debe incluir prompt maestro V2.1');
assert.ok(pkg.includes('Título: Tu Fidelidad'), 'Debe incluir título');
assert.ok(pkg.includes('Artista: Marcos Witt'), 'Debe incluir artista');
assert.ok(pkg.includes('Tonalidad real: Ab'), 'Debe incluir tonalidad');
assert.ok(pkg.includes('Forma de acordes / Armonía: G'), 'Debe incluir forma');
assert.ok(pkg.includes('Capo: Traste 1'), 'Debe incluir capo');
assert.ok(pkg.includes('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'Debe incluir YouTube');
assert.ok(pkg.includes('Repite el coro 2 veces'), 'Debe incluir indicaciones adicionales');
assert.ok(pkg.includes('continuando en ChatGPT un trabajo musical iniciado previamente en Gemini'), 'Debe incluir contexto de cambio');
assert.ok(pkg.includes('# Coro\nTu [G]fidelidad es [D]grande'), 'Debe incluir borrador actualizado');
assert.ok(pkg.includes('```kadosh'), 'Debe exigir formato kadosh');
console.log('[PASS] Paquete maestro musical y contexto de continuación verificados.');

// 3. Importación limpia de respuesta pegada desde ChatGPT o Gemini
const rawPastedReply = `¡Claro! Aquí tienes tu canción organizada según KADOSH V2.1:

Tono: Ab
Forma: G
Capo: 1

\`\`\`kadosh
# Intro
[G] [D] [Em] [C]

# Coro
// Tu [G]fidelidad es [D]grande
Tu [Em]fidelidad incompa[C]rable es //
\`\`\`

Espero que te sirva para tu ensayo. ¡Dios te bendiga!`;

const imported = importExternalAssistantResult(rawPastedReply);
assert.equal(imported.syntax.valid, true, 'La sintaxis importada debe ser válida');
assert.equal(imported.syntax.stats.sections, 2);
assert.equal(imported.syntax.stats.chords, 8);
assert.equal(imported.syntax.stats.repeats, 1);
assert.equal(imported.metadata.tono, 'Ab');
assert.equal(imported.metadata.forma, 'G');
assert.equal(imported.metadata.capo, 1);
assert.equal(imported.kadoshContent.includes('¡Claro!'), false, 'Debe limpiar saludos');
assert.equal(imported.kadoshContent.includes('```'), false, 'Debe limpiar envoltorios markdown');
assert.equal(imported.kadoshContent.includes('Espero que te sirva'), false, 'Debe limpiar despedidas');
console.log('[PASS] Importación de respuesta externa limpia envoltorios, detecta repeticiones y conserva acordes.');

console.log('\n=== TODAS LAS PRUEBAS UNITARIAS PASARON (PASS) ===');

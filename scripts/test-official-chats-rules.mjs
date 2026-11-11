import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('Se requiere Firestore Emulator local.');
}

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-kadosh-e2e',
  firestore: { rules }
});

const ownerDb = () => testEnv.authenticatedContext('owner-uid', { email: 'owner@example.test' }).firestore();
const otherMemberDb = () => testEnv.authenticatedContext('other-uid', { email: 'member@example.test' }).firestore();
const unauthDb = () => testEnv.unauthenticatedContext().firestore();

try {
  const ownerChatsRefForOwner = doc(ownerDb(), 'usuarios', 'owner-uid', 'notas', 'music_ai_official_chats');
  const ownerChatsRefForOther = doc(otherMemberDb(), 'usuarios', 'owner-uid', 'notas', 'music_ai_official_chats');
  const ownerChatsRefForUnauth = doc(unauthDb(), 'usuarios', 'owner-uid', 'notas', 'music_ai_official_chats');

  // 1. El dueño PUEDE escribir sus propios chats favoritos privados
  await assertSucceeds(setDoc(ownerChatsRefForOwner, {
    ownerUid: 'owner-uid',
    kind: 'music_ai_official_chats',
    favorites: [
      { id: 'fav-1', provider: 'gemini', label: 'Gemini — Repertorio principal', url: 'https://gemini.google.com/app/private123' }
    ]
  }));

  // 2. El dueño PUEDE leer sus propios chats favoritos
  await assertSucceeds(getDoc(ownerChatsRefForOwner));

  // 3. Otro usuario autenticado NO PUEDE leer los enlaces privados del dueño
  await assertFails(getDoc(ownerChatsRefForOther));

  // 4. Otro usuario autenticado NO PUEDE sobrescribir los enlaces privados del dueño
  await assertFails(setDoc(ownerChatsRefForOther, { hacked: true }));

  // 5. Usuario no autenticado NO PUEDE leer ni escribir
  await assertFails(getDoc(ownerChatsRefForUnauth));
  await assertFails(setDoc(ownerChatsRefForUnauth, { hacked: true }));

  console.log('[PASS] Privacidad por usuario de favoritos en Firestore Rules verificada al 100%.');
} finally {
  await testEnv.cleanup();
}

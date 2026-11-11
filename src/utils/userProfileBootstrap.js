import { doc, runTransaction, updateDoc } from 'firebase/firestore';

export const buildInitialUserProfile = ({ firebaseUser, ownerEmail, now = new Date().toISOString() }) => {
  const isOwner = firebaseUser?.email === ownerEmail;
  return {
    email: firebaseUser?.email || '',
    nombre: isOwner ? 'Dueño Principal' : 'Usuario Nuevo',
    rol: isOwner ? 'dueño' : 'musico',
    accountStatus: 'active',
    fechaCreacion: now,
  };
};

// A transaction creates a profile only after the server has confirmed it is absent.
// Existing profiles are returned untouched, including every unknown legacy field.
export const bootstrapUserProfile = async ({ firestore, firebaseUser, ownerEmail, now }) => {
  if (!firebaseUser?.uid) throw new Error('No se puede inicializar un perfil sin uid.');

  const userRef = doc(firestore, 'usuarios', firebaseUser.uid);
  let result = null;

  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (snapshot.exists()) {
      result = { created: false, data: snapshot.data() };
      return;
    }

    const data = buildInitialUserProfile({ firebaseUser, ownerEmail, now: now?.() || new Date().toISOString() });
    transaction.set(userRef, data);
    result = { created: true, data };
  });

  return { userRef, ...result };
};

export const updateEphemeralUserProfile = async ({ firestore, uid, changes }) => {
  if (!uid) throw new Error('No se puede actualizar un perfil efímero sin uid.');
  const allowedKeys = new Set(['fcmToken', 'ultimaConexion']);
  const keys = Object.keys(changes || {});
  if (!keys.length || keys.some((key) => !allowedKeys.has(key))) {
    throw new Error('Actualización efímera de perfil inválida.');
  }
  await updateDoc(doc(firestore, 'usuarios', uid), changes);
};

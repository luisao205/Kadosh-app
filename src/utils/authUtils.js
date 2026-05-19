import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, updateDoc, collection, getDoc, getDocs, query, where, writeBatch, deleteDoc, deleteField } from 'firebase/firestore';
import { db } from '../config/firebase';

// TRUCO PROFESIONAL: Clonamos la configuración de tu app principal.
// Creamos una app "secundaria" para que al registrar no se cierre tu sesión principal.
const secondaryApp = initializeApp(db.app.options, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

export const crearUsuarioPorAdmin = async (email, password, nombre, rol, instrumentos = [], fechaNacimiento = null) => {
  try {
    // 1. Crear en Auth con la app secundaria
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = userCredential.user.uid;

    // 2. Guardar el rol en tu base de datos principal
    await setDoc(doc(db, "usuarios", uid), {
      nombre,
      email,
      rol,
      instrumentos,
      fechaNacimiento,
      fechaCreacion: new Date().toISOString()
    });

    // 3. Cerrar la sesión secundaria por limpieza
    await signOut(secondaryAuth);
    return uid;
  } catch (error) {
    throw error;
  }
};

export const crearPerfilSinAcceso = async (nombre, rol, instrumentos = [], fechaNacimiento = null) => {
  try {
    const newUserRef = doc(collection(db, "usuarios"));
    await setDoc(newUserRef, {
      nombre,
      rol,
      instrumentos,
      fechaNacimiento,
      sinAcceso: true,
      fechaCreacion: new Date().toISOString()
    });
    return newUserRef.id;
  } catch (error) {
    throw error;
  }
};

export const habilitarAccesoWeb = async (oldUid, email, password) => {
  try {
    // 1. Crear credenciales reales en Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUid = userCredential.user.uid;

    // 2. Extraer historial y guardar en el nuevo ID Oficial
    const oldUserRef = doc(db, "usuarios", oldUid);
    const oldUserSnap = await getDoc(oldUserRef);
    await setDoc(doc(db, "usuarios", newUid), {
      ...oldUserSnap.data(), email, sinAcceso: false, fechaActualizacion: new Date().toISOString()
    });

    // 3. Actualizar TODOS los eventos donde este músico estaba convocado
    const q = query(collection(db, "eventos"), where("equipo", "array-contains", oldUid));
    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);
    querySnapshot.forEach((eventoDoc) => {
      const nuevoEquipo = eventoDoc.data().equipo.map(id => id === oldUid ? newUid : id);
      
      const updateData = { equipo: nuevoEquipo };
      const data = eventoDoc.data();
      // Traspasar el estado de asistencia para que no pierda su confirmación
      if (data.estadoAsistencia && data.estadoAsistencia[oldUid]) {
        updateData[`estadoAsistencia.${newUid}`] = data.estadoAsistencia[oldUid];
        updateData[`estadoAsistencia.${oldUid}`] = deleteField();
      }
      
      batch.update(eventoDoc.ref, updateData);
    });
    await batch.commit();

    // 4. Limpieza
    await deleteDoc(oldUserRef);
    await signOut(secondaryAuth);
  } catch (error) {
    throw error;
  }
};

export const actualizarUsuarioPorAdmin = async (uid, nombre, rol, instrumentos = [], fechaNacimiento = null) => {
  try {
    const userRef = doc(db, "usuarios", uid);
    await updateDoc(userRef, {
      nombre,
      rol,
      instrumentos,
      fechaNacimiento,
      fechaActualizacion: new Date().toISOString()
    });
  } catch (error) {
    throw error;
  }
};
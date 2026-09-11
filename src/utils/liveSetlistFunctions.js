import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const agregarCancionEnVivoCallable = httpsCallable(functions, 'agregarCancionEnVivo');
const quitarCancionEnVivoCallable = httpsCallable(functions, 'quitarCancionEnVivo');

export const agregarCancionEnVivo = async ({ eventoId, songId }) => {
  const result = await agregarCancionEnVivoCallable({ eventoId, songId });
  return result.data;
};

export const quitarCancionEnVivo = async ({ eventoId, idLocal }) => {
  const result = await quitarCancionEnVivoCallable({ eventoId, idLocal });
  return result.data;
};

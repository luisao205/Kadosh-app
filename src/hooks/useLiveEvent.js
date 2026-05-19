// src/hooks/useLiveEvent.js
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

export const useLiveEvent = (eventId) => {
  const [eventoActivo, setEventoActivo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) return;

    const eventRef = doc(db, 'eventos', eventId);
    
    // onSnapshot escucha los cambios en tiempo real
    const unsubscribe = onSnapshot(eventRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setEventoActivo(data);
        
        // Lógica del "Botón de Pánico"
        if (data.cancionPanicoId) {
          console.warn("¡IMPROVISACIÓN FLASH DETECTADA! Redirigiendo UI...");
          // Aquí la UI forzará la vista a la nueva canción
        }
      }
      setLoading(false);
    });

    // Cleanup al desmontar el componente (salir del modo culto)
    return () => unsubscribe();
  }, [eventId]);

  return { eventoActivo, loading };
};

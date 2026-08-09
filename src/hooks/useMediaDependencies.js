import { useEffect, useMemo, useState } from 'react';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { normalizeMediaUsage } from '../utils/mediaUsage';

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getSongIds = (usages) => (
  [...new Set(usages.map(usage => usage.songId).filter(Boolean))]
);

const fetchSongsByIds = async (songIds = []) => {
  if (songIds.length === 0) return new Map();

  const songMap = new Map();
  const songChunks = chunk(songIds, 10);

  await Promise.all(songChunks.map(async (ids) => {
    const snapshot = await getDocs(query(collection(db, 'canciones'), where(documentId(), 'in', ids)));
    snapshot.forEach(docSnapshot => {
      songMap.set(docSnapshot.id, { id: docSnapshot.id, ...docSnapshot.data() });
    });
  }));

  return songMap;
};

export const useMediaDependencies = (media, { enabled = false } = {}) => {
  const [dependencies, setDependencies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const usages = useMemo(() => (
    Array.isArray(media?.usedBy) ? media.usedBy.map(normalizeMediaUsage) : []
  ), [media?.id, media?.mediaId, media?.usedBy]);

  useEffect(() => {
    let active = true;

    const resolveDependencies = async () => {
      if (!enabled || !media) return;

      setLoading(true);
      setError('');

      try {
        const songMap = await fetchSongsByIds(getSongIds(usages));
        if (!active) return;

        setDependencies(usages.map(usage => {
          const song = usage.songId ? songMap.get(usage.songId) : null;
          const title = song?.titulo || song?.title || song?.nombre || usage.title || 'Elemento no disponible';

          return {
            ...usage,
            available: usage.type !== 'song' || Boolean(song || usage.title),
            title,
            route: usage.songId ? `/editar/${usage.songId}` : null
          };
        }));
      } catch (err) {
        if (!active) return;
        console.error('Error resolviendo dependencias multimedia:', err);
        setError('No se pudieron resolver las dependencias. Intenta nuevamente.');
      } finally {
        if (active) setLoading(false);
      }
    };

    resolveDependencies();

    return () => {
      active = false;
    };
  }, [enabled, media, usages]);

  return {
    dependencies,
    loading,
    error
  };
};

export default useMediaDependencies;

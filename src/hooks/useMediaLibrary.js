import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { MEDIA_LIBRARY_COLLECTION, createMediaLibraryDocument, normalizeMediaText } from '../utils/mediaLibrary';

const normalizeMediaLibraryDoc = (docSnap) => {
  const data = docSnap.data() || {};
  const normalized = createMediaLibraryDocument({
    ...data,
    id: docSnap.id,
    mediaId: data.mediaId || docSnap.id,
    source: data.source || 'library'
  }, {
    now: data.updatedAt || Date.now(),
    userId: data.createdBy || null
  });

  return {
    ...normalized,
    ...data,
    id: docSnap.id,
    mediaId: data.mediaId || docSnap.id,
    title: data.title || normalized.title,
    normalizedTitle: data.normalizedTitle || normalizeMediaText(data.title || normalized.title),
    usageCount: Number.isFinite(data.usageCount) ? data.usageCount : 0,
    usedBy: Array.isArray(data.usedBy) ? data.usedBy : [],
    metadata: {
      ...(normalized.metadata || {}),
      ...(data.metadata || {})
    }
  };
};

const sortMediaItems = (items) => [...items].sort((a, b) => {
  const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
  const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
  if (bTime !== aTime) return bTime - aTime;
  return String(a.title || '').localeCompare(String(b.title || ''));
});

export const useMediaLibrary = ({ enabled = true } = {}) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, MEDIA_LIBRARY_COLLECTION),
      (snapshot) => {
        const nextItems = snapshot.docs.map(normalizeMediaLibraryDoc);
        setItems(sortMediaItems(nextItems));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('Error cargando mediaLibrary:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [enabled]);

  const counts = useMemo(() => {
    const nextCounts = { all: items.length };
    items.forEach(item => {
      nextCounts[item.type] = (nextCounts[item.type] || 0) + 1;
    });
    return nextCounts;
  }, [items]);

  return {
    items,
    counts,
    loading,
    error,
    empty: !loading && items.length === 0
  };
};

export default useMediaLibrary;


import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { MEDIA_LIBRARY_COLLECTION, createMediaLibraryDocument, normalizeMediaText } from '../utils/mediaLibrary';
import { isMediaTrashed } from '../utils/mediaTrash';

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
    favorite: data.favorite ?? false,
    category: data.category ?? null,
    fileName: data.fileName || data.originalName || data.name || '',
    originalName: data.originalName || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
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

export const useMediaLibrary = ({ enabled = true, activeOnly = false, sharedOnly = false } = {}) => {
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const constraints = [];
    if (activeOnly) constraints.push(where('status', '==', 'active'));
    if (sharedOnly) constraints.push(where('source', '==', 'library'));
    const mediaQuery = constraints.length
      ? query(collection(db, MEDIA_LIBRARY_COLLECTION), ...constraints)
      : collection(db, MEDIA_LIBRARY_COLLECTION);

    const unsubscribe = onSnapshot(
      mediaQuery,
      (snapshot) => {
        const nextItems = snapshot.docs.map(normalizeMediaLibraryDoc);
        setAllItems(sortMediaItems(nextItems));
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
  }, [activeOnly, enabled, sharedOnly]);

  const counts = useMemo(() => {
    const activeItems = allItems.filter(item => !isMediaTrashed(item));
    const nextCounts = { all: activeItems.length };
    activeItems.forEach(item => {
      nextCounts[item.type] = (nextCounts[item.type] || 0) + 1;
    });
    return nextCounts;
  }, [allItems]);

  const items = useMemo(() => allItems.filter(item => !isMediaTrashed(item)), [allItems]);
  const trashedItems = useMemo(() => allItems.filter(isMediaTrashed), [allItems]);

  return {
    items,
    trashedItems,
    allItems,
    counts,
    loading,
    error,
    empty: !loading && items.length === 0
  };
};

export default useMediaLibrary;

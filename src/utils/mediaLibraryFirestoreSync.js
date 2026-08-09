import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { MEDIA_LIBRARY_COLLECTION, createMediaLibraryDocument } from './mediaLibrary.js';
import { buildMediaLibrarySyncPlan, getMediaIdentityKey } from './mediaLibrarySync.js';

const SONGS_COLLECTION = 'canciones';
const FIRESTORE_BATCH_LIMIT = 450;

const resolveFirestore = async (firestore) => firestore || db;

const isAdminFirestore = (firestore) => typeof firestore?.collection === 'function'
  && typeof firestore?.batch === 'function';

const getDocRef = (firestore, collectionName, documentId) => (
  isAdminFirestore(firestore)
    ? firestore.collection(collectionName).doc(documentId)
    : doc(firestore, collectionName, documentId)
);

const getCollectionSnapshot = (firestore, collectionName) => (
  isAdminFirestore(firestore)
    ? firestore.collection(collectionName).get()
    : getDocs(collection(firestore, collectionName))
);

const getBatch = (firestore) => (
  isAdminFirestore(firestore)
    ? firestore.batch()
    : writeBatch(firestore)
);

const setDocumentData = async (firestore, ref, data, options = { merge: true }) => {
  const batch = getBatch(firestore);
  batch.set(ref, data, options);
  await batch.commit();
};

const createStableMediaDocId = (identityKey = '') => {
  let hash = 5381;
  const value = String(identityKey);

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(index);
  }

  return `media_${(hash >>> 0).toString(36)}`;
};

const commitBatchQueue = async (firestore, operations) => {
  let committedBatches = 0;

  for (let index = 0; index < operations.length; index += FIRESTORE_BATCH_LIMIT) {
    const batch = getBatch(firestore);
    operations.slice(index, index + FIRESTORE_BATCH_LIMIT).forEach(operation => {
      batch.set(operation.ref, operation.data, { merge: operation.merge });
    });
    await batch.commit();
    committedBatches += 1;
  }

  return committedBatches;
};

const getExistingMediaIndex = async (firestore) => {
  const snapshot = await getCollectionSnapshot(firestore, MEDIA_LIBRARY_COLLECTION);
  const byIdentityKey = new Map();

  snapshot.forEach(documentSnapshot => {
    const data = documentSnapshot.data() || {};
    const identityKey = data.identityKey || getMediaIdentityKey({
      ...data,
      id: documentSnapshot.id,
      mediaId: data.mediaId
    });

    if (!identityKey) return;

    byIdentityKey.set(identityKey, {
      id: documentSnapshot.id,
      data
    });
  });

  return byIdentityKey;
};

export const isSameMediaUsage = (usageA = {}, usageB = {}) => (
  usageA.songId === usageB.songId
  && usageA.location === usageB.location
  && (usageA.sectionKey || '') === (usageB.sectionKey || '')
  && (usageA.resourceId || '') === (usageB.resourceId || '')
);

export const calculateMediaUsageFields = (currentUsedBy = [], usage, action = 'add', now = Date.now()) => {
  const safeCurrentUsedBy = Array.isArray(currentUsedBy) ? currentUsedBy : [];
  const nextUsedBy = action === 'remove'
    ? safeCurrentUsedBy.filter(item => !isSameMediaUsage(item, usage))
    : [
        ...safeCurrentUsedBy.filter(item => !isSameMediaUsage(item, usage)),
        usage
      ];

  return {
    usedBy: nextUsedBy,
    usageCount: nextUsedBy.length,
    firstUsedAt: nextUsedBy.length ? now : null,
    lastUsedAt: nextUsedBy.length ? now : null,
    updatedAt: now
  };
};

export const createOrReuseMediaLibraryResource = async (resource = {}, options = {}) => {
  const firestore = await resolveFirestore(options.firestore);
  const now = options.now || Date.now();
  const usage = options.usage || null;
  const identityKey = getMediaIdentityKey(resource);

  if (!identityKey) {
    throw new Error('media_identity_required');
  }

  const existingByIdentityKey = await getExistingMediaIndex(firestore);
  const existing = existingByIdentityKey.get(identityKey);

  if (existing) {
    const usageFields = usage
      ? calculateMediaUsageFields(existing.data.usedBy, usage, 'add', now)
      : { updatedAt: now };
    if (usageFields.firstUsedAt) {
      usageFields.firstUsedAt = existing.data.firstUsedAt || usageFields.firstUsedAt;
    }
    const ref = getDocRef(firestore, MEDIA_LIBRARY_COLLECTION, existing.id);
    await setDocumentData(firestore, ref, { identityKey, ...usageFields });

    return {
      id: existing.id,
      media: {
        ...existing.data,
        id: existing.id,
        mediaId: existing.id,
        identityKey,
        ...usageFields
      },
      created: false
    };
  }

  const mediaDocument = createMediaLibraryDocument({
    ...resource,
    usageCount: usage ? 1 : 0,
    usedBy: usage ? [usage] : [],
    firstUsedAt: usage ? now : null,
    lastUsedAt: usage ? now : null
  }, {
    now,
    userId: options.userId || null
  });
  const documentId = options.id || createStableMediaDocId(identityKey);
  const ref = getDocRef(firestore, MEDIA_LIBRARY_COLLECTION, documentId);
  const data = {
    ...mediaDocument,
    identityKey,
    usedBy: usage ? [usage] : [],
    usageCount: usage ? 1 : 0,
    firstUsedAt: usage ? now : null,
    lastUsedAt: usage ? now : null
  };

  await setDocumentData(firestore, ref, data);

  return {
    id: documentId,
    media: {
      ...data,
      id: documentId,
      mediaId: documentId
    },
    created: true
  };
};

export const loadSongsForMediaLibrarySync = async (firestore) => {
  const resolvedFirestore = await resolveFirestore(firestore);
  const snapshot = await getCollectionSnapshot(resolvedFirestore, SONGS_COLLECTION);
  return snapshot.docs.map(documentSnapshot => ({
    id: documentSnapshot.id,
    ...documentSnapshot.data()
  }));
};

export const syncMediaLibraryFromSongs = async (songs = [], options = {}) => {
  const firestore = await resolveFirestore(options.firestore);
  const now = options.now || Date.now();
  const plan = buildMediaLibrarySyncPlan(songs, {
    now,
    userId: options.userId || null
  });
  const existingByIdentityKey = await getExistingMediaIndex(firestore);
  const operations = [];
  const created = [];
  const updated = [];
  const skipped = [];

  plan.mediaDocuments.forEach(mediaDocument => {
    const identityKey = getMediaIdentityKey(mediaDocument);
    if (!identityKey) {
      skipped.push({ reason: 'missing_identity', media: mediaDocument });
      return;
    }

    const existing = existingByIdentityKey.get(identityKey);

    if (existing) {
      const ref = getDocRef(firestore, MEDIA_LIBRARY_COLLECTION, existing.id);
      const usageFields = {
        usedBy: mediaDocument.usedBy || [],
        usageCount: mediaDocument.usageCount || 0,
        firstUsedAt: existing.data.firstUsedAt || mediaDocument.firstUsedAt || null,
        lastUsedAt: mediaDocument.lastUsedAt || now,
        updatedAt: now
      };
      operations.push({
        ref,
        merge: true,
        data: {
          identityKey,
          ...usageFields
        }
      });
      updated.push(existing.id);
      return;
    }

    const id = createStableMediaDocId(identityKey);
    const ref = getDocRef(firestore, MEDIA_LIBRARY_COLLECTION, id);
    operations.push({
      ref,
      merge: true,
      data: {
        ...mediaDocument,
        identityKey,
        createdAt: mediaDocument.createdAt || now,
        updatedAt: now,
        lastUsedAt: mediaDocument.lastUsedAt || now
      }
    });
    created.push(id);
  });

  const committedBatches = await commitBatchQueue(firestore, operations);

  return {
    generatedAt: now,
    plan,
    created,
    updated,
    skipped,
    stats: {
      ...plan.stats,
      created: created.length,
      updated: updated.length,
      skipped: skipped.length,
      committedBatches
    }
  };
};

export const syncMediaLibraryFromFirestoreSongs = async (options = {}) => {
  const normalizedOptions = options?.collection || options?.batch ? { firestore: options } : options;
  const firestore = await resolveFirestore(normalizedOptions.firestore);
  const songs = await loadSongsForMediaLibrarySync(firestore);
  return syncMediaLibraryFromSongs(songs, {
    ...normalizedOptions,
    firestore
  });
};

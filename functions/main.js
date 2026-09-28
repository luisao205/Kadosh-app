/* global require, exports */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const existingFunctions = require('./index');
Object.assign(exports, existingFunctions);
Object.assign(exports, require('./permissionManagement')({ functions, admin }));

const chunk = (items, size) => {
  const groups = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
};

const getAndroidConfig = (snapshot) => snapshot?.exists ? snapshot.data()?.android || null : null;

const sanitizePublishedAndroidConfig = (value) => {
  if (!value || value.status !== 'published' || !value.latestVersion) return null;
  return {
    latestVersion: String(value.latestVersion || ''),
    minimumVersion: String(value.minimumVersion || ''),
    downloadUrl: String(value.downloadUrl || value.apkUrl || ''),
    forceUpdate: value.forceUpdate === true,
    releaseNotes: String(value.releaseNotes || ''),
    releaseTag: String(value.releaseTag || ''),
    releaseUrl: String(value.releaseUrl || ''),
    assetName: String(value.assetName || ''),
    status: 'published'
  };
};

exports.getPublishedAndroidUpdate = functions.https.onCall(async () => {
  const snapshot = await admin.firestore().collection('sistema').doc('appUpdates').get();
  return { android: sanitizePublishedAndroidConfig(getAndroidConfig(snapshot)) };
});

exports.notifyPublishedAndroidUpdate = functions.firestore
  .document('sistema/appUpdates')
  .onWrite(async (change) => {
    const before = getAndroidConfig(change.before);
    const after = getAndroidConfig(change.after);

    if (!after || after.status !== 'published' || !after.latestVersion) return null;

    const becamePublished = before?.status !== 'published';
    const versionChanged = before?.latestVersion !== after.latestVersion;
    if (!becamePublished && !versionChanged) return null;

    const usersSnapshot = await admin.firestore().collection('usuarios').get();
    const tokens = [...new Set(usersSnapshot.docs
      .map((document) => document.get('fcmToken'))
      .filter((token) => typeof token === 'string' && token.trim())
      .map((token) => token.trim()))];

    if (!tokens.length) return null;

    const required = after.forceUpdate === true;
    const title = required ? 'Actualización necesaria' : 'Nueva versión de Kadosh App';
    const body = required
      ? `Actualiza a Kadosh App ${after.latestVersion} para continuar.`
      : `Kadosh App ${after.latestVersion} ya está disponible.`;

    const batches = chunk(tokens, 500);
    const results = await Promise.all(batches.map((batch) => admin.messaging().sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data: {
        type: 'appUpdate',
        platform: 'android',
        version: String(after.latestVersion),
        url: '/?updates=1'
      },
      android: {
        priority: 'high',
        notification: { channelId: 'urgente' }
      }
    })));

    const failureCount = results.reduce((total, result) => total + result.failureCount, 0);
    console.log(`Android update ${after.latestVersion}: ${tokens.length - failureCount} delivered, ${failureCount} failed.`);
    return null;
  });

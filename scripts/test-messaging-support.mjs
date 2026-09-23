import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [firebaseConfig, app, userProfile] = await Promise.all([
  readFile(new URL('../src/config/firebase.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/admin/UserProfile.jsx', import.meta.url), 'utf8')
]);

assert.match(firebaseConfig, /import \{ getMessaging, isSupported \} from 'firebase\/messaging';/);
assert.match(firebaseConfig, /let messagingPromise = null;/);
assert.match(firebaseConfig, /export const getMessagingIfSupported = \(\) => \{/);
assert.match(firebaseConfig, /messagingPromise = isSupported\(\)\s*\.then\(\(supported\) => \(supported \? getMessaging\(app\) : null\)\)\s*\.catch\(\(\) => null\)/);
assert.doesNotMatch(firebaseConfig, /export const messaging = getMessaging\(app\)/);

assert.match(app, /import \{ db, getMessagingIfSupported \} from '\.\/config\/firebase';/);
assert.match(app, /const messaging = await getMessagingIfSupported\(\);\s*if \(!messaging \|\| !\('Notification' in window\)\) return;/);
assert.match(app, /const notificationsStartedRef = useRef\(false\)/);
assert.match(app, /if \(userAccessRef\.current && !notificationsStartedRef\.current\) \{\s*notificationsStartedRef\.current = true;/);

assert.match(userProfile, /import \{ db, getMessagingIfSupported \} from '\.\.\/\.\.\/config\/firebase';/);
assert.match(userProfile, /const notificationSetupRef = useRef\(false\);/);
assert.match(userProfile, /if \(notificationSetupRef\.current\) return;\s*notificationSetupRef\.current = true;/);
assert.match(userProfile, /const messaging = await getMessagingIfSupported\(\);\s*if \(!messaging \|\| !\('Notification' in window\)\) return;/);
assert.match(userProfile, /finally \{\s*notificationSetupRef\.current = false;/);

console.log('messaging support guard and initialization singleton: OK');

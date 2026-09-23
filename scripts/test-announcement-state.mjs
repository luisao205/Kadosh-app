import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAnnouncementProjectionPayload, buildFinishedAnnouncementPayload } from '../src/utils/announcementState.js';
import { buildPanicProjectorPayload, buildProjectorMediaPayload } from '../src/utils/projectorMediaState.js';
import { canDeleteAnnouncements, canManageAnnouncements, canProjectAnnouncements } from '../src/utils/announcementPermissions.js';
import { PERMISSIONS } from '../src/utils/permissions.js';

for (const role of ['dueño', 'dueno']) {
  assert.equal(canManageAnnouncements({ rol: role }), true);
  assert.equal(canDeleteAnnouncements({ rol: role }), true);
}
for (const role of ['admin', 'multimedia', 'pastor', 'predicador', 'musico', 'cantante']) {
  assert.equal(canManageAnnouncements({ rol: role }), false);
  assert.equal(canDeleteAnnouncements({ rol: role }), false);
}
const projector = { rol: 'musico', permissionOverrides: { [PERMISSIONS.ANNOUNCEMENTS_PROJECT]: true } };
assert.equal(canManageAnnouncements(projector), true);
assert.equal(canProjectAnnouncements(projector), true);
assert.equal(canDeleteAnnouncements(projector), false);

const songBackground = { url: 'song.jpg', mediaId: 'song-bg' };
const announcement = { id: 'a1', title: 'Culto', slides: [
  { id: 's1', transition: { type: 'fade', durationMs: 300 }, durationMs: 1500, elements: [] },
  { id: 's2', transition: { type: 'slide', durationMs: 400 }, elements: [] },
  { id: 's3', transition: { type: 'zoom', durationMs: 500 }, elements: [] }
] };
for (let index=0; index<3; index+=1) {
  const payload=buildAnnouncementProjectionPayload({announcement,slideIndex:index,user:{uid:'u1'},autoAdvance:true});
  assert.equal(payload.projectorState.type,'announcement'); assert.equal(payload.liveState.activeContentType,'announcement');
  assert.equal(payload.announcementState.currentSlideIndex,index); assert.equal(payload.announcementState.transition.type,announcement.slides[index].transition.type);
  assert.equal(payload.proyectorMedia,null); assert.equal(payload.proyectorFondo,null); assert.equal(payload.currentSongId,null);
}
const finished=buildFinishedAnnouncementPayload();
assert.equal(finished.announcementState.presentationActive,false); assert.equal(finished.projectorState.contentType,'none');
const panic=buildPanicProjectorPayload({liveState:{activeContentType:'blackout'}});
assert.equal(panic.announcementState.presentationActive,false); assert.equal(panic.projectorState.type,'blackout');
const media=buildProjectorMediaPayload({media:{url:'media.jpg'},liveState:{activeContentType:'media'}});
assert.equal(media.projectorState.type,'media'); assert.equal(songBackground.url,'song.jpg');

const editor=await readFile(new URL('../src/components/admin/AnnouncementEditor.jsx',import.meta.url),'utf8');
assert.match(editor,/mediaId:media\.mediaId/); assert.doesNotMatch(editor,/proyectorFondo|proyectorMedia|projectorState/);
const renderer=await readFile(new URL('../src/components/announcements/AnnouncementRenderer.jsx',import.meta.url),'utf8');
assert.match(renderer,/video\.pause\(\); video\.removeAttribute\('src'\); video\.load\(\);/);
assert.match(renderer,/enabled: allowed/);
const layout=await readFile(new URL('../src/components/layout/AdminLayout.jsx',import.meta.url),'utf8');
assert.match(layout,/canManageAnnouncements\(user\).*name: 'Anuncios'/);
const app=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8');
assert.match(app,/path="\/anuncios".*canManageAnnouncements\(user\).*<Navigate to="\/" replace/);
const rules=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');
assert.match(rules,/function canUpdateEventAnnouncement\(\) \{\s*return hasPermission\('announcements\.project'\)/);
assert.match(rules,/allow create: if hasPermission\('announcements\.create'\)/);
assert.match(rules,/allow update: if hasPermission\('announcements\.edit'\)/);
assert.match(rules,/allow delete: if hasPermission\('announcements\.delete'\)/);
console.log('announcement state and isolation: OK');

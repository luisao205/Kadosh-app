import assert from 'node:assert/strict';
import { uploadMediaLibraryFile, validateMediaLibraryFile } from '../src/utils/mediaLibraryUpload.js';

const image = { name: 'test.png', type: 'image/png', size: 120 };
const video = { name: 'test.mp4', type: 'video/mp4', size: 240 };
assert.equal(validateMediaLibraryFile(image), 'image');
assert.equal(validateMediaLibraryFile(video), 'video');
assert.throws(() => validateMediaLibraryFile({ name: 'bad.html', type: 'text/html' }), /media_file_type_not_allowed/);

let uploadedFolder = '';
let registeredResource = null;
const upload = async (_file, folder) => {
  uploadedFolder = folder;
  return { url: 'https://res.cloudinary.com/test/image/upload/v1/preaching/test.png', publicId: 'preaching/test', type: 'image', bytes: 120 };
};
const register = async (resource) => {
  registeredResource = resource;
  return { id: 'media_123', media: { ...resource, id: 'media_123' }, created: true };
};
const result = await uploadMediaLibraryFile(image, {
  upload,
  register,
  folder: 'preaching/predica_1/media',
  category: 'Predicas / Prueba',
  sourceContext: 'preaching',
  preachingId: 'predica_1',
  preachingTitle: 'Prueba'
});
assert.equal(uploadedFolder, 'kadosh/preaching/predica_1/media');
assert.equal(result.mediaId, 'media_123');
assert.equal(registeredResource.folder, 'preaching/predica_1/media');
assert.equal(registeredResource.metadata.preachingId, 'predica_1');
assert.equal(registeredResource.source, 'library');
assert.ok(!('blob' in registeredResource));
assert.ok(!String(registeredResource.url).startsWith('data:'));

let uploadAttempted = false;
await assert.rejects(
  uploadMediaLibraryFile({ name: 'bad.txt', type: 'text/plain' }, { upload: async () => { uploadAttempted = true; } }),
  /media_file_type_not_allowed/
);
assert.equal(uploadAttempted, false);
console.log('media library central upload contract: OK');

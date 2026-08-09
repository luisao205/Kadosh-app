const CLOUDINARY_CLOUD_NAME = 'dgi9l8blg';
const CLOUDINARY_UPLOAD_PRESET = 'KADOSH';

export const uploadToCloudinary = async (file, folder = 'kadosh/backgrounds') => {
  if (!file) throw new Error('No file provided');

  const isVideo = file.type?.startsWith('video/');
  const isAudio = file.type?.startsWith('audio/');
  const isRaw = file.type === 'application/pdf';
  const resourceType = isVideo || isAudio ? 'video' : isRaw ? 'raw' : 'image';
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
    method: 'POST',
    body: formData
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message || 'Cloudinary upload failed');
  }

  return {
    url: data.secure_url,
    type: data.resource_type || resourceType,
    publicId: data.public_id || null,
    thumbnailUrl: data.thumbnail_url || (resourceType === 'image' ? data.secure_url : ''),
    bytes: data.bytes || null,
    width: data.width || null,
    height: data.height || null,
    duration: data.duration || null,
    format: data.format || null
  };
};

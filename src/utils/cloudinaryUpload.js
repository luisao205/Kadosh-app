const CLOUDINARY_CLOUD_NAME = 'dgi9l8blg';
const CLOUDINARY_UPLOAD_PRESET = 'KADOSH';

export const uploadToCloudinary = async (file, folder = 'kadosh/backgrounds') => {
  if (!file) throw new Error('No file provided');

  const isVideo = file.type?.startsWith('video/');
  const resourceType = isVideo ? 'video' : 'image';
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
    publicId: data.public_id || null
  };
};

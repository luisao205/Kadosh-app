export const isVideoMediaUrl = (url = '') => {
  const cleanUrl = String(url).split('?')[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v)$/i.test(cleanUrl) || String(url).includes('/video/upload/');
};

export const getVideoThumbnailUrl = (mediaOrUrl = '', options = {}) => {
  const media = typeof mediaOrUrl === 'string' ? { url: mediaOrUrl } : (mediaOrUrl || {});
  const url = String(media.url || '').trim();
  if (!url || !isVideoMediaUrl(url)) return '';

  const [baseUrl, query = ''] = url.split('?');
  if (baseUrl.includes('res.cloudinary.com') && baseUrl.includes('/video/upload/')) {
    const requestedSecond = Number(options?.second ?? 1);
    const second = Number.isFinite(requestedSecond) && requestedSecond >= 0 ? requestedSecond : 1;
    const transformation = `so_${second},w_720,c_limit,q_auto:good,f_jpg`;
    const thumbnailBase = baseUrl
      .replace('/video/upload/', `/video/upload/${transformation}/`)
      .replace(/\.(mp4|webm|mov|m4v)$/i, '.jpg');
    return query ? `${thumbnailBase}?${query}` : thumbnailBase;
  }

  return String(media.thumbnailUrl || media.thumbnail_url || '').trim();
};

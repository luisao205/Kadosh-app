export const isVideoMediaUrl = (url = '') => {
  const cleanUrl = String(url).split('?')[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v)$/i.test(cleanUrl) || String(url).includes('/video/upload/');
};

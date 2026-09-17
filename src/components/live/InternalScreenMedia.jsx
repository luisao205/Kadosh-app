import { useEffect, useRef } from 'react';
import { isVideoMediaUrl } from '../../utils/mediaUtils';

const InternalScreenMedia = ({ media, label = 'Multimedia en pantalla', opacity = 1 }) => {
  const videoRef = useRef(null);
  const isVideo = media?.type === 'video' || isVideoMediaUrl(media?.url);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return undefined;

    video.muted = true;
    if (media?.seekRequest && video._lastSeekTime !== media.seekRequest.time) {
      video._lastSeekTime = media.seekRequest.time;
      if (media.seekRequest.type === 'start') video.currentTime = 0;
      if (media.seekRequest.type === 'back10') video.currentTime = Math.max(0, video.currentTime - 10);
      if (media.seekRequest.type === 'fwd10' && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(video.duration, video.currentTime + 10);
      }
    }

    if (media?.playing === false) video.pause();
    else video.play().catch(() => {});

    return undefined;
  }, [isVideo, media?.playing, media?.seekRequest]);

  useEffect(() => () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }, [media?.url]);

  if (!media?.url) return null;

  return (
    <div className="fixed inset-0 z-[80] flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black p-1 sm:p-2">
      {isVideo ? (
        <video
          key={media.url}
          ref={videoRef}
          src={media.url}
          autoPlay
          loop={media.loop ?? true}
          muted
          playsInline
          preload="auto"
          className="h-full w-full object-contain"
          style={{ opacity }}
          aria-label={label}
        />
      ) : (
        <img
          key={media.url}
          src={media.url}
          alt={media.title || media.name || label}
          className="h-full w-full object-contain"
          style={{ opacity }}
        />
      )}
    </div>
  );
};

export default InternalScreenMedia;

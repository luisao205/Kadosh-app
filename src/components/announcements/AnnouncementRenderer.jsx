import { useEffect, useMemo, useRef } from 'react';
import useMediaLibrary from '../../hooks/useMediaLibrary';
import { canManageAnnouncements } from '../../utils/announcementPermissions';

const MediaElement = ({ element, media }) => {
  const videoRef = useRef(null);
  useEffect(() => () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause(); video.removeAttribute('src'); video.load();
  }, [media?.url]);
  if (!media?.url) return null;
  return element.type === 'video' ? <video ref={videoRef} src={media.url} autoPlay={element.autoplay !== false} loop={element.loop !== false} muted={element.muted !== false} playsInline className="h-full w-full object-contain" /> : <img src={media.url} alt="" className="h-full w-full object-contain" />;
};

const AnnouncementRenderer = ({ user, slide, transitionKey = '' }) => {
  const allowed = canManageAnnouncements(user);
  const library = useMediaLibrary({ enabled: allowed });
  const mediaIndex = useMemo(() => new Map(library.items.map(item => [item.id, item])), [library.items]);
  const backgroundMedia = slide?.background?.mediaId ? mediaIndex.get(slide.background.mediaId) : null;
  const transition = slide?.transition?.type || 'fade';
  const animation = transition === 'slide' ? 'animate-in slide-in-from-right-8' : transition === 'zoom' ? 'animate-in zoom-in-95' : 'animate-in fade-in';
  if (!allowed) return null;
  return (
    <div key={transitionKey} className={`relative h-full w-full overflow-hidden bg-black ${animation}`} style={{ backgroundColor: slide?.background?.color || '#000000', animationDuration: `${slide?.transition?.durationMs || 500}ms` }}>
      {backgroundMedia?.url && <div className="absolute inset-0"><MediaElement element={{ type: backgroundMedia.type === 'video' ? 'video' : 'image' }} media={backgroundMedia} /></div>}
      {(slide?.elements || []).map(element => {
        const style = { position: 'absolute', left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%`, opacity: element.opacity ?? 1 };
        if (element.type === 'text') return <div key={element.id} style={{ ...style, color: element.color || '#fff', fontSize: `clamp(18px, ${Math.max(1, (element.fontSize || 48) / 16)}vw, ${element.fontSize || 48}px)`, fontWeight: element.fontWeight || 700, textAlign: element.align || 'center' }} className="flex items-center justify-center whitespace-pre-wrap leading-tight">{element.text}</div>;
        return <div key={element.id} style={style}><MediaElement element={element} media={mediaIndex.get(element.mediaId)} /></div>;
      })}
    </div>
  );
};
export default AnnouncementRenderer;

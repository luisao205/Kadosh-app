import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isVideoMediaUrl } from '../../utils/mediaUtils';

const TRANSITION_MS = 500;

const supportsReducedMotion = () => (
  typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const getLayerId = (url, media) => [
  url || '',
  media?.mediaId || media?.id || '',
  media?.updatedAt || ''
].join('|');

const isVideoBackground = (url, mediaObject) => (
  mediaObject?.type === 'video' || isVideoMediaUrl(url)
);

const preloadImage = (url, tokenRef, token) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => tokenRef.current === token ? resolve() : reject(new Error('stale_background_preload'));
  image.onerror = () => reject(new Error('image_background_failed'));
  image.src = url;
});

const preloadVideo = (url, tokenRef, token) => new Promise((resolve, reject) => {
  const video = document.createElement('video');
  let settled = false;

  const cleanup = () => {
    video.onloadeddata = null;
    video.oncanplay = null;
    video.onerror = null;
    video.removeAttribute('src');
    video.load();
  };

  const done = () => {
    if (settled) return;
    settled = true;
    cleanup();
    tokenRef.current === token ? resolve() : reject(new Error('stale_background_preload'));
  };

  const fail = () => {
    if (settled) return;
    settled = true;
    cleanup();
    reject(new Error('video_background_failed'));
  };

  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.onloadeddata = done;
  video.oncanplay = done;
  video.onerror = fail;
  video.src = url;
  video.load();
});

const BackgroundLayer = ({ layer, visible, reduceMotion }) => {
  if (!layer?.url) return null;
  const video = isVideoBackground(layer.url, layer.media);

  return (
    <div
      className={`absolute inset-0 transition-opacity ease-in-out ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ transitionDuration: reduceMotion ? '0ms' : `${TRANSITION_MS}ms` }}
    >
      {video ? (
        <video
          key={layer.id}
          src={layer.url}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onCanPlay={(event) => {
            const playPromise = event.currentTarget.play();
            if (playPromise) playPromise.catch(error => console.warn('Autoplay de fondo bloqueado:', error));
          }}
          onError={(event) => console.warn('No se pudo cargar video de fondo:', event.currentTarget.src)}
          className="h-full w-full object-cover opacity-80"
        />
      ) : (
        <img
          key={layer.id}
          src={layer.url}
          alt=""
          onError={(event) => console.warn('No se pudo cargar imagen de fondo:', event.currentTarget.src)}
          className="h-full w-full object-cover opacity-80"
        />
      )}
    </div>
  );
};

const ProjectorMediaBackground = ({ url, media, disabled = false }) => {
  const reduceMotion = useMemo(supportsReducedMotion, []);
  const [currentLayer, setCurrentLayer] = useState(null);
  const [previousLayer, setPreviousLayer] = useState(null);
  const [nextVisible, setNextVisible] = useState(true);
  const tokenRef = useRef(0);
  const timerRef = useRef(null);
  const currentLayerRef = useRef(null);

  useEffect(() => {
    currentLayerRef.current = currentLayer;
  }, [currentLayer]);

  useEffect(() => {
    const token = tokenRef.current + 1;
    tokenRef.current = token;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (disabled) {
      setCurrentLayer(null);
      setPreviousLayer(null);
      setNextVisible(false);
      return undefined;
    }

    if (!url) {
      setPreviousLayer(currentLayerRef.current);
      setCurrentLayer(null);
      setNextVisible(false);
      timerRef.current = setTimeout(() => {
        if (tokenRef.current !== token) return;
        setPreviousLayer(null);
        timerRef.current = null;
      }, reduceMotion ? 0 : TRANSITION_MS + 80);
      return undefined;
    }

    const nextLayer = {
      id: getLayerId(url, media),
      url,
      media: media || null
    };

    if (currentLayerRef.current?.id === nextLayer.id) {
      return undefined;
    }

    const preload = isVideoBackground(url, media)
      ? preloadVideo(url, tokenRef, token)
      : preloadImage(url, tokenRef, token);

    preload
      .catch(error => {
        if (error.message !== 'stale_background_preload') {
          console.warn('Fondo no precargado, se mantiene el fondo anterior:', error);
        }
        throw error;
      })
      .then(() => {
        if (tokenRef.current !== token) return;
        setPreviousLayer(currentLayerRef.current);
        setCurrentLayer(nextLayer);
        setNextVisible(false);
        requestAnimationFrame(() => {
          if (tokenRef.current === token) setNextVisible(true);
        });

        timerRef.current = setTimeout(() => {
          if (tokenRef.current !== token) return;
          setPreviousLayer(null);
          timerRef.current = null;
        }, reduceMotion ? 0 : TRANSITION_MS + 80);
      })
      .catch(() => {
        if (tokenRef.current !== token) return;
        if (!currentLayerRef.current) {
          setCurrentLayer(null);
          setPreviousLayer(null);
        }
      });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [disabled, media, reduceMotion, url]);

  useEffect(() => () => {
    tokenRef.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  if (disabled || (!currentLayer && !previousLayer)) return null;

  return (
    <div className="absolute inset-0 z-0 pointer-events-none bg-black overflow-hidden">
      <BackgroundLayer layer={previousLayer} visible={!nextVisible} reduceMotion={reduceMotion} />
      <BackgroundLayer layer={currentLayer} visible={nextVisible} reduceMotion={reduceMotion} />
    </div>
  );
};

export default ProjectorMediaBackground;

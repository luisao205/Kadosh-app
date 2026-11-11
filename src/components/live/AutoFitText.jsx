import { useLayoutEffect, useRef } from 'react';

const AutoFitText = ({
  text,
  className = '',
  containerClassName = '',
  minFontSize = 18,
  maxFontSize = 220,
  safeMaxWidth = '90vw',
  safeMaxHeight = '78vh',
  lineHeight = 1.06,
  variant = 'projector',
  debounceMs = 0,
}) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const lastSizeRef = useRef({ width: 0, height: 0, fontSize: null });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    let frameId;
    let debounceId;

    const fit = () => {
      const availableWidth = container.clientWidth;
      const availableHeight = container.clientHeight;
      if (!availableWidth || !availableHeight) return;

      const prevTransition = textEl.style.transition;
      textEl.style.transition = 'none';
      textEl.style.lineHeight = String(lineHeight);
      textEl.style.maxWidth = `${availableWidth}px`;
      textEl.style.width = 'fit-content';

      let low = minFontSize;
      let high = maxFontSize;
      let best = minFontSize;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        textEl.style.fontSize = `${mid}px`;

        const textRect = textEl.getBoundingClientRect();
        const fitsWidth = textRect.width <= availableWidth + 2 && textEl.scrollWidth <= availableWidth + 2;
        const fitsHeight = textRect.height <= availableHeight + 2 && textEl.scrollHeight <= availableHeight + 2;
        const fitsWindow = (
          typeof window === 'undefined' ||
          (textRect.bottom <= (window.innerHeight || Infinity) + 1 &&
           textRect.right <= (window.innerWidth || Infinity) + 1 &&
           textRect.top >= -1 &&
           textRect.left >= -1)
        );

        if (fitsWidth && fitsHeight && fitsWindow) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const nextSize = variant === 'preview' ? Math.round(best / 2) * 2 : best;
      textEl.style.fontSize = `${nextSize}px`;
      textEl.style.transition = prevTransition;
      lastSizeRef.current = { width: availableWidth, height: availableHeight, fontSize: nextSize };
    };

    const scheduleFit = () => {
      cancelAnimationFrame(frameId);
      clearTimeout(debounceId);
      const run = () => { frameId = requestAnimationFrame(fit); };
      if (debounceMs > 0) debounceId = setTimeout(run, debounceMs);
      else run();
    };

    // 1. Inmediato y sincrónico en fase de layout para primer render sin saltos ni texto gigante
    fit();

    // 2. Pasada diferida en animación de frame para estabilización tras montaje
    scheduleFit();

    // 3. Listener de fuentes web asíncronas
    document.fonts?.ready?.then(fit);
    const handleFontsDone = () => fit();
    document.fonts?.addEventListener?.('loadingdone', handleFontsDone);

    // 4. Observadores de tamaño y eventos de pantalla
    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(container);
    window.addEventListener('resize', scheduleFit);
    window.addEventListener('orientationchange', scheduleFit);
    document.addEventListener('fullscreenchange', scheduleFit);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(debounceId);
      document.fonts?.removeEventListener?.('loadingdone', handleFontsDone);
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleFit);
      window.removeEventListener('orientationchange', scheduleFit);
      document.removeEventListener('fullscreenchange', scheduleFit);
    };
  }, [text, minFontSize, maxFontSize, lineHeight, variant, debounceMs]);

  return (
    <div
      className={`flex items-center justify-center text-center ${containerClassName}`}
      style={{ width: '100%', height: '100%', maxWidth: safeMaxWidth, maxHeight: safeMaxHeight }}
      ref={containerRef}
    >
      <div
        ref={textRef}
        className={`whitespace-pre-wrap break-words ${className}`}
        translate="no"
      >
        {text}
      </div>
    </div>
  );
};

export default AutoFitText;

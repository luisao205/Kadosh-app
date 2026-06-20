import React, { useLayoutEffect, useRef } from 'react';

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
      const last = lastSizeRef.current;
      const containerUnchanged = last.width === availableWidth && last.height === availableHeight;

      textEl.style.fontSize = `${minFontSize}px`;
      textEl.style.lineHeight = String(lineHeight);
      textEl.style.width = `${availableWidth}px`;

      let low = minFontSize;
      let high = maxFontSize;
      let best = minFontSize;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        textEl.style.fontSize = `${mid}px`;

        const fits =
          textEl.scrollWidth <= availableWidth + 1 &&
          textEl.scrollHeight <= availableHeight + 1;

        if (fits) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const nextSize = variant === 'preview' ? Math.round(best / 2) * 2 : best;
      if (variant !== 'preview' || !containerUnchanged || last.fontSize === null || Math.abs(nextSize - last.fontSize) >= 4) {
        textEl.style.fontSize = `${nextSize}px`;
        lastSizeRef.current = { width: availableWidth, height: availableHeight, fontSize: nextSize };
      } else {
        textEl.style.fontSize = `${last.fontSize}px`;
      }
    };

    const scheduleFit = () => {
      cancelAnimationFrame(frameId);
      clearTimeout(debounceId);
      const run = () => { frameId = requestAnimationFrame(fit); };
      if (debounceMs > 0) debounceId = setTimeout(run, debounceMs);
      else run();
    };

    scheduleFit();

    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(container);
    window.addEventListener('orientationchange', scheduleFit);
    document.addEventListener('fullscreenchange', scheduleFit);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(debounceId);
      resizeObserver.disconnect();
      window.removeEventListener('orientationchange', scheduleFit);
      document.removeEventListener('fullscreenchange', scheduleFit);
    };
  }, [text, minFontSize, maxFontSize, lineHeight, variant, debounceMs]);

  return (
    <div
      className={`flex items-center justify-center text-center overflow-hidden ${containerClassName}`}
      style={{ width: '100%', height: '100%', maxWidth: safeMaxWidth, maxHeight: safeMaxHeight }}
      ref={containerRef}
    >
      <div
        ref={textRef}
        className={`whitespace-pre-wrap break-words overflow-hidden ${className}`}
        translate="no"
      >
        {text}
      </div>
    </div>
  );
};

export default AutoFitText;

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  assertRichLyricRuns,
  calculateProportionalFit,
  richLyricRunStyle,
} from '../../utils/richLyricText';

const RichLyricText = ({
  runs,
  className = '',
  containerClassName = '',
  minBaseFontSize = 18,
  maxBaseFontSize = 220,
  safeMaxWidth = '90vw',
  safeMaxHeight = '78vh',
  lineHeight = 1.08,
  onFitStatus,
}) => {
  const safeRuns = useMemo(() => assertRichLyricRuns(runs), [runs]);
  const containerRef = useRef(null);
  const textElementRef = useRef(null);
  const statusRef = useRef(null);
  const [fitStatus, setFitStatus] = useState({ baseFontSize: minBaseFontSize, overflow: false });
  const [reducedMotion, setReducedMotion] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const textElement = textElementRef.current;
    if (!container || !textElement) return undefined;

    let frameId;
    const fit = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;

      const prevTransition = textElement.style.transition;
      textElement.style.transition = 'none';
      textElement.style.width = `${width}px`;
      textElement.style.lineHeight = String(lineHeight);

      const result = calculateProportionalFit({
        minBaseFontSize,
        maxBaseFontSize,
        measure: (baseFontSize) => {
          textElement.style.fontSize = `${baseFontSize}px`;
          const textRect = textElement.getBoundingClientRect();
          const scrollWidth = textElement.scrollWidth;
          const scrollHeight = textElement.scrollHeight;

          const fitsWidth = textRect.width <= width + 2 && scrollWidth <= width + 1;
          const fitsHeight = textRect.height <= height + 2 && scrollHeight <= height + 1;
          const fitsWindow = (
            typeof window === 'undefined' ||
            (textRect.bottom <= (window.innerHeight || Infinity) + 1 &&
             textRect.right <= (window.innerWidth || Infinity) + 1 &&
             textRect.top >= -1 &&
             textRect.left >= -1)
          );

          return {
            fits: fitsWidth && fitsHeight && fitsWindow,
            width: Math.max(scrollWidth, textRect.width),
            height: Math.max(scrollHeight, textRect.height),
            availableWidth: width,
            availableHeight: height,
          };
        },
      });

      textElement.style.fontSize = `${result.baseFontSize}px`;
      textElement.style.transition = prevTransition;

      const nextStatus = { baseFontSize: result.baseFontSize, overflow: result.overflow };
      const previous = statusRef.current;
      if (!previous || previous.baseFontSize !== nextStatus.baseFontSize || previous.overflow !== nextStatus.overflow) {
        statusRef.current = nextStatus;
        setFitStatus(nextStatus);
        onFitStatus?.(nextStatus);
      }
    };

    const scheduleFit = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(fit);
    };

    // 1. Inmediato y sincrónico en layout phase
    fit();

    // 2. Pasada diferida
    scheduleFit();

    // 3. Fuentes web asíncronas
    document.fonts?.ready?.then(fit);
    const handleFontsDone = () => fit();
    document.fonts?.addEventListener?.('loadingdone', handleFontsDone);

    // 4. Observador de redimensionamiento y pantalla completa
    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(container);
    window.addEventListener('resize', scheduleFit);
    window.addEventListener('orientationchange', scheduleFit);
    document.addEventListener('fullscreenchange', scheduleFit);

    return () => {
      cancelAnimationFrame(frameId);
      document.fonts?.removeEventListener?.('loadingdone', handleFontsDone);
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleFit);
      window.removeEventListener('orientationchange', scheduleFit);
      document.removeEventListener('fullscreenchange', scheduleFit);
    };
  }, [lineHeight, maxBaseFontSize, minBaseFontSize, onFitStatus, safeRuns]);

  useLayoutEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`flex items-center justify-center text-center ${containerClassName}`}
      style={{ width: '100%', height: '100%', maxWidth: safeMaxWidth, maxHeight: safeMaxHeight }}
      data-rich-lyric-container="true"
      data-rich-lyric-overflow={fitStatus.overflow ? 'true' : 'false'}
      data-rich-lyric-base-size={fitStatus.baseFontSize}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      <div
        ref={textElementRef}
        className={`whitespace-pre-wrap break-words ${className}`}
        style={{ fontSize: `${fitStatus.baseFontSize}px`, lineHeight }}
        translate="no"
      >
        {safeRuns.map((run, index) => (
          <span key={index} data-rich-lyric-run={index} style={richLyricRunStyle(run.style)}>{run.text}</span>
        ))}
      </div>
    </div>
  );
};

export default RichLyricText;

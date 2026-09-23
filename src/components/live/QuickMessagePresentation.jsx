import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import QuickMessageAmbientGlow from './QuickMessageAmbientGlow';
import QuickMessageAmbientParticles from './QuickMessageAmbientParticles';
import { getQuickMessageAmbientGlows } from '../../utils/quickMessageAmbient';
import { resolveActiveQuickMessageProjectorState } from '../../utils/quickMessageProjectionState';
import { getQuickMessagePresentationLayout } from '../../utils/quickMessagePresentationLayout';
import { getQuickMessageThemeStyle } from '../../utils/quickMessageVisualTheme';

const AutoFitQuickMessage = ({ segments, minFontSize, maxFontSize, presentationRef, onMeasureFragments }) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const fragmentRefs = useRef([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return undefined;

    let frameId;
    let measureFrameId;
    const fit = () => {
      const { clientWidth: width, clientHeight: height } = container;
      if (!width || !height) return;

      text.style.width = `${width}px`;
      text.style.fontSize = `${minFontSize}px`;
      let low = minFontSize;
      let high = maxFontSize;
      let best = minFontSize;

      while (low <= high) {
        const size = Math.floor((low + high) / 2);
        text.style.fontSize = `${size}px`;
        if (text.scrollWidth <= width + 1 && text.scrollHeight <= height + 1) {
          best = size;
          low = size + 1;
        } else {
          high = size - 1;
        }
      }
      text.style.fontSize = `${best}px`;
      cancelAnimationFrame(measureFrameId);
      measureFrameId = requestAnimationFrame(() => {
        const presentationBounds = presentationRef.current?.getBoundingClientRect();
        if (!presentationBounds?.width || !presentationBounds.height) return;
        onMeasureFragments(fragmentRefs.current.map((fragment, index) => {
          const bounds = fragment?.getBoundingClientRect();
          if (!bounds?.width || !bounds.height) return null;
          return {
            color: segments[index]?.color,
            left: ((bounds.left - presentationBounds.left) / presentationBounds.width) * 100,
            top: ((bounds.top - presentationBounds.top) / presentationBounds.height) * 100,
            width: (bounds.width / presentationBounds.width) * 100,
            height: (bounds.height / presentationBounds.height) * 100
          };
        }).filter(Boolean));
      });
    };
    const scheduleFit = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(fit);
    };

    scheduleFit();
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);
    window.addEventListener('orientationchange', scheduleFit);
    document.addEventListener('fullscreenchange', scheduleFit);
    return () => {
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(measureFrameId);
      observer.disconnect();
      window.removeEventListener('orientationchange', scheduleFit);
      document.removeEventListener('fullscreenchange', scheduleFit);
    };
  }, [segments, minFontSize, maxFontSize, onMeasureFragments, presentationRef]);

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden">
      <p ref={textRef} className="whitespace-pre-wrap break-words text-center font-black leading-[1.08] drop-shadow-[0_10px_45px_rgba(0,0,0,0.85)]">
        {segments.map((segment, index) => (
          <span ref={(element) => { fragmentRefs.current[index] = element; }} key={`${index}-${segment.text}`} style={getQuickMessageThemeStyle(segment.color)} className={`quick-message-dynamic-text ${segment.bold === false ? 'font-medium' : 'font-black'}`}>
            {segment.text}
          </span>
        ))}
      </p>
    </div>
  );
};

export const QuickMessagePresentation = ({ eventData, layerClassName = 'z-20' }) => {
  const presentationRef = useRef(null);
  const fragmentBoundsSignatureRef = useRef('');
  const [measuredFragments, setMeasuredFragments] = useState({ messageSignature: '', bounds: [] });
  const state = resolveActiveQuickMessageProjectorState(eventData);
  const segments = Array.isArray(state?.segments) ? state.segments : [];
  const messageSignature = segments.map((segment) => `${segment.color}:${segment.text}`).join('|');
  const handleMeasuredFragments = useCallback((nextBounds) => {
    const signature = nextBounds.map((bound) => [bound.color, bound.left.toFixed(2), bound.top.toFixed(2), bound.width.toFixed(2), bound.height.toFixed(2)].join(':')).join('|');
    const scopedSignature = `${messageSignature}|${signature}`;
    if (scopedSignature === fragmentBoundsSignatureRef.current) return;
    fragmentBoundsSignatureRef.current = scopedSignature;
    setMeasuredFragments({ messageSignature, bounds: nextBounds });
  }, [messageSignature]);
  const fragmentBounds = measuredFragments.messageSignature === messageSignature ? measuredFragments.bounds : [];
  const glows = useMemo(() => getQuickMessageAmbientGlows(segments, fragmentBounds), [segments, fragmentBounds]);
  if (!state) return null;
  const layout = getQuickMessagePresentationLayout({
    content: state.content,
    segments,
    presentationType: state.presentationType
  });

  return (
    <div ref={presentationRef} className={`absolute inset-0 ${layerClassName} overflow-hidden bg-black text-white`}>
      <div aria-hidden="true" className="absolute inset-0 bg-[#070a10]" />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.045),transparent_52%)]" />
      <QuickMessageAmbientGlow glows={glows} />
      <QuickMessageAmbientParticles glows={glows} messageKey={state.projectionActionId || messageSignature} />
      <div className="absolute inset-0 z-[3] bg-black/28" />
      <main className="relative z-10 flex h-full min-h-0 w-full flex-col px-[5vw] pb-[5vh] pt-8 text-center">
        <header className="shrink-0 pt-1">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-amber-100/85 drop-shadow-2xl sm:text-base">
            {layout.header}
          </p>
        </header>
        <div className="min-h-0 w-full flex-1 py-6 sm:py-8">
          <AutoFitQuickMessage
            segments={segments}
            minFontSize={layout.minFontSize}
            maxFontSize={layout.maxFontSize}
            presentationRef={presentationRef}
            onMeasureFragments={handleMeasuredFragments}
          />
        </div>
      </main>
    </div>
  );
};

export default QuickMessagePresentation;

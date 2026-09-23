import { useEffect, useState } from 'react';
import { getQuickMessageThemeStyle } from '../../utils/quickMessageVisualTheme';

const GlowLayer = ({ glows, visible }) => (
  <div className={`absolute inset-0 z-[1] transition-opacity duration-500 ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}>
    {glows.map((glow, index) => (
      <div
        key={`${glow.color}-${index}`}
        aria-hidden="true"
        className={`quick-message-ambient-glow quick-message-ambient-glow-${index % 4} absolute h-[72%] w-[68%] -translate-x-1/2 -translate-y-1/2 blur-3xl`}
        style={{ left: glow.left, top: glow.top, width: glow.width, height: glow.height }}
      >
        <div className="quick-message-dynamic-glow h-full w-full" style={getQuickMessageThemeStyle(glow.color)} />
      </div>
    ))}
  </div>
);

const QuickMessageAmbientGlow = ({ glows = [] }) => {
  const signature = glows.map((glow) => `${glow.color}:${glow.left}:${glow.top}:${glow.width}:${glow.height}`).join('|');
  const [current, setCurrent] = useState(() => ({ signature, glows }));
  const [previous, setPrevious] = useState([]);
  const [transitionReady, setTransitionReady] = useState(true);

  useEffect(() => {
    if (signature === current.signature) return;
    setPrevious(current.glows);
    setCurrent({ signature, glows });
    setTransitionReady(false);
  }, [current, glows, signature]);

  useEffect(() => {
    if (transitionReady) return undefined;
    const frameId = requestAnimationFrame(() => setTransitionReady(true));
    return () => cancelAnimationFrame(frameId);
  }, [transitionReady]);

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <GlowLayer glows={previous} visible={!transitionReady} />
      <GlowLayer glows={current.glows} visible={transitionReady} />
    </div>
  );
};

export default QuickMessageAmbientGlow;

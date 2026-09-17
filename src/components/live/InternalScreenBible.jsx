import AutoFitText from './AutoFitText';
import BibleAmbientBackground from './BibleAmbientBackground';
import { resolveActiveBibleProjectorState, resolveActiveBibleSlide } from '../../utils/bibleProjectionState';

const InternalScreenBible = ({ eventData }) => {
  if (!eventData || typeof eventData !== 'object') return null;
  const projectorState = resolveActiveBibleProjectorState(eventData);
  const slide = resolveActiveBibleSlide(projectorState);
  if (!projectorState || !slide?.text) return null;

  return (
    <div className="fixed inset-0 z-[70] flex h-[100dvh] w-screen overflow-hidden bg-black text-white">
      <BibleAmbientBackground />
      <div className="absolute inset-0 bg-black/42" />
      <main className="relative z-10 flex h-full min-h-0 w-full flex-col items-center justify-center px-[5vw] py-[5vh] text-center">
        <p className="mb-3 shrink-0 text-[clamp(1rem,2.4vw,2.7rem)] font-black uppercase tracking-[0.12em] text-amber-100 drop-shadow-2xl">
          {slide.reference || projectorState.reference}
        </p>
        {slide.heading && <p className="mb-3 shrink-0 text-[clamp(0.8rem,1.4vw,1.4rem)] font-black uppercase tracking-wide text-blue-100">{slide.heading}</p>}
        <div className="min-h-0 w-full flex-1">
          <AutoFitText
            text={slide.text}
            minFontSize={28}
            maxFontSize={180}
            safeMaxWidth="94%"
            safeMaxHeight="96%"
            variant="projector"
            className="font-black leading-[1.08] text-white drop-shadow-[0_10px_45px_rgba(0,0,0,0.85)]"
          />
        </div>
        {(slide.translation || projectorState.translation) && (
          <p className="mt-3 shrink-0 rounded-full border border-white/10 bg-white/10 px-5 py-2 text-[clamp(0.7rem,1.2vw,1.2rem)] font-black uppercase tracking-[0.18em] text-zinc-100">
            {slide.translation || projectorState.translation}
          </p>
        )}
      </main>
    </div>
  );
};

export default InternalScreenBible;

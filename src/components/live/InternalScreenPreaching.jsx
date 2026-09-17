import AutoFitText from './AutoFitText';
import { resolveActivePreachingProjectorState, resolvePreachingProjectionContent } from '../../utils/preachingProjectionState';

export const PreachingPresentation = ({ content, layerClassName = 'z-[75]' }) => {
  if (!content) return null;

  return (
    <div className={`fixed inset-0 ${layerClassName} flex h-[100dvh] w-screen overflow-hidden bg-[#06070b] text-white`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.16),transparent_34%),linear-gradient(135deg,rgba(24,24,27,0.9),rgba(0,0,0,0.98))]" />
      <main className="relative z-10 flex h-full min-h-0 w-full flex-col items-center justify-center px-[6vw] py-[6vh] text-center">
        <p className="mb-4 text-[clamp(0.8rem,1.4vw,1.4rem)] font-black uppercase tracking-[0.18em] text-amber-200">{content.eyebrow}</p>
        {content.reference && <p className="mb-4 text-[clamp(1.2rem,3vw,3.4rem)] font-black text-amber-100">{content.reference}</p>}
        <div className="min-h-0 w-full flex-1">
          <AutoFitText text={content.body} minFontSize={28} maxFontSize={160} safeMaxWidth="94%" safeMaxHeight="96%" variant="projector" className="font-black leading-[1.08] text-white drop-shadow-[0_10px_45px_rgba(0,0,0,0.85)]" />
        </div>
        {content.translation && <p className="mt-3 rounded-full border border-white/10 bg-white/10 px-5 py-2 text-[clamp(0.7rem,1.2vw,1.2rem)] font-black uppercase tracking-[0.18em] text-zinc-100">{content.translation}</p>}
      </main>
    </div>
  );
};

const InternalScreenPreaching = ({ eventData }) => {
  const state = resolveActivePreachingProjectorState(eventData);
  const content = resolvePreachingProjectionContent(state);
  return <PreachingPresentation content={content} />;
};

export default InternalScreenPreaching;

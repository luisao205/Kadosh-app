import { useMemo } from 'react';
import { buildQuickMessageParticles, getQuickMessageThemeStyle } from '../../utils/quickMessageVisualTheme';

const QuickMessageAmbientParticles = ({ glows, messageKey }) => {
  const particleSignature = `${messageKey}|${glows.map((glow) => `${glow.color}:${glow.left}:${glow.top}:${glow.width}:${glow.height}`).join('|')}`;
  const particles = useMemo(() => buildQuickMessageParticles({ glows, messageKey: particleSignature }), [glows, particleSignature]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      {particles.map((particle) => (
        <i
          key={particle.id}
          className={`quick-message-particle quick-message-particle-${particle.motion} absolute rounded-full`}
          style={{
            ...getQuickMessageThemeStyle(particle.color),
            left: particle.left,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            '--quick-particle-duration': particle.duration,
            '--quick-particle-delay': particle.delay
          }}
        />
      ))}
    </div>
  );
};

export default QuickMessageAmbientParticles;

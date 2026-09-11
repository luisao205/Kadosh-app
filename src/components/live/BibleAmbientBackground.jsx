import React, { useEffect, useRef } from 'react';

const PARTICLE_COUNT = 44;
const COLOR_STOPS = [44, 52, 210, 272, 404];
const PARTICLE_PALETTES = [
  { hue: 44, saturation: 10, lightness: 96 },
  { hue: 46, saturation: 88, lightness: 79 },
  { hue: 211, saturation: 84, lightness: 78 },
  { hue: 274, saturation: 72, lightness: 80 }
];

const getCycleHue = (time) => {
  const position = ((time / 26000) % 1) * (COLOR_STOPS.length - 1);
  const index = Math.floor(position);
  const progress = position - index;
  return COLOR_STOPS[index] + ((COLOR_STOPS[index + 1] || COLOR_STOPS[0]) - COLOR_STOPS[index]) * progress;
};

const wrap = (value) => ((value % 1) + 1) % 1;

const BibleAmbientBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const particles = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
      const layer = index < 23 ? 0 : index < 38 ? 1 : 2;
      const palette = PARTICLE_PALETTES[index % PARTICLE_PALETTES.length];
      const velocity = 0.0028 + ((index * 17) % 13) / 1000;

      return {
        x: ((index * 37) % 101) / 100,
        y: ((index * 61) % 101) / 100,
        layer,
        palette,
        size: layer === 0 ? 0.5 + ((index * 7) % 6) / 10 : layer === 1 ? 1.2 + ((index * 11) % 11) / 10 : 3.5 + ((index * 5) % 12) / 10,
        velocityX: velocity * (index % 3 === 0 ? -0.72 : 0.78),
        velocityY: velocity * (index % 4 === 0 ? 0.34 : -0.58),
        phase: index * 0.91,
        depth: 0.48 + ((index * 19) % 48) / 100
      };
    });
    const halos = [
      { phase: 0.3, x: 0.14, y: 0.2, radius: 0.42, speedX: 0.07, speedY: 0.09 },
      { phase: 2.2, x: 0.86, y: 0.65, radius: 0.38, speedX: 0.1, speedY: 0.06 },
      { phase: 4.6, x: 0.48, y: 0.88, radius: 0.33, speedX: 0.08, speedY: 0.07 }
    ];
    let frameId;
    let lastFrame = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const drawHalo = (halo, seconds, hue) => {
      const motion = reducedMotion.matches ? 0 : seconds;
      const x = (halo.x + Math.sin(motion * halo.speedX + halo.phase) * 0.13) * width;
      const y = (halo.y + Math.cos(motion * halo.speedY + halo.phase) * 0.14) * height;
      const radius = Math.max(width, height) * halo.radius;
      const haloHue = hue + Math.sin(motion * 0.11 + halo.phase) * 24;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

      gradient.addColorStop(0, `hsla(${haloHue}, 78%, 65%, 0.1)`);
      gradient.addColorStop(0.35, `hsla(${haloHue}, 75%, 52%, 0.045)`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    };

    const draw = (time = 0) => {
      const seconds = time / 1000;
      const hue = getCycleHue(time);
      const backgroundHue = hue + Math.sin(seconds * 0.09) * 12;

      context.clearRect(0, 0, width, height);
      context.fillStyle = `hsl(${backgroundHue}, 48%, 6%)`;
      context.fillRect(0, 0, width, height);
      halos.forEach((halo, index) => drawHalo(halo, seconds, hue + index * 19));

      particles.forEach((particle) => {
        const motion = reducedMotion.matches ? 0 : seconds;
        const driftX = Math.sin(motion * (0.32 + particle.layer * 0.12) + particle.phase) * 0.026;
        const driftY = Math.cos(motion * (0.26 + particle.layer * 0.1) + particle.phase) * 0.034;
        const x = wrap(particle.x + motion * particle.velocityX + driftX) * width;
        const y = wrap(particle.y + motion * particle.velocityY + driftY) * height;
        const shimmer = (Math.sin(motion * (0.9 + particle.layer * 0.22) + particle.phase) + 1) / 2;
        const scale = 0.78 + shimmer * (particle.layer === 2 ? 0.72 : 0.32);
        const alpha = (particle.layer === 0 ? 0.12 : particle.layer === 1 ? 0.22 : 0.16) * particle.depth * (0.62 + shimmer * 0.55);
        const hueShift = Math.sin(motion * 0.18 + particle.phase) * 13;
        const particleHue = particle.palette.hue + hueShift;
        const radius = particle.size * scale;

        context.beginPath();
        context.shadowBlur = particle.layer === 2 ? 16 : 5 + radius * 3;
        context.shadowColor = `hsla(${particleHue}, ${particle.palette.saturation}%, ${particle.palette.lightness}%, ${alpha})`;
        context.fillStyle = `hsla(${particleHue}, ${particle.palette.saturation}%, ${particle.palette.lightness}%, ${alpha})`;
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      });

      context.shadowBlur = 0;
      context.fillStyle = 'rgba(0, 3, 10, 0.35)';
      context.fillRect(0, 0, width, height);
    };

    const render = (time) => {
      if (time - lastFrame >= 33) {
        draw(time);
        lastFrame = time;
      }
      if (!reducedMotion.matches) frameId = requestAnimationFrame(render);
    };

    const handleMotionChange = () => {
      cancelAnimationFrame(frameId);
      draw(performance.now());
      if (!reducedMotion.matches) frameId = requestAnimationFrame(render);
    };

    resize();
    draw();
    if (!reducedMotion.matches) frameId = requestAnimationFrame(render);
    window.addEventListener('resize', resize);
    reducedMotion.addEventListener('change', handleMotionChange);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      reducedMotion.removeEventListener('change', handleMotionChange);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
};

export default BibleAmbientBackground;

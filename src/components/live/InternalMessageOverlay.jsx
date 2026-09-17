const InternalMessageOverlay = ({ alert, audience = 'pastor', currentTime = 0 }) => {
  const data = typeof alert === 'string'
    ? { text: alert, priority: 'urgente', target: 'all' }
    : alert;
  const active = data
    && data.active !== false
    && (!data.expiresAt || data.expiresAt > currentTime);
  const visible = active
    && (!data.target || data.target === 'all' || data.target === audience);

  if (!visible || !data.text) return null;

  const priority = data.priority || 'normal';
  const audienceLabel = audience === 'pastor' ? 'pastor' : audience;

  if (priority === 'urgente') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(248,113,113,0.92),rgba(185,28,28,0.82)_45%,rgba(69,10,10,0.72)_100%)] p-8 text-center backdrop-blur-[2px]">
        <div className="absolute inset-0 bg-black/15" />
        <div className="relative rounded-[2rem] border border-white/20 bg-black/20 px-8 py-7 shadow-2xl">
          <h2 className="mb-4 text-4xl font-black uppercase italic text-white md:text-6xl">Urgente / Atencion {audienceLabel}</h2>
          <p className="text-5xl font-black text-white drop-shadow-2xl md:text-8xl">{data.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed left-3 right-3 z-[90] mx-auto max-w-5xl rounded-3xl border px-5 py-4 text-center shadow-2xl backdrop-blur-md ${priority === 'importante' ? 'top-24 border-amber-300/50 bg-amber-500/90 text-zinc-950' : 'bottom-24 border-white/10 bg-zinc-950/88 text-white'}`}>
      <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${priority === 'importante' ? 'text-zinc-900/70' : 'text-emerald-300'}`}>
        {priority === 'importante' ? `Atencion ${audienceLabel}` : `Mensaje a ${audienceLabel}`}
      </p>
      <p className="mt-1 text-2xl font-black leading-tight sm:text-4xl">{data.text}</p>
    </div>
  );
};

export default InternalMessageOverlay;

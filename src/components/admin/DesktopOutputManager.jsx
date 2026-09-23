import { useEffect, useMemo, useState } from 'react';
import { Headphones, Mic2, Monitor, ShieldCheck, Tv, X } from 'lucide-react';

const getDesktopOutputs = () => (
  typeof window === 'undefined' ? null : window.kadoshDesktop?.outputs || null
);

const outputDefinitions = [
  { type: 'projector', label: 'Proyector', Icon: Tv },
  { type: 'singers', label: 'Cantantes', Icon: Mic2 },
  { type: 'musicians', label: 'Músicos', Icon: Headphones },
  { type: 'preacher', label: 'Predicador', Icon: ShieldCheck }
];

const DesktopOutputManager = ({ eventId }) => {
  const [outputs] = useState(getDesktopOutputs);
  const [displays, setDisplays] = useState([]);
  const [state, setState] = useState({ outputs: [], assignments: {} });
  const [busyType, setBusyType] = useState('');

  useEffect(() => {
    if (!outputs) return undefined;
    let active = true;
    const refresh = async () => {
      const [nextDisplays, nextState] = await Promise.all([outputs.getDisplays(), outputs.getState()]);
      if (!active) return;
      setDisplays(Array.isArray(nextDisplays) ? nextDisplays : []);
      if (nextState) setState(nextState);
    };
    void refresh();
    return outputs.onStateChange((nextState) => {
      if (nextState) setState(nextState);
      void outputs.getDisplays().then((nextDisplays) => {
        if (active && Array.isArray(nextDisplays)) setDisplays(nextDisplays);
      });
    });
  }, [outputs]);

  const displayById = useMemo(() => new Map(displays.map((display) => [String(display.id), display])), [displays]);
  if (!outputs) return null;

  const getDescriptor = (type) => ({ type, eventId });
  const run = async (type, action) => {
    if (!eventId || busyType) return;
    setBusyType(type);
    try {
      const result = await action();
      if (result?.state) setState(result.state);
    } finally {
      setBusyType('');
    }
  };

  return (
    <section className="mb-6 rounded-3xl border border-white/10 bg-zinc-950/45 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300"><Monitor size={18} /></span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Pantallas y salidas</p>
          <p className="text-xs font-semibold text-zinc-500">Administración local de Electron</p>
        </div>
      </div>
      {!eventId && <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">Selecciona un próximo evento para abrir salidas.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {outputDefinitions.map(({ type, label, Icon }) => {
          const descriptor = getDescriptor(type);
          const entry = state.outputs.find((output) => output.key === `${type}:${eventId}`);
          const assignedId = state.assignments?.[type];
          const assignedDisplay = assignedId === null || assignedId === undefined ? null : displayById.get(String(assignedId));
          const isBusy = busyType === type;
          return (
            <div key={type} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-black text-zinc-100"><Icon size={16} /> {label}</span>
                <span className={`text-[10px] font-black uppercase ${entry ? 'text-emerald-300' : 'text-zinc-500'}`}>{entry ? 'Abierto' : 'Cerrado'}</span>
              </div>
              <select
                value={assignedId ?? ''}
                disabled={isBusy}
                onChange={(event) => run(type, () => outputs.setDisplay({ type, displayId: event.target.value || null }))}
                className="mb-3 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200"
              >
                <option value="">Sin pantalla asignada</option>
                {!assignedDisplay && assignedId !== null && assignedId !== undefined && <option value={String(assignedId)}>Pantalla no disponible</option>}
                {displays.map((display) => <option key={display.id} value={String(display.id)}>{display.label}{display.primary ? ' (Principal)' : ''}</option>)}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!eventId || isBusy}
                  onClick={() => run(type, () => entry ? outputs.focus(descriptor) : outputs.open(descriptor))}
                  className="flex-1 rounded-xl bg-cyan-500/15 px-3 py-2 text-[10px] font-black uppercase text-cyan-200 disabled:opacity-40"
                >
                  {entry ? 'Enfocar' : 'Abrir'}
                </button>
                <button
                  type="button"
                  disabled={!entry || isBusy}
                  onClick={() => run(type, () => outputs.close(descriptor))}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 text-zinc-300 disabled:opacity-40"
                  title={`Cerrar ${label}`}
                  aria-label={`Cerrar ${label}`}
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default DesktopOutputManager;

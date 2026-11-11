import { useState } from 'react';
import { DEFAULT_PROJECTION_STYLE, PROJECTION_STYLE_MOTIONS, PROJECTION_STYLE_PRESETS, getProjectionStyleLabel, normalizeProjectionStyle } from '../../utils/projectionStyle';

const ProjectionStylePanel = ({ value, onChange }) => {
  const style = normalizeProjectionStyle(value);
  const [previewRun, setPreviewRun] = useState(0);

  const patch = (changes) => {
    onChange(normalizeProjectionStyle({ ...style, ...changes }));
    setPreviewRun((run) => run + 1);
  };

  return (
    <section className="col-span-2 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4" aria-label="Estilo de proyección">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-zinc-900 dark:text-white">Estilo de proyección</h3>
          <p className="text-xs text-zinc-500">Se guarda como predeterminado de esta canción.</p>
        </div>
        <button type="button" onClick={() => onChange(DEFAULT_PROJECTION_STYLE)} className="text-xs font-bold text-violet-700 dark:text-violet-300 underline underline-offset-2">Restaurar limpio</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Preset
          <select value={style.preset} onChange={(event) => patch({ preset: event.target.value })} className="kp-input mt-1 w-full rounded-xl p-2 text-sm">
            {Object.entries(PROJECTION_STYLE_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Movimiento
          <select value={style.motion} onChange={(event) => patch({ motion: event.target.value })} className="kp-input mt-1 w-full rounded-xl p-2 text-sm">
            {PROJECTION_STYLE_MOTIONS.map((motion) => <option key={motion} value={motion}>{motion === 'none' ? 'Ninguno' : motion === 'soft' ? 'Suave' : 'Dinámico'}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 rounded-xl border border-white/10 bg-zinc-950 p-5 text-center shadow-inner">
        <div key={`${style.preset}-${style.motion}-${previewRun}`} className={`projection-style-preview projection-preset-${style.preset} projection-motion-${style.motion} flex min-h-32 items-center justify-center overflow-hidden text-white`}>
          <p className="projection-style-preview-text">Tu gracia es suficiente<br />Tu presencia es mi hogar</p>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs font-bold text-zinc-500 dark:text-zinc-400">
          <span>{getProjectionStyleLabel(style)}</span>
          <button type="button" onClick={() => setPreviewRun((run) => run + 1)} className="rounded-md border border-zinc-600 px-2 py-1 text-zinc-200 transition-colors hover:border-violet-400 hover:text-white">Vista previa</button>
        </div>
      </div>
    </section>
  );
};

export default ProjectionStylePanel;

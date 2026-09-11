import React from 'react';
import { traducirAcorde } from '../../utils/musicCore';

const SongMetadataForm = ({
  titulo,
  onTituloChange,
  artista,
  onArtistaChange,
  tono,
  onTonoChange,
  bpm,
  onBpmChange,
  etiquetas = [],
  onToggleEtiqueta,
  tonosCantantes = {},
  onOpenSingerModal,
  tonosDisponibles = [],
  etiquetasDisponibles = [],
  detectedKey,
  normalizeKey,
  formatoAcordes,
  notacion
}) => (
  <>
    <div className="col-span-2">
      <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Titulo de la Cancion</label>
      <input type="text" value={titulo} onChange={(e) => onTituloChange(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm" />
    </div>
    <div className="col-span-2">
      <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Artista / Banda</label>
      <input type="text" value={artista} onChange={(e) => onArtistaChange(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm" />
    </div>
    <div className="col-span-1">
      <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Tono Original</label>
      <select value={tonosDisponibles.includes(tono) ? tono : ''} onChange={(e) => onTonoChange(e.target.value || tono)} className="kp-input w-full p-2.5 rounded-xl text-sm font-bold">
        {!tonosDisponibles.includes(tono) && <option value="">{tono || 'Seleccionar'}</option>}
        {tonosDisponibles.map(key => <option key={key} value={key}>{key}</option>)}
      </select>
      {detectedKey && detectedKey.tono !== normalizeKey(tono) && (
        <div className="mt-2 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-2 text-xs text-emerald-800 dark:text-emerald-200">
          <p className="font-bold">
            Tono detectado: <span className="font-black">{traducirAcorde(detectedKey.tono, formatoAcordes, notacion)}</span>
            {detectedKey.ambiguo ? ' (probable)' : ''}
          </p>
          <button type="button" onClick={() => onTonoChange(detectedKey.tono)} className="mt-1 text-[11px] font-black uppercase text-emerald-700 dark:text-emerald-300 underline underline-offset-2">
            Usar como tono original
          </button>
        </div>
      )}
    </div>
    <div className="col-span-1">
      <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1 flex justify-between items-end">
        <span>Tonos por Cantante</span>
        <button type="button" onClick={onOpenSingerModal} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 font-bold text-[10px] bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-500/20 transition-colors">Administrar</button>
      </label>
      <div className="border border-zinc-200 dark:border-zinc-800 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 min-h-[2.75rem]">
        {Object.keys(tonosCantantes).length === 0 ? (
          <p className="text-[10px] text-zinc-400 italic">Ningun cantante asignado.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(tonosCantantes).map(([cantante, key]) => (
              <span key={cantante} className="text-[10px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-1 rounded-md font-bold flex items-center gap-1 shadow-sm">
                {cantante} <span className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1 rounded">{traducirAcorde(key || tono || '?', formatoAcordes)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
    <div className="col-span-1">
      <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">BPM</label>
      <input type="number" value={bpm} onChange={(e) => onBpmChange(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm" />
    </div>
    <div className="col-span-2">
      <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Etiquetas (Filtros de Repertorio)</label>
      <div className="flex flex-wrap gap-2">
        {etiquetasDisponibles.map(tag => (
          <button key={tag} type="button" onClick={() => onToggleEtiqueta(tag)}
            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-colors ${etiquetas.includes(tag) ? 'bg-violet-100 dark:bg-violet-500/20 border-violet-300 dark:border-violet-500/30 text-violet-700 dark:text-violet-400' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  </>
);

export default SongMetadataForm;


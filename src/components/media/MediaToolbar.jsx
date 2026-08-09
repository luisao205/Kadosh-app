import React from 'react';
import { Plus, Search } from 'lucide-react';

const MediaToolbar = ({ total = 0, query, onQueryChange, onAdd, sortBy = 'recent', onSortChange }) => (
  <div className="flex flex-col gap-4 border-b border-white/10 bg-zinc-950/70 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
    <div className="min-w-0">
      <h1 className="text-2xl font-black tracking-tight text-white">Biblioteca Multimedia</h1>
      <p className="mt-1 text-sm font-medium text-zinc-400">{total} recursos visibles para Kadosh</p>
    </div>

    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-3 py-2.5 sm:w-80">
        <Search size={17} className="shrink-0 text-zinc-500" />
        <input
          value={query}
          onChange={event => onQueryChange?.(event.target.value)}
          placeholder="Buscar multimedia..."
          className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-zinc-600"
        />
      </div>
      <select
        value={sortBy}
        onChange={event => onSortChange?.(event.target.value)}
        className="rounded-2xl border border-white/10 bg-black/35 px-3 py-3 text-xs font-black uppercase tracking-wide text-white outline-none"
      >
        <option value="recent">Mas recientes</option>
        <option value="used">Mas usados</option>
        <option value="favorites">Favoritos primero</option>
        <option value="name">Nombre</option>
      </select>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-violet-950/25 hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        disabled
        title="Disponible en una fase futura"
      >
        <Plus size={16} />
        Agregar Multimedia
      </button>
    </div>
  </div>
);

export default MediaToolbar;

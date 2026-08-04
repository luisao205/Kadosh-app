import React from 'react';
import { Boxes } from 'lucide-react';
import { MEDIA_TYPES } from '../../utils/mediaLibrary';
import { getMediaTypeIcon, getMediaTypeLabel } from './mediaDisplay';

const FILTERS = [
  { id: 'all', label: 'Todos', icon: Boxes },
  { id: MEDIA_TYPES.IMAGE, label: 'Imagenes' },
  { id: MEDIA_TYPES.VIDEO, label: 'Videos' },
  { id: MEDIA_TYPES.AUDIO, label: 'Audios' },
  { id: MEDIA_TYPES.PDF, label: 'PDF' },
  { id: MEDIA_TYPES.LINK, label: 'Enlaces' }
];

const MediaFilters = ({ activeType = 'all', onChange, counts = {} }) => (
  <aside className="border-b border-white/10 bg-zinc-950/60 p-4 lg:border-b-0 lg:border-r lg:p-5">
    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Filtros rapidos</p>
    <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible [&::-webkit-scrollbar]:hidden">
      {FILTERS.map(filter => {
        const Icon = filter.icon || getMediaTypeIcon(filter.id);
        const active = activeType === filter.id;
        const label = filter.label || getMediaTypeLabel(filter.id);

        return (
          <button
            type="button"
            key={filter.id}
            onClick={() => onChange?.(filter.id)}
            className={`flex shrink-0 items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors lg:w-full ${
              active
                ? 'border-violet-500/50 bg-violet-500/15 text-white'
                : 'border-white/10 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-900 hover:text-white'
            }`}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <Icon size={16} className={active ? 'text-violet-200' : 'text-zinc-500'} />
              <span className="truncate text-xs font-black uppercase tracking-wide">{label}</span>
            </span>
            <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-black text-zinc-500">
              {counts[filter.id] || 0}
            </span>
          </button>
        );
      })}
    </div>
  </aside>
);

export default MediaFilters;


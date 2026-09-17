import { Boxes, FilterX, Star } from 'lucide-react';
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

const MediaFilters = ({
  activeType = 'all',
  onChange,
  counts = {},
  categories = [],
  selectedCategory = 'all',
  onCategoryChange,
  tags = [],
  selectedTags = [],
  onToggleTag,
  usageFilter = 'all',
  onUsageFilterChange,
  favoritesOnly = false,
  onFavoritesOnlyChange,
  onClearFilters,
  libraryScope = 'all',
  onLibraryScopeChange,
  preachingFolders = [],
  selectedPreachingId = 'all',
  onPreachingChange
}) => (
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

    <div className="mt-5 space-y-4">
      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Seccion</p>
        <select value={libraryScope} onChange={event => onLibraryScopeChange?.(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-xs font-bold text-white outline-none">
          <option value="all">Toda la biblioteca</option><option value="general">General</option><option value="preaching">Predicas</option>
        </select>
        {libraryScope === 'preaching' && <select value={selectedPreachingId} onChange={event => onPreachingChange?.(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-xs font-bold text-white outline-none">
          <option value="all">Todas las predicas</option>{preachingFolders.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>}
      </div>
      <button
        type="button"
        onClick={() => onFavoritesOnlyChange?.(!favoritesOnly)}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
          favoritesOnly ? 'border-amber-400/50 bg-amber-400/15 text-amber-100' : 'border-white/10 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-900 hover:text-white'
        }`}
      >
        <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide">
          <Star size={15} fill={favoritesOnly ? 'currentColor' : 'none'} /> Favoritos
        </span>
      </button>

      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Uso</p>
        <div className="grid grid-cols-3 gap-1">
          {[
            ['all', 'Todos'],
            ['used', 'En uso'],
            ['unused', 'Sin uso']
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onUsageFilterChange?.(value)}
              className={`rounded-xl px-2 py-2 text-[9px] font-black uppercase ${
                usageFilter === value ? 'bg-emerald-600 text-white' : 'border border-white/10 bg-zinc-900 text-zinc-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Categoria</p>
        <select
          value={selectedCategory}
          onChange={event => onCategoryChange?.(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-xs font-bold text-white outline-none"
        >
          <option value="all">Todas</option>
          <option value="none">Sin categoria</option>
          {categories.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </div>

      {tags.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Etiquetas</p>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">
            {tags.map(tag => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onToggleTag?.(tag)}
                  className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${
                    active ? 'border-violet-400 bg-violet-500/20 text-violet-100' : 'border-white/10 bg-zinc-900 text-zinc-500'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onClearFilters}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white"
      >
        <FilterX size={14} /> Limpiar filtros
      </button>
    </div>
  </aside>
);

export default MediaFilters;

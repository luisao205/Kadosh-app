import React from 'react';
import { Check, Edit3, Eye, MapPin, Star, Trash2 } from 'lucide-react';
import { MEDIA_TYPES } from '../../utils/mediaLibrary';
import { getMediaStatusClassName, getMediaStatusLabel, getMediaTypeIcon, getMediaTypeLabel } from './mediaDisplay';

const MediaCard = ({ media, selected = false, selectable = false, onSelect, onDetails, onEdit, onUsage, onTrash, onToggleFavorite, updating = false }) => {
  const Icon = getMediaTypeIcon(media.type);
  const favorite = media.favorite ?? false;

  return (
    <article className={`overflow-hidden rounded-2xl border bg-zinc-900/85 shadow-lg shadow-black/10 transition-all ${
      selected ? 'border-violet-400 ring-2 ring-violet-500/25' : 'border-white/10 hover:border-violet-500/40'
    }`}>
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        <button
          type="button"
          onClick={() => onDetails?.(media)}
          className="absolute inset-0 block h-full w-full text-left"
          aria-label={`Abrir ${media.title || media.name || 'recurso multimedia'}`}
        >
          {media.type === MEDIA_TYPES.VIDEO && media.thumbnailUrl ? (
            <img src={media.thumbnailUrl} alt={media.title || 'Video multimedia'} loading="lazy" decoding="async" className="h-full w-full object-cover opacity-80" />
          ) : media.type === MEDIA_TYPES.VIDEO ? (
            <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
              <Icon size={42} />
            </div>
          ) : media.type === MEDIA_TYPES.IMAGE ? (
            <img src={media.thumbnailUrl || media.url} alt={media.title || 'Recurso multimedia'} loading="lazy" decoding="async" className="h-full w-full object-cover opacity-80" />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-500">
              <Icon size={36} />
            </div>
          )}
        </button>
        <span className="pointer-events-none absolute left-2 top-2 rounded-full border border-white/10 bg-black/70 p-1.5 text-white backdrop-blur">
          <Icon size={14} />
        </span>
        <span className={`pointer-events-none absolute right-2 top-2 rounded-full border px-2 py-1 text-[9px] font-black uppercase backdrop-blur ${getMediaStatusClassName(media.status)}`}>
          {getMediaStatusLabel(media.status)}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite?.(media);
          }}
          disabled={updating}
          className={`absolute bottom-2 right-2 rounded-full border p-1.5 backdrop-blur transition-colors disabled:opacity-50 ${
            favorite ? 'border-amber-300/60 bg-amber-400 text-zinc-950' : 'border-white/10 bg-black/70 text-zinc-400 hover:text-amber-200'
          }`}
          title={favorite ? 'Quitar favorito' : 'Marcar favorito'}
          aria-label={favorite ? 'Quitar de favoritos' : 'Marcar favorito'}
        >
          <Star size={14} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="space-y-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{media.title || media.name || 'Recurso multimedia'}</p>
          <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            {getMediaTypeLabel(media.type)} {media.provider ? `- ${media.provider}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {media.category && (
              <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-violet-200">
                {media.category}
              </span>
            )}
            {(media.usageCount ?? 0) > 0 && (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-200">
                Usado {media.usageCount}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSelect?.(media)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-2.5 py-2 text-[10px] font-black uppercase text-white hover:bg-violet-500"
          >
            {selected && selectable ? <Check size={13} /> : null}
            Usar recurso
          </button>
          <button
            type="button"
            onClick={() => onDetails?.(media)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-950 px-2.5 py-2 text-[10px] font-black uppercase text-zinc-300 hover:bg-zinc-800"
          >
            <Eye size={13} />
            Ver detalles
          </button>
          <button
            type="button"
            onClick={() => onEdit?.(media)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-500/20 bg-violet-500/10 px-2.5 py-2 text-[10px] font-black uppercase text-violet-100 hover:bg-violet-500/15"
          >
            <Edit3 size={13} />
            Editar recurso
          </button>
          <button
            type="button"
            onClick={() => onUsage?.(media)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-black uppercase text-emerald-100 hover:bg-emerald-500/15"
          >
            <MapPin size={13} />
            Ver usos
          </button>
          <button
            type="button"
            onClick={() => onTrash?.(media)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-2.5 py-2 text-[10px] font-black uppercase text-red-100 hover:bg-red-500/15"
          >
            <Trash2 size={13} />
            Papelera
          </button>
        </div>
      </div>
    </article>
  );
};

export default MediaCard;

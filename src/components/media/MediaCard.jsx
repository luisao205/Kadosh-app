import React from 'react';
import { Check, Eye } from 'lucide-react';
import { MEDIA_TYPES } from '../../utils/mediaLibrary';
import { getMediaStatusClassName, getMediaStatusLabel, getMediaTypeIcon, getMediaTypeLabel } from './mediaDisplay';

const MediaCard = ({ media, selected = false, selectable = false, onSelect, onDetails }) => {
  const Icon = getMediaTypeIcon(media.type);

  return (
    <article className={`overflow-hidden rounded-2xl border bg-zinc-900/85 shadow-lg shadow-black/10 transition-all ${
      selected ? 'border-violet-400 ring-2 ring-violet-500/25' : 'border-white/10 hover:border-violet-500/40'
    }`}>
      <button type="button" onClick={() => onDetails?.(media)} className="relative block aspect-video w-full overflow-hidden bg-black text-left">
        {media.type === MEDIA_TYPES.VIDEO ? (
          <video src={media.url} muted playsInline className="h-full w-full object-cover opacity-70" />
        ) : media.type === MEDIA_TYPES.IMAGE ? (
          <img src={media.thumbnailUrl || media.url} alt={media.title} className="h-full w-full object-cover opacity-80" />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500">
            <Icon size={36} />
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/70 p-1.5 text-white backdrop-blur">
          <Icon size={14} />
        </span>
        <span className={`absolute right-2 top-2 rounded-full border px-2 py-1 text-[9px] font-black uppercase backdrop-blur ${getMediaStatusClassName(media.status)}`}>
          {getMediaStatusLabel(media.status)}
        </span>
      </button>

      <div className="space-y-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{media.title || media.name || 'Recurso multimedia'}</p>
          <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            {getMediaTypeLabel(media.type)} {media.provider ? `- ${media.provider}` : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSelect?.(media)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-2.5 py-2 text-[10px] font-black uppercase text-white hover:bg-violet-500"
          >
            {selected && selectable ? <Check size={13} /> : null}
            Seleccionar
          </button>
          <button
            type="button"
            onClick={() => onDetails?.(media)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-950 px-2.5 py-2 text-[10px] font-black uppercase text-zinc-300 hover:bg-zinc-800"
          >
            <Eye size={13} />
            Detalles
          </button>
        </div>
      </div>
    </article>
  );
};

export default MediaCard;


import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { MEDIA_TYPES } from '../../utils/mediaLibrary';
import { getMediaStatusClassName, getMediaStatusLabel, getMediaTypeIcon, getMediaTypeLabel } from './mediaDisplay';

const metadataEntries = (metadata = {}) => Object.entries(metadata)
  .filter(([, value]) => value !== null && value !== undefined && value !== '');

const MediaPreview = ({ media, emptyLabel = 'Selecciona un recurso' }) => {
  if (!media) {
    return (
      <div className="flex h-full min-h-[22rem] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-zinc-950/70 text-center">
        <div>
          <ImageIcon size={36} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-600">{emptyLabel}</p>
        </div>
      </div>
    );
  }

  const Icon = getMediaTypeIcon(media.type);
  const entries = metadataEntries(media.metadata);

  return (
    <div className="flex h-full min-h-[22rem] flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/85">
      <div className="relative flex min-h-[14rem] flex-1 items-center justify-center overflow-hidden bg-black">
        {media.type === MEDIA_TYPES.VIDEO ? (
          <video src={media.url} muted controls playsInline className="h-full w-full object-contain" />
        ) : media.type === MEDIA_TYPES.IMAGE ? (
          <img src={media.thumbnailUrl || media.url} alt={media.title} className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-zinc-400">
            <Icon size={52} />
            <span className="text-xs font-black uppercase tracking-[0.2em]">{getMediaTypeLabel(media.type)}</span>
          </div>
        )}
      </div>

      <div className="space-y-4 border-t border-white/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-black text-white">{media.title || media.name || 'Recurso multimedia'}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {getMediaTypeLabel(media.type)} {media.provider ? `- ${media.provider}` : ''}
            </p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${getMediaStatusClassName(media.status)}`}>
            {getMediaStatusLabel(media.status)}
          </span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">URL</p>
          <p className="break-all text-xs font-semibold text-zinc-300">{media.url || 'Sin URL'}</p>
        </div>

        {entries.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {entries.map(([key, value]) => (
              <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{key}</p>
                <p className="mt-1 truncate text-xs font-bold text-zinc-200">{String(value)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaPreview;


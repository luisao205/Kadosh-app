import React from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { getDeletedByLabel, getTrashExpiration } from '../../utils/mediaTrash';
import { getMediaTypeIcon, getMediaTypeLabel } from './mediaDisplay';
import { MEDIA_TYPES } from '../../utils/mediaLibrary';

const formatDate = (value) => {
  const { deletedDate } = getTrashExpiration(value);
  if (!deletedDate) return 'Fecha no disponible';
  return deletedDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

const MediaTrashView = ({ items = [], processingIds = [], onRestore, onDeleteForever }) => {
  if (items.length === 0) {
    return (
      <div className="flex min-h-[22rem] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-zinc-950/70 text-center">
        <div className="max-w-sm px-4">
          <Trash2 size={36} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-xl font-black text-white">La papelera esta vacia.</p>
          <p className="mt-2 text-sm text-zinc-500">Los recursos enviados a papelera apareceran aqui.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {items.map(media => {
        const Icon = getMediaTypeIcon(media.type);
        const expiration = getTrashExpiration(media.deletedAt);
        const processing = processingIds.includes(media.id || media.mediaId);

        return (
          <article key={media.id || media.url} className="overflow-hidden rounded-3xl border border-red-500/15 bg-zinc-900/85 shadow-lg shadow-black/10">
            <div className="relative aspect-video bg-black">
              {media.type === MEDIA_TYPES.VIDEO && media.thumbnailUrl ? (
                <img src={media.thumbnailUrl} alt={media.title || 'Video multimedia'} loading="lazy" className="h-full w-full object-cover opacity-70" />
              ) : media.type === MEDIA_TYPES.VIDEO ? (
                <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
                  <Icon size={42} />
                </div>
              ) : media.type === MEDIA_TYPES.IMAGE ? (
                <img src={media.thumbnailUrl || media.url} alt={media.title || 'Recurso multimedia'} loading="lazy" className="h-full w-full object-cover opacity-70" />
              ) : (
                <div className="flex h-full items-center justify-center text-zinc-500">
                  <Icon size={38} />
                </div>
              )}
              <span className="absolute left-3 top-3 rounded-full border border-red-500/25 bg-red-500/15 px-3 py-1 text-[10px] font-black uppercase text-red-100">
                Papelera
              </span>
            </div>

            <div className="space-y-3 p-4">
              <div>
                <h3 className="truncate text-base font-black text-white">{media.title || media.name || 'Recurso multimedia'}</h3>
                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">{getMediaTypeLabel(media.type)}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-zinc-400">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Eliminado</p>
                  <p className="mt-1">{formatDate(media.deletedAt)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Restan</p>
                  <p className="mt-1">{expiration.daysRemaining === null ? 'Sin fecha' : `${expiration.daysRemaining} dias`}</p>
                </div>
              </div>

              <p className="truncate text-xs font-semibold text-zinc-500">Elimino: {getDeletedByLabel(media.deletedBy)}</p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onRestore?.(media)}
                  disabled={processing}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-[10px] font-black uppercase text-emerald-100 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  Restaurar
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteForever?.(media)}
                  disabled={processing}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[10px] font-black uppercase text-red-100 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Eliminar
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default MediaTrashView;

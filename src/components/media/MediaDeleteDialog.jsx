import React from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { getMediaUsageCount, isMediaResourceInUse } from '../../utils/mediaUsage';

const MediaDeleteDialog = ({ open, media, mode = 'trash', processing = false, onClose, onConfirm, onViewUsage }) => {
  if (!open || !media) return null;

  const inUse = isMediaResourceInUse(media);
  const usageCount = getMediaUsageCount(media);
  const isPermanent = mode === 'permanent';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 text-white backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl shadow-black">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-300">
              {isPermanent ? 'Eliminar definitivamente' : 'Mover a papelera'}
            </p>
            <h2 className="mt-1 truncate text-xl font-black">{media.title || media.name || 'Recurso multimedia'}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={processing} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-zinc-300 disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {inUse ? (
            <div className="rounded-3xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-100">
              <div className="mb-2 flex items-center gap-2 font-black">
                <AlertTriangle size={18} />
                Recurso en uso
              </div>
              <p className="text-sm leading-relaxed">
                Este recurso no puede {isPermanent ? 'eliminarse definitivamente' : 'enviarse a la papelera'} porque esta siendo utilizado en {usageCount} {usageCount === 1 ? 'lugar' : 'lugares'}.
              </p>
              <button
                type="button"
                onClick={onViewUsage}
                className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-xs font-black uppercase text-amber-50"
              >
                Ver dependencias
              </button>
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-relaxed text-zinc-300">
              {isPermanent ? (
                <p>Esta accion eliminara el documento de la Biblioteca Multimedia. No se borraran archivos de Cloudinary ni URLs externas desde el cliente.</p>
              ) : (
                <p>El recurso dejara de aparecer en la Biblioteca Multimedia y podra restaurarse durante 30 dias.</p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-white/10 p-5">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase text-zinc-300 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={processing || inUse}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-xs font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            {isPermanent ? 'Eliminar' : 'Mover'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaDeleteDialog;

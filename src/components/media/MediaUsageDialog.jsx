import React from 'react';
import { AlertCircle, ExternalLink, Loader2, MapPin, Music, X } from 'lucide-react';
import { getMediaUsageCount } from '../../utils/mediaUsage';
import useMediaDependencies from '../../hooks/useMediaDependencies';

const getLocationLabel = (dependency = {}) => {
  if (dependency.location === 'background') return 'Fondo de cancion';
  if (dependency.location === 'section') return 'Seccion';
  if (dependency.location === 'resource') return 'Recurso de cancion';
  return dependency.location || 'Uso registrado';
};

const getTypeLabel = (dependency = {}) => {
  if (dependency.type === 'song') return 'Cancion';
  if (dependency.type === 'event') return 'Evento';
  return dependency.type || 'Entidad';
};

const MediaUsageDialog = ({ open, media, onClose, onOpenDependency }) => {
  const shouldResolve = Boolean(open && media);
  const { dependencies, loading, error } = useMediaDependencies(media, { enabled: shouldResolve });

  if (!open || !media) return null;

  const usageCount = getMediaUsageCount(media);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 text-white backdrop-blur-sm">
      <div className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl shadow-black">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Dependencias</p>
            <h2 className="mt-1 truncate text-xl font-black text-white">{media.title || media.name || 'Recurso multimedia'}</h2>
            <p className="mt-1 text-sm font-semibold text-zinc-400">
              {usageCount > 0 ? `Usado en ${usageCount} ${usageCount === 1 ? 'lugar' : 'lugares'}` : 'Sin usos registrados'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
            aria-label="Cerrar dependencias"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {usageCount !== dependencies.length && usageCount > 0 && (
            <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold text-amber-100">
              Hay una diferencia entre usageCount y la lista usedBy. Se considera el recurso en uso para evitar eliminaciones inseguras.
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[16rem] items-center justify-center text-zinc-400">
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-red-100">
              <div className="flex gap-3">
                <AlertCircle size={20} />
                <p className="text-sm font-bold">{error}</p>
              </div>
            </div>
          ) : dependencies.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-zinc-900/60 text-center">
              <div className="max-w-sm px-4">
                <MapPin size={34} className="mx-auto mb-3 text-zinc-600" />
                <p className="text-sm font-black text-white">Este recurso no tiene dependencias registradas.</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">Puede eliminarse cuando exista una accion de eliminacion disponible.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {dependencies.map(dependency => (
                <article key={dependency.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-200">
                          <Music size={12} />
                          {getTypeLabel(dependency)}
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-black uppercase text-zinc-400">
                          {getLocationLabel(dependency)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-black text-white">{dependency.title}</h3>
                      {dependency.sectionTitle && (
                        <p className="mt-1 text-sm font-semibold text-violet-200">Seccion: {dependency.sectionTitle}</p>
                      )}
                      {dependency.resourceTitle && dependency.resourceTitle !== dependency.title && (
                        <p className="mt-1 text-xs font-semibold text-zinc-500">Referencia: {dependency.resourceTitle}</p>
                      )}
                      {!dependency.available && (
                        <p className="mt-2 text-xs font-bold text-amber-200">Elemento no disponible o referencia obsoleta.</p>
                      )}
                    </div>

                    {dependency.route && (
                      <button
                        type="button"
                        onClick={() => onOpenDependency?.(dependency)}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 px-4 py-2.5 text-xs font-black uppercase text-zinc-200 hover:bg-zinc-800"
                      >
                        <ExternalLink size={14} />
                        Abrir cancion
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-wide text-zinc-300 hover:bg-white/10"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaUsageDialog;

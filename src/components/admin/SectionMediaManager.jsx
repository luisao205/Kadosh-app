import React, { useState } from 'react';
import { X, Library, Video, Link as LinkIcon, FileText as FileIcon, Upload, Trash2, SlidersHorizontal, Image as ImageIcon } from 'lucide-react';
import MediaPicker from '../media/MediaPicker';
import { getMediaTypeLabel } from '../media/mediaDisplay';

const SectionMediaManager = ({
  sections = [],
  sectionMedia = {},
  isSaving = false,
  getSectionKey,
  getSectionDraft,
  updateSectionDraft,
  onSelectLibraryResource,
  onAddUrlResource,
  onUploadResource,
  onUpdateResource,
  onRemoveResource
}) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null);

  const openPicker = (sectionKey, sectionTitle, replaceResourceId = null) => {
    setPickerTarget({ sectionKey, sectionTitle, replaceResourceId });
    setShowPicker(true);
  };

  const handleSelectFromLibrary = async (media) => {
    if (!pickerTarget || !media) return;
    await onSelectLibraryResource?.({ ...pickerTarget, media });
    setShowPicker(false);
    setPickerTarget(null);
  };

  const closePicker = () => {
    setShowPicker(false);
    setPickerTarget(null);
  };

  const safeSelectedIndex = Math.min(selectedIndex, Math.max(sections.length - 1, 0));

  return (
    <>
      <div className="col-span-2 pt-4 mt-2 border-t border-zinc-100 dark:border-zinc-800">
        <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
          <SlidersHorizontal size={18} className="text-violet-500" /> Multimedia por Seccion
        </label>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="mb-4 text-xs font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
            Administra la multimedia asociada a Intro, Versos, Coros, Puentes, Interludios y demas secciones.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedIndex(prev => Math.min(prev, Math.max(sections.length - 1, 0)));
              setShowModal(true);
            }}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={sections.length === 0}
          >
            Administrar Multimedia
          </button>
          {sections.length === 0 && (
            <p className="mt-3 text-center text-[10px] font-bold text-zinc-400">No hay secciones detectadas en la letra.</p>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm animate-in fade-in">
          <div className="flex h-[80vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 md:w-[90vw]">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-black text-zinc-900 dark:text-white">
                  <SlidersHorizontal size={20} className="text-violet-500" /> Multimedia por Seccion
                </h3>
                <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Administra los recursos asociados a cada seccion detectada en la letra.
                </p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="rounded-2xl p-2 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
                <X size={22} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[18rem_1fr]">
              <aside className="min-h-0 overflow-y-auto border-b border-zinc-100 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/70 md:border-b-0 md:border-r">
                <div className="space-y-2">
                  {sections.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-zinc-200 bg-white p-4 text-center text-xs font-bold text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
                      No hay secciones detectadas.
                    </p>
                  ) : (
                    sections.map((section, index) => {
                      const sectionKey = getSectionKey(section, index);
                      const count = (sectionMedia[sectionKey] || []).length;
                      const selected = selectedIndex === index;

                      return (
                        <button
                          key={sectionKey}
                          type="button"
                          onClick={() => setSelectedIndex(index)}
                          className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                            selected
                              ? 'border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-500/40 dark:bg-violet-500/20 dark:text-violet-100'
                              : 'border-zinc-200 bg-white text-zinc-700 hover:border-violet-200 hover:bg-violet-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-violet-500/30 dark:hover:bg-violet-500/10'
                          }`}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-sm font-black">{section.titulo || `Seccion ${index + 1}`}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${selected ? 'bg-white/70 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                              {count > 0 ? `${count} recurso${count === 1 ? '' : 's'}` : 'Sin multimedia'}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              <section className="min-h-0 overflow-y-auto p-4">
                {sections.length > 0 && (() => {
                  const section = sections[safeSelectedIndex];
                  const sectionKey = getSectionKey(section, safeSelectedIndex);
                  const draft = getSectionDraft(sectionKey);
                  const resources = sectionMedia[sectionKey] || [];
                  const sectionTitle = section.titulo || `Seccion ${safeSelectedIndex + 1}`;

                  return (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-lg font-black text-zinc-900 dark:text-white">{sectionTitle}</p>
                          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">{resources.length} recursos asociados</p>
                        </div>
                        <span className="w-fit rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                          {sectionKey}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {resources.length === 0 && (
                          <p className="rounded-xl border border-dashed border-zinc-200 bg-white p-5 text-center text-xs font-medium text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
                            Sin multimedia asignada a esta seccion.
                          </p>
                        )}

                        {resources.map(resource => {
                          const isLibraryResource = resource.source === 'library' || Boolean(resource.mediaId);
                          const PreviewIcon = resource.type === 'image' ? ImageIcon : resource.type === 'video' ? Video : resource.type === 'pdf' ? FileIcon : LinkIcon;

                          return (
                            <div key={resource.id} className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="flex h-20 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 sm:w-28">
                                  {resource.type === 'image' && resource.url ? (
                                    <img src={resource.thumbnailUrl || resource.url} alt={resource.title || 'Recurso'} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                                  ) : resource.type === 'video' && resource.thumbnailUrl ? (
                                    <img src={resource.thumbnailUrl} alt={resource.title || 'Video'} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                                  ) : (
                                    <PreviewIcon size={28} />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-black text-zinc-900 dark:text-white">{resource.title || 'Recurso multimedia'}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider">
                                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                      {getMediaTypeLabel(resource.type)}
                                    </span>
                                    {isLibraryResource ? (
                                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-600 dark:text-emerald-300">
                                        Biblioteca
                                      </span>
                                    ) : (
                                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-600 dark:text-amber-300">
                                        URL directa
                                      </span>
                                    )}
                                    {isLibraryResource && (
                                      <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-violet-600 dark:text-violet-300">
                                        Usado {Number(resource.usageCount || 0)} veces
                                      </span>
                                    )}
                                  </div>
                                  {resource.url && (
                                    <p className="mt-2 truncate text-[11px] font-medium text-zinc-400">{resource.url}</p>
                                  )}
                                </div>

                                <div className="grid grid-cols-3 gap-2 sm:w-auto sm:grid-cols-1">
                                  <button
                                    type="button"
                                    onClick={() => resource.url && window.open(resource.url, '_blank', 'noopener,noreferrer')}
                                    className="rounded-xl border border-zinc-200 px-3 py-2 text-[10px] font-black uppercase text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                  >
                                    Vista previa
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openPicker(sectionKey, sectionTitle, resource.id)}
                                    className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-[10px] font-black uppercase text-violet-700 hover:bg-violet-500/20 dark:text-violet-300"
                                  >
                                    Cambiar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onRemoveResource?.(sectionKey, resource.id, sectionTitle)}
                                    className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase text-red-600 hover:bg-red-500/20 dark:text-red-300"
                                  >
                                    Quitar
                                  </button>
                                </div>
                              </div>

                              {!isLibraryResource && (
                                <div className="mt-3 grid grid-cols-1 gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800 sm:grid-cols-[1fr_110px_1fr]">
                                  <input
                                    type="text"
                                    value={resource.title || ''}
                                    onChange={e => onUpdateResource?.(sectionKey, resource.id, { title: e.target.value })}
                                    className="text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-violet-500 bg-white dark:bg-zinc-950 dark:text-white"
                                    placeholder="Titulo"
                                  />
                                  <select
                                    value={resource.type || 'link'}
                                    onChange={e => onUpdateResource?.(sectionKey, resource.id, { type: e.target.value })}
                                    className="text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-violet-500 bg-white dark:bg-zinc-950 dark:text-white"
                                  >
                                    <option value="image" className="bg-white dark:bg-zinc-900">Imagen</option>
                                    <option value="video" className="bg-white dark:bg-zinc-900">Video</option>
                                    <option value="audio" className="bg-white dark:bg-zinc-900">Audio</option>
                                    <option value="pdf" className="bg-white dark:bg-zinc-900">PDF</option>
                                    <option value="link" className="bg-white dark:bg-zinc-900">Link</option>
                                  </select>
                                  <input
                                    type="url"
                                    value={resource.url || ''}
                                    onChange={e => onUpdateResource?.(sectionKey, resource.id, { url: e.target.value })}
                                    className="text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-violet-500 bg-white dark:bg-zinc-950 dark:text-white"
                                    placeholder="URL"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3">
                        <button
                          type="button"
                          onClick={() => openPicker(sectionKey, sectionTitle)}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-violet-700"
                        >
                          <Library size={16} /> Biblioteca Multimedia
                        </button>
                        <p className="mt-2 text-center text-[10px] font-bold text-violet-700/80 dark:text-violet-200/80">
                          Usa recursos existentes sin volver a subir archivos.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-[1fr_110px_1fr_auto_auto]">
                        <input
                          type="text"
                          value={draft.title}
                          onChange={e => updateSectionDraft(sectionKey, { title: e.target.value })}
                          className="text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-violet-500 bg-white dark:bg-zinc-900 dark:text-white"
                          placeholder="Titulo del recurso"
                        />
                        <select
                          value={draft.type}
                          onChange={e => updateSectionDraft(sectionKey, { type: e.target.value })}
                          className="text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-violet-500 bg-white dark:bg-zinc-900 dark:text-white"
                        >
                          <option value="image" className="bg-white dark:bg-zinc-900">Imagen</option>
                          <option value="video" className="bg-white dark:bg-zinc-900">Video</option>
                          <option value="audio" className="bg-white dark:bg-zinc-900">Audio</option>
                          <option value="pdf" className="bg-white dark:bg-zinc-900">PDF</option>
                          <option value="link" className="bg-white dark:bg-zinc-900">Link</option>
                        </select>
                        <input
                          type="url"
                          value={draft.url}
                          onChange={e => updateSectionDraft(sectionKey, { url: e.target.value })}
                          className="text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-violet-500 bg-white dark:bg-zinc-900 dark:text-white"
                          placeholder="Pegar URL"
                        />
                        <button type="button" onClick={() => onAddUrlResource?.(sectionKey, sectionTitle)} disabled={isSaving} className="text-xs font-bold bg-zinc-800 dark:bg-zinc-700 text-white px-3 py-2 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors disabled:opacity-50">
                          Agregar
                        </button>
                        <label className="text-xs font-bold bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 px-3 py-2 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-500/30 transition-colors flex justify-center items-center gap-2 cursor-pointer">
                          <Upload size={14} /> Subir
                          <input
                            type="file"
                            accept="image/*,video/*,audio/*,application/pdf"
                            className="hidden"
                            disabled={isSaving}
                            onChange={e => {
                              onUploadResource?.(sectionKey, e.target.files?.[0], sectionTitle);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })()}
              </section>
            </div>
          </div>
        </div>
      )}

      <MediaPicker
        open={showPicker}
        onClose={closePicker}
        onSelect={handleSelectFromLibrary}
        title="Seleccionar desde Biblioteca"
        context="multimedia-por-seccion"
        acceptedTypes={['image', 'video', 'audio', 'pdf', 'link']}
      />
    </>
  );
};

export default SectionMediaManager;

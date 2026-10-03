import fs from 'node:fs';

const filePath = 'src/components/live/ProyectorController.jsx';
if (!fs.existsSync(filePath)) throw new Error('No existe ProyectorController.jsx.');

const raw = fs.readFileSync(filePath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');
const original = source;

const replaceExact = (before, after, label) => {
  if (source.includes(after)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return;
  }
  if (!source.includes(before)) throw new Error(`No se encontró el bloque para ${label}.`);
  source = source.replace(before, after);
  console.log(`[ok] ${label}`);
};

// 1) El botón "Subir Medios" de la Bóveda NO debe abrir el modal de Fondo.
// Ese modal usa applyAsBackground:true y por diseño puede cambiar proyectorFondo/fondoUrl de canción.
const unsafeVaultUpload = `                  <button onClick={() => setShowFondosModal(true)} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Upload size={12}/> Subir Medios</button>`;
const safeVaultUpload = `                  {/* KADOSH_SAFE_VAULT_UPLOAD_V1: subir a Bóveda nunca modifica fondo de canción/proyección */}\n                  <label className={\`text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer \${isUploadingFondo || !canUploadMedia ? 'opacity-50 pointer-events-none' : ''}\`}>\n                    <Upload size={12}/> Subir Medios\n                    <input\n                      type="file"\n                      accept="video/mp4, video/webm, image/jpeg, image/png, image/gif"\n                      className="hidden"\n                      disabled={isUploadingFondo || !canUploadMedia}\n                      onChange={(event) => handleUploadBackground(event, { applyAsBackground: false })}\n                    />\n                  </label>`;
replaceExact(unsafeVaultUpload, safeVaultUpload, 'Subir Medios aislado de fondos de canción/proyección');

// 2) Controles independientes por salida. mediaActive solo representa el medio enrutado más reciente,
// por eso dos videos distintos en dos pantallas no podían controlarse individualmente.
const controlsAnchor = `  const renderMediaStopActions = () => (`;
const controlsMarker = 'KADOSH_MEDIA_PER_OUTPUT_CONTROLS_V1';
if (source.includes(controlsMarker)) {
  console.log('[skip] controles por pantalla: ya aplicados.');
} else {
  if (!source.includes(controlsAnchor)) throw new Error('No se encontró el ancla de controles Multimedia.');
  const controlsBlock = `  // KADOSH_MEDIA_PER_OUTPUT_CONTROLS_V1\n  const MEDIA_OUTPUT_CONTROL_META = {\n    projector: { label: 'Proyector', Icon: Monitor, audible: true },\n    singers: { label: 'Cantantes', Icon: Type, audible: false },\n    musicians: { label: 'Músicos', Icon: Music, audible: false },\n  };\n\n  const getActiveRoutedMediaOutputs = () => {\n    const outputs = evento?.mediaOutputs && typeof evento.mediaOutputs === 'object' ? evento.mediaOutputs : {};\n    return ['projector', 'singers', 'musicians']\n      .map((targetId) => ({ targetId, state: outputs[targetId] }))\n      .filter(({ state }) => state?.active && state?.url);\n  };\n\n  const updateMediaOutputTarget = async (targetId, mutate) => {\n    if (!canProjectMedia) {\n      notify('No tienes permiso para controlar Multimedia.', { type: 'error' });\n      return false;\n    }\n    try {\n      let changed = false;\n      await runTransaction(db, async (transaction) => {\n        const eventRef = doc(db, 'eventos', eventoId);\n        const snapshot = await transaction.get(eventRef);\n        if (!snapshot.exists()) throw new Error('El evento ya no existe.');\n        const outputs = snapshot.data()?.mediaOutputs;\n        if (!outputs || typeof outputs !== 'object') return;\n        const existing = outputs[targetId];\n        if (!existing?.active || !existing?.url) return;\n\n        const now = Date.now();\n        const nextOutputs = { ...outputs };\n        const nextState = mutate(existing, now);\n        if (nextState == null) delete nextOutputs[targetId];\n        else nextOutputs[targetId] = {\n          ...nextState,\n          updatedAt: now,\n          updatedBy: user?.nombre || user?.email || 'Multimedia',\n        };\n        transaction.update(eventRef, { mediaOutputs: nextOutputs });\n        changed = true;\n      });\n      return changed;\n    } catch (error) {\n      console.error('Error controlando salida Multimedia:', error);\n      notify('No se pudo controlar esa salida Multimedia.', { type: 'error' });\n      return false;\n    }\n  };\n\n  const controlMediaOutputTarget = (targetId, updates) => updateMediaOutputTarget(\n    targetId,\n    (existing) => ({ ...existing, ...updates })\n  );\n\n  const seekMediaOutputTarget = (targetId, type) => updateMediaOutputTarget(\n    targetId,\n    (existing) => ({\n      ...existing,\n      seekRequest: { type, time: Date.now() },\n    })\n  );\n\n  const stopMediaOutputTarget = (targetId) => updateMediaOutputTarget(targetId, () => null);\n\n  const renderMediaOutputControls = ({ compact = false } = {}) => {\n    const activeOutputs = getActiveRoutedMediaOutputs();\n    if (!activeOutputs.length) return null;\n\n    return (\n      <div className={compact ? 'rounded-2xl border border-violet-400/15 bg-violet-500/5 p-2.5' : 'rounded-2xl border border-violet-400/20 bg-violet-500/8 p-3'}>\n        <div className="mb-2 flex items-center justify-between gap-2">\n          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-200">Control por pantalla</p>\n          <span className="text-[9px] font-bold text-zinc-500">{activeOutputs.length} salida{activeOutputs.length === 1 ? '' : 's'} activa{activeOutputs.length === 1 ? '' : 's'}</span>\n        </div>\n        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">\n          {activeOutputs.map(({ targetId, state }) => {\n            const meta = MEDIA_OUTPUT_CONTROL_META[targetId];\n            const Icon = meta.Icon;\n            const isVideo = state.type === 'video' || isVideoMediaUrl(state.url);\n            const isPlaying = state.playing !== false;\n            const volume = Number.isFinite(Number(state.volume)) ? Math.max(0, Math.min(1, Number(state.volume))) : 1;\n            return (\n              <div key={targetId} className="rounded-xl border border-white/10 bg-black/35 p-2.5">\n                <div className="flex items-center justify-between gap-2">\n                  <div className="min-w-0 flex items-center gap-2">\n                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200"><Icon size={13}/></span>\n                    <div className="min-w-0">\n                      <p className="text-[9px] font-black uppercase tracking-wide text-white">{meta.label}</p>\n                      <p className="truncate text-[9px] font-bold text-zinc-500">{state.name || 'Multimedia'}</p>\n                    </div>\n                  </div>\n                  <button type="button" onClick={() => stopMediaOutputTarget(targetId)} className="rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-1.5 text-[8px] font-black uppercase text-red-200">Retirar</button>\n                </div>\n\n                {isVideo && (\n                  <>\n                    <div className="mt-2 grid grid-cols-4 gap-1.5">\n                      <button type="button" onClick={() => seekMediaOutputTarget(targetId, 'start')} className="min-h-9 rounded-lg border border-white/10 bg-white/5 text-zinc-300" title="Reiniciar"><RotateCcw size={14} className="mx-auto"/></button>\n                      <button type="button" onClick={() => seekMediaOutputTarget(targetId, 'back10')} className="min-h-9 rounded-lg border border-white/10 bg-white/5 text-zinc-300" title="-10 segundos"><Rewind size={14} className="mx-auto"/></button>\n                      <button type="button" onClick={() => controlMediaOutputTarget(targetId, { playing: !isPlaying })} className="min-h-9 rounded-lg bg-white text-zinc-950" title={isPlaying ? 'Pausar' : 'Reproducir'}>{isPlaying ? <Pause size={15} className="mx-auto" fill="currentColor"/> : <Play size={15} className="mx-auto" fill="currentColor"/>}</button>\n                      <button type="button" onClick={() => seekMediaOutputTarget(targetId, 'fwd10')} className="min-h-9 rounded-lg border border-white/10 bg-white/5 text-zinc-300" title="+10 segundos"><FastForward size={14} className="mx-auto"/></button>\n                    </div>\n                    {meta.audible ? (\n                      <label className="mt-2 flex items-center gap-2 text-[8px] font-black uppercase text-zinc-500">\n                        <Volume2 size={12}/>\n                        <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => controlMediaOutputTarget(targetId, { volume: Number(event.target.value) })} className="min-w-0 flex-1 accent-violet-500"/>\n                        <span className="w-7 text-right">{Math.round(volume * 100)}%</span>\n                      </label>\n                    ) : (\n                      <p className="mt-2 text-[8px] font-bold uppercase tracking-wide text-zinc-600">Audio silenciado en retornos</p>\n                    )}\n                  </>\n                )}\n              </div>\n            );\n          })}\n        </div>\n      </div>\n    );\n  };\n\n`;
  source = source.replace(controlsAnchor, controlsBlock + controlsAnchor);
  console.log('[ok] controles independientes por Proyector/Cantantes/Músicos');
}

// Desktop: mostrar los controles por salida dentro del bloque de Multimedia sin reemplazar el transporte legacy.
const desktopBefore = `                  {renderMediaStopActions()}\n                </div>\n              )}\n              {projectionSourceMode === 'bible' && (`;
const desktopAfter = `                  {renderMediaStopActions()}\n                  {renderMediaOutputControls({ compact: true })}\n                </div>\n              )}\n              {projectionSourceMode === 'bible' && (`;
if (source.includes(desktopAfter)) console.log('[skip] controles por salida en desktop: ya aplicados.');
else if (source.includes(desktopBefore)) {
  source = source.replace(desktopBefore, desktopAfter);
  console.log('[ok] controles por salida visibles en desktop');
} else {
  throw new Error('No se encontró el bloque Multimedia desktop para insertar controles por salida.');
}

// Mobile/tablet: el mismo control independiente aparece arriba del transporte existente.
const mobileBefore = `            {/* KADOSH_MOBILE_MEDIA_CONTROL_MAIN_V3 */}\n            {renderMobileMediaTransportV3()}`;
const mobileAfter = `            {/* KADOSH_MOBILE_MEDIA_CONTROL_MAIN_V3 */}\n            {renderMediaOutputControls({ compact: true })}\n            {renderMobileMediaTransportV3()}`;
if (source.includes(mobileAfter)) console.log('[skip] controles por salida en móvil: ya aplicados.');
else if (source.includes(mobileBefore)) {
  source = source.replace(mobileBefore, mobileAfter);
  console.log('[ok] controles por salida visibles en móvil/tablet');
} else {
  console.log('[skip] bloque móvil principal no encontrado; desktop queda protegido.');
}

if (!source.includes('KADOSH_SAFE_VAULT_UPLOAD_V1')) throw new Error('Validación falló: subida segura no aplicada.');
if (!source.includes('KADOSH_MEDIA_PER_OUTPUT_CONTROLS_V1')) throw new Error('Validación falló: controles independientes no aplicados.');
if (source.includes(unsafeVaultUpload)) throw new Error('Validación falló: Subir Medios todavía abre el modal de Fondo.');

try {
  fs.writeFileSync(filePath, source.replace(/\n/g, eol), 'utf8');
  console.log('Fix aplicado: subir a Bóveda ya no toca fondos y cada salida Multimedia tiene su propio control.');
} catch (error) {
  fs.writeFileSync(filePath, original.replace(/\n/g, eol), 'utf8');
  throw error;
}

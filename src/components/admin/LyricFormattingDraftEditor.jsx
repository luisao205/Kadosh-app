import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RotateCcw, Sparkles } from 'lucide-react';
import { resolveLyricFormatting } from '../../utils/lyricFormatting';
import { buildLyricFormattingDraftModel, createLyricFormattingDraft, serializeLyricFormattingIdentities } from '../../utils/lyricFormattingDraft';

const TEMPLATE_OPTIONS = [
  ['single-emphasis', 'Énfasis principal'],
  ['double-emphasis', 'Énfasis doble'],
  ['alternating-lines', 'Líneas alternadas'],
];
const SCALE_OPTIONS = ['xs', 'sm', 'md', 'lg', 'xl'];
const COLOR_OPTIONS = ['default', 'primary', 'secondary', 'accent', 'muted'];
const SPACING_OPTIONS = ['compact', 'normal', 'relaxed'];

const runClassName = (style = {}) => [
  style.bold ? 'font-black' : 'font-medium',
  style.transform === 'uppercase' ? 'uppercase' : '',
  { xs: 'text-sm', sm: 'text-base', md: 'text-xl', lg: 'text-3xl', xl: 'text-5xl' }[style.scale] || 'text-xl',
  { default: 'text-white', primary: 'text-violet-200', secondary: 'text-zinc-300', accent: 'text-amber-300', muted: 'text-zinc-500' }[style.color] || 'text-white',
  { compact: 'tracking-normal', normal: 'tracking-wide', relaxed: 'tracking-widest' }[style.spacing] || '',
].filter(Boolean).join(' ');

const LyricFormattingDraftEditor = ({
  lyricsRaw,
  sections,
  projectionStyle,
  initialFormatting = null,
  formattingStatus = 'absent',
  saveStatus = 'idle',
  saveMessage = '',
  onDraftChange,
}) => {
  const [identityState, setIdentityState] = useState(() => (
    initialFormatting?.identities
      || serializeLyricFormattingIdentities(buildLyricFormattingDraftModel(sections))
  ));
  const [manualRemaps, setManualRemaps] = useState({});
  const model = useMemo(() => buildLyricFormattingDraftModel(sections, { identities: identityState, manualRemaps }), [identityState, manualRemaps, sections]);
  const [sectionId, setSectionId] = useState('');
  const [slideId, setSlideId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [scopeType, setScopeType] = useState('slide');
  const [templateId, setTemplateId] = useState('');
  const [selectedLineIds, setSelectedLineIds] = useState([]);
  const [manualStyles, setManualStyles] = useState({});
  const [draftSidecar, setDraftSidecar] = useState(initialFormatting);

  useEffect(() => {
    onDraftChange?.(draftSidecar);
  }, [draftSidecar, onDraftChange]);

  if (!model.some((item) => item.ambiguous || item.slides.some((candidate) => candidate.ambiguous))) {
    const next = serializeLyricFormattingIdentities(model);
    if (JSON.stringify(next) !== JSON.stringify(identityState)) setIdentityState(next);
  }

  const effectiveSectionId = model.some((item) => item.id === sectionId) ? sectionId : (model[0]?.id || '');
  const section = model.find((item) => item.id === effectiveSectionId) || null;
  const effectiveSlideId = section?.slides.some((item) => item.id === slideId) ? slideId : (section?.slides[0]?.id || '');
  const slide = section?.slides.find((item) => item.id === effectiveSlideId) || null;

  const resetSelection = () => {
    setEnabled(false);
    setTemplateId('');
    setSelectedLineIds([]);
    setManualStyles({});
  };
  const resetDraft = () => {
    resetSelection();
    setDraftSidecar(initialFormatting);
  };

  const changeSection = (nextId) => {
    setSectionId(nextId);
    setSlideId('');
    resetSelection();
  };
  const changeSlide = (nextId) => {
    setSlideId(nextId);
    resetSelection();
  };
  const toggleLine = (lineId) => {
    setSelectedLineIds((current) => current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId]);
  };
  const patchLineStyle = (lineId, patch) => {
    setManualStyles((current) => ({ ...current, [lineId]: { ...(current[lineId] || {}), ...patch } }));
  };

  const unsafeIdentity = Boolean(section?.ambiguous || slide?.ambiguous);
  const candidateSidecar = useMemo(() => {
    if (!enabled || !section || !slide || unsafeIdentity || !selectedLineIds.length) return null;
    try {
      return createLyricFormattingDraft({
        lyricsRaw,
        identities: serializeLyricFormattingIdentities(model),
        blocks: draftSidecar?.blocks || [],
        section,
        slide,
        scopeType,
        templateId,
        selectedLineIds,
        manualStyles,
      });
    } catch {
      return null;
    }
  }, [draftSidecar, enabled, lyricsRaw, manualStyles, model, scopeType, section, selectedLineIds, slide, templateId, unsafeIdentity]);
  const draftResult = useMemo(() => {
    if (!section || !slide || !(candidateSidecar || draftSidecar)) return null;
    return resolveLyricFormatting({
      lyricsRaw,
      text: slide.text,
      sectionText: section.text,
      sectionId: section.id,
      slideId: slide.id,
      lyricFormatting: candidateSidecar || draftSidecar,
      generalStyle: projectionStyle,
    });
  }, [candidateSidecar, draftSidecar, lyricsRaw, projectionStyle, section, slide]);
  const restoreCurrentSlide = () => {
    if (!draftSidecar || !slide) return;
    setDraftSidecar({ ...draftSidecar, blocks: draftSidecar.blocks.filter((block) => block.scope.slideId !== slide.id) });
    resetSelection();
  };

  if (!model.length) return null;

  return (
    <section className="col-span-2 border-t border-zinc-200 pt-5 dark:border-zinc-800" aria-label="Borrador de formato especial">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Sparkles size={17} className="text-violet-500" /><h3 className="text-sm font-black text-zinc-900 dark:text-white">Formato especial de letras</h3></div>
          <p className="mt-1 text-xs text-zinc-500">Los cambios se guardan junto con la canción tras confirmación del servidor.</p>
          <p className={`mt-1 text-xs font-bold ${saveStatus === 'error' || saveStatus === 'conflict' ? 'text-amber-600' : saveStatus === 'saved' ? 'text-emerald-600' : 'text-zinc-500'}`} role="status">
            {saveMessage || (saveStatus === 'dirty' ? 'Cambios de formato sin guardar.' : saveStatus === 'saving' ? 'Guardando formato...' : saveStatus === 'saved' ? 'Formato guardado.' : '')}
          </p>
        </div>
        <button type="button" onClick={resetDraft} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 text-xs font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"><RotateCcw size={14} /> Restablecer borrador</button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Sección
              <select value={section?.id || ''} onChange={(event) => changeSection(event.target.value)} className="kp-input mt-1 w-full rounded-md p-2 text-sm">
                {model.map((item, index) => <option key={item.id} value={item.id}>{item.title} · sección {index + 1}{item.ambiguous ? ' (identidad ambigua)' : ''}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Diapositiva
              <select value={slide?.id || ''} onChange={(event) => changeSlide(event.target.value)} className="kp-input mt-1 w-full rounded-md p-2 text-sm">
                {section?.slides.map((item, index) => <option key={item.id} value={item.id}>Diapositiva {index + 1}{item.ambiguous ? ' (ambigua)' : ''}</option>)}
              </select>
            </label>
          </div>

          {formattingStatus !== 'absent' && formattingStatus !== 'valid' && <div role="alert" className="flex gap-2 rounded-md border border-amber-400/50 bg-amber-500/10 p-3 text-xs font-bold text-amber-800 dark:text-amber-200"><AlertTriangle size={16} className="shrink-0" />El formato almacenado está {formattingStatus === 'legacy-unsupported' ? 'en una versión incompatible' : formattingStatus === 'stale' ? 'pendiente de reconciliación' : 'inválido'}. No se reemplazará automáticamente.</div>}
          {unsafeIdentity && <div role="alert" className="flex gap-2 rounded-md border border-amber-400/50 bg-amber-500/10 p-3 text-xs font-bold text-amber-800 dark:text-amber-200"><AlertTriangle size={16} className="shrink-0" />Esta selección no tiene una identidad única. El formato permanece desactivado.</div>}
          {section?.ambiguous && <label className="block text-xs font-bold text-amber-800 dark:text-amber-200">Remapear esta sección
            <select
              value=""
              onChange={(event) => setManualRemaps((current) => ({ ...current, [`section:${model.indexOf(section)}`]: event.target.value }))}
              className="kp-input mt-1 w-full rounded-md p-2 text-sm"
            >
              <option value="">Seleccionar identidad anterior...</option>
              {identityState.sections.filter((item) => item.titleFingerprint === section.titleFingerprint).map((item, index) => <option key={item.id} value={item.id}>Identidad anterior {index + 1}</option>)}
            </select>
          </label>}
          {slide?.ambiguous && <label className="block text-xs font-bold text-amber-800 dark:text-amber-200">Remapear esta diapositiva
            <select
              value=""
              onChange={(event) => setManualRemaps((current) => ({ ...current, [`slide:${model.indexOf(section)}:${section.slides.indexOf(slide)}`]: event.target.value }))}
              className="kp-input mt-1 w-full rounded-md p-2 text-sm"
            >
              <option value="">Seleccionar identidad anterior...</option>
              {(identityState.sections.find((item) => item.id === section.id)?.slides || []).map((item, index) => <option key={item.id} value={item.id}>Identidad anterior {index + 1}</option>)}
            </select>
          </label>}

          <label className="flex min-h-11 items-center gap-3 rounded-md border border-zinc-200 px-3 text-sm font-bold dark:border-zinc-800">
            <input type="checkbox" checked={enabled} disabled={unsafeIdentity || !['absent', 'valid'].includes(formattingStatus)} onChange={(event) => setEnabled(event.target.checked)} /> Activar formato solo para esta selección
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Alcance
              <select value={scopeType} disabled={!enabled} onChange={(event) => setScopeType(event.target.value)} className="kp-input mt-1 w-full rounded-md p-2 text-sm">
                <option value="slide">Solo esta diapositiva</option>
                <option value="section">Sección lógica</option>
              </select>
            </label>
            <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Plantilla
              <select value={templateId} disabled={!enabled} onChange={(event) => setTemplateId(event.target.value)} className="kp-input mt-1 w-full rounded-md p-2 text-sm">
                <option value="">Sin plantilla</option>
                {TEMPLATE_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
          </div>

          <fieldset disabled={!enabled} className="space-y-2">
            <legend className="mb-2 text-xs font-black uppercase text-zinc-500">Frases seleccionadas</legend>
            {slide?.lines.map((line) => {
              const selected = selectedLineIds.includes(line.id);
              const lineStyle = manualStyles[line.id] || {};
              return <div key={line.id} className={`rounded-md border p-3 ${selected ? 'border-violet-400 bg-violet-500/10' : 'border-zinc-200 dark:border-zinc-800'}`}>
                <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" className="mt-1" checked={selected} onChange={() => toggleLine(line.id)} /><span>{line.text}</span></label>
                {selected && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <label className="flex min-h-9 items-center gap-2 text-xs font-bold"><input type="checkbox" checked={lineStyle.bold === true} onChange={(event) => patchLineStyle(line.id, { bold: event.target.checked })} /> Negrita</label>
                  <label className="flex min-h-9 items-center gap-2 text-xs font-bold"><input type="checkbox" checked={lineStyle.transform === 'uppercase'} onChange={(event) => patchLineStyle(line.id, { transform: event.target.checked ? 'uppercase' : 'none' })} /> Mayúsculas</label>
                  <select aria-label={`Tamaño de ${line.text}`} value={lineStyle.scale || 'md'} onChange={(event) => patchLineStyle(line.id, { scale: event.target.value })} className="kp-input rounded-md p-2 text-xs">{SCALE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select>
                  <select aria-label={`Color de ${line.text}`} value={lineStyle.color || 'default'} onChange={(event) => patchLineStyle(line.id, { color: event.target.value })} className="kp-input rounded-md p-2 text-xs">{COLOR_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select>
                  <select aria-label={`Espaciado de ${line.text}`} value={lineStyle.spacing || 'normal'} onChange={(event) => patchLineStyle(line.id, { spacing: event.target.value })} className="kp-input rounded-md p-2 text-xs">{SPACING_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select>
                </div>}
              </div>;
            })}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!candidateSidecar} onClick={() => { setDraftSidecar(candidateSidecar); resetSelection(); }} className="min-h-10 rounded-md bg-violet-600 px-3 text-xs font-black text-white disabled:opacity-40">Aplicar al borrador</button>
            <button type="button" disabled={!draftSidecar?.blocks.some((block) => block.scope.slideId === slide?.id)} onClick={restoreCurrentSlide} className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-black disabled:opacity-40 dark:border-zinc-700">Restaurar esta diapositiva</button>
          </div>
        </div>

        <div className="min-h-72 overflow-hidden rounded-md border border-white/10 bg-zinc-950 p-5 text-white">
          <div className="mb-4 flex items-center justify-between text-[10px] font-black uppercase text-zinc-500"><span>Vista previa local</span><span>{draftResult?.status || 'normal'}</span></div>
          <div className="flex min-h-56 items-center justify-center text-center">
            <p className="whitespace-pre-wrap leading-relaxed">
              {(draftResult?.runs || [{ text: slide?.text || '', style: {} }]).map((run, index) => <span key={`${index}-${run.text}`} className={runClassName(run.style)}>{run.text}</span>)}
            </p>
          </div>
          <p className="mt-4 text-center text-[10px] font-bold text-zinc-500">Preset {projectionStyle?.preset || 'clean'} · Movimiento {projectionStyle?.motion || 'soft'} preservados</p>
        </div>
      </div>
    </section>
  );
};

export default LyricFormattingDraftEditor;

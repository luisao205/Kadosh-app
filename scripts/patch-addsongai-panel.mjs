import fs from 'node:fs';

let content = fs.readFileSync('src/components/admin/AddSongAI.jsx', 'utf8');

// 1. Add Sparkles and DEFAULT_PROJECTION_STYLE import
if (!content.includes('DEFAULT_PROJECTION_STYLE')) {
  content = content.replace("import SongResourcesPanel from './SongResourcesPanel';",
    "import SongResourcesPanel from './SongResourcesPanel';\nimport { DEFAULT_PROJECTION_STYLE } from '../../utils/projectionStyle';");
}

if (!content.includes('Sparkles')) {
  content = content.replace("import { Search, Sparkles as SparklesIcon", "import { Search, Sparkles");
  if (!content.includes('Sparkles')) {
    content = content.replace("import { Search,", "import { Search, Sparkles,");
  }
}

// 2. Add projectionStyle state & draft preloading on mount
const stateHook = `  const [projectionStyle, setProjectionStyle] = useState(DEFAULT_PROJECTION_STYLE);

  // Cargar borrador de KADOSH Music AI si proviene de la transferencia
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('kadosh_music_ai_draft');
      if (stored) {
        sessionStorage.removeItem('kadosh_music_ai_draft');
        const draft = JSON.parse(stored);
        if (draft.titulo) setTitulo(draft.titulo);
        if (draft.artista) setArtista(draft.artista);
        if (draft.tono) setTono(normalizeKey(draft.tono));
        if (draft.bpm) setBpm(draft.bpm);
        if (draft.letraRaw) setLetraGenerada(draft.letraRaw);
        if (draft.youtubeUrl) setYoutubeUrl(draft.youtubeUrl);
        if (draft.projectionStyle) setProjectionStyle(draft.projectionStyle);
        notify('Borrador de KADOSH Music AI cargado en el editor. Revisa los datos antes de guardar.', { type: 'info', duration: 6000 });
      }
    } catch (e) {
      console.warn('No se pudo cargar el borrador de Music AI:', e);
    }
  }, []);
`;

if (!content.includes('projectionStyle, setProjectionStyle')) {
  content = content.replace('  const [busqueda, setBusqueda] = useState(\'\');', `${stateHook}\n  const [busqueda, setBusqueda] = useState('');`);
}

// 3. Save projectionStyle in addDoc
if (!content.includes('projectionStyle: projectionStyle || DEFAULT_PROJECTION_STYLE')) {
  content = content.replace('        recursos: recursos || [],', '        recursos: recursos || [],\n        projectionStyle: projectionStyle || DEFAULT_PROJECTION_STYLE,');
}

// 4. Add "Preparar con Music AI" button in AddSongAI header
const musicAIButton = `            <button
              type="button"
              onClick={() => navigate('/music-ai')}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3.5 py-2 text-xs font-black uppercase text-violet-300 hover:bg-violet-500/20 transition-colors shadow-sm"
              title="Abrir KADOSH Music AI para estructurar letras y acordes con Gemini"
            >
              <Sparkles size={14} className="text-violet-400" />
              <span>Preparar con Music AI</span>
            </button>
`;

if (!content.includes('Preparar con Music AI')) {
  content = content.replace('<div className="flex items-center justify-between mb-4">', `<div className="flex items-center justify-between mb-4">\n${musicAIButton}`);
}

// 5. Update SongResourcesPanel call with projectionStyle
const oldPanelCall = `              <SongResourcesPanel
                fondoUrl={fondoUrl}
                onFondoUrlChange={handleFondoUrlChange}
                onUploadFondo={handleUploadFondo}
                isUploadingFondo={isUploadingFondo}
                audioFile={audioFile}
                onAudioFileChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                youtubeUrl={youtubeUrl}
                onYoutubeUrlChange={setYoutubeUrl}
                multitracks={multitracks}
                nombreStem={nombreStem}
                onNombreStemChange={setNombreStem}
                customStemName={customStemName}
                onCustomStemNameChange={setCustomStemName}
                onUploadStem={handleUploadStem}
                onRemoveStem={removeStem}
                recursos={recursos}
                nuevoRecurso={nuevoRecurso}
                onNuevoRecursoChange={setNuevoRecurso}
                onAddRecurso={handleAddRecurso}
                onUploadPDF={handleUploadPDF}
                onRemoveRecurso={removeRecurso}
                isSaving={isSaving}
              />`;

const newPanelCall = `              <SongResourcesPanel
                fondoUrl={fondoUrl}
                onFondoUrlChange={handleFondoUrlChange}
                onUploadFondo={handleUploadFondo}
                isUploadingFondo={isUploadingFondo}
                projectionStyle={projectionStyle}
                onProjectionStyleChange={setProjectionStyle}
                canEditProjectionStyle={true}
                canEditFormatting={false}
                audioFile={audioFile}
                onAudioFileChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                youtubeUrl={youtubeUrl}
                onYoutubeUrlChange={setYoutubeUrl}
                multitracks={multitracks}
                nombreStem={nombreStem}
                onNombreStemChange={setNombreStem}
                customStemName={customStemName}
                onCustomStemNameChange={setCustomStemName}
                onUploadStem={handleUploadStem}
                onRemoveStem={removeStem}
                recursos={recursos}
                nuevoRecurso={nuevoRecurso}
                onNuevoRecursoChange={setNuevoRecurso}
                onAddRecurso={handleAddRecurso}
                onUploadPDF={handleUploadPDF}
                onRemoveRecurso={removeRecurso}
                isSaving={isSaving}
              />`;

const normContent = content.replace(/\r\n/g, '\n');
const normOld = oldPanelCall.replace(/\r\n/g, '\n');

if (normContent.includes(normOld)) {
  const updated = normContent.replace(normOld, newPanelCall);
  fs.writeFileSync('src/components/admin/AddSongAI.jsx', updated.replace(/\n/g, '\r\n'), 'utf8');
  console.log('✓ Successfully patched AddSongAI.jsx with projectionStyle & Music AI hand-off');
} else {
  console.error('Could not find old SongResourcesPanel call in AddSongAI.jsx');
}

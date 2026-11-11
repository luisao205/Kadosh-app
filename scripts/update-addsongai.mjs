import fs from 'node:fs';

let code = fs.readFileSync('src/components/admin/AddSongAI.jsx', 'utf8');

// 1. Import SongResourcesPanel
if (!code.includes('SongResourcesPanel')) {
  code = code.replace(
    "import { useFeedback } from '../ui/FeedbackProvider';",
    "import { useFeedback } from '../ui/FeedbackProvider';\nimport SongResourcesPanel from './SongResourcesPanel';"
  );
}

// 2. Add states
const stateMarker = "const [isUploadingFondo, setIsUploadingFondo] = useState(false);";
const newStates = `const [isUploadingFondo, setIsUploadingFondo] = useState(false);
  const [multitracks, setMultitracks] = useState([]);
  const [nombreStem, setNombreStem] = useState('Click');
  const [customStemName, setCustomStemName] = useState('');
  const [recursos, setRecursos] = useState([]);
  const [nuevoRecurso, setNuevoRecurso] = useState({ titulo: '', url: '', tipo: 'youtube', instrumento: 'General' });`;
if (!code.includes('const [multitracks, setMultitracks]')) {
  code = code.replace(stateMarker, newStates);
}

// 3. Add handlers
const handlerMarker = "  const handleFondoUrlChange = (value) => {";
const newHandlers = `  const handleUploadStem = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const finalStemName = nombreStem === 'Otro' ? customStemName.trim() : nombreStem;
    if (!finalStemName || finalStemName === 'Otro') {
      showToast('Por favor, ingresa un nombre para la pista.', 'error');
      return;
    }
    showToast(\`Subiendo pista: \${finalStemName}...\`, 'info');
    setIsSaving(true);
    try {
      const storage = getStorage();
      const stemRef = ref(storage, \`multitracks/\${Date.now()}_\${file.name}\`);
      await uploadBytes(stemRef, file);
      const url = await getDownloadURL(stemRef);
      setMultitracks((prev) => [...prev, { id: Date.now().toString(), nombre: finalStemName, url, fileName: file.name }]);
      showToast(\`¡Pista de \${finalStemName} subida!\`, 'success');
      setCustomStemName('');
      setNombreStem('Click');
    } catch (err) {
      showToast('Error al subir la pista.', 'error');
    } finally {
      setIsSaving(false);
      e.target.value = '';
    }
  };

  const removeStem = (id) => {
    setMultitracks((prev) => prev.filter((m) => m.id !== id));
  };

  const handleAddRecurso = () => {
    if (!nuevoRecurso.titulo || !nuevoRecurso.url) {
      showToast('Título y URL son obligatorios para el recurso.', 'warning');
      return;
    }
    setRecursos((prev) => [...prev, { ...nuevoRecurso, id: Date.now().toString() }]);
    setNuevoRecurso({ titulo: '', url: '', tipo: 'youtube', instrumento: 'General' });
    showToast('Recurso añadido a la lista.', 'success');
  };

  const handleUploadPDF = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showToast('Subiendo PDF...', 'info');
    setIsSaving(true);
    try {
      const storage = getStorage();
      const pdfRef = ref(storage, \`partituras/\${Date.now()}_\${file.name}\`);
      await uploadBytes(pdfRef, file);
      const url = await getDownloadURL(pdfRef);
      setRecursos((prev) => [...prev, { id: Date.now().toString(), tipo: 'pdf', url, titulo: file.name, instrumento: 'General' }]);
      showToast('¡PDF adjuntado exitosamente!', 'success');
    } catch (err) {
      showToast('Error al subir el PDF.', 'error');
    } finally {
      setIsSaving(false);
      e.target.value = '';
    }
  };

  const removeRecurso = (id) => {
    setRecursos((prev) => prev.filter((r) => r.id !== id));
  };

  const handleFondoUrlChange = (value) => {`;
if (!code.includes('const handleUploadStem =')) {
  code = code.replace(handlerMarker, newHandlers);
}

// 4. Update save payload
const saveMarker = "fondoMediaId: fondoMediaId || null,";
const newSave = `fondoMediaId: fondoMediaId || null,
        multitracks: multitracks || [],
        recursos: recursos || [],`;
if (!code.includes('multitracks: multitracks || []')) {
  code = code.replace(saveMarker, newSave);
}

// 5. Update reset form
const resetMarker = "setFondoUrl(''); setFondoMediaId('');";
const newReset = "setFondoUrl(''); setFondoMediaId(''); setMultitracks([]); setRecursos([]);";
if (!code.includes('setMultitracks([]); setRecursos([]);')) {
  code = code.replace(resetMarker, newReset);
}

// 6. Replace old JSX blocks
const startTag = '<div className="col-span-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-2">\r\n                 <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Pista o Secuencia de Audio (MP3)</label>';
const startTagLF = '<div className="col-span-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-2">\n                 <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Pista o Secuencia de Audio (MP3)</label>';

const startIdx = code.indexOf('<div className="col-span-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-2">\n                 <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Pista o Secuencia de Audio (MP3)</label>') !== -1
  ? code.indexOf('<div className="col-span-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-2">\n                 <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Pista o Secuencia de Audio (MP3)</label>')
  : code.indexOf('<div className="col-span-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-2">\r\n                 <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Pista o Secuencia de Audio (MP3)</label>');

console.log('startIdx:', startIdx);
const endMarker = 'Recomendado: video MP4/WebM corto en loop. Tambien acepta GIF o imagen.</p>';
const endIdx = code.indexOf(endMarker);
console.log('endIdx:', endIdx);

if (startIdx !== -1 && endIdx !== -1) {
  // Find the closing </div> of that section block
  const closingDiv1 = code.indexOf('</div>', endIdx);
  const closingDiv2 = code.indexOf('</div>', closingDiv1 + 6);
  const endSectionIdx = closingDiv2 + 6;

  const newJsx = `<SongResourcesPanel
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

  code = code.slice(0, startIdx) + newJsx + code.slice(endSectionIdx);
  console.log('Replaced old JSX blocks successfully!');
} else {
  console.error('Could not locate startIdx or endIdx!');
  process.exit(1);
}

fs.writeFileSync('src/components/admin/AddSongAI.jsx', code);
console.log('AddSongAI.jsx written successfully!');

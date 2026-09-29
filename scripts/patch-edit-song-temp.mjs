import fs from 'node:fs';

const path = 'src/components/admin/EditSong.jsx';
let content = fs.readFileSync(path, 'utf8');

const replaceOnce = (needle, replacement, label) => {
  if (!content.includes(needle)) {
    throw new Error(`No se encontró: ${label}`);
  }
  content = content.replace(needle, replacement);
};

replaceOnce(
  "import { Save, ArrowLeft, Edit3, AlertCircle, X } from 'lucide-react';",
  "import { Save, ArrowLeft, Edit3, AlertCircle, X, Scissors, Wand2 } from 'lucide-react';",
  'import lucide-react'
);

replaceOnce(
  "import { getSectionKey, parsearCancion } from '../../utils/songParser';",
  "import { getSectionKey, isSongSectionTitle, parsearCancion } from '../../utils/songParser';",
  'import songParser'
);

replaceOnce(
  "const { notify } = useFeedback();",
  "const { confirm: askConfirm, notify } = useFeedback();",
  'useFeedback'
);

const helperNeedle = "const sortObjectKeys = (value) => {";
const helperBlock = `const isSectionTitle = (value) => isSongSectionTitle(value);

const limpiarTextoCancion = (value) => String(value || '')
  .replace(/\r\n?/g, '\n')
  .replace(/[“”]/g, '"')
  .replace(/[’]/g, "'")
  .replace(/\u00a0/g, ' ')
  .replace(/[ \t]+$/gm, '')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const detectarSeccionesTexto = (value) => {
  const lines = String(value || '').split(/\r?\n/);
  let hasSection = false;
  const processed = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      hasSection = true;
      return line;
    }

    const bracketMatch = trimmed.match(/^\[(.*?)\]$/);
    if (bracketMatch && isSectionTitle(bracketMatch[1])) {
      hasSection = true;
      return \`# \${bracketMatch[1].trim()}\`;
    }

    if (!isSectionTitle(trimmed)) return line;
    hasSection = true;
    const title = trimmed.replace(/[:.-]\s*$/, '');
    return \`# \${title}\`;
  });

  return { text: processed.join('\n').trim(), hasSection };
};

`;
replaceOnce(helperNeedle, helperBlock + helperNeedle, 'helpers de formato');

const handlerNeedle = "  const handleAddRecurso = () => {";
const handlerBlock = `  const handleCleanFormat = async () => {
    const cleaned = limpiarTextoCancion(letraRaw);
    if (!cleaned) return;

    const hasHeavyCleanup = /\n{3,}|\u00a0|\r/.test(letraRaw);
    if (hasHeavyCleanup) {
      const shouldClean = await askConfirm({
        title: 'Limpiar formato',
        message: 'Esto limpiará espacios excesivos y caracteres pegados, manteniendo máximo una línea vacía entre bloques. ¿Continuar?',
        confirmLabel: 'Limpiar',
        cancelLabel: 'Cancelar',
      });
      if (!shouldClean) return;
    }

    setLetraRaw(cleaned);
    showToast('Formato limpiado. Revisa la letra antes de guardar.', 'success');
  };

  const handleDetectSections = () => {
    const result = detectarSeccionesTexto(letraRaw);
    if (!result.text) return;

    setLetraRaw(
      result.hasSection && !result.text.startsWith('#')
        ? \`# Inicio\n\${result.text}\`
        : result.text
    );

    showToast(
      result.hasSection ? 'Secciones detectadas.' : 'No se encontraron secciones claras.',
      result.hasSection ? 'success' : 'info'
    );
  };

`;
replaceOnce(handlerNeedle, handlerBlock + handlerNeedle, 'handlers de formato');

const buttonNeedle = `            <div className="flex flex-wrap gap-2 mb-3">
              {CUE_PRESETS.map(cue => (`;

const buttonBlock = `            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                onClick={handleCleanFormat}
                disabled={!letraRaw.trim()}
                className="px-3 py-1.5 text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <Scissors size={13}/> Limpiar formato
              </button>
              <button
                type="button"
                onClick={handleDetectSections}
                disabled={!letraRaw.trim()}
                className="px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <Wand2 size={13}/> Detectar secciones
              </button>
            </div>

`;
replaceOnce(buttonNeedle, buttonBlock + buttonNeedle, 'botones Limpiar/Detectar');

fs.writeFileSync(path, content, 'utf8');
console.log('EditSong actualizado: Limpiar formato + Detectar secciones');

import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  ExternalLink,
  Copy,
  Star,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  Info,
  ClipboardPaste,
  X,
  Link2,
  ShieldCheck,
  MessageSquare
} from 'lucide-react';
import { db } from '../../config/firebase';
import { importExternalAssistantResult } from '../../utils/musicConverter';
import {
  OFFICIAL_CHAT_PROVIDERS,
  validateOfficialChatUrl,
  sanitizeFavoriteLabel,
  loadUserFavoriteChats,
  saveUserFavoriteChats,
  buildOfficialChatPackage,
  copyAndOpenOfficialChat,
  openExternalOfficialUrl
} from '../../utils/officialMusicChats';

/**
 * Espacio de trabajo principal para preparar canciones usando las cuentas oficiales
 * de Gemini y ChatGPT del propietario/usuario autorizado, e importar el resultado en KADOSH.
 */
const OfficialChatsWorkspace = ({
  user,
  titulo,
  artista,
  tonalidad,
  formaAcordes,
  capo,
  youtubeUrl,
  rawText,
  currentDraft,
  additionalInstructions,
  onImportResult,
  notify
}) => {
  const uid = user?.uid || 'local-preview';

  // Favoritos privados del usuario actual
  const [favorites, setFavorites] = useState([]);
  const [selectedGeminiChatId, setSelectedGeminiChatId] = useState('default');
  const [selectedChatGPTChatId, setSelectedChatGPTChatId] = useState('default');
  const [lastUsedProvider, setLastUsedProvider] = useState(null);

  // Modal de administración de chats favoritos
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [editingChatId, setEditingChatId] = useState(null);
  const [favProvider, setFavProvider] = useState('gemini');
  const [favLabel, setFavLabel] = useState('');
  const [favUrl, setFavUrl] = useState('');
  const [favFormError, setFavFormError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Importación de respuesta pegada desde Gemini o ChatGPT
  const [assistantReplyText, setAssistantReplyText] = useState('');
  const [lastImportSummary, setLastImportSummary] = useState(null);

  // Modal fallback cuando navegador bloquea portapapeles o ventana emergente
  const [manualPackageModal, setManualPackageModal] = useState(null);

  // Cargar favoritos privados del usuario al montar / cambiar UID
  useEffect(() => {
    let active = true;
    loadUserFavoriteChats(db, uid).then((loaded) => {
      if (active) setFavorites(loaded);
    });
    return () => {
      active = false;
    };
  }, [uid]);

  const geminiFavorites = useMemo(
    () => favorites.filter((f) => f.provider === 'gemini'),
    [favorites]
  );

  const chatgptFavorites = useMemo(
    () => favorites.filter((f) => f.provider === 'chatgpt'),
    [favorites]
  );

  const resolveProviderTargetUrl = (provider) => {
    const selectedId = provider === 'gemini' ? selectedGeminiChatId : selectedChatGPTChatId;
    const match = favorites.find((f) => f.id === selectedId && f.provider === provider);
    return match ? match.url : OFFICIAL_CHAT_PROVIDERS[provider].defaultUrl;
  };

  // Abrir directamente enlace oficial (o favorito seleccionado) sin paquete
  const handleDirectOpen = async (provider) => {
    const targetUrl = resolveProviderTargetUrl(provider);
    const outcome = await openExternalOfficialUrl(targetUrl, provider);
    if (!outcome.ok) {
      notify(outcome.error || 'Enlace oficial inválido.', { type: 'error' });
      return;
    }

    setLastUsedProvider(provider);
    if (!outcome.windowOpened) {
      setManualPackageModal({
        provider,
        targetUrl: outcome.targetUrl,
        clipboardCopied: true,
        windowOpened: false,
        text: '',
        onlyLink: true
      });
    }
  };

  // Copiar instrucciones completas + Prompt Maestro y abrir chat oficial
  const handlePrepareAndOpen = async (provider, { isSwitch = false, previousProvider = null } = {}) => {
    const sourceContent = String(currentDraft || rawText || '').trim();
    if (!sourceContent && !titulo.trim() && !additionalInstructions.trim()) {
      notify('Pega primero la letra, acordes o instrucciones de la canción.', { type: 'warning' });
      return;
    }

    const targetUrl = resolveProviderTargetUrl(provider);
    const packageText = buildOfficialChatPackage({
      titulo,
      artista,
      tonalidad,
      formaAcordes,
      capo,
      youtubeUrl,
      rawSong: rawText,
      currentDraft,
      additionalInstructions,
      targetProvider: provider,
      isSwitch,
      previousProvider
    });

    const outcome = await copyAndOpenOfficialChat({ text: packageText, targetUrl });
    setLastUsedProvider(provider);

    if (!outcome.ok) {
      notify(outcome.error || 'Enlace oficial inválido.', { type: 'error' });
      return;
    }

    if (outcome.clipboardCopied && outcome.windowOpened) {
      notify(
        `Instrucciones copiadas al portapapeles. Pégalas (Ctrl+V) en ${OFFICIAL_CHAT_PROVIDERS[provider].name} que se abrió en otra pestaña.`,
        { type: 'success', duration: 6000 }
      );
    } else {
      // Bloqueo de portapapeles o ventana emergente por navegador -> mostrar modal manual claro
      setManualPackageModal({
        provider,
        targetUrl: outcome.targetUrl,
        clipboardCopied: outcome.clipboardCopied,
        windowOpened: outcome.windowOpened,
        text: packageText,
        onlyLink: false
      });
    }
  };

  // Guardar nuevo o editado enlace favorito privado
  const handleSaveFavorite = async (e) => {
    e.preventDefault();
    setFavFormError('');

    const check = validateOfficialChatUrl(favUrl, favProvider);
    if (!check.valid) {
      setFavFormError(check.error);
      return;
    }

    const cleanLabel = sanitizeFavoriteLabel(favLabel)
      || `${OFFICIAL_CHAT_PROVIDERS[favProvider].name} — Chat favorito`;

    let updatedList;
    if (editingChatId) {
      updatedList = favorites.map((item) =>
        item.id === editingChatId
          ? { ...item, provider: favProvider, label: cleanLabel, url: check.url, updatedAt: new Date().toISOString() }
          : item
      );
    } else {
      const newEntry = {
        id: `fav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        provider: favProvider,
        label: cleanLabel,
        url: check.url,
        updatedAt: new Date().toISOString()
      };
      updatedList = [newEntry, ...favorites];
    }

    try {
      const saved = await saveUserFavoriteChats(db, uid, updatedList);
      setFavorites(saved);
      setEditingChatId(null);
      setFavLabel('');
      setFavUrl('');
      setFavFormError('');
      notify('Conversación favorita guardada de forma privada para tu usuario.', { type: 'success' });
    } catch (err) {
      setFavFormError(err?.message || 'No se pudo guardar la conversación favorita.');
    }
  };

  const handleEditFavorite = (item) => {
    setEditingChatId(item.id);
    setFavProvider(item.provider);
    setFavLabel(item.label);
    setFavUrl(item.url);
    setFavFormError('');
  };

  const handleDeleteFavorite = async (id) => {
    const nextList = favorites.filter((f) => f.id !== id);
    const saved = await saveUserFavoriteChats(db, uid, nextList);
    setFavorites(saved);
    setConfirmDeleteId(null);
    if (selectedGeminiChatId === id) setSelectedGeminiChatId('default');
    if (selectedChatGPTChatId === id) setSelectedChatGPTChatId('default');
    notify('Acceso favorito eliminado.', { type: 'info' });
  };

  // Importar respuesta pegada de Gemini o ChatGPT
  const handleImportAssistantReply = () => {
    if (!assistantReplyText.trim()) {
      notify('Pega primero la respuesta que te entregó Gemini o ChatGPT.', { type: 'warning' });
      return;
    }

    const imported = importExternalAssistantResult(assistantReplyText);
    if (!imported.kadoshContent) {
      notify('No se detectó contenido musical utilizable en el texto pegado.', { type: 'warning' });
      return;
    }

    onImportResult(imported);
    setLastImportSummary({
      stats: imported.syntax.stats,
      issues: imported.syntax.issues,
      valid: imported.syntax.valid,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    notify('Respuesta importada y estructurada en el Estudio KADOSH.', { type: 'success' });
  };

  const handleManualCopyModal = async () => {
    if (!manualPackageModal?.text) return;
    try {
      await navigator.clipboard.writeText(manualPackageModal.text);
      setManualPackageModal((prev) => (prev ? { ...prev, clipboardCopied: true } : null));
      notify('Texto copiado manualmente al portapapeles.', { type: 'success' });
    } catch {
      notify('Selecciona todo el texto dentro del cuadro y presiona Ctrl+C.', { type: 'info' });
    }
  };

  return (
    <div className="space-y-4">
      {/* ─────────────────────────────────────────────────────────────
          TARJETA 1: CHATS OFICIALES (GEMINI & CHATGPT) + FAVORITOS
      ────────────────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={15} className="text-violet-400" />
            <h2 className="text-xs font-black uppercase tracking-wider text-white">
              1. Chats Oficiales (Gemini & ChatGPT)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingChatId(null);
              setFavFormError('');
              setShowFavoritesModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <Star size={12} /> Administrar favoritos ({favorites.length})
          </button>
        </div>

        {/* Selectores rápidos de cuenta/chat por proveedor */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Proveedor Gemini */}
          <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-violet-300 flex items-center gap-1.5">
                <Sparkles size={13} /> Google Gemini
              </span>
              <button
                type="button"
                onClick={() => handleDirectOpen('gemini')}
                className="text-[10px] font-bold text-zinc-400 hover:text-white inline-flex items-center gap-1"
              >
                Abrir Gemini <ExternalLink size={10} />
              </button>
            </div>

            <select
              value={selectedGeminiChatId}
              onChange={(e) => setSelectedGeminiChatId(e.target.value)}
              aria-label="Chat favorito de Gemini"
              className="kp-input w-full rounded-xl px-2.5 py-1.5 text-[11px] font-semibold"
            >
              <option value="default">Gemini oficial (gemini.google.com)</option>
              {geminiFavorites.map((fav) => (
                <option key={fav.id} value={fav.id}>
                  ★ {fav.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => handlePrepareAndOpen('gemini')}
              className="kp-button-primary w-full py-2 px-3 rounded-xl text-[11px] font-black uppercase flex items-center justify-center gap-1.5 shadow-md shadow-violet-600/20"
            >
              <Copy size={12} /> Preparar con Gemini
            </button>
          </div>

          {/* Proveedor ChatGPT */}
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                <MessageSquare size={13} /> OpenAI ChatGPT
              </span>
              <button
                type="button"
                onClick={() => handleDirectOpen('chatgpt')}
                className="text-[10px] font-bold text-zinc-400 hover:text-white inline-flex items-center gap-1"
              >
                Abrir ChatGPT <ExternalLink size={10} />
              </button>
            </div>

            <select
              value={selectedChatGPTChatId}
              onChange={(e) => setSelectedChatGPTChatId(e.target.value)}
              aria-label="Chat favorito de ChatGPT"
              className="kp-input w-full rounded-xl px-2.5 py-1.5 text-[11px] font-semibold"
            >
              <option value="default">ChatGPT oficial (chatgpt.com)</option>
              {chatgptFavorites.map((fav) => (
                <option key={fav.id} value={fav.id}>
                  ★ {fav.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => handlePrepareAndOpen('chatgpt')}
              className="w-full py-2 px-3 rounded-xl text-[11px] font-black uppercase flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-md shadow-emerald-600/20"
            >
              <Copy size={12} /> Preparar con ChatGPT
            </button>
          </div>
        </div>

        {/* Alternar manualmente entre proveedores */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5">
          <span className="text-[11px] font-bold text-zinc-400 flex items-center gap-1.5">
            <ArrowRightLeft size={12} className="text-sky-400" />
            ¿Cambiar o continuar con otro proveedor?
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handlePrepareAndOpen('chatgpt', { isSwitch: true, previousProvider: 'gemini' })}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              Continuar en ChatGPT
            </button>
            <button
              type="button"
              onClick={() => handlePrepareAndOpen('gemini', { isSwitch: true, previousProvider: 'chatgpt' })}
              className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold text-violet-300 hover:bg-violet-500/20 transition-colors"
            >
              Continuar en Gemini
            </button>
          </div>
        </div>

        {/* Nota transparente sobre cuentas y seguridad */}
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-2.5 text-[11px] text-zinc-300 flex items-start gap-2 leading-relaxed">
          <Info size={14} className="text-sky-400 shrink-0 mt-0.5" />
          <span>
            Al pulsar <strong>Preparar</strong>, KADOSH copia el prompt maestro junto a tu letra y abre la pestaña oficial elegida para que pegues allí (<code className="text-sky-300">Ctrl+V</code>). Tus cuentas y sesiones se administran en Google/OpenAI o mediante perfiles separados del navegador; KADOSH no guarda contraseñas ni accede a tu historial privado.
          </span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TARJETA 2: IMPORTAR RESPUESTA DE GEMINI O CHATGPT
      ────────────────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardPaste size={15} className="text-emerald-400" />
            <h2 className="text-xs font-black uppercase tracking-wider text-white">
              2. Importar respuesta de Gemini o ChatGPT
            </h2>
          </div>
          {lastUsedProvider && (
            <span className="text-[10px] font-bold text-zinc-400">
              Último abierto: {OFFICIAL_CHAT_PROVIDERS[lastUsedProvider]?.name}
            </span>
          )}
        </div>

        <textarea
          rows={6}
          value={assistantReplyText}
          onChange={(e) => setAssistantReplyText(e.target.value)}
          placeholder="Pega aquí la respuesta completa que te dio Gemini o ChatGPT (incluso si trae explicaciones o envoltorios ```kadosh). KADOSH limpiará y validará la canción automáticamente..."
          className="kp-input w-full rounded-2xl p-3 font-mono text-xs leading-relaxed"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleImportAssistantReply}
            className="kp-button-primary flex-1 py-2.5 px-4 text-xs font-black uppercase rounded-xl flex items-center justify-center gap-2"
          >
            <ClipboardPaste size={14} /> Importar respuesta de Gemini o ChatGPT
          </button>
          {assistantReplyText && (
            <button
              type="button"
              onClick={() => setAssistantReplyText('')}
              className="kp-button-secondary py-2.5 px-3 text-xs font-bold rounded-xl"
            >
              Limpiar
            </button>
          )}
        </div>

        {lastImportSummary && (
          <div
            className={`rounded-xl border p-2.5 text-[11px] flex items-start gap-2 ${
              lastImportSummary.valid
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
            }`}
          >
            {lastImportSummary.valid ? (
              <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-400" />
            ) : (
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
            )}
            <div>
              <p className="font-bold">
                Importado a las {lastImportSummary.timestamp} · {lastImportSummary.stats.sections} secciones ·{' '}
                {lastImportSummary.stats.chords} acordes · {lastImportSummary.stats.slides} diapositivas
                {lastImportSummary.stats.repeats > 0 ? ` · ${lastImportSummary.stats.repeats} repeticiones` : ''}
              </p>
              {lastImportSummary.issues.length > 0 && (
                <p className="mt-1 text-amber-300">{lastImportSummary.issues.join(' ')}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ADMINISTRAR CONVERSACIONES FAVORITAS PRIVADAS
      ────────────────────────────────────────────────────────────── */}
      {showFavoritesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Administrar conversaciones favoritas"
        >
          <div className="w-full max-w-xl rounded-3xl border border-white/15 bg-zinc-950 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Star size={18} className="text-amber-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Conversaciones Favoritas Privadas
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFavoritesModal(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-200 flex items-start gap-2">
              <ShieldCheck size={15} className="shrink-0 mt-0.5 text-emerald-400" />
              <span>
                Estos enlaces se guardan de forma privada exclusivamente para tu cuenta actual y solo permiten dominios HTTPS oficiales (<strong>gemini.google.com</strong>, <strong>chatgpt.com</strong>, <strong>chat.openai.com</strong>).
              </span>
            </div>

            {/* Formulario agregar / editar */}
            <form onSubmit={handleSaveFavorite} className="space-y-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                    Proveedor oficial
                  </label>
                  <select
                    value={favProvider}
                    onChange={(e) => {
                      setFavProvider(e.target.value);
                      setFavFormError('');
                    }}
                    className="kp-input w-full rounded-xl p-2 text-xs font-bold"
                  >
                    <option value="gemini">Google Gemini (gemini.google.com)</option>
                    <option value="chatgpt">OpenAI ChatGPT (chatgpt.com)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                    Etiqueta descriptiva
                  </label>
                  <input
                    type="text"
                    value={favLabel}
                    onChange={(e) => setFavLabel(e.target.value)}
                    placeholder={OFFICIAL_CHAT_PROVIDERS[favProvider].suggestedLabels[0]}
                    className="kp-input w-full rounded-xl p-2 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Sugerencias rápidas de etiquetas */}
              <div className="flex flex-wrap gap-1.5">
                {OFFICIAL_CHAT_PROVIDERS[favProvider].suggestedLabels.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setFavLabel(sug)}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-300 hover:bg-violet-600 hover:text-white transition-colors"
                  >
                    + {sug}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                  Enlace HTTPS de la conversación oficial
                </label>
                <input
                  type="url"
                  value={favUrl}
                  onChange={(e) => {
                    setFavUrl(e.target.value);
                    setFavFormError('');
                  }}
                  placeholder={
                    favProvider === 'gemini'
                      ? 'https://gemini.google.com/app/...'
                      : 'https://chatgpt.com/c/...'
                  }
                  className="kp-input w-full rounded-xl p-2 text-xs"
                />
              </div>

              {favFormError && (
                <p className="text-[11px] font-bold text-red-400 flex items-center gap-1.5">
                  <AlertTriangle size={13} /> {favFormError}
                </p>
              )}

              <div className="flex justify-end gap-2">
                {editingChatId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingChatId(null);
                      setFavLabel('');
                      setFavUrl('');
                      setFavFormError('');
                    }}
                    className="kp-button-secondary rounded-xl px-3 py-1.5 text-xs font-bold"
                  >
                    Cancelar edición
                  </button>
                )}
                <button
                  type="submit"
                  className="kp-button-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-black uppercase"
                >
                  <Plus size={13} /> {editingChatId ? 'Actualizar favorito' : 'Guardar favorito'}
                </button>
              </div>
            </form>

            {/* Lista de favoritos guardados */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-400">
                Tus accesos guardados ({favorites.length})
              </h4>

              {favorites.length === 0 ? (
                <p className="rounded-xl border border-white/5 bg-zinc-900/30 p-3 text-center text-xs text-zinc-500">
                  Aún no tienes conversaciones favoritas guardadas. Puedes usar los chats generales o guardar tus enlaces específicos arriba.
                </p>
              ) : (
                favorites.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-zinc-900/50 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase ${
                            item.provider === 'gemini'
                              ? 'bg-violet-500/20 text-violet-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {OFFICIAL_CHAT_PROVIDERS[item.provider]?.name}
                        </span>
                        <span className="truncate text-xs font-bold text-white">{item.label}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-zinc-500 flex items-center gap-1">
                        <Link2 size={10} /> {item.url}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (item.provider === 'gemini') setSelectedGeminiChatId(item.id);
                          else setSelectedChatGPTChatId(item.id);
                          setShowFavoritesModal(false);
                          notify(`Seleccionado: ${item.label}`, { type: 'info' });
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-zinc-200 hover:bg-violet-600 hover:text-white"
                      >
                        Usar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditFavorite(item)}
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
                        title="Editar"
                      >
                        <Edit3 size={13} />
                      </button>
                      {confirmDeleteId === item.id ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteFavorite(item.id)}
                          className="rounded-lg bg-red-600 px-2 py-1 text-[10px] font-black text-white"
                        >
                          Confirmar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/20 hover:text-red-300"
                          title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL FALLBACK MANUAL SI PORTAPAPELES O POPUP FUE BLOQUEADO
      ────────────────────────────────────────────────────────────── */}
      {manualPackageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Asistencia manual de apertura"
        >
          <div className="w-full max-w-lg rounded-3xl border border-amber-500/30 bg-zinc-950 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-400" />
                <h3 className="text-sm font-black uppercase text-white">
                  Acción manual para {OFFICIAL_CHAT_PROVIDERS[manualPackageModal.provider]?.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setManualPackageModal(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              {!manualPackageModal.windowOpened && !manualPackageModal.clipboardCopied
                ? 'Tu navegador bloqueó la copia automática y la ventana emergente. Usa los botones manuales debajo:'
                : !manualPackageModal.windowOpened
                ? 'El texto sí se copió al portapapeles, pero tu navegador bloqueó la ventana emergente. Abre el chat oficial con el botón debajo:'
                : 'La pestaña oficial se abrió, pero no pudimos copiar automáticamente al portapapeles. Copia las instrucciones desde aquí:'}
            </p>

            {!manualPackageModal.onlyLink && (
              <div className="space-y-2">
                <textarea
                  readOnly
                  rows={8}
                  value={manualPackageModal.text}
                  onFocus={(e) => e.target.select()}
                  className="kp-input w-full rounded-2xl p-3 font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={handleManualCopyModal}
                  className="kp-button-secondary w-full py-2 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2"
                >
                  <Copy size={13} />{' '}
                  {manualPackageModal.clipboardCopied ? 'Copiado al portapapeles' : 'Copiar instrucciones manualmente'}
                </button>
              </div>
            )}

            <a
              href={manualPackageModal.targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setManualPackageModal(null)}
              className="kp-button-primary w-full py-2.5 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2"
            >
              <ExternalLink size={14} /> Abrir {OFFICIAL_CHAT_PROVIDERS[manualPackageModal.provider]?.name} ahora
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficialChatsWorkspace;

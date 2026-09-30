import fs from 'node:fs';

const patchFile = (filePath, mutate) => {
  const original = fs.readFileSync(filePath, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const normalized = original.replace(/\r\n/g, '\n');
  const next = mutate(normalized);
  fs.writeFileSync(filePath, next.replace(/\n/g, eol), 'utf8');
};

const replaceOnce = (source, needle, replacement, label) => {
  const first = source.indexOf(needle);
  if (first === -1) throw new Error(`No se encontró: ${label}`);
  if (source.indexOf(needle, first + needle.length) !== -1) throw new Error(`Marcador duplicado: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

patchFile('src/App.jsx', (input) => {
  let text = input;

  if (!text.includes("import MultitrackLiveManagement from './components/admin/MultitrackLiveManagement';")) {
    text = replaceOnce(
      text,
      "import MultitrackLive from './components/live/MultitrackLive';",
      "import MultitrackLive from './components/live/MultitrackLive';\nimport MultitrackLiveManagement from './components/admin/MultitrackLiveManagement';",
      'import MultitrackLiveManagement'
    );
  }

  if (!text.includes('path="/multitrack-live"')) {
    text = replaceOnce(
      text,
      '        <Route path="/perfil" element={<AdminLayout user={user}><UserProfile user={user} /></AdminLayout>} />',
      [
        '        <Route path="/perfil" element={<AdminLayout user={user}><UserProfile user={user} /></AdminLayout>} />',
        '        <Route path="/multitrack-live" element={<ProtectedAdminRoute user={user} allowed={canManageSongs(user)} message="Solo el equipo autorizado puede preparar Multitrack Live."><MultitrackLiveManagement user={user} /></ProtectedAdminRoute>} />'
      ].join('\n'),
      'ruta admin Multitrack Live'
    );
  }

  if (!text.includes('path="/multitrack-live/cancion/:songId"')) {
    text = replaceOnce(
      text,
      '        {/* Multitrack Live - motor independiente del modo ensayo */}\n        <Route path="/multitrack-live/:eventoId" element={<ProtectedLiveRoute allowed={canViewEventsAndSetlists(user)} message="Tu rol no tiene acceso a Multitrack Live."><MultitrackLive user={user} /></ProtectedLiveRoute>} />',
      [
        '        {/* Multitrack Live - motor independiente del modo ensayo */}',
        '        <Route path="/multitrack-live/cancion/:songId" element={<ProtectedLiveRoute allowed={canManageSongs(user)} message="Solo el equipo autorizado puede preparar canciones para Multitrack Live."><MultitrackLive user={user} /></ProtectedLiveRoute>} />',
        '        <Route path="/multitrack-live/:eventoId" element={<ProtectedLiveRoute allowed={canViewEventsAndSetlists(user)} message="Tu rol no tiene acceso a Multitrack Live."><MultitrackLive user={user} /></ProtectedLiveRoute>} />'
      ].join('\n'),
      'ruta editor individual Multitrack Live'
    );
  }

  return text;
});

patchFile('src/components/layout/AdminLayout.jsx', (input) => {
  let text = input;

  if (!text.includes('Radio,') && !text.includes(', Radio }')) {
    text = replaceOnce(
      text,
      'import { Home, Music, Calendar, Settings, Menu, X, PlayCircle, LogOut, User, BellRing, Bell, Monitor, Images, Camera, BookOpen, Megaphone } from \'lucide-react\';',
      'import { Home, Music, Calendar, Settings, Menu, X, PlayCircle, LogOut, User, BellRing, Bell, Monitor, Images, Camera, BookOpen, Megaphone, Radio } from \'lucide-react\';',
      'icono Radio'
    );
  }

  if (!text.includes('canManageSongs')) {
    text = replaceOnce(
      text,
      "import { canAccessMultimediaTools, canAccessPreachings, canManageAnnouncements, canManageTeam } from '../../utils/rolePermissions';",
      "import { canAccessMultimediaTools, canAccessPreachings, canManageAnnouncements, canManageSongs, canManageTeam } from '../../utils/rolePermissions';",
      'permiso canManageSongs'
    );
  }

  if (!text.includes("name: 'Multitrack Live', path: '/multitrack-live'")) {
    text = replaceOnce(
      text,
      "        { name: 'Canciones / Repertorio', path: '/canciones', section: 'songs', icon: <Music size={20} /> },",
      [
        "        { name: 'Canciones / Repertorio', path: '/canciones', section: 'songs', icon: <Music size={20} /> },",
        "        canManageSongs(user) ? { name: 'Multitrack Live', path: '/multitrack-live', section: 'multitrack-live', icon: <Radio size={20} className=\"text-emerald-400\" /> } : null,"
      ].join('\n'),
      'item sidebar Multitrack Live'
    );
  }

  if (!text.includes("if (pathname === '/multitrack-live' || pathname.startsWith('/multitrack-live/cancion/'))")) {
    text = replaceOnce(
      text,
      "    if (pathname === '/canciones' || pathname === '/añadir' || pathname.startsWith('/editar/')) return 'songs';",
      [
        "    if (pathname === '/canciones' || pathname === '/añadir' || pathname.startsWith('/editar/')) return 'songs';",
        "    if (pathname === '/multitrack-live' || pathname.startsWith('/multitrack-live/cancion/')) return 'multitrack-live';"
      ].join('\n'),
      'active section Multitrack Live'
    );
  }

  return text;
});

patchFile('src/utils/multitrackPlaybackEngine.js', (input) => {
  let text = input;

  if (!text.includes('applyMixerPreset(preset = {})')) {
    const marker = [
      '  setMasterVolume(volume) {',
      '    this.masterVolume = clamp(Number(volume) || 0, 0, 1);',
      '    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;',
      '  }'
    ].join('\n');

    const extra = [
      '',
      '  applyMixerPreset(preset = {}) {',
      '    const rawMaster = Number(preset?.masterVolume);',
      '    this.masterVolume = Number.isFinite(rawMaster) ? clamp(rawMaster, 0, 1) : 1;',
      '    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;',
      '',
      "    const savedStems = preset?.stems && typeof preset.stems === 'object' ? preset.stems : {};",
      '    const savedValues = Object.values(savedStems);',
      '    this.stems.forEach((stem) => {',
      '      const saved = savedStems[stem.id] || savedValues.find((item) => String(item?.name || \'\') === stem.name);',
      '      if (!saved) {',
      '        stem.volume = 1;',
      '        stem.muted = false;',
      '        stem.solo = false;',
      '        return;',
      '      }',
      '      const rawVolume = Number(saved.volume);',
      '      stem.volume = Number.isFinite(rawVolume) ? clamp(rawVolume, 0, 1) : 1;',
      '      stem.muted = Boolean(saved.muted);',
      '      stem.solo = Boolean(saved.solo);',
      '    });',
      '',
      '    this.applyMixerState();',
      '    return this.getState();',
      '  }'
    ].join('\n');

    text = replaceOnce(text, marker, marker + extra, 'applyMixerPreset');
  }

  return text;
});

patchFile('src/components/live/MultitrackLive.jsx', (input) => {
  let text = input;

  if (text.includes('  const { eventoId } = useParams();')) {
    text = replaceOnce(
      text,
      '  const { eventoId } = useParams();',
      "  const { eventoId, songId } = useParams();\n  const standaloneSongMode = Boolean(songId);",
      'params standalone song'
    );
  }

  const oldLoad = [
    '  useEffect(() => {',
    '    let cancelled = false;',
    '',
    '    const loadSetlist = async () => {',
    '      setLoadingSetlist(true);',
    "      setSetlistError('');",
    '      try {',
    "        const eventSnap = await getDoc(doc(db, 'eventos', eventoId));",
    "        if (!eventSnap.exists()) throw new Error('El evento no existe.');",
    '        const eventData = eventSnap.data();',
    '        const songIds = [...new Set(getEventSongIds(eventData))];',
    "        const songSnaps = await Promise.all(songIds.map((songId) => getDoc(doc(db, 'canciones', songId))));",
    '        const map = {};',
    '        songSnaps.forEach((snap) => {',
    '          if (snap.exists()) map[snap.id] = { id: snap.id, ...snap.data() };',
    '        });',
    '',
    '        if (!cancelled) {',
    '          setEvento(eventData);',
    '          setSongsById(map);',
    '        }',
    '      } catch (error) {',
    "        if (!cancelled) setSetlistError(error?.message || 'No se pudo cargar el setlist.');",
    '      } finally {',
    '        if (!cancelled) setLoadingSetlist(false);',
    '      }',
    '    };',
    '',
    '    loadSetlist();',
    '    return () => { cancelled = true; };',
    '  }, [eventoId]);'
  ].join('\n');

  if (text.includes(oldLoad)) {
    const newLoad = [
      '  useEffect(() => {',
      '    let cancelled = false;',
      '',
      '    const loadSetlist = async () => {',
      '      setLoadingSetlist(true);',
      "      setSetlistError('');",
      '      try {',
      '        if (standaloneSongMode) {',
      "          const songSnap = await getDoc(doc(db, 'canciones', songId));",
      "          if (!songSnap.exists()) throw new Error('La canción no existe.');",
      '          const song = { id: songSnap.id, ...songSnap.data() };',
      '          if (!cancelled) {',
      "            setEvento({ titulo: 'Editor de Live Map' });",
      '            setSongsById({ [song.id]: song });',
      '          }',
      '        } else {',
      "          const eventSnap = await getDoc(doc(db, 'eventos', eventoId));",
      "          if (!eventSnap.exists()) throw new Error('El evento no existe.');",
      '          const eventData = eventSnap.data();',
      '          const songIds = [...new Set(getEventSongIds(eventData))];',
      "          const songSnaps = await Promise.all(songIds.map((id) => getDoc(doc(db, 'canciones', id))));",
      '          const map = {};',
      '          songSnaps.forEach((snap) => {',
      '            if (snap.exists()) map[snap.id] = { id: snap.id, ...snap.data() };',
      '          });',
      '          if (!cancelled) {',
      '            setEvento(eventData);',
      '            setSongsById(map);',
      '          }',
      '        }',
      '      } catch (error) {',
      "        if (!cancelled) setSetlistError(error?.message || (standaloneSongMode ? 'No se pudo cargar la canción.' : 'No se pudo cargar el setlist.'));",
      '      } finally {',
      '        if (!cancelled) setLoadingSetlist(false);',
      '      }',
      '    };',
      '',
      '    loadSetlist();',
      '    return () => { cancelled = true; };',
      '  }, [eventoId, songId, standaloneSongMode]);'
    ].join('\n');
    text = replaceOnce(text, oldLoad, newLoad, 'carga individual o setlist');
  }

  const oldPlaylist = [
    '  const playlist = useMemo(() => {',
    '    if (!evento) return [];',
    '    return getEventSetlistItems(evento)',
    "      .filter((item) => item.type === 'song')",
    '      .map((item, index) => {',
    '        const song = songsById[item.value];',
    '        if (!song) return null;',
    '        return {',
    '          ...song,',
    '          setlistItemId: item.idLocal || `${item.value}_${index}`,',
    '        };',
    '      })',
    '      .filter(Boolean);',
    '  }, [evento, songsById]);'
  ].join('\n');

  if (text.includes(oldPlaylist)) {
    const nextPlaylist = [
      '  const playlist = useMemo(() => {',
      '    if (standaloneSongMode) {',
      '      const song = songsById[songId];',
      "      return song ? [{ ...song, setlistItemId: 'song_' + song.id }] : [];",
      '    }',
      '    if (!evento) return [];',
      '    return getEventSetlistItems(evento)',
      "      .filter((item) => item.type === 'song')",
      '      .map((item, index) => {',
      '        const song = songsById[item.value];',
      '        if (!song) return null;',
      '        return {',
      '          ...song,',
      '          setlistItemId: item.idLocal || `${item.value}_${index}`,',
      '        };',
      '      })',
      '      .filter(Boolean);',
      '  }, [standaloneSongMode, songId, evento, songsById]);'
    ].join('\n');
    text = replaceOnce(text, oldPlaylist, nextPlaylist, 'playlist standalone');
  }

  if (!text.includes('applyMixerPreset(currentSong?.livePlayback?.mixer)')) {
    text = replaceOnce(
      text,
      '      setStemErrors(result.errors || []);\n      setPlayback(engineRef.current.getState());',
      '      setStemErrors(result.errors || []);\n      engineRef.current.applyMixerPreset(currentSong?.livePlayback?.mixer);\n      setPlayback(engineRef.current.getState());',
      'restaurar mixer al cargar canción'
    );
  }

  const oldCurrentSignature = [
    '  const currentLiveMapSignature = useMemo(() => JSON.stringify({',
    '    bpm: currentBpm,',
    '    beatsPerBar: currentBeatsPerBar,',
    '    gridOffsetSeconds: Number(currentGridOffset.toFixed(3)),',
    '    sections: currentSections.map((section) => ({',
    "      label: String(section.label || ''),",
    "      baseLabel: String(section.baseLabel || section.label || ''),",
    '      bar: Math.max(1, Math.round(Number(section.bar) || 1)),',
    '    })).sort((a, b) => a.bar - b.bar),',
    '  }), [currentBpm, currentBeatsPerBar, currentGridOffset, currentSections]);'
  ].join('\n');

  if (text.includes(oldCurrentSignature)) {
    const nextCurrentSignature = [
      '  const currentLiveMapSignature = useMemo(() => JSON.stringify({',
      '    bpm: currentBpm,',
      '    beatsPerBar: currentBeatsPerBar,',
      '    gridOffsetSeconds: Number(currentGridOffset.toFixed(3)),',
      '    sections: currentSections.map((section) => ({',
      "      label: String(section.label || ''),",
      "      baseLabel: String(section.baseLabel || section.label || ''),",
      '      bar: Math.max(1, Math.round(Number(section.bar) || 1)),',
      '    })).sort((a, b) => a.bar - b.bar),',
      '    mixer: {',
      '      masterVolume: Number((playback.masterVolume ?? 1).toFixed(3)),',
      '      stems: playback.stems.map((stem) => ({',
      '        id: String(stem.id),',
      "        name: String(stem.name || ''),",
      '        volume: Number((stem.volume ?? 1).toFixed(3)),',
      '        muted: Boolean(stem.muted),',
      '        solo: Boolean(stem.solo),',
      '      })).sort((a, b) => a.id.localeCompare(b.id)),',
      '    },',
      '  }), [currentBpm, currentBeatsPerBar, currentGridOffset, currentSections, playback.masterVolume, playback.stems]);'
    ].join('\n');
    text = replaceOnce(text, oldCurrentSignature, nextCurrentSignature, 'firma Live Map con mixer');
  }

  const oldSavedTail = [
    '      sections: (Array.isArray(saved.sections) ? saved.sections : []).map((section) => ({',
    "        label: String(section?.label || ''),",
    "        baseLabel: String(section?.baseLabel || section?.label || ''),",
    '        bar: Math.max(1, Math.round(Number(section?.bar) || 1)),',
    '      })).sort((a, b) => a.bar - b.bar),',
    '    });'
  ].join('\n');

  if (text.includes(oldSavedTail)) {
    const nextSavedTail = [
      '      sections: (Array.isArray(saved.sections) ? saved.sections : []).map((section) => ({',
      "        label: String(section?.label || ''),",
      "        baseLabel: String(section?.baseLabel || section?.label || ''),",
      '        bar: Math.max(1, Math.round(Number(section?.bar) || 1)),',
      '      })).sort((a, b) => a.bar - b.bar),',
      '      mixer: {',
      '        masterVolume: Number((Number(saved?.mixer?.masterVolume ?? 1)).toFixed(3)),',
      '        stems: Object.entries(saved?.mixer?.stems || {}).map(([id, stem]) => ({',
      '          id: String(id),',
      "          name: String(stem?.name || ''),",
      '          volume: Number((Number(stem?.volume ?? 1)).toFixed(3)),',
      '          muted: Boolean(stem?.muted),',
      '          solo: Boolean(stem?.solo),',
      '        })).sort((a, b) => a.id.localeCompare(b.id)),',
      '      },',
      '    });'
    ].join('\n');
    text = replaceOnce(text, oldSavedTail, nextSavedTail, 'firma guardada con mixer');
  }

  if (!text.includes('const restoreSavedMixer = () =>')) {
    const marker = [
      '  const changeMasterVolume = (value) => {',
      '    engineRef.current.setMasterVolume(value);',
      '    setPlayback(engineRef.current.getState());',
      '  };'
    ].join('\n');
    const extra = [
      '',
      '  const restoreSavedMixer = () => {',
      '    if (!currentSong?.livePlayback?.mixer || playback.stems.length === 0) return;',
      '    engineRef.current.applyMixerPreset(currentSong.livePlayback.mixer);',
      '    setPlayback(engineRef.current.getState());',
      "    setLiveMapNotice('Mezcla guardada restaurada.');",
      '  };'
    ].join('\n');
    text = replaceOnce(text, marker, marker + extra, 'restaurar mezcla guardada');
  }

  if (!text.includes('const mixer = {\n      masterVolume:')) {
    const marker = "    const livePlayback = {\n      version: 1,";
    const replacement = [
      '    if (getSongAudioCount(currentSong) > 0 && playback.stems.length === 0) {',
      "      setLiveMapNotice('Espera a que termine de cargar el audio antes de guardar la mezcla.');",
      '      return;',
      '    }',
      '',
      '    const mixer = {',
      '      masterVolume: Number((playback.masterVolume ?? 1).toFixed(3)),',
      '      stems: Object.fromEntries(playback.stems.map((stem) => [String(stem.id), {',
      "        name: String(stem.name || ''),",
      '        volume: Number((stem.volume ?? 1).toFixed(3)),',
      '        muted: Boolean(stem.muted),',
      '        solo: Boolean(stem.solo),',
      '      }])),',
      '    };',
      '',
      '    const livePlayback = {',
      '      version: 2,'
    ].join('\n');
    text = replaceOnce(text, marker, replacement, 'mixer dentro Live Map');
  }

  if (!text.includes('      mixer,\n      updatedAt:')) {
    text = replaceOnce(
      text,
      '      gridOffsetSeconds: Number(currentGridOffset.toFixed(3)),\n      sections,\n      updatedAt: new Date().toISOString(),',
      '      gridOffsetSeconds: Number(currentGridOffset.toFixed(3)),\n      sections,\n      mixer,\n      updatedAt: new Date().toISOString(),',
      'guardar mixer'
    );
  }

  text = text.replace('>Fase 2E</span>', '>Fase 2F</span>');
  text = text.replace('Guarda BPM, compás, alineación y secciones directamente en la canción.', 'Guarda BPM, compás, alineación, secciones y la mezcla completa directamente en la canción.');

  text = text.replace('onClick={() => navigate(`/setlist/${eventoId}`)}', "onClick={() => navigate(standaloneSongMode ? '/multitrack-live' : `/setlist/${eventoId}`)}");
  text = text.replace('Volver al setlist', "{standaloneSongMode ? 'Volver a Multitrack Live' : 'Volver al setlist'}");
  text = text.replace("{evento?.titulo || 'Setlist'} · Operador: {user?.nombre || 'Usuario'}", "{standaloneSongMode ? 'Editor de canción' : (evento?.titulo || 'Setlist')} · Operador: {user?.nombre || 'Usuario'}");

  if (!text.includes('Restaurar mezcla guardada')) {
    const marker = '          <div className="mb-3 rounded-2xl border border-white/10 bg-black/25 p-3">';
    const block = [
      '          {currentSong?.livePlayback?.mixer && (',
      '            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3">',
      '              <div>',
      '                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Mezcla guardada</p>',
      '                <p className="mt-1 text-[9px] font-semibold text-zinc-600">Volumen, Mute, Solo y Master forman parte del Live Map.</p>',
      '              </div>',
      '              <button type="button" onClick={restoreSavedMixer} disabled={playback.stems.length === 0} className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-30">Restaurar mezcla guardada</button>',
      '            </div>',
      '          )}',
      '',
      '          {playback.stems.some((stem) => stem.solo) && (',
      '            <div className="mb-3 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-amber-200">',
      '              <AlertTriangle size={14} className="shrink-0" />',
      '              <p className="text-[9px] font-bold leading-relaxed">Hay uno o más canales en Solo. Si guardas el Live Map, ese estado se restaurará la próxima vez.</p>',
      '            </div>',
      '          )}',
      '',
      marker
    ].join('\n');
    text = replaceOnce(text, marker, block, 'panel mezcla guardada');
  }

  const required = [
    'standaloneSongMode',
    'applyMixerPreset(currentSong?.livePlayback?.mixer)',
    'const restoreSavedMixer = () =>',
    'version: 2,',
    'mixer,',
    '>Fase 2F</span>',
    'Restaurar mezcla guardada'
  ];
  for (const marker of required) {
    if (!text.includes(marker)) throw new Error(`Validación final fallida en MultitrackLive: ${marker}`);
  }

  return text;
});

console.log('Multitrack Live Fase 2F integrado: Administración + editor individual + mixer persistente.');

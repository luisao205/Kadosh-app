import fs from 'node:fs';

let content = fs.readFileSync('src/components/admin/EditSong.jsx', 'utf8');

// 1. Add Sparkles and useNavigate if needed
if (!content.includes('Sparkles')) {
  content = content.replace("import { Trash2, Plus, Music, ArrowLeft, Save, Eye, Video, Link as LinkIcon, FileText as FileIcon, Upload, Check, AlertCircle, ChevronDown, Radio } from 'lucide-react';",
    "import { Trash2, Plus, Music, ArrowLeft, Save, Eye, Video, Link as LinkIcon, FileText as FileIcon, Upload, Check, AlertCircle, ChevronDown, Radio, Sparkles } from 'lucide-react';");
}

// 2. Add handleOpenMusicAI function
const musicAIHandler = `  const handleOpenMusicAI = () => {
    try {
      sessionStorage.setItem('kadosh_music_ai_draft', JSON.stringify({
        titulo,
        artista,
        tono: tonoOriginal,
        letraRaw,
        youtubeUrl,
        projectionStyle
      }));
    } catch (e) {
      console.warn('No se pudo guardar borrador para Music AI:', e);
    }
    navigate('/music-ai');
  };
`;

if (!content.includes('handleOpenMusicAI')) {
  content = content.replace('  const handleSave = async () => {', `${musicAIHandler}\n  const handleSave = async () => {`);
}

// 3. Add "Preparar con Music AI" button next to top actions
const topButton = `            <button
              type="button"
              onClick={handleOpenMusicAI}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3.5 py-2 text-xs font-black uppercase text-violet-300 hover:bg-violet-500/20 transition-colors shadow-sm"
              title="Abrir en KADOSH Music AI para estructurar letras y acordes con Gemini"
            >
              <Sparkles size={14} className="text-violet-400" />
              <span>Preparar con Music AI</span>
            </button>
`;

if (!content.includes('Preparar con Music AI')) {
  content = content.replace('<div className="flex items-center gap-3">', `<div className="flex items-center gap-3">\n${topButton}`);
}

// 4. Replace separate panels with unified SongResourcesPanel
const oldPanelsBlock = `            {v21Capability.canEditProjectionStyle && <ProjectionStylePanel value={projectionStyle} onChange={setProjectionStyle} />}

            {v21Capability.canEditFormatting && <LyricFormattingDraftEditor
              key={id}
              lyricsRaw={letraRaw}
              sections={parsedSections}
              projectionStyle={projectionStyle}
              initialFormatting={confirmedLyricFormatting}
              formattingStatus={lyricFormattingStatus}
              saveStatus={formatSaveState.status}
              saveMessage={formatSaveState.message}
              onDraftChange={handleFormattingDraftChange}
            />}

            <SongResourcesPanel
              audioUrl={audioUrl}
              audioRef={audioRef}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              volume={volume}
              isMuted={isMuted}
              onToggleAudio={toggleAudio}
              onSeek={handleSeek}
              onVolumeChange={handleVolumeChange}
              onToggleMute={toggleMute}
              onAudioFileChange={(e) => setAudioFile(e.target.files[0])}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => setDuration(e.target.duration)}
              onAudioEnded={() => setIsPlaying(false)}
              youtubeUrl={youtubeUrl}
              onYoutubeUrlChange={setYoutubeUrl}
              multitracks={multitracks}
              nombreStem={nombreStem}
              onNombreStemChange={setNombreStem}
              customStemName={customStemName}
              onCustomStemNameChange={setCustomStemName}
              onUploadStem={handleUploadStem}
              onRemoveStem={removeStem}
              fondoUrl={fondoUrl}
              onFondoUrlChange={handleFondoUrlChange}
              onUploadFondo={handleUploadFondo}
              recursos={recursos}
              nuevoRecurso={nuevoRecurso}
              onNuevoRecursoChange={setNuevoRecurso}
              onAddRecurso={handleAddRecurso}
              onUploadPDF={handleUploadPDF}
              onRemoveRecurso={removeRecurso}
              instrumentosRecursos={INSTRUMENTOS_RECURSOS}
              isSaving={isSaving}
              formatTime={formatTime}
            />

            <SectionMediaManager
              sections={parsedSections}
              sectionMedia={sectionMedia}
              isSaving={isSaving}
              getSectionKey={getSectionKey}
              getSectionDraft={getSectionDraft}
              updateSectionDraft={updateSectionDraft}
              onSelectLibraryResource={handleSelectLibrarySectionMedia}
              onAddUrlResource={addSectionMediaResource}
              onUploadResource={uploadSectionMediaResource}
              onUpdateResource={updateSectionMediaResource}
              onRemoveResource={removeSectionMediaResource}
            />`;

const newUnifiedPanel = `            <SongResourcesPanel
              fondoUrl={fondoUrl}
              onFondoUrlChange={handleFondoUrlChange}
              onUploadFondo={handleUploadFondo}
              isUploadingFondo={isSaving}
              projectionStyle={projectionStyle}
              onProjectionStyleChange={setProjectionStyle}
              canEditProjectionStyle={v21Capability.canEditProjectionStyle}
              canEditFormatting={v21Capability.canEditFormatting}
              lyricFormattingProps={{
                key: id,
                lyricsRaw: letraRaw,
                sections: parsedSections,
                projectionStyle: projectionStyle,
                initialFormatting: confirmedLyricFormatting,
                formattingStatus: lyricFormattingStatus,
                saveStatus: formatSaveState.status,
                saveMessage: formatSaveState.message,
                onDraftChange: handleFormattingDraftChange,
              }}
              audioUrl={audioUrl}
              audioRef={audioRef}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              volume={volume}
              isMuted={isMuted}
              onToggleAudio={toggleAudio}
              onSeek={handleSeek}
              onVolumeChange={handleVolumeChange}
              onToggleMute={toggleMute}
              onAudioFileChange={(e) => setAudioFile(e.target.files[0])}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => setDuration(e.target.duration)}
              onAudioEnded={() => setIsPlaying(false)}
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
              instrumentosRecursos={INSTRUMENTOS_RECURSOS}
              sectionMediaProps={{
                sections: parsedSections,
                sectionMedia: sectionMedia,
                isSaving: isSaving,
                getSectionKey: getSectionKey,
                getSectionDraft: getSectionDraft,
                updateSectionDraft: updateSectionDraft,
                onSelectLibraryResource: handleSelectLibrarySectionMedia,
                onAddUrlResource: addSectionMediaResource,
                onUploadResource: uploadSectionMediaResource,
                onUpdateResource: updateSectionMediaResource,
                onRemoveResource: removeSectionMediaResource,
              }}
              isSaving={isSaving}
              formatTime={formatTime}
            />`;

const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedOld = oldPanelsBlock.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedOld)) {
  const updated = normalizedContent.replace(normalizedOld, newUnifiedPanel);
  fs.writeFileSync('src/components/admin/EditSong.jsx', updated.replace(/\n/g, '\r\n'), 'utf8');
  console.log('✓ Successfully patched EditSong.jsx with unified SongResourcesPanel');
} else {
  console.error('Could not find old panels block in EditSong.jsx');
}

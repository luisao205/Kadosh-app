import {
  findBrokenMediaReferences,
  resolveSectionMedia,
  resolveSongAudio,
  resolveSongBackground,
  resolveSongMedia,
  resolveSongResources
} from './mediaResolver';

const countResolvedSectionMedia = (sectionMedia = {}) => (
  Object.values(sectionMedia).reduce((total, resources) => (
    total + (Array.isArray(resources) ? resources.length : 0)
  ), 0)
);

const hasUsableResolvedResource = (resource) => Boolean(resource && !resource.broken && (resource.url || resource.mediaId));

export const getSongMediaStatus = (song = {}, mediaLibraryItems = []) => {
  const resolvedMedia = resolveSongMedia(song, mediaLibraryItems);
  const background = resolvedMedia.background || resolveSongBackground(song, mediaLibraryItems);
  const sectionMedia = resolvedMedia.sectionMedia || resolveSectionMedia(song?.sectionMedia || {}, mediaLibraryItems);
  const resources = resolvedMedia.resources || resolveSongResources(song, mediaLibraryItems);
  const audio = resolvedMedia.audio || resolveSongAudio(song, mediaLibraryItems);
  const brokenReferences = resolvedMedia.brokenReferences || findBrokenMediaReferences({ song, mediaLibraryItems });

  const sectionMediaCount = countResolvedSectionMedia(sectionMedia);
  const resourceCount = Array.isArray(resources) ? resources.length : 0;
  const audioCount = audio ? 1 : 0;
  const multitrackCount = Array.isArray(song?.multitracks) ? song.multitracks.length : 0;
  const total = sectionMediaCount + resourceCount + audioCount + multitrackCount;

  const criticalBrokenReferences = brokenReferences.filter(reference => (
    reference?.resource?.severity === 'critical'
  ));
  const hasBrokenReferences = brokenReferences.length > 0;
  const hasCriticalBrokenReferences = criticalBrokenReferences.length > 0;
  const hasBackground = hasUsableResolvedResource(background);
  const hasSectionMedia = sectionMediaCount > 0;
  const hasResources = resourceCount > 0;
  const hasAudio = hasUsableResolvedResource(audio);
  const hasMultitracks = multitrackCount > 0;
  const hasSupportResources = hasSectionMedia || hasResources || hasAudio || hasMultitracks;

  if (hasCriticalBrokenReferences) {
    return {
      status: 'broken',
      label: 'Referencias rotas',
      hasBackground,
      hasSectionMedia,
      hasResources,
      hasAudio,
      hasMultitracks,
      brokenReferences,
      counts: {
        sectionMedia: sectionMediaCount,
        resources: resourceCount,
        audio: audioCount,
        multitracks: multitrackCount,
        total
      }
    };
  }

  if (hasBackground && hasSupportResources) {
    return {
      status: 'complete',
      label: hasBrokenReferences ? 'Multimedia con avisos' : 'Multimedia completa',
      hasBackground,
      hasSectionMedia,
      hasResources,
      hasAudio,
      hasMultitracks,
      brokenReferences,
      counts: {
        sectionMedia: sectionMediaCount,
        resources: resourceCount,
        audio: audioCount,
        multitracks: multitrackCount,
        total
      }
    };
  }

  if (hasBackground) {
    return {
      status: 'background-ready',
      label: hasBrokenReferences ? 'Fondo con avisos' : 'Fondo de proyeccion',
      hasBackground,
      hasSectionMedia,
      hasResources,
      hasAudio,
      hasMultitracks,
      brokenReferences,
      counts: {
        sectionMedia: sectionMediaCount,
        resources: resourceCount,
        audio: audioCount,
        multitracks: multitrackCount,
        total
      }
    };
  }

  if (hasSupportResources) {
    return {
      status: 'missing-background',
      label: hasBrokenReferences ? 'Recursos con avisos' : 'Sin fondo de proyeccion',
      hasBackground,
      hasSectionMedia,
      hasResources,
      hasAudio,
      hasMultitracks,
      brokenReferences,
      counts: {
        sectionMedia: sectionMediaCount,
        resources: resourceCount,
        audio: audioCount,
        multitracks: multitrackCount,
        total
      }
    };
  }

  return {
    status: hasBrokenReferences ? 'broken' : 'missing-media',
    label: hasBrokenReferences ? 'Referencias rotas' : 'Sin multimedia',
    hasBackground,
    hasSectionMedia,
    hasResources,
    hasAudio,
    hasMultitracks,
    brokenReferences,
    counts: {
      sectionMedia: sectionMediaCount,
      resources: resourceCount,
      audio: audioCount,
      multitracks: multitrackCount,
      total
    }
  };
};

export default getSongMediaStatus;

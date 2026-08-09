import { parsearCancion } from './songParser';

const hasSectionMedia = (song = {}) => (
  song.sectionMedia
  && typeof song.sectionMedia === 'object'
  && Object.values(song.sectionMedia).some(items => Array.isArray(items) && items.length > 0)
);

export const hasSongMultimedia = (song = {}) => Boolean(song.fondoUrl)
  || (Array.isArray(song.recursos) && song.recursos.length > 0)
  || hasSectionMedia(song);

export const getSongQuality = (song = {}) => {
  const letra = String(song.letraRaw || '');
  const sections = parsearCancion(letra);
  const hasKey = Boolean(song.tonoOriginal || song.tono);
  const hasLyrics = letra.trim().length > 0;
  const hasSections = sections.length > 0;
  const hasChords = /\[[A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?[0-9]*(?:\/[A-G](?:#|b)?)?\]/i.test(letra);
  const hasMedia = hasSongMultimedia(song);
  const issues = [];

  if (!hasKey) issues.push('Sin tono');
  if (!hasLyrics) issues.push('Sin letra');
  if (hasLyrics && !hasSections) issues.push('Sin secciones');
  if (hasLyrics && !hasChords) issues.push('Sin acordes');
  if (!hasMedia) issues.push('Sin multimedia');

  const criticalIssues = issues.filter(issue => issue !== 'Sin multimedia');

  return {
    status: criticalIssues.length === 0 && hasMedia ? 'complete' : 'review',
    label: criticalIssues.length === 0 && hasMedia ? 'Completa' : 'Requiere revision',
    issues,
    checks: {
      hasKey,
      hasLyrics,
      hasSections,
      hasChords,
      hasMedia
    }
  };
};

export const getSongQualityBadges = (song = {}) => {
  const quality = getSongQuality(song);
  const badges = [
    {
      label: quality.label,
      tone: quality.status === 'complete' ? 'success' : 'warning'
    }
  ];

  quality.issues.slice(0, 3).forEach(issue => {
    badges.push({
      label: issue,
      tone: issue === 'Sin multimedia' ? 'neutral' : 'warning'
    });
  });

  return badges;
};

import {
  AudioLines,
  FileText,
  Film,
  Image as ImageIcon,
  Link as LinkIcon
} from 'lucide-react';
import { MEDIA_TYPES } from '../../utils/mediaLibrary';

export const MEDIA_TYPE_LABELS = {
  [MEDIA_TYPES.IMAGE]: 'Imagenes',
  [MEDIA_TYPES.VIDEO]: 'Videos',
  [MEDIA_TYPES.AUDIO]: 'Audios',
  [MEDIA_TYPES.PDF]: 'PDF',
  [MEDIA_TYPES.LINK]: 'Enlaces'
};

export const MEDIA_TYPE_ICONS = {
  [MEDIA_TYPES.IMAGE]: ImageIcon,
  [MEDIA_TYPES.VIDEO]: Film,
  [MEDIA_TYPES.AUDIO]: AudioLines,
  [MEDIA_TYPES.PDF]: FileText,
  [MEDIA_TYPES.LINK]: LinkIcon
};

export const getMediaTypeIcon = (type) => MEDIA_TYPE_ICONS[type] || LinkIcon;

export const getMediaTypeLabel = (type) => MEDIA_TYPE_LABELS[type] || type || 'Media';

export const getMediaStatusLabel = (status) => {
  if (status === 'archived') return 'Archivado';
  if (status === 'pending_delete') return 'En papelera';
  if (status === 'deleted') return 'Eliminado';
  return 'Activo';
};

export const getMediaStatusClassName = (status) => {
  if (status === 'archived') return 'border-amber-500/25 bg-amber-500/10 text-amber-200';
  if (status === 'pending_delete' || status === 'deleted') return 'border-red-500/25 bg-red-500/10 text-red-200';
  return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200';
};


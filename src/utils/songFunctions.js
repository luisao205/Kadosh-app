import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const lyricsCallable = httpsCallable(functions, 'updateSongLyrics');
const chordsCallable = httpsCallable(functions, 'updateSongChords');
const contentCallable = httpsCallable(functions, 'updateSongContent');
const metadataCallable = httpsCallable(functions, 'updateSongMetadata');
const archiveCallable = httpsCallable(functions, 'setSongArchiveState');
const eventSongProjectionStyleCallable = httpsCallable(functions, 'setEventSongProjectionStyle');

export const updateSongLyrics = (songId, letraRaw) => lyricsCallable({ songId, letraRaw });
export const updateSongChords = (songId, letraRaw) => chordsCallable({ songId, letraRaw });
export const updateSongContent = (songId, letraRaw) => contentCallable({ songId, letraRaw });
export const updateSongMetadata = (songId, changes) => metadataCallable({ songId, changes });
export const setSongArchiveState = (songId, archived) => archiveCallable({ songId, archived });
export const setEventSongProjectionStyle = (eventId, songId, projectionStyle) => (
  eventSongProjectionStyleCallable({ eventId, songId, projectionStyle })
);

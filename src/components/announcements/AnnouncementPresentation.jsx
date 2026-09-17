import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import AnnouncementRenderer from './AnnouncementRenderer';
import { canManageAnnouncements } from '../../utils/announcementPermissions';

const AnnouncementPresentation = ({ user, state }) => {
  const allowed = canManageAnnouncements(user);
  const [announcement, setAnnouncement] = useState(null);
  useEffect(() => {
    if (!allowed || !state?.presentationActive || !state.announcementId) return undefined;
    return onSnapshot(doc(db, 'anuncios', state.announcementId), snap => setAnnouncement(snap.exists() ? { id: snap.id, ...snap.data() } : null));
  }, [allowed, state?.announcementId, state?.presentationActive]);
  if (!allowed) return null;
  const slide = announcement?.slides?.[state?.currentSlideIndex || 0];
  return <div className="fixed inset-0 z-30 bg-black"><AnnouncementRenderer user={user} slide={slide} transitionKey={`${state?.announcementId}-${state?.currentSlideIndex}-${state?.updatedAt}`} /></div>;
};
export default AnnouncementPresentation;

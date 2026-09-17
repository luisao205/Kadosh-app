import AnnouncementRenderer from './AnnouncementRenderer';
import { canManageAnnouncements } from '../../utils/announcementPermissions';
const AnnouncementCanvas = ({ user, slide }) => canManageAnnouncements(user) ? <div className="aspect-video w-full overflow-hidden rounded-md border border-white/10 bg-black shadow-2xl"><AnnouncementRenderer user={user} slide={slide} /></div> : null;
export default AnnouncementCanvas;

import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Copy, Edit3, Megaphone, Play, Plus, Trash2 } from 'lucide-react';
import { db } from '../../config/firebase';
import { useFeedback } from '../ui/FeedbackProvider';
import { canDeleteAnnouncements, canManageAnnouncements } from '../../utils/announcementPermissions';
import { ANNOUNCEMENT_TEMPLATES, createBlankAnnouncement } from '../../utils/announcementTemplates';
import { buildAnnouncementProjectionPayload, buildFinishedAnnouncementPayload } from '../../utils/announcementState';
import AnnouncementEditor from './AnnouncementEditor';

const AnnouncementManagement = ({ user }) => {
  const allowed = canManageAnnouncements(user);
  const { notify, confirm } = useFeedback();
  const [items, setItems] = useState([]); const [events, setEvents] = useState([]); const [draft, setDraft] = useState(null); const [eventId, setEventId] = useState(''); const [presenting, setPresenting] = useState(null);
  useEffect(() => allowed ? onSnapshot(collection(db, 'anuncios'), snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))) : undefined, [allowed]);
  useEffect(() => allowed ? onSnapshot(collection(db, 'eventos'), snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.id !== 'global'))) : undefined, [allowed]);
  const save = async () => { const data = { title: draft.title.trim() || 'Anuncio', status: draft.status || 'draft', slides: draft.slides || [], updatedAt: serverTimestamp(), updatedBy: user.uid }; if (draft.id) await setDoc(doc(db,'anuncios',draft.id),data,{merge:true}); else await addDoc(collection(db,'anuncios'),{...data,createdAt:serverTimestamp(),createdBy:user.uid}); setDraft(null); notify('Anuncio guardado.',{type:'success'}); };
  const present = async (announcement, index=0, autoAdvance=false) => { if (!eventId) return notify('Selecciona un evento.',{type:'warning'}); await setDoc(doc(db,'eventos',eventId),buildAnnouncementProjectionPayload({announcement,slideIndex:index,user,autoAdvance}),{merge:true}); setPresenting({announcement,index,autoAdvance}); };
  const move = delta => { if (!presenting) return; const index=Math.max(0,Math.min(presenting.index+delta,presenting.announcement.slides.length-1)); present(presenting.announcement,index,presenting.autoAdvance); };
  const finish = async () => { if (!eventId) return; await setDoc(doc(db,'eventos',eventId),buildFinishedAnnouncementPayload(),{merge:true}); setPresenting(null); };
  useEffect(() => {
    if (!presenting?.autoAdvance) return undefined;
    const slide = presenting.announcement.slides[presenting.index];
    if (!slide || presenting.index >= presenting.announcement.slides.length - 1) return undefined;
    const timer = window.setTimeout(() => move(1), Math.max(1000, slide.durationMs || 7000));
    return () => window.clearTimeout(timer);
  // The presentation object is replaced after every navigation or auto-mode change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting]);
  if (!allowed) return null;
  if (draft) return <div className="h-full min-h-0 p-4"><AnnouncementEditor user={user} value={draft} onChange={setDraft} onSave={save} onClose={()=>setDraft(null)}/></div>;
  return <div className="h-full overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-7xl"><div className="mb-5 flex flex-wrap items-center gap-3"><div className="mr-auto"><h1 className="text-2xl font-black"><Megaphone className="mr-2 inline text-amber-400"/>Anuncios</h1><p className="text-sm text-zinc-500">Presentaciones reutilizables para congregacion</p></div><select value={eventId} onChange={e=>setEventId(e.target.value)} className="rounded-md border border-white/10 bg-zinc-900 px-3 py-2"><option value="">Evento destino</option>{events.map(e=><option key={e.id} value={e.id}>{e.titulo || e.id}</option>)}</select><button onClick={()=>setDraft(createBlankAnnouncement())} className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-black"><Plus/>Crear</button></div>
  <div className="mb-5 flex gap-2 overflow-x-auto">{ANNOUNCEMENT_TEMPLATES.map(t=><button key={t.id} onClick={()=>setDraft(t.create())} className="shrink-0 rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-black">{t.name}</button>)}</div>
  {presenting&&<div className="mb-5 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3"><span className="mr-auto font-black">Presentando: {presenting.announcement.title} ({presenting.index+1}/{presenting.announcement.slides.length})</span><button onClick={()=>present(presenting.announcement,presenting.index,!presenting.autoAdvance)} className="rounded bg-zinc-800 px-3 py-2">Auto: {presenting.autoAdvance?'Si':'No'}</button><button onClick={()=>move(-1)} className="rounded bg-zinc-800 px-3 py-2">Anterior</button><button onClick={()=>move(1)} className="rounded bg-zinc-800 px-3 py-2">Siguiente</button><button onClick={finish} className="rounded bg-red-600 px-3 py-2">Finalizar</button></div>}
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(item=><article key={item.id} className="rounded-md border border-white/10 bg-zinc-900 p-4"><h2 className="truncate text-lg font-black">{item.title}</h2><p className="text-xs text-zinc-500">{item.slides?.length||0} diapositivas</p><div className="mt-4 flex gap-2"><button onClick={()=>setDraft(item)} title="Editar"><Edit3/></button><button onClick={()=>present(item)} title="Presentar"><Play/></button><button onClick={()=>setDraft({...item,id:null,title:`${item.title} copia`})} title="Duplicar"><Copy/></button>{canDeleteAnnouncements(user)&&<button onClick={async()=>{if(await confirm({title:'Eliminar anuncio',message:'Esta accion no se puede deshacer.',confirmLabel:'Eliminar',tone:'danger'}))await deleteDoc(doc(db,'anuncios',item.id));}} title="Eliminar" className="text-red-400"><Trash2/></button>}</div></article>)}</div></div></div>;
};
export default AnnouncementManagement;

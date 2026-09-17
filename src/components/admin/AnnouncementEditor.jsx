import { useState } from 'react';
import { Copy, Image, MonitorPlay, Plus, Save, Trash2, Type, Video } from 'lucide-react';
import MediaPicker from '../media/MediaPicker';
import AnnouncementCanvas from '../announcements/AnnouncementCanvas';
import AnnouncementRenderer from '../announcements/AnnouncementRenderer';
import { canManageAnnouncements } from '../../utils/announcementPermissions';

const newId = () => crypto.randomUUID();
const AnnouncementEditor = ({ user, value, onChange, onSave, onClose }) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [pickerTarget, setPickerTarget] = useState(null);
  const slides = value.slides || [];
  const slide = slides[slideIndex];
  const selected = slide?.elements?.find(item => item.id === selectedId);
  if (!canManageAnnouncements(user)) return null;
  const updateSlide = next => onChange({ ...value, slides: slides.map((item, index) => index === slideIndex ? next : item) });
  const addElement = (type, mediaId = null) => updateSlide({ ...slide, elements: [...(slide.elements || []), { id: newId(), type, text: type === 'text' ? 'Nuevo texto' : '', mediaId, x: 10, y: 20, width: 80, height: 55, color: '#ffffff', fontSize: 56, fontWeight: 800, align: 'center', opacity: 1, autoplay: true, loop: true, muted: true }] });
  const updateElement = patch => updateSlide({ ...slide, elements: slide.elements.map(item => item.id === selectedId ? { ...item, ...patch } : item) });
  const addSlide = () => { const next = { id: newId(), transition: { type: 'fade', durationMs: 500 }, durationMs: 7000, background: { type: 'color', color: '#18181b' }, elements: [] }; onChange({ ...value, slides: [...slides, next] }); setSlideIndex(slides.length); };
  return <div className="flex h-full min-h-0 flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2"><input value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} className="min-w-48 flex-1 rounded-md border border-white/10 bg-zinc-950 px-3 py-2 font-black" />
      <button onClick={() => addElement('text')} className="rounded-md bg-zinc-800 p-2" title="Texto"><Type size={18}/></button>
      <button onClick={() => setPickerTarget('image')} className="rounded-md bg-zinc-800 p-2" title="Imagen"><Image size={18}/></button>
      <button onClick={() => setPickerTarget('video')} className="rounded-md bg-zinc-800 p-2" title="Video"><Video size={18}/></button>
      <button onClick={() => setPickerTarget('background')} className="rounded-md bg-zinc-800 p-2" title="Fondo"><MonitorPlay size={18}/></button>
      <button onClick={onSave} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-black"><Save size={16}/> Guardar</button>
      <button onClick={onClose} className="rounded-md border border-white/10 px-3 py-2 text-xs font-black">Cerrar</button></div>
    <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]"><div className="min-h-0 overflow-y-auto"><AnnouncementCanvas user={user} slide={slide}/></div>
      <aside className="min-h-0 overflow-y-auto rounded-md border border-white/10 bg-zinc-950 p-3">{selected ? <div className="space-y-3"><p className="text-xs font-black uppercase">Elemento</p>{selected.type === 'text' && <textarea value={selected.text} onChange={e => updateElement({ text: e.target.value })} className="w-full rounded-md bg-zinc-900 p-2"/>}{['x','y','width','height','opacity'].map(key => <label key={key} className="block text-xs text-zinc-400">{key}<input type="number" step={key === 'opacity' ? .1 : 1} value={selected[key]} onChange={e => updateElement({ [key]: Number(e.target.value) })} className="mt-1 w-full rounded-md bg-zinc-900 p-2 text-white"/></label>)}<button onClick={() => { updateSlide({ ...slide, elements: slide.elements.filter(item => item.id !== selectedId) }); setSelectedId(null); }} className="inline-flex items-center gap-2 text-xs font-black text-red-300"><Trash2 size={15}/> Eliminar elemento</button></div> : <div className="space-y-3"><label className="block text-xs">Fondo<input type="color" value={slide?.background?.color || '#000000'} onChange={e => updateSlide({ ...slide, background: { type: 'color', color: e.target.value } })} className="mt-1 h-10 w-full"/></label><label className="block text-xs">Transicion<select value={slide?.transition?.type || 'fade'} onChange={e => updateSlide({ ...slide, transition: { ...slide.transition, type: e.target.value } })} className="mt-1 w-full rounded-md bg-zinc-900 p-2"><option>fade</option><option>slide</option><option>zoom</option></select></label></div>}</aside></div>
    <div className="flex gap-2 overflow-x-auto">{slides.map((item,index)=><button key={item.id} onClick={()=>{setSlideIndex(index);setSelectedId(null);}} className={`relative h-20 w-36 shrink-0 overflow-hidden rounded-md border ${index===slideIndex?'border-violet-400':'border-white/10'}`}><AnnouncementRenderer user={user} slide={item}/><span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-xs">{index+1}</span></button>)}<button onClick={addSlide} className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-white/20"><Plus/></button>{slide && <><button onClick={()=>{const clone={...slide,id:newId(),elements:slide.elements.map(e=>({...e,id:newId()}))};onChange({...value,slides:[...slides.slice(0,slideIndex+1),clone,...slides.slice(slideIndex+1)]});}} title="Duplicar diapositiva"><Copy/></button></>}</div>
    {slide?.elements?.length > 0 && <div className="flex gap-2 overflow-x-auto">{slide.elements.map(item=><button key={item.id} onClick={()=>setSelectedId(item.id)} className={`rounded-md px-2 py-1 text-xs ${selectedId===item.id?'bg-violet-600':'bg-zinc-800'}`}>{item.type}</button>)}</div>}
    <MediaPicker open={Boolean(pickerTarget)} onClose={()=>setPickerTarget(null)} acceptedTypes={pickerTarget==='video'?['video']:['image','video']} context="announcement" onSelect={media=>{if(pickerTarget==='background')updateSlide({...slide,background:{type:media.type,mediaId:media.mediaId}});else addElement(pickerTarget,media.mediaId);setPickerTarget(null);}} />
  </div>;
};
export default AnnouncementEditor;

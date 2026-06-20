import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { AlertCircle, ArrowRight, BookOpen, Clock3, Lock, MessageSquare, ShieldCheck, StickyNote, TimerReset } from 'lucide-react';

const PRIVATE_ROLES = ['dueño', 'admin', 'multimedia', 'predicador'];

const formatClock = (value) => {
  if (!value) return '00:00';
  const diff = Math.max(0, Date.now() - value);
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const formatTime = (value) => {
  if (!value) return 'Sin actualizar';
  return new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

const getInstructionStyle = (value) => {
  const text = String(value || '').toLowerCase();
  if (text.includes('oraci')) return 'bg-sky-500/15 border-sky-400/30 text-sky-100';
  if (text.includes('ofrenda')) return 'bg-emerald-500/15 border-emerald-400/30 text-emerald-100';
  if (text.includes('llamado')) return 'bg-rose-500/15 border-rose-400/30 text-rose-100';
  if (text.includes('ministra')) return 'bg-violet-500/15 border-violet-400/30 text-violet-100';
  if (text.includes('cierre')) return 'bg-amber-500/15 border-amber-400/30 text-amber-100';
  return 'bg-zinc-800 border-zinc-700 text-zinc-100';
};

const PreacherDisplay = ({ eventoIdOverride, user }) => {
  const { eventoId: routeEventoId } = useParams();
  const eventoId = eventoIdOverride || routeEventoId;
  const canViewPrivate = PRIVATE_ROLES.includes(user?.rol);
  const [preacherState, setPreacherState] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!canViewPrivate || !eventoId) return undefined;
    const unsub = onSnapshot(doc(db, 'eventos', eventoId, 'private', 'preacher'), (snap) => {
      setPreacherState(snap.exists() ? snap.data() : null);
    });
    return () => unsub();
  }, [canViewPrivate, eventoId]);

  useEffect(() => {
    if (!canViewPrivate || !eventoId) return undefined;
    const unsub = onSnapshot(doc(db, 'eventos', eventoId), (snap) => {
      if (!snap.exists()) return;
      setCountdown(snap.data().proyectorCountdown || null);
    });
    return () => unsub();
  }, [canViewPrivate, eventoId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const countdownText = useMemo(() => {
    if (!countdown?.active || !countdown?.endTimestamp) return '';
    const diff = Math.max(0, countdown.endTimestamp - now);
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [countdown, now]);

  if (!canViewPrivate) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-white flex items-center justify-center p-8">
        <div className="max-w-lg text-center rounded-3xl border border-red-500/30 bg-red-500/10 p-8">
          <Lock className="mx-auto text-red-300 mb-4" size={42} />
          <h1 className="text-2xl font-black mb-2">Pantalla privada bloqueada</h1>
          <p className="text-sm text-red-100/80 font-medium">Esta salida solo puede abrirse con rol multimedia, admin o predicador.</p>
        </div>
      </div>
    );
  }

  if (!preacherState) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-zinc-600 flex items-center justify-center p-10">
        <div className="text-center">
          <ShieldCheck className="mx-auto mb-5 text-amber-500/50" size={54} />
          <p className="text-5xl font-black tracking-tight mb-3">PREDICADOR</p>
          <p className="text-xs font-black uppercase tracking-[0.4em]">Esperando contenido privado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#080a0f] text-white overflow-hidden p-5 md:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.10),transparent_28%)] pointer-events-none" />
      <div className="relative h-full grid grid-rows-[auto_1fr_auto] gap-5">
        <header className="flex items-start justify-between gap-5 border-b border-white/10 pb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 text-[10px] font-black uppercase tracking-[0.28em]">Privado / Solo Predicador</span>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Actualizado {formatTime(preacherState.updatedAt)}</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight truncate">{preacherState.tema || 'Tema sin definir'}</h1>
          </div>
          <div className="grid grid-cols-2 gap-3 shrink-0">
            <div className="rounded-2xl bg-zinc-900/90 border border-zinc-800 px-4 py-3 text-right shadow-2xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center justify-end gap-1"><Clock3 size={12}/> Transcurrido</p>
              <p className="font-mono text-3xl md:text-4xl font-black">{formatClock(preacherState.startedAt || preacherState.updatedAt)}</p>
            </div>
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-right shadow-2xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300 flex items-center justify-end gap-1"><TimerReset size={12}/> Restante</p>
              <p className="font-mono text-3xl md:text-4xl font-black text-emerald-200">{countdownText || preacherState.tiempoRestante || '--:--'}</p>
            </div>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-5 min-h-0">
          <section className="rounded-[2rem] border border-violet-500/30 bg-violet-500/10 p-7 flex flex-col justify-center shadow-[0_25px_80px_rgba(0,0,0,0.35)]">
            <p className="text-[11px] font-black uppercase tracking-[0.35em] text-violet-300 mb-5">Punto actual</p>
            <h2 className="text-5xl md:text-7xl xl:text-8xl font-black leading-[1.03]">{preacherState.puntoActual || 'Sin punto actual'}</h2>
            <div className="mt-8 rounded-3xl bg-black/30 border border-white/10 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 flex items-center gap-2"><ArrowRight size={14}/> Siguiente punto</p>
              <p className="text-2xl md:text-4xl font-bold text-zinc-200">{preacherState.siguientePunto || 'Sin siguiente punto'}</p>
            </div>
          </section>

          <section className="grid grid-rows-[0.9fr_1.1fr] gap-5 min-h-0">
            <div className="rounded-[2rem] border border-blue-500/20 bg-blue-500/10 p-6 overflow-hidden shadow-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-300 mb-4 flex items-center gap-2"><BookOpen size={16}/> Versiculo actual</p>
              <p className="text-2xl md:text-4xl font-black leading-snug whitespace-pre-wrap">{preacherState.versiculoActual || 'Sin versiculo'}</p>
            </div>
            <div className="rounded-[2rem] border border-amber-500/25 bg-amber-500/10 p-6 overflow-hidden shadow-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-300 mb-4 flex items-center gap-2"><StickyNote size={16}/> Notas privadas</p>
              <p className="text-xl md:text-3xl font-bold leading-snug whitespace-pre-wrap text-amber-50">{preacherState.notasPrivadas || 'Sin notas privadas'}</p>
            </div>
          </section>
        </main>

        <footer className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
          <div className="rounded-2xl bg-cyan-500/10 border border-cyan-400/20 px-5 py-4 flex items-start gap-3">
            <MessageSquare className="text-cyan-300 shrink-0 mt-1" size={22} />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300 mb-1">Mensaje interno</p>
              <p className="text-xl md:text-2xl font-bold text-cyan-50">{preacherState.mensajesInternos || 'Sin mensajes internos'}</p>
            </div>
          </div>
          <div className={`rounded-2xl border px-5 py-4 flex items-start gap-3 min-w-[300px] ${getInstructionStyle(preacherState.indicaciones)}`}>
            <AlertCircle className="shrink-0 mt-1" size={22} />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Indicacion</p>
              <p className="text-xl md:text-2xl font-black">{preacherState.indicaciones || 'Sin indicacion'}</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default PreacherDisplay;

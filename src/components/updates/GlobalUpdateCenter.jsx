import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { RefreshCw, X } from 'lucide-react';
import { db } from '../../config/firebase';
import UpdateCenter from '../admin/UpdateCenter';

const GlobalUpdateCenter = () => {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('updates') === '1';
  });

  useEffect(() => onAuthStateChanged(getAuth(), async (firebaseUser) => {
    if (!firebaseUser) {
      setUser(null);
      return;
    }
    try {
      const snapshot = await getDoc(doc(db, 'usuarios', firebaseUser.uid));
      setUser({ uid: firebaseUser.uid, email: firebaseUser.email, ...(snapshot.exists() ? snapshot.data() : {}) });
    } catch (error) {
      console.warn('No se pudo cargar el perfil para actualizaciones:', error);
      setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
    }
  }), []);

  const close = () => {
    setOpen(false);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('updates')) return;
    url.searchParams.delete('updates');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[80] flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-zinc-900/95 text-cyan-300 shadow-2xl shadow-black/40 backdrop-blur hover:bg-zinc-800"
        aria-label="Abrir centro de actualizaciones"
        title="Centro de Actualizaciones"
      >
        <RefreshCw size={19} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/75 p-4 backdrop-blur-sm md:p-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={close} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white" aria-label="Cerrar centro de actualizaciones">
                <X size={20} />
              </button>
            </div>
            <UpdateCenter user={user} />
          </div>
        </div>
      )}
    </>
  );
};

export default GlobalUpdateCenter;

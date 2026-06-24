import React, { useState } from 'react';
import { Music, Lock, Mail, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMsg('');
    setError('');
    setIsLoading(true);

    try {
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, email, password);
      // App.jsx detecta el login automaticamente a traves de Firebase.
    } catch (err) {
      console.error(err);
      setError('Correo o contraseña incorrectos.');
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setSuccessMsg('');
    setError('');
    if (!email) {
      setError('Por favor, ingresa tu correo electrónico arriba para enviarte el enlace.');
      return;
    }
    setIsLoading(true);
    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, email);
      setSuccessMsg('Enlace enviado. Revisa tu bandeja de entrada y la carpeta de spam.');
    } catch (err) {
      console.error(err);
      setError('No se pudo enviar el correo. Verifica que esté bien escrito.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="kp-app-shell relative flex min-h-screen flex-col justify-center overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_82%_4%,rgba(124,58,237,0.2),transparent_30%)]" />

      <div className="relative z-10 mx-auto w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-2xl shadow-violet-950/40 backdrop-blur-md">
            <Music className="h-8 w-8 text-violet-200" />
          </div>
          <div className="mb-3 flex items-center justify-center gap-2">
            <h1 className="text-4xl font-black tracking-tight text-white">Kadosh</h1>
            <span className="kp-badge rounded-lg px-2 py-1 text-xs font-black uppercase tracking-widest text-violet-100">Pro</span>
          </div>
          <p className="mx-auto max-w-sm text-sm font-medium leading-relaxed text-zinc-400">
            Sistema musical y multimedia profesional para iglesia.
          </p>
        </div>

        <div className="kp-card rounded-3xl px-5 py-6 sm:px-8 sm:py-8">
          <div className="mb-6">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-300">Acceso ministerial</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Iniciar sesión</h2>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-center text-sm font-bold text-red-200">{error}</div>}
            {successMsg && <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-center text-sm font-bold text-emerald-200">{successMsg}</div>}

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-zinc-400">Correo electrónico</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500"><Mail size={18} /></div>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="kp-input block rounded-2xl py-3 pl-10 pr-3 text-sm font-medium" placeholder="musico@kadosh.com" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-zinc-400">Contraseña</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500"><Lock size={18} /></div>
                <input type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} className="kp-input block rounded-2xl py-3 pl-10 pr-10 text-sm font-medium" placeholder="••••••••" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 transition-colors hover:text-zinc-200"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={handleResetPassword} className="text-xs font-black uppercase tracking-wide text-blue-300 transition-colors hover:text-blue-200">
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <button type="submit" disabled={isLoading} className="kp-button-primary flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-60">
              {isLoading ? 'Autenticando...' : 'Entrar a Kadosh Pro'}
              {!isLoading && <ArrowRight size={18} />}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-center text-xs font-bold text-zinc-500">
            Acceso exclusivo para miembros del ministerio.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

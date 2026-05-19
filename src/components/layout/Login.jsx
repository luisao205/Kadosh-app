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
      // App.jsx detectará el login automáticamente a través de Firebase
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
      setSuccessMsg('¡Enlace enviado! Revisa tu bandeja de entrada (y la carpeta de spam).');
    } catch (err) {
      console.error(err);
      setError('No se pudo enviar el correo. Verifica que esté bien escrito.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Círculos decorativos de fondo */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-100/50 blur-3xl"></div>
        <div className="absolute top-1/2 right-0 w-80 h-80 rounded-full bg-violet-100/50 blur-3xl"></div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 transform -rotate-6">
            <Music className="text-white w-8 h-8 transform rotate-6" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-black tracking-tight text-zinc-900">
          Kadosh <span className="text-blue-600">App</span>
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-500 font-medium">
          Gestión de repertorio y eventos musicales
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-zinc-200/50 sm:rounded-3xl sm:px-10 border border-zinc-100 relative">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm font-bold rounded-xl text-center">{error}</div>}
            {successMsg && <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm font-bold rounded-xl text-center">{successMsg}</div>}
            
            <div>
              <label className="block text-sm font-bold text-zinc-700 mb-1">Correo Electrónico</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400"><Mail size={18} /></div>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full pl-10 pr-3 py-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-zinc-50 focus:bg-white text-zinc-900 text-sm font-medium" placeholder="musico@kadosh.com" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-zinc-700 mb-1">Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400"><Lock size={18} /></div>
                <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} className="block w-full pl-10 pr-10 py-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-zinc-50 focus:bg-white text-zinc-900 text-sm font-medium" placeholder="••••••••" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <div className="flex justify-end mt-2">
              <button type="button" onClick={handleResetPassword} className="text-xs font-bold text-blue-600 hover:text-blue-500 transition-colors">
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <button type="submit" disabled={isLoading} className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed">
              {isLoading ? 'Autenticando...' : 'Iniciar Sesión'}
              {!isLoading && <ArrowRight size={18} />}
            </button>
          </form>
          
          <div className="mt-6 text-center text-xs font-medium text-zinc-400">
            Acceso exclusivo para miembros del ministerio
          </div>
        </div>
      </div>
    </div>
  );
};
export default Login;
import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { User, Save, Moon, Sun, Type, Camera, Loader2, Quote, Mic2, Palette, Check, X } from 'lucide-react';

const UserProfile = ({ user }) => {
  // Extraemos las preferencias guardadas o usamos unas por defecto
  const prefGuardadas = user?.preferencias || {};
  
  const [darkMode, setDarkMode] = useState(prefGuardadas.darkMode ?? false);
  const [fontSize, setFontSize] = useState(prefGuardadas.fontSize ?? 16);
  const [ocultarAcordes, setOcultarAcordes] = useState(prefGuardadas.ocultarAcordes ?? false);
  const [formatoAcordes, setFormatoAcordes] = useState(prefGuardadas.formatoAcordes || 'american');
  const [themeColor, setThemeColor] = useState(prefGuardadas.themeColor || 'violet');
  const [biografia, setBiografia] = useState(user?.biografia || '');
  const [fotoUrl, setFotoUrl] = useState(user?.fotoPerfil || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const themeStyles = {
    violet: 'bg-violet-600 hover:bg-violet-700 text-white ring-violet-200 dark:ring-violet-900',
    blue: 'bg-blue-600 hover:bg-blue-700 text-white ring-blue-200 dark:ring-blue-900',
    rose: 'bg-rose-600 hover:bg-rose-700 text-white ring-rose-200 dark:ring-rose-900'
  };

  // Compresión mágica de imagen antes de subirla
  const handleImageUpload = async (e) => {
    const NOW = Date.now();
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    
    // Normalizar historial de fotos (retrocompatibilidad con el campo viejo)
    let historial = user?.historialFotos || [];
    if (typeof user?.ultimaActualizacionFoto === 'string' && historial.length === 0) {
      historial = [user.ultimaActualizacionFoto];
    }
    
    // Filtrar solo las fotos subidas en las últimas 24 horas
    historial = historial.filter(fecha => (NOW - new Date(fecha).getTime()) < COOLDOWN_MS);

    if (historial.length >= 3) {
      const olderDate = new Date(historial[0]).getTime();
      const horasRestantes = Math.ceil(24 - ((NOW - olderDate) / (1000 * 60 * 60)));
      showToast(`Límite alcanzado (3 fotos por día). Intenta en ${horasRestantes} hora(s).`, 'error');
      e.target.value = '';
      return;
    }

    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 300; // Reducimos la imagen a 300x300 máximo
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Convertir a JPEG de baja calidad (pesará apenas unos ~20kb)
      canvas.toBlob(async (blob) => {
        try {
          const storage = getStorage();
          const avatarRef = ref(storage, `avatars/${user.uid}.jpg`);
          await uploadBytes(avatarRef, blob);
          const url = await getDownloadURL(avatarRef);
          
          historial.push(new Date().toISOString());
          await updateDoc(doc(db, 'usuarios', user.uid), { 
            fotoPerfil: url,
            historialFotos: historial
          });
          setFotoUrl(url);
          showToast("¡Foto de perfil actualizada exitosamente!");
        } catch (error) {
          console.error(error);
          showToast("Error al subir la imagen.", "error");
        } finally {
          setIsUploading(false);
        }
      }, 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'usuarios', user.uid), {
        biografia,
        preferencias: {
          darkMode: darkMode ?? false,
          fontSize: Number(fontSize) || 16,
          ocultarAcordes: ocultarAcordes ?? false,
          formatoAcordes: formatoAcordes || 'american',
          themeColor: themeColor || 'violet'
        }
      });
      showToast("¡Preferencias guardadas! Se aplicarán la próxima vez que inicies sesión o recargues la aplicación.");
    } catch (error) {
      console.error(error);
      showToast("Hubo un error al guardar.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-500 pb-12">
      <header className="mb-8 flex items-center gap-3">
        
        <div className="relative group">
          <div className="w-20 h-20 bg-violet-100 text-violet-700 rounded-3xl flex items-center justify-center overflow-hidden shadow-sm border border-violet-200">
            {isUploading ? (
              <Loader2 size={28} className="animate-spin text-violet-500" />
            ) : fotoUrl ? (
              <img src={fotoUrl} alt="Avatar" onClick={() => setViewingPhoto(true)} className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" title="Ver foto ampliada" />
            ) : (
              <User size={36} />
            )}
          </div>
          
          <label className="absolute -bottom-2 -right-2 p-2 bg-zinc-900 text-white rounded-full shadow-lg cursor-pointer hover:bg-zinc-800 transition-colors active:scale-95 group-hover:scale-110">
            <Camera size={14} />
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isUploading} />
          </label>
        </div>

        <div className="ml-2">
          <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Mi Perfil</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm font-medium">
            Hola, <span className="text-violet-600 dark:text-violet-400 font-bold">{user?.nombre}</span>. Personaliza tu cuenta.
          </p>
        </div>
      </header>

      <div className="bg-white dark:bg-zinc-900 p-6 md:p-8 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 transition-colors">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-4">Preferencias de la Aplicación</h2>
        
        <div className="space-y-8 max-w-md">
          
          {/* Biografía / Info */}
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
              <Quote size={18} className="text-violet-600" /> Biografía / Versículo
            </label>
            <textarea value={biografia} onChange={(e) => setBiografia(e.target.value)} placeholder="Ej. Baterista de corazón | Salmos 150" className="w-full p-3 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:ring-2 focus:ring-violet-500 outline-none resize-none h-20" />
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">Esta información será visible para el equipo.</p>
          </div>

          {/* Tamaño de Letra */}
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
              <Type size={18} className="text-violet-600" /> Tamaño de letra inicial (px)
            </label>
            <div className="flex items-center gap-4">
              <input type="range" min="16" max="60" value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="w-full accent-violet-600" />
              <span className="font-bold text-zinc-900 dark:text-white w-12 text-center bg-zinc-100 dark:bg-zinc-800 p-2 rounded-lg">{fontSize}</span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">Puedes seguir ajustándolo manualmente durante el evento.</p>
          </div>

          {/* Formato de Acordes */}
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
              <Type size={18} className="text-violet-600" /> Formato de Acordes
            </label>
            <div className="flex flex-col sm:flex-row bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-full sm:w-max gap-1">
              <button onClick={() => setFormatoAcordes('american')} className={`flex justify-center items-center gap-2 px-6 py-2.5 sm:py-2 rounded-lg text-sm font-bold transition-all ${formatoAcordes === 'american' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
                Americano (C, D, E)
              </button>
              <button onClick={() => setFormatoAcordes('latin')} className={`flex justify-center items-center gap-2 px-6 py-2.5 sm:py-2 rounded-lg text-sm font-bold transition-all ${formatoAcordes === 'latin' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
                Latino (Do, Re, Mi)
              </button>
            </div>
          </div>

          {/* Modo Oscuro */}
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
              <Moon size={18} className="text-violet-600" /> Tema de la Aplicación
            </label>
            <div className="flex flex-col sm:flex-row bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-full sm:w-max gap-1">
              <button onClick={() => setDarkMode(false)} className={`flex justify-center items-center gap-2 px-6 py-2.5 sm:py-2 rounded-lg text-sm font-bold transition-all ${!darkMode ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
                <Sun size={16} /> Claro
              </button>
              <button onClick={() => setDarkMode(true)} className={`flex justify-center items-center gap-2 px-6 py-2.5 sm:py-2 rounded-lg text-sm font-bold transition-all ${darkMode ? 'bg-zinc-900 dark:bg-zinc-600 shadow-sm text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
                <Moon size={16} /> Oscuro
              </button>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-zinc-100 dark:border-zinc-800">
          <button onClick={handleSave} disabled={isSaving} className={`flex items-center justify-center gap-2 py-3 px-8 rounded-xl shadow-md text-sm font-bold disabled:opacity-50 transition-all active:scale-95 ${themeStyles[themeColor] || themeStyles.violet}`}>
            <Save size={18} /> {isSaving ? 'Guardando...' : 'Guardar Preferencias'}
          </button>
        </div>
      </div>

      {/* Modal para ver Foto en Grande */}
      {viewingPhoto && fotoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setViewingPhoto(false)}>
          <button className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors p-2 bg-white/10 rounded-full hover:bg-white/20" onClick={() => setViewingPhoto(false)}>
            <X size={24} />
          </button>
          <img 
            src={fotoUrl} 
            alt="Foto de perfil ampliada" 
            className="max-w-full max-h-[85vh] rounded-3xl shadow-2xl object-contain animate-in zoom-in-95 border border-white/10"
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}

      {toast && (<div className={`fixed bottom-6 right-6 p-4 rounded-xl shadow-xl text-sm font-bold animate-in slide-in-from-bottom-5 z-50 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>{toast.message}</div>)}
    </div>
  );
};
export default UserProfile;
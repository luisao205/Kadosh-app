import React, { useState, useEffect } from 'react';
import { doc, updateDoc, collection, addDoc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, messaging } from '../../config/firebase';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getToken } from 'firebase/messaging';
import { User, Save, Moon, Sun, Type, Camera, Loader2, Quote, Mic2, Palette, Check, X, Bell, BellRing, Settings, Lock } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { getAccountStatusLabel, normalizeAccountStatus } from '../../utils/accountStatus';
import { isOwner } from '../../utils/rolePermissions';
import { clearTeamPinSession, createPinSalt, hashTeamPin, isCompletePin, sanitizePin, TEAM_PIN_DOC_PATH } from '../../utils/teamPinAccess';
import { useFeedback } from '../ui/FeedbackProvider';

const UserProfile = ({ user }) => {
  const { notify } = useFeedback();
  // Extraemos las preferencias guardadas o usamos unas por defecto
  const prefGuardadas = user?.preferencias || {};
  
  const [darkMode, setDarkMode] = useState(prefGuardadas.darkMode ?? false);
  const [fontSize, setFontSize] = useState(prefGuardadas.fontSize ?? 16);
  const [ocultarAcordes, setOcultarAcordes] = useState(prefGuardadas.ocultarAcordes ?? false);
  const [formatoAcordes, setFormatoAcordes] = useState(prefGuardadas.formatoAcordes || 'american');
  const [notacion, setNotacion] = useState(prefGuardadas.notacion || 'sharps');
  const [themeColor, setThemeColor] = useState(prefGuardadas.themeColor || 'violet');
  const [biografia, setBiografia] = useState(user?.biografia || '');
  const [fotoUrl, setFotoUrl] = useState(user?.fotoPerfil || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const [permisoConcedido, setPermisoConcedido] = useState(false);
  const [isSendingTestNotification, setIsSendingTestNotification] = useState(false);
  const [teamPinConfig, setTeamPinConfig] = useState(null);
  const [loadingTeamPin, setLoadingTeamPin] = useState(false);
  const [savingTeamPin, setSavingTeamPin] = useState(false);
  const [teamPinError, setTeamPinError] = useState('');
  const [teamPinForm, setTeamPinForm] = useState({ current: '', next: '', confirm: '' });
  const [teamPinAttempts, setTeamPinAttempts] = useState(0);
  const [teamPinLockedUntil, setTeamPinLockedUntil] = useState(0);
  const isOwnerUser = isOwner(user);

  useEffect(() => {
    const checkPerms = async () => {
      if (Capacitor.isNativePlatform()) {
        const status = await PushNotifications.checkPermissions();
        setPermisoConcedido(status.receive === 'granted');
      } else {
        setPermisoConcedido(Notification.permission === 'granted');
      }
    };
    checkPerms();
  }, []);

  useEffect(() => {
    if (!isOwnerUser) return;
    let mounted = true;
    const loadTeamPin = async () => {
      setLoadingTeamPin(true);
      try {
        const snap = await getDoc(doc(db, ...TEAM_PIN_DOC_PATH));
        if (mounted) setTeamPinConfig(snap.exists() ? snap.data() : null);
      } catch (error) {
        console.error('Error cargando PIN de Equipo:', error);
        if (mounted) setTeamPinError('No se pudo cargar la configuración del PIN.');
      } finally {
        if (mounted) setLoadingTeamPin(false);
      }
    };
    loadTeamPin();
    return () => { mounted = false; };
  }, [isOwnerUser]);
  const showToast = (message, type = 'success') => notify(message, { type });

  const themeStyles = {
    violet: 'bg-violet-600 hover:bg-violet-700 text-white ring-violet-200 dark:ring-violet-900',
    blue: 'bg-blue-600 hover:bg-blue-700 text-white ring-blue-200 dark:ring-blue-900',
    rose: 'bg-rose-600 hover:bg-rose-700 text-white ring-rose-200 dark:ring-rose-900'
  };

  // Función para manejar la subida desde el APK (Nativo)
  const handleNativePhoto = async () => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const image = await NativeCamera.getPhoto({
        quality: 80,
        allowEditing: true,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt, // Pregunta si quiere Cámara o Galería
        width: 300,
        height: 300
      });

      if (image.webPath) {
        setIsUploading(true);
        // Convertir la ruta local en un Blob para Firebase
        const response = await fetch(image.webPath);
        const blob = await response.blob();
        
        const storage = getStorage();
        const avatarRef = ref(storage, `avatars/${user.uid}.jpg`);
        await uploadBytes(avatarRef, blob);
        const url = await getDownloadURL(avatarRef);

        await updateDoc(doc(db, 'usuarios', user.uid), { 
          fotoPerfil: url,
          historialFotos: [...(user?.historialFotos || []), new Date().toISOString()]
        });

        setFotoUrl(url);
        showToast("¡Foto actualizada!");
      }
    } catch (error) {
      console.error("Error en cámara nativa:", error);
      if (error.message !== "User cancelled photos app") {
        showToast("Error al acceder a la cámara", "error");
      }
    } finally {
      setIsUploading(false);
    }
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

  // Función para solicitar permisos de notificación manualmente
  const handleManualNotificationRequest = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        // MODO NATIVO (APK)
        let permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive !== 'granted') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive === 'granted') {
          PushNotifications.removeAllListeners();
          PushNotifications.addListener('registration', async (token) => {
            await updateDoc(doc(db, 'usuarios', user.uid), { fcmToken: token.value });
            showToast("¡Notificaciones nativas activadas!", "success");
          });
          await PushNotifications.register();
        } else {
          showToast("Permiso denegado. Actívalo en los ajustes de tu celular.", "error");
        }
      } else {
        // MODO WEB
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const currentToken = await getToken(messaging, { vapidKey: import.meta.env.VITE_VAPID_KEY });
          if (currentToken) {
            await updateDoc(doc(db, 'usuarios', user.uid), { fcmToken: currentToken });
            showToast("¡Notificaciones web activadas!", "success");
          }
        } else {
          showToast("Permiso denegado por el navegador.", "error");
        }
      }
    } catch (error) {
      console.error(error);
      showToast("Error al configurar notificaciones", "error");
    }
  };

  // Función para enviar una notificación de prueba (solo dueño)
  const handleTestNotification = async () => {
    setIsSendingTestNotification(true);
    try {
      await addDoc(collection(db, 'notificaciones'), {
        titulo: '🧪 Prueba de Notificación',
        mensaje: `¡Hola ${user.nombre.split(' ')[0]}! Si ves esto, las notificaciones de alta prioridad están funcionando correctamente.`,
        destinatarios: [user.uid], // Se envía a sí mismo
        emisorId: 'system-test',
        url: '/perfil', // Redirige al perfil al hacer clic
        fechaCreacion: new Date().toISOString()
      });
      showToast("Notificación de prueba enviada. Revisa tu dispositivo.");
    } catch (e) {
      console.error("Error al enviar notificación de prueba:", e);
      showToast("Error al enviar la prueba de notificación.", "error");
    } finally {
      setIsSendingTestNotification(false);
    }
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
          notacion: notacion || 'sharps',
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

  const handleTeamPinInput = (field, value) => {
    setTeamPinForm(prev => ({ ...prev, [field]: sanitizePin(value) }));
    setTeamPinError('');
  };

  const resetTeamPinForm = () => {
    setTeamPinForm({ current: '', next: '', confirm: '' });
  };

  const saveTeamPinConfig = async (pin, existingConfig = null) => {
    const salt = createPinSalt();
    const pinHash = await hashTeamPin(pin, salt);
    const nowVersion = Date.now().toString();
    const payload = {
      pinHash,
      pinSalt: salt,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
      pinVersion: nowVersion,
      version: 1
    };
    if (!existingConfig?.pinHash) {
      payload.createdAt = serverTimestamp();
      payload.createdBy = user.uid;
    }
    await setDoc(doc(db, ...TEAM_PIN_DOC_PATH), payload, { merge: true });
    clearTeamPinSession();
    setTeamPinConfig({ ...(existingConfig || {}), ...payload, updatedAt: new Date().toISOString() });
    resetTeamPinForm();
  };

  const handleCreateTeamPin = async () => {
    if (savingTeamPin) return;
    if (!isCompletePin(teamPinForm.next) || teamPinForm.next !== teamPinForm.confirm) {
      setTeamPinError('El PIN debe tener 4 digitos y coincidir con la confirmacion.');
      return;
    }
    setSavingTeamPin(true);
    setTeamPinError('');
    try {
      await saveTeamPinConfig(teamPinForm.next, null);
      showToast('PIN de Equipo creado correctamente.');
    } catch (error) {
      console.error('Error creando PIN de Equipo:', error);
      setTeamPinError('No se pudo crear el PIN de Equipo.');
    } finally {
      setSavingTeamPin(false);
    }
  };

  const handleChangeTeamPin = async () => {
    if (savingTeamPin) return;
    if (teamPinLockedUntil > Date.now()) {
      setTeamPinError('Espera antes de intentar nuevamente.');
      return;
    }
    if (!teamPinConfig?.pinHash || !teamPinConfig?.pinSalt) {
      setTeamPinError('No hay PIN configurado para cambiar.');
      return;
    }
    if (!isCompletePin(teamPinForm.current) || !isCompletePin(teamPinForm.next) || teamPinForm.next !== teamPinForm.confirm) {
      setTeamPinError('Completa los campos con PINs de 4 digitos y confirma el nuevo PIN.');
      return;
    }
    if (teamPinForm.current === teamPinForm.next) {
      setTeamPinError('El PIN nuevo debe ser diferente al PIN actual.');
      return;
    }

    setSavingTeamPin(true);
    setTeamPinError('');
    try {
      const currentHash = await hashTeamPin(teamPinForm.current, teamPinConfig.pinSalt);
      if (currentHash !== teamPinConfig.pinHash) {
        const nextAttempts = teamPinAttempts + 1;
        setTeamPinAttempts(nextAttempts);
        setTeamPinForm(prev => ({ ...prev, current: '' }));
        if (nextAttempts >= 5) {
          setTeamPinLockedUntil(Date.now() + 60 * 1000);
          setTeamPinAttempts(0);
          setTeamPinError('Demasiados intentos. Espera un minuto antes de intentar otra vez.');
        } else {
          setTeamPinError(`PIN actual incorrecto. Intento ${nextAttempts} de 5.`);
        }
        return;
      }

      await saveTeamPinConfig(teamPinForm.next, teamPinConfig);
      setTeamPinAttempts(0);
      showToast('PIN de Equipo cambiado correctamente. Se pedirá el nuevo PIN al abrir Equipo.');
    } catch (error) {
      console.error('Error cambiando PIN de Equipo:', error);
      setTeamPinError('No se pudo cambiar el PIN de Equipo.');
    } finally {
      setSavingTeamPin(false);
    }
  };

  const formatAccountDate = (value) => {
    if (!value) return 'No registrado';
    const rawDate = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(rawDate.getTime())) return 'No registrado';
    return rawDate.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const accountStatus = normalizeAccountStatus(user?.accountStatus);
  const accountFields = [
    { label: 'Correo', value: user?.email },
    { label: 'Rol', value: user?.rol || user?.role },
    { label: 'Estado de cuenta', value: getAccountStatusLabel(accountStatus) },
    { label: 'Fecha de ingreso', value: formatAccountDate(user?.fechaCreacion || user?.createdAt || user?.fechaIngreso) },
    { label: 'Ultimo acceso', value: formatAccountDate(user?.ultimaConexion || user?.lastLoginAt || user?.ultimoAcceso) },
    {
      label: 'Instrumentos / funciones',
      value: Array.isArray(user?.instrumentos)
        ? user.instrumentos.join(', ')
        : user?.funcion || user?.ministerio || user?.instrumento
    }
  ].filter(field => field.value);

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-500 pb-12">
      <header className="mb-8 flex flex-col gap-5 rounded-3xl border border-white/10 bg-zinc-950/45 p-5 backdrop-blur-sm sm:flex-row sm:items-center md:p-6">
        
        <div className="relative group">
          <div className="w-20 h-20 bg-violet-500/10 text-violet-300 rounded-3xl flex items-center justify-center overflow-hidden shadow-2xl border border-violet-500/20">
            {isUploading ? (
              <Loader2 size={28} className="animate-spin text-violet-500" />
            ) : fotoUrl ? (
              <img src={fotoUrl} alt="Avatar" onClick={() => setViewingPhoto(true)} className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" title="Ver foto ampliada" />
            ) : (
              <User size={36} />
            )}
          </div>
          
          <button 
            type="button"
            onClick={() => Capacitor.isNativePlatform() ? handleNativePhoto() : null}
            className="absolute -bottom-2 -right-2 p-2 bg-violet-600 text-white rounded-full shadow-lg cursor-pointer hover:bg-violet-500 transition-colors active:scale-95 group-hover:scale-110"
          >
            <Camera size={14} />
            {!Capacitor.isNativePlatform() && (
              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageUpload} disabled={isUploading} />
            )}
          </button>
        </div>

        <div className="ml-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-black text-white tracking-tight">Mi Perfil</h1>
            <span className="kp-badge rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest">{user?.rol || 'usuario'}</span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm font-medium">
            Hola, <span className="text-violet-600 dark:text-violet-400 font-bold">{user?.nombre}</span>. Personaliza tu cuenta.
          </p>
        </div>
      </header>

      <section className="mb-8 rounded-3xl border border-white/10 bg-zinc-950/45 p-5 backdrop-blur-sm md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-300">
            <Settings size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Cuenta y seguridad</p>
            <h2 className="text-lg font-black text-white">Informacion administrativa</h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {accountFields.map(field => (
            <div key={field.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{field.label}</p>
              <p className="mt-1 break-words text-sm font-bold text-zinc-100">{field.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs font-semibold leading-relaxed text-zinc-500">
          Estos datos son administrados por el equipo autorizado. Desde aqui solo puedes actualizar tu foto, biografia y preferencias.
        </p>

        {isOwnerUser && (
          <div className="mt-5 rounded-3xl border border-violet-500/20 bg-violet-500/10 p-4">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-2xl border border-violet-500/25 bg-violet-500/15 p-2.5 text-violet-200">
                <Lock size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Seguridad de Equipo</p>
                <h3 className="text-base font-black text-white">
                  {teamPinConfig?.pinHash ? 'Cambiar PIN de Equipo' : 'Crear PIN de Equipo'}
                </h3>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-zinc-400">
                  {teamPinConfig?.pinHash
                    ? 'Actualiza el PIN de 4 digitos que protege la administracion del equipo.'
                    : 'Configura un PIN de 4 digitos para proteger el acceso a la administracion del equipo.'}
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-white/10 bg-zinc-950/35 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Estado</p>
              <p className="mt-1 text-sm font-bold text-zinc-100">
                {loadingTeamPin ? 'Cargando...' : teamPinConfig?.pinHash ? 'PIN configurado' : 'PIN no configurado'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {teamPinConfig?.pinHash && (
                <input
                  value={teamPinForm.current}
                  onChange={(event) => handleTeamPinInput('current', event.target.value)}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  className="kp-input rounded-2xl p-3 text-center text-sm font-black tracking-[0.3em]"
                  placeholder="PIN actual"
                />
              )}
              <input
                value={teamPinForm.next}
                onChange={(event) => handleTeamPinInput('next', event.target.value)}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                className="kp-input rounded-2xl p-3 text-center text-sm font-black tracking-[0.3em]"
                placeholder="Nuevo PIN"
              />
              <input
                value={teamPinForm.confirm}
                onChange={(event) => handleTeamPinInput('confirm', event.target.value)}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                className="kp-input rounded-2xl p-3 text-center text-sm font-black tracking-[0.3em]"
                placeholder={teamPinConfig?.pinHash ? 'Confirmar nuevo' : 'Confirmar PIN'}
              />
              <button
                type="button"
                onClick={teamPinConfig?.pinHash ? handleChangeTeamPin : handleCreateTeamPin}
                disabled={savingTeamPin || loadingTeamPin}
                className="kp-button-primary rounded-2xl px-4 py-3 text-xs font-black uppercase disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingTeamPin ? 'Guardando...' : teamPinConfig?.pinHash ? 'Cambiar PIN' : 'Crear PIN'}
              </button>
            </div>

            {teamPinError && (
              <p className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold text-red-200">{teamPinError}</p>
            )}
            <p className="mt-3 text-[11px] font-semibold leading-relaxed text-zinc-500">
              El PIN no se muestra ni se guarda en texto plano. Al cambiarlo se invalida la sesion actual de acceso a Equipo.
            </p>
          </div>
        )}
      </section>

      <div className="kp-card p-6 md:p-8 rounded-3xl transition-colors">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-4">Preferencias de la Aplicación</h2>
        
        <div className="space-y-8 max-w-md">
          
          {/* Biografía / Info */}
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
              <Quote size={18} className="text-violet-600" /> Biografía / Versículo
            </label>
            <textarea value={biografia} onChange={(e) => setBiografia(e.target.value)} placeholder="Ej. Baterista de corazón | Salmos 150" className="kp-input w-full p-3 rounded-xl text-sm resize-none h-20" />
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

          {/* Preferencia de Alteraciones */}
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
              <Palette size={18} className="text-violet-600" /> Preferencia de Alteraciones
            </label>
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-full sm:w-max gap-1">
              <button onClick={() => setNotacion('sharps')} className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all ${notacion === 'sharps' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                Sostenidos (#)
              </button>
              <button onClick={() => setNotacion('flats')} className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all ${notacion === 'flats' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                Bemoles (b)
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2">Ejemplo: ¿Prefieres leer D# o Eb?</p>
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

          {/* Sección de Notificaciones Push (Backup) */}
          <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800">
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
              <BellRing size={18} className="text-violet-600" /> Estado de Notificaciones
            </label>
            <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1">
                <p className="text-xs font-bold text-zinc-900 dark:text-white">
                  {user?.fcmToken ? '✅ Suscrito correctamente' : '⚠️ No configuradas'}
                </p>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Si no recibes avisos de ensayos o cambios de tonos, pulsa el botón para reactivarlas.
                </p>
              </div>
              <button 
                type="button"
                onClick={handleManualNotificationRequest}
                className="w-full sm:w-auto px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-black rounded-xl hover:scale-105 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm"
              >
                <Bell size={14} />
                Activar Avisos
              </button>
            </div>
            {user?.rol === 'dueño' && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleTestNotification}
                  disabled={isSendingTestNotification}
                  className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <BellRing size={14} />
                  {isSendingTestNotification ? 'Enviando...' : 'Probar Notificación (Dueño)'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-zinc-100 dark:border-zinc-800">
          <button onClick={handleSave} disabled={isSaving} className="kp-button-primary flex items-center justify-center gap-2 py-3 px-8 rounded-xl text-sm font-bold disabled:opacity-50 transition-all active:scale-95">
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
    </div>
  );
};
export default UserProfile;

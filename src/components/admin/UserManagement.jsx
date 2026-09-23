import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, deleteDoc, doc, addDoc, updateDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { crearUsuarioPorAdmin, actualizarUsuarioPorAdmin, crearPerfilSinAcceso, habilitarAccesoWeb } from '../../utils/authUtils';
import { Users, UserPlus, Shield, Music, Trash2, Edit, AlertCircle, Key, MonitorPlay, Eye, EyeOff, Search, SlidersHorizontal } from 'lucide-react';
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_OPTIONS, SUSPENSION_TYPES, SUSPENSION_TYPE_OPTIONS, getAccountStatusLabel, normalizeAccountStatus } from '../../utils/accountStatus';
import { useFeedback } from '../ui/FeedbackProvider';
import PermissionManagementPanel from './PermissionManagementPanel';
import { overrideCount } from '../../utils/permissions';

const INSTRUMENTOS_DISPONIBLES = [
  "Voz Principal", "Coros", "Bateria", "Piano",
  "Bajo", "Guitarra Acustica", "Guitarra Electrica", "Percusion"
];

const normalizeRole = (role = '') => String(role)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const isOwnerRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === 'dueno' || normalized === 'duea±o' || normalized === 'dueã±o' || role === 'dueño';
};

const isAdminLikeRole = (role) => role === 'admin' || isOwnerRole(role);

const normalizeSearchText = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9@._\s-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const UserManagement = ({ user }) => {
  const { notify } = useFeedback();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('musico');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [instrumentosSeleccionados, setInstrumentosSeleccionados] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);
  const [sinAcceso, setSinAcceso] = useState(false);
  const [nuevoInstrumentoCustom, setNuevoInstrumentoCustom] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [accountStatus, setAccountStatus] = useState(ACCOUNT_STATUSES.ACTIVE);
  const [suspensiónReason, setSuspensionReason] = useState('');
  const [suspensiónType, setSuspensionType] = useState(SUSPENSION_TYPES.INDEFINITE);
  const [suspensiónEndDate, setSuspensionEndDate] = useState('');
  const [notifyAccountStatus, setNotifyAccountStatus] = useState(true);
  
  const [usuarios, setUsuarios] = useState([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [permissionUser, setPermissionUser] = useState(null);
  const isOwner = isOwnerRole(user?.rol || user?.role);
  const showToast = (message, type = 'error') => notify(message, { type });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsuarios(lista);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredUsuarios = useMemo(() => {
    const search = normalizeSearchText(userSearchTerm);
    if (!search) return usuarios;

    return usuarios.filter(integrante => {
      const searchableFields = [
        integrante.nombre,
        integrante.email,
        integrante.rol,
        getAccountStatusLabel(integrante.accountStatus),
        normalizeAccountStatus(integrante.accountStatus),
        integrante.funcion,
        integrante.funcionMinisterial,
        integrante.ministerio,
        integrante.area,
        integrante.cargo,
        ...(Array.isArray(integrante.instrumentos) ? integrante.instrumentos : []),
        ...(Array.isArray(integrante.funciones) ? integrante.funciones : []),
        ...(Array.isArray(integrante.ministerios) ? integrante.ministerios : [])
      ];

      return normalizeSearchText(searchableFields.filter(Boolean).join(' ')).includes(search);
    });
  }, [usuarios, userSearchTerm]);

  const toggleInstrumento = (inst) => {
    setInstrumentosSeleccionados(prev => 
      prev.includes(inst)
        ? prev.filter(i => i !== inst)
        : [...prev, inst]
    );
  };

  const handleAddCustomInstrument = () => {
    if (!nuevoInstrumentoCustom.trim()) return;
    const inst = nuevoInstrumentoCustom.trim();
    if (!instrumentosSeleccionados.includes(inst)) toggleInstrumento(inst);
    setNuevoInstrumentoCustom('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // --- MODO EDICION ---
    if (editingUserId && isActivating) {
      if (!email || password.length < 6) {
        showToast("Se requiere correo y contraseña de al menos 6 caracteres.");
        return;
      }
      setIsSaving(true);
      try {
        await habilitarAccesoWeb(editingUserId, email, password);
        showToast(`Acceso web habilitado para ${nombre}.`, 'success');
        cancelEdit();
      } catch (error) {
        console.error(error);
        showToast("Error al crear credenciales. Puede que el correo ya exista.");
      } finally {
        setIsSaving(false);
      }
      return;
    } else if (editingUserId) {
      if (!nombre) {
        showToast("El nombre es obligatorio.");
        return;
      }
      if (editingUserId === user?.uid && accountStatus !== ACCOUNT_STATUSES.ACTIVE) {
        showToast("No puedes suspender o desactivar tu propia cuenta.");
        return;
      }
      if (editingUserId === user?.uid && isOwnerRole(user?.rol || user?.role) && !isOwnerRole(rol)) {
        showToast("El dueño no puede quitarse su propio acceso total.");
        return;
      }
      if (accountStatus === ACCOUNT_STATUSES.SUSPENDED && !suspensiónReason.trim()) {
        showToast("El motivo de la suspensión es obligatorio.");
        return;
      }
      if (accountStatus === ACCOUNT_STATUSES.SUSPENDED && suspensiónType === SUSPENSION_TYPES.UNTIL_DATE && !suspensiónEndDate) {
        showToast("Selecciona la fecha de finalización de la suspensión.");
        return;
      }
      setIsSaving(true);
      try {
        const userRef = doc(db, 'usuarios', editingUserId);
        const previousSnap = await getDoc(userRef);
        const previousData = previousSnap.exists() ? previousSnap.data() : {};
        const previousStatus = normalizeAccountStatus(previousData.accountStatus);
        const now = new Date().toISOString();
        const statusPayload = {
          accountStatus,
          accountStatusUpdatedAt: now,
          suspensión: accountStatus === ACCOUNT_STATUSES.SUSPENDED ? {
            reason: suspensiónReason.trim(),
            type: suspensiónType,
            startedAt: previousStatus === ACCOUNT_STATUSES.SUSPENDED && previousData.suspensión?.startedAt ? previousData.suspensión.startedAt : now,
            endsAt: suspensiónType === SUSPENSION_TYPES.UNTIL_DATE ? suspensiónEndDate : null,
            notifyUser: notifyAccountStatus
          } : null,
          accountStatusAudit: arrayUnion({
            previousStatus,
            newStatus: accountStatus,
            reason: accountStatus === ACCOUNT_STATUSES.SUSPENDED ? suspensiónReason.trim() : '',
            suspensiónType: accountStatus === ACCOUNT_STATUSES.SUSPENDED ? suspensiónType : null,
            suspensiónEndsAt: accountStatus === ACCOUNT_STATUSES.SUSPENDED && suspensiónType === SUSPENSION_TYPES.UNTIL_DATE ? suspensiónEndDate : null,
            reactivatedAt: previousStatus !== ACCOUNT_STATUSES.ACTIVE && accountStatus === ACCOUNT_STATUSES.ACTIVE ? now : null,
            adminId: user?.uid || null,
            adminName: user?.nombre || user?.email || 'Administrador',
            createdAt: now
          })
        };

        await actualizarUsuarioPorAdmin(editingUserId, nombre, rol, instrumentosSeleccionados, fechaNacimiento);
        await updateDoc(userRef, statusPayload);
        if (previousStatus !== accountStatus) {
          if (accountStatus === ACCOUNT_STATUSES.SUSPENDED && notifyAccountStatus) {
            await addDoc(collection(db, 'notificaciones'), {
              titulo: 'Cuenta Suspendida',
              mensaje: `Tu cuenta ha sido suspendida. Motivo: ${suspensiónReason.trim()}.`,
              destinatarios: [editingUserId],
              accountStatusException: 'suspensión',
              emisorId: user?.uid,
              fechaCreacion: now
            });
          } else if (previousStatus !== ACCOUNT_STATUSES.ACTIVE && accountStatus === ACCOUNT_STATUSES.ACTIVE) {
            await addDoc(collection(db, 'notificaciones'), {
              titulo: 'Acceso Restablecido',
              mensaje: 'Tu acceso a Kadosh ha sido restablecido.',
              destinatarios: [editingUserId],
              accountStatusException: 'reactivation',
              emisorId: user?.uid,
              fechaCreacion: now
            });
          }
        } else if (previousData.rol !== rol && accountStatus === ACCOUNT_STATUSES.ACTIVE) {
          await addDoc(collection(db, 'notificaciones'), {
            titulo: 'Rol Actualizado',
            mensaje: `Un administrador ha actualizado tus permisos a: ${rol}.`,
            destinatarios: [editingUserId],
            emisorId: user?.uid,
            fechaCreacion: now
          });
        }
        showToast(`Usuario ${nombre} actualizado exitosamente.`, 'success');
        cancelEdit();
      } catch (error) {
        console.error(error);
        showToast("Error al actualizar el usuario.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // --- MODO CREACION ---
    if (sinAcceso) {
      if (!nombre) return showToast("El nombre es obligatorio.");
      setIsSaving(true);
      try {
        await crearPerfilSinAcceso(nombre, rol, instrumentosSeleccionados, fechaNacimiento);
        showToast(`Perfil de ${nombre} creado.`, 'success');
        cancelEdit();
      } catch (error) {
        showToast("Error al crear el perfil.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!nombre || !email || password.length < 6) {
      showToast("Datos inválidos. La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setIsSaving(true);
    try {
      await crearUsuarioPorAdmin(email, password, nombre, rol, instrumentosSeleccionados, fechaNacimiento);
      showToast(`Usuario ${nombre} creado exitosamente.`, 'success');
      cancelEdit(); // Reutilizamos esta funcion para limpiar el formulario
    } catch (error) {
      console.error(error);
      showToast("Error al crear usuario. Puede que el correo ya exista.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClick = (user) => {
    setEditingUserId(user.id);
    setNombre(user.nombre);
    setEmail(user.email);
    setRol(user.rol || 'musico');
    setSinAcceso(user.sinAcceso || false);
    setIsActivating(false);
    setFechaNacimiento(user.fechaNacimiento || '');
    setInstrumentosSeleccionados(user.instrumentos || []);
    const status = normalizeAccountStatus(user.accountStatus);
    setAccountStatus(status);
    setSuspensionReason(user.suspensión?.reason || '');
    setSuspensionType(user.suspensión?.type || SUSPENSION_TYPES.INDEFINITE);
    setSuspensionEndDate(user.suspensión?.endsAt || '');
    setNotifyAccountStatus(true);
    
    // Hacer scroll hacia arriba suavemente para moviles
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setNombre('');
    setEmail('');
    setPassword('');
    setRol('musico');
    setFechaNacimiento('');
    setSinAcceso(false);
    setIsActivating(false);
    setAccountStatus(ACCOUNT_STATUSES.ACTIVE);
    setSuspensionReason('');
    setSuspensionType(SUSPENSION_TYPES.INDEFINITE);
    setSuspensionEndDate('');
    setNotifyAccountStatus(true);
    setInstrumentosSeleccionados([]);
  };

  const confirmarEliminacion = async () => {
    if (!userToDelete) return;
    if (userToDelete.id === user?.uid && isOwnerRole(userToDelete.rol)) {
      showToast("El dueño no puede eliminar su propia cuenta.");
      setUserToDelete(null);
      return;
    }
    try {
      await deleteDoc(doc(db, 'usuarios', userToDelete.id));
      showToast("Usuario eliminado exitosamente.", "success");
    } catch (error) {
      console.error(error);
      showToast("Hubo un error al eliminar el usuario.");
    } finally {
      setUserToDelete(null);
    }
  };

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-zinc-900">Acceso Restringido</h2>
        <p className="text-zinc-500 mt-2">Solo el dueno de la aplicacion puede gestionar los accesos del equipo.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <header className="mb-8 flex items-center gap-3 rounded-3xl border border-white/10 bg-zinc-950/45 p-5 md:p-6 backdrop-blur-sm">
        <div className="p-3 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-2xl">
          <Users size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Equipo y Roles</h1>
          <p className="text-zinc-400 mt-1 text-sm font-medium">Administra integrantes, permisos y funciones del ministerio.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulario Crear Usuario */}
        <div className="kp-card p-0 rounded-3xl lg:col-span-1 h-fit lg:sticky lg:top-6 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
          <h2 className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md px-6 pt-6 pb-4 text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-0 flex items-center gap-2 border-b border-zinc-200/60 dark:border-white/10 rounded-t-3xl">
            <UserPlus size={20} className="text-indigo-600 dark:text-indigo-400" /> {editingUserId ? 'Editar Integrante' : 'Nuevo Integrante'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6 pt-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Nombre Completo</label>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm" placeholder="Ej. Juan Perez" required />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Fecha de Nacimiento (Opcional)</label>
              <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm" />
            </div>
            
            {editingUserId && !isActivating ? (
              <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 text-xs rounded-lg border border-indigo-100 dark:border-indigo-500/20">
                Editando perfil de: <b>{email || 'Sin correo asignado'}</b><br/>
                <span className="text-[10px] opacity-80">(Correo y contraseña no modificables por seguridad)</span>
                {sinAcceso && (
                  <button type="button" onClick={() => setIsActivating(true)} className="mt-2 w-full py-2 bg-indigo-600 text-white rounded-md font-bold flex items-center justify-center gap-2 transition-transform active:scale-95">
                    <Key size={14} /> Habilitar Acceso Web
                  </button>
                )}
              </div>
            ) : (
              <>
                {!isActivating && (
                  <label className="flex items-center gap-2 mb-4 p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl cursor-pointer">
                    <input type="checkbox" checked={sinAcceso} onChange={(e) => setSinAcceso(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Solo crear perfil (Sin correo/contraseña)</span>
                  </label>
                )}
                
                {(!sinAcceso || isActivating) && (
                  <>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Correo Electronico</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm" placeholder="juan@kadosh.com" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Contrasena Inicial</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="kp-input w-full p-2.5 pr-10 rounded-xl text-sm" placeholder="Ej. kadosh123" minLength={6} required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 transition-colors">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                  </>
                )}
              </>
            )}
            
            {!isActivating && <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Rol en Kadosh</label>
              <select value={rol} onChange={(e) => setRol(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm">
                <option value="musico" className="bg-white dark:bg-zinc-900">Musico (Solo ve canciones en Modo Vivo)</option>
                <option value="multimedia" className="bg-white dark:bg-zinc-900">Multimedia (Controlador de Proyector)</option>
                <option value="pastor" className="bg-white dark:bg-zinc-900">Pastor (Predicas y Modo Predicador)</option>
                <option value="admin" className="bg-white dark:bg-zinc-900">Administrador (Puede editar Repertorio)</option>
                <option value="dueño" className="bg-white dark:bg-zinc-900">Admin Principal (Oculto)</option>
              </select>
            </div>}
            {editingUserId && !isActivating && (
              <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-4 space-y-3">
                <div>
                  <p className="text-sm font-black text-zinc-100">Estado de la Cuenta</p>
                  <p className="text-xs text-zinc-500 mt-1">Controla si este integrante puede acceder a Kadosh.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Estado</label>
                  <select value={accountStatus} onChange={(e) => setAccountStatus(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm">
                    {ACCOUNT_STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value} className="bg-white dark:bg-zinc-900">{option.label}</option>
                    ))}
                  </select>
                </div>

                {accountStatus === ACCOUNT_STATUSES.SUSPENDED && (
                  <div className="space-y-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
                    <div>
                      <label className="block text-xs font-bold text-amber-200 mb-1">Motivo de la suspensión</label>
                      <textarea
                        value={suspensiónReason}
                        onChange={(e) => setSuspensionReason(e.target.value)}
                        className="kp-input w-full min-h-[86px] p-2.5 rounded-xl text-sm resize-none"
                        placeholder="Explica el motivo de forma clara para el usuario."
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-amber-200 mb-1">Tipo de suspensión</label>
                      <select value={suspensiónType} onChange={(e) => setSuspensionType(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm">
                        {SUSPENSION_TYPE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value} className="bg-white dark:bg-zinc-900">{option.label}</option>
                        ))}
                      </select>
                    </div>
                    {suspensiónType === SUSPENSION_TYPES.UNTIL_DATE && (
                      <div>
                        <label className="block text-xs font-bold text-amber-200 mb-1">Fecha de finalización</label>
                        <input type="date" value={suspensiónEndDate} onChange={(e) => setSuspensionEndDate(e.target.value)} className="kp-input w-full p-2.5 rounded-xl text-sm" required />
                      </div>
                    )}
                    <label className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-black/20 p-3 text-xs font-bold text-amber-100 cursor-pointer">
                      <input type="checkbox" checked={notifyAccountStatus} onChange={(e) => setNotifyAccountStatus(e.target.checked)} className="rounded text-amber-500 focus:ring-amber-500" />
                      Enviar notificacion al usuario
                    </label>
                  </div>
                )}
              </div>
            )}
            {!isActivating && <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Instrumentos / Funcion</label>
              <div className="flex flex-wrap gap-2">
                {INSTRUMENTOS_DISPONIBLES.map(inst => (
                  <button
                    key={inst}
                    type="button"
                    onClick={() => toggleInstrumento(inst)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors active:scale-95 ${
                      instrumentosSeleccionados.includes(inst) ? 'bg-indigo-100 dark:bg-indigo-500/20 border-indigo-300 dark:border-indigo-500/30 text-indigo-800 dark:text-indigo-400' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {inst}
                  </button>
                ))}
              </div>
              {/* Opcion para crear un instrumento o funcion nueva */}
              <div className="flex gap-2 mt-2">
                <input 
                  type="text" 
                  value={nuevoInstrumentoCustom} 
                  onChange={(e) => setNuevoInstrumentoCustom(e.target.value)}
                  placeholder="Anadir funcion (Ej. Trombon)"
                  className="kp-input flex-1 p-2 rounded-lg text-xs"
                />
                <button 
                  type="button" 
                  onClick={handleAddCustomInstrument}
                  className="kp-button-secondary px-3 rounded-lg text-xs font-bold transition-colors"
                >
                  Anadir
                </button>
              </div>
            </div>}
            <div className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-4 flex gap-2 border-t border-zinc-200/60 dark:border-white/10 bg-white/95 dark:bg-zinc-950/95 px-6 py-4 backdrop-blur-md rounded-b-3xl">
              {editingUserId && (
                <button type="button" onClick={cancelEdit} className="kp-button-secondary w-1/3 flex items-center justify-center py-3 px-4 rounded-xl text-sm font-bold transition-all active:scale-95">
                  Cancelar
                </button>
              )}
              <button type="submit" disabled={isSaving} className={`kp-button-primary flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold disabled:opacity-50 transition-all active:scale-95 ${editingUserId ? 'w-2/3' : 'w-full mt-4'}`}>
                {isSaving ? 'Guardando...' : isActivating ? 'Dar Acceso' : editingUserId ? 'Guardar Cambios' : sinAcceso ? 'Crear Perfil' : 'Crear Cuenta'}
              </button>
            </div>
          </form>
        </div>

        {/* Lista de Usuarios */}
        <div className="kp-card p-6 rounded-3xl lg:col-span-2">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Integrantes Registrados</h2>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {filteredUsuarios.length} de {usuarios.length} integrantes
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-950/60 px-3 py-2.5 sm:w-80">
              <Search size={16} className="shrink-0 text-zinc-500" />
              <input
                type="search"
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                placeholder="Buscar nombre, correo, rol, funcion o estado..."
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-zinc-600"
              />
            </div>
          </div>
          {loading ? (
            <div className="text-zinc-500 text-center py-8 animate-pulse">Cargando equipo...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredUsuarios.map(user => (
                <div key={user.id} className="kp-panel flex items-center gap-4 p-4 rounded-2xl relative overflow-hidden">
                  {user.fotoPerfil ? (
                    <img src={user.fotoPerfil} alt={user.nombre} className="w-12 h-12 rounded-xl object-cover shadow-sm border border-zinc-200 dark:border-zinc-700 shrink-0" />
                  ) : (
                    <div className={`p-3 rounded-xl shrink-0 ${isAdminLikeRole(user.rol) ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400' : user.rol === 'multimedia' ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400' : 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'}`}>
                      {isAdminLikeRole(user.rol) ? <Shield size={20} /> : user.rol === 'multimedia' ? <MonitorPlay size={20} /> : <Music size={20} />}
                    </div>
                  )}
                  
                  <div className="absolute top-3 right-3 flex gap-2">
                    <button type="button" onClick={() => setPermissionUser(user)} className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Permisos del integrante">
                      <SlidersHorizontal size={16} />
                    </button>
                    <button onClick={() => handleEditClick(user)} className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors" title="Editar integrante">
                      <Edit size={16} />
                    </button>
                    <button onClick={() => setUserToDelete(user)} className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors" title="Eliminar integrante">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div>
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 leading-none mb-1">{user.nombre}</p>
                    {user.sinAcceso ? (
                      <p className="text-xs font-medium text-red-500 mb-1 flex items-center gap-1"><AlertCircle size={12}/> Sin acceso web</p>
                    ) : (
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">{user.email}</p>
                    )}
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${isAdminLikeRole(user.rol) ? 'bg-amber-200/50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' : user.rol === 'multimedia' ? 'bg-violet-200/50 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400' : 'bg-blue-200/50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'}`}>
                      {isOwnerRole(user.rol) ? 'admin' : user.rol}
                    </span>
                    <span className={`ml-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${
                      normalizeAccountStatus(user.accountStatus) === ACCOUNT_STATUSES.SUSPENDED
                        ? 'bg-amber-200/50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                        : normalizeAccountStatus(user.accountStatus) === ACCOUNT_STATUSES.DISABLED
                          ? 'bg-red-200/50 dark:bg-red-500/20 text-red-700 dark:text-red-300'
                          : 'bg-emerald-200/50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {getAccountStatusLabel(user.accountStatus)}
                    </span>
                    {overrideCount(user) > 0 && <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-emerald-300">+{overrideCount(user)} permisos personalizados</p>}
                  </div>
                  
                  {user.instrumentos && user.instrumentos.length > 0 && (
                    <div className="w-full mt-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60 flex flex-wrap gap-1">
                      {user.instrumentos.map(inst => (
                        <span key={inst} className="text-[9px] bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded-md uppercase font-bold tracking-wider">{inst}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {usuarios.length === 0 && <p className="kp-empty-state text-sm py-8 px-4 rounded-2xl col-span-2 text-center">No hay usuarios registrados.</p>}
              {usuarios.length > 0 && filteredUsuarios.length === 0 && <p className="kp-empty-state text-sm py-8 px-4 rounded-2xl col-span-2 text-center">No encontramos integrantes con esa busqueda.</p>}
            </div>
          )}
        </div>
      </div>
      {permissionUser && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-md sm:items-center" onClick={() => setPermissionUser(null)}>
          <div className="max-h-[calc(100dvh-max(env(safe-area-inset-top),0.75rem)-max(env(safe-area-inset-bottom),0.75rem))] w-full max-w-6xl overflow-y-auto overscroll-contain rounded-[2rem] border border-white/10 bg-zinc-950 p-3 shadow-2xl sm:p-5" onClick={(event) => event.stopPropagation()}>
            <PermissionManagementPanel key={permissionUser.id} currentUser={user} usuarios={usuarios} configuredDefaults={user?.permissionRoleDefaults} selectedUser={permissionUser} onClose={() => setPermissionUser(null)} />
          </div>
        </div>
      )}

      {/* Modal de Confirmacion de Eliminacion */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in p-4">
          <div className="kp-modal p-6 rounded-2xl max-w-sm w-full mx-4 animate-in zoom-in-95">
            <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-2">Eliminar integrante?</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">Estas seguro de que quieres quitarle el acceso a <b>"{userToDelete.nombre}"</b>? Ya no podra entrar a la aplicacion.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setUserToDelete(null)} className="kp-button-secondary px-4 py-2.5 text-sm font-bold rounded-xl transition-colors">Cancelar</button>
              <button onClick={confirmarEliminacion} className="kp-button-danger px-4 py-2.5 text-sm font-bold rounded-xl transition-colors">Si, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default UserManagement;

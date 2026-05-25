import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc, addDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { crearUsuarioPorAdmin, actualizarUsuarioPorAdmin, crearPerfilSinAcceso, habilitarAccesoWeb } from '../../utils/authUtils';
import { Users, UserPlus, Shield, Music, Trash2, Edit, AlertCircle, Key, MonitorPlay, Eye, EyeOff } from 'lucide-react';

const INSTRUMENTOS_DISPONIBLES = [
  "Voz Principal", "Coros", "Batería", "Piano", 
  "Bajo", "Guitarra Acústica", "Guitarra Eléctrica", "Percusión"
];

const UserManagement = ({ user }) => {
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
  
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsuarios(lista);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

    // --- MODO EDICIÓN ---
    if (editingUserId && isActivating) {
      if (!email || password.length < 6) {
        showToast("Se requiere correo y contraseña de al menos 6 caracteres.");
        return;
      }
      setIsSaving(true);
      try {
        await habilitarAccesoWeb(editingUserId, email, password);
        showToast(`¡Acceso web habilitado para ${nombre}!`, 'success');
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
      setIsSaving(true);
      try {
        await actualizarUsuarioPorAdmin(editingUserId, nombre, rol, instrumentosSeleccionados, fechaNacimiento);
        await addDoc(collection(db, 'notificaciones'), {
          titulo: '🔐 Rol Actualizado',
          mensaje: `Un administrador ha actualizado tus permisos a: ${rol}.`,
          destinatarios: [editingUserId],
          emisorId: user?.uid,
          fechaCreacion: new Date().toISOString()
        });
        showToast(`¡Usuario ${nombre} actualizado exitosamente!`, 'success');
        cancelEdit();
      } catch (error) {
        console.error(error);
        showToast("Error al actualizar el usuario.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // --- MODO CREACIÓN ---
    if (sinAcceso) {
      if (!nombre) return showToast("El nombre es obligatorio.");
      setIsSaving(true);
      try {
        await crearPerfilSinAcceso(nombre, rol, instrumentosSeleccionados, fechaNacimiento);
        showToast(`¡Perfil de ${nombre} creado!`, 'success');
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
      showToast(`¡Usuario ${nombre} creado exitosamente!`, 'success');
      cancelEdit(); // Reutilizamos esta función para limpiar el formulario
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
    
    // Hacer scroll hacia arriba suavemente para móviles
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
    setInstrumentosSeleccionados([]);
  };

  const confirmarEliminacion = async () => {
    if (!userToDelete) return;
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

  if (user?.rol !== 'dueño') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-zinc-900">Acceso Restringido</h2>
        <p className="text-zinc-500 mt-2">Solo el dueño de la aplicación puede gestionar los accesos del equipo.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <header className="mb-8 flex items-center gap-3">
        <div className="p-3 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded-2xl">
          <Users size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Equipo y Roles</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm font-medium">Crea accesos privados para los integrantes de tu banda.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulario Crear Usuario */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 lg:col-span-1 h-fit sticky top-6">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
            <UserPlus size={20} className="text-indigo-600 dark:text-indigo-400" /> {editingUserId ? 'Editar Integrante' : 'Nuevo Integrante'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Nombre Completo</label>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 dark:text-white focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500" placeholder="Ej. Juan Pérez" required />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Fecha de Nacimiento (Opcional)</label>
              <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 dark:text-white focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500" />
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
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Correo Electrónico</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 dark:text-white focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500" placeholder="juan@kadosh.com" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Contraseña Inicial</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2.5 pr-10 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 dark:text-white focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500" placeholder="Ej. kadosh123" minLength={6} required />
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
              <select value={rol} onChange={(e) => setRol(e.target.value)} className="w-full p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-950 dark:text-white focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500">
                <option value="musico" className="bg-white dark:bg-zinc-900">Músico (Solo ve canciones en Modo Vivo)</option>
                <option value="multimedia" className="bg-white dark:bg-zinc-900">Multimedia (Controlador de Proyector)</option>
                <option value="admin" className="bg-white dark:bg-zinc-900">Administrador (Puede editar Repertorio)</option>
                <option value="dueño" className="bg-white dark:bg-zinc-900">Admin Principal (Oculto)</option>
              </select>
            </div>}
            {!isActivating && <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Instrumentos / Función</label>
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
              {/* Opción para crear un instrumento o función nueva */}
              <div className="flex gap-2 mt-2">
                <input 
                  type="text" 
                  value={nuevoInstrumentoCustom} 
                  onChange={(e) => setNuevoInstrumentoCustom(e.target.value)}
                  placeholder="Añadir función (Ej. Trombón)" 
                  className="flex-1 p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-950 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button 
                  type="button" 
                  onClick={handleAddCustomInstrument}
                  className="px-3 bg-zinc-800 dark:bg-zinc-700 text-white rounded-lg text-xs font-bold hover:bg-zinc-700 transition-colors"
                >
                  Añadir
                </button>
              </div>
            </div>}
            <div className="flex gap-2 pt-2">
              {editingUserId && (
                <button type="button" onClick={cancelEdit} className="w-1/3 flex items-center justify-center py-3 px-4 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95">
                  Cancelar
                </button>
              )}
              <button type="submit" disabled={isSaving} className={`flex items-center justify-center gap-2 py-3 px-6 rounded-xl shadow-md text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-95 ${editingUserId ? 'w-2/3' : 'w-full mt-4'}`}>
                {isSaving ? 'Guardando...' : isActivating ? 'Dar Acceso' : editingUserId ? 'Guardar Cambios' : sinAcceso ? 'Crear Perfil' : 'Crear Cuenta'}
              </button>
            </div>
          </form>
        </div>

        {/* Lista de Usuarios */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 lg:col-span-2">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Integrantes Registrados</h2>
          {loading ? (
            <div className="text-zinc-500 text-center py-8 animate-pulse">Cargando equipo...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {usuarios.map(user => (
                <div key={user.id} className="flex items-center gap-4 p-4 border border-zinc-100 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-800/50 relative overflow-hidden">
                  {user.fotoPerfil ? (
                    <img src={user.fotoPerfil} alt={user.nombre} className="w-12 h-12 rounded-xl object-cover shadow-sm border border-zinc-200 dark:border-zinc-700 shrink-0" />
                  ) : (
                    <div className={`p-3 rounded-xl shrink-0 ${['admin', 'dueño'].includes(user.rol) ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400' : user.rol === 'multimedia' ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400' : 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'}`}>
                      {['admin', 'dueño'].includes(user.rol) ? <Shield size={20} /> : user.rol === 'multimedia' ? <MonitorPlay size={20} /> : <Music size={20} />}
                    </div>
                  )}
                  
                  <div className="absolute top-3 right-3 flex gap-2">
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
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${['admin', 'dueño'].includes(user.rol) ? 'bg-amber-200/50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' : user.rol === 'multimedia' ? 'bg-violet-200/50 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400' : 'bg-blue-200/50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'}`}>
                      {user.rol === 'dueño' ? 'admin' : user.rol}
                    </span>
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
              {usuarios.length === 0 && <p className="text-zinc-500 text-sm py-4 col-span-2">No hay usuarios registrados.</p>}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Confirmación de Eliminación */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-xl max-w-sm w-full mx-4 animate-in zoom-in-95 border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-2">¿Eliminar integrante?</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">¿Estás seguro de que quieres quitarle el acceso a <b>"{userToDelete.nombre}"</b>? Ya no podrá entrar a la aplicación.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setUserToDelete(null)} className="px-4 py-2.5 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">Cancelar</button>
              <button onClick={confirmarEliminacion} className="px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm shadow-red-200">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
      
      {toast && (
        <div className={`fixed bottom-6 right-6 p-4 rounded-xl shadow-xl text-sm font-bold animate-in slide-in-from-bottom-5 z-50 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};
export default UserManagement;
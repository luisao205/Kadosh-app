import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Lock, User, X } from 'lucide-react';
import { db } from '../../config/firebase';
import { isOwner } from '../../utils/rolePermissions';
import {
  TEAM_PIN_DOC_PATH,
  clearTeamPinLock,
  getTeamPinLock,
  getTeamPinSession,
  getTeamPinVersion,
  hashTeamPin,
  isCompletePin,
  markTeamPinVerified,
  sanitizePin,
  setTeamPinLock
} from '../../utils/teamPinAccess';

const MAX_ATTEMPTS = 3;
const FIRST_LOCK_MS = 60 * 1000;
const ESCALATED_LOCK_MS = 5 * 60 * 1000;

const formatLockTime = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const TeamPinGate = ({ user, children }) => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [verified, setVerified] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockLevel, setLockLevel] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [lockNow, setLockNow] = useState(Date.now());
  const [shakeError, setShakeError] = useState(false);
  const navigate = useNavigate();
  const pinInputRef = useRef(null);
  const validatingRef = useRef(false);
  const lastValidatedPinRef = useRef('');

  const pinRef = useMemo(() => doc(db, ...TEAM_PIN_DOC_PATH), []);
  const hasConfiguredPin = Boolean(config?.pinHash && config?.pinSalt);
  const pinVersion = hasConfiguredPin ? getTeamPinVersion(config) : null;
  const isLocked = lockedUntil > lockNow;
  const lockedSeconds = Math.max(0, Math.ceil((lockedUntil - lockNow) / 1000));
  const lockedTimeLabel = formatLockTime(lockedSeconds);

  useEffect(() => {
    let mounted = true;
    const loadPinConfig = async () => {
      setLoading(true);
      setError('');
      try {
        if (!isOwner(user)) {
          return;
        }

        const snap = await getDoc(pinRef);
        if (!mounted) return;
        const nextConfig = snap.exists() ? snap.data() : null;
        setConfig(nextConfig);
        const lock = getTeamPinLock(user?.uid);
        if (lock) {
          const isStoredLockActive = Number(lock.lockedUntil) > Date.now();
          setFailedAttempts(isStoredLockActive ? 0 : lock.failedAttempts);
          setLockLevel(lock.lockLevel);
          setLockedUntil(isStoredLockActive ? Number(lock.lockedUntil) : 0);
          setLockNow(Date.now());
        }
        if (nextConfig?.pinHash && nextConfig?.pinSalt) {
          const currentVersion = getTeamPinVersion(nextConfig);
          const existingSession = getTeamPinSession(user?.uid, currentVersion);
          if (existingSession) setVerified(true);
        }
      } catch (err) {
        console.error('Error cargando PIN de Equipo:', err);
        if (mounted) setError('No se pudo cargar la configuracion del PIN.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadPinConfig();
    return () => { mounted = false; };
  }, [pinRef, user]);

  useEffect(() => {
    if (!isLocked) return undefined;
    const interval = setInterval(() => {
      const now = Date.now();
      setLockNow(now);
      if (lockedUntil <= now) {
        clearTeamPinLock();
        setLockedUntil(0);
        setFailedAttempts(0);
        setError('Puedes intentar nuevamente.');
        setPin('');
        setTeamPinLock(user.uid, { failedAttempts: 0, lockLevel, lockedUntil: 0 });
        setTimeout(() => pinInputRef.current?.focus(), 0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isLocked, lockedUntil, lockLevel, user?.uid]);

  const handlePinChange = (event, setter) => {
    const nextPin = sanitizePin(event.target.value);
    setter(nextPin);
    setError('');
    setShakeError(false);
    if (nextPin.length < 4) lastValidatedPinRef.current = '';
  };

  const triggerPinError = (message) => {
    setError(message);
    setShakeError(true);
    setTimeout(() => {
      setPin('');
      setShakeError(false);
      pinInputRef.current?.focus();
    }, 420);
  };

  const verifyPin = async (candidatePin) => {
    if (validatingRef.current || validating || isLocked) return;
    if (!isCompletePin(candidatePin)) {
      setError('Ingresa un PIN de 4 digitos.');
      return;
    }
    if (!hasConfiguredPin) {
      setError('El PIN de Equipo todavia no esta configurado.');
      return;
    }

    validatingRef.current = true;
    lastValidatedPinRef.current = candidatePin;
    setValidating(true);
    setError('');
    try {
      const candidateHash = await hashTeamPin(candidatePin, config.pinSalt);
      if (candidateHash !== config.pinHash) {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        if (nextAttempts >= MAX_ATTEMPTS) {
          const nextLockLevel = lockLevel === 0 ? 1 : lockLevel;
          const duration = lockLevel === 0 ? FIRST_LOCK_MS : ESCALATED_LOCK_MS;
          const nextLockedUntil = Date.now() + duration;
          setLockedUntil(nextLockedUntil);
          setLockNow(Date.now());
          setLockLevel(nextLockLevel);
          setFailedAttempts(0);
          setTeamPinLock(user.uid, {
            failedAttempts: 0,
            lockLevel: nextLockLevel,
            lockedUntil: nextLockedUntil
          });
          triggerPinError(`Demasiados intentos. Intenta nuevamente en ${formatLockTime(Math.ceil(duration / 1000))}.`);
        } else {
          setTeamPinLock(user.uid, {
            failedAttempts: nextAttempts,
            lockLevel,
            lockedUntil: 0
          });
          triggerPinError('PIN incorrecto.');
        }
        return;
      }

      clearTeamPinLock();
      setFailedAttempts(0);
      setLockLevel(0);
      setLockedUntil(0);
      markTeamPinVerified(user.uid, pinVersion);
      setVerified(true);
    } catch (err) {
      console.error('Error validando PIN de Equipo:', err);
      setError('No se pudo validar el PIN.');
    } finally {
      setValidating(false);
      validatingRef.current = false;
    }
  };

  const handleVerify = async (event) => {
    event?.preventDefault();
    await verifyPin(pin);
  };

  useEffect(() => {
    if (!hasConfiguredPin || !isCompletePin(pin) || isLocked || validatingRef.current) return;
    if (lastValidatedPinRef.current === pin) return;
    verifyPin(pin);
  }, [pin, hasConfiguredPin, isLocked]);

  const handleCancel = () => {
    window.history.back();
  };

  const goToProfile = () => {
    navigate('/perfil', { state: { returnTo: '/equipo' } });
  };

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="kp-card rounded-3xl p-8 text-center text-sm font-black text-zinc-300">Validando acceso protegido...</div>
      </div>
    );
  }

  if (!isOwner(user)) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center p-6">
        <div className="kp-card w-full max-w-lg rounded-3xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-300">
            <span className="text-2xl font-black">!</span>
          </div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">Acceso restringido</p>
          <h1 className="mt-2 text-2xl font-black text-white">Sin autorizacion</h1>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-zinc-400">Solo el dueno puede administrar Equipo y Roles.</p>
        </div>
      </div>
    );
  }

  if (verified) return children;

  return (
    <div className="flex min-h-[65vh] items-center justify-center p-4">
      <div className="kp-card w-full max-w-md rounded-3xl p-6 text-white shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-violet-500/25 bg-violet-500/10 p-3 text-violet-200">
              <Lock size={22} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Acceso protegido</p>
              <h2 className="mt-1 text-xl font-black">Equipo y Roles</h2>
            </div>
          </div>
          <button type="button" onClick={handleCancel} className="rounded-xl p-2 text-zinc-500 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <p className="mb-5 text-sm font-semibold leading-relaxed text-zinc-400">
          {validating ? 'Validando...' : 'Ingresa tu PIN de 4 digitos para administrar integrantes, accesos y roles.'}
        </p>

        {hasConfiguredPin ? (
          <form onSubmit={handleVerify} className="space-y-4">
            <style>{`
              @keyframes teamPinShake {
                0%, 100% { transform: translateX(0); }
                20% { transform: translateX(-8px); }
                40% { transform: translateX(8px); }
                60% { transform: translateX(-6px); }
                80% { transform: translateX(6px); }
              }
              @media (prefers-reduced-motion: reduce) {
                .team-pin-shake { animation: none !important; }
              }
            `}</style>
            <input
              ref={pinInputRef}
              value={pin}
              onChange={(event) => handlePinChange(event, setPin)}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoFocus
              autoComplete="one-time-code"
              disabled={validating || isLocked}
              aria-invalid={Boolean(error)}
              aria-describedby="team-pin-status"
              className={`kp-input w-full rounded-2xl p-4 text-center text-2xl font-black tracking-[0.45em] disabled:cursor-not-allowed disabled:opacity-60 ${shakeError ? 'team-pin-shake border-red-500 ring-2 ring-red-500/30' : ''}`}
              style={shakeError ? { animation: 'teamPinShake 420ms ease-in-out' } : undefined}
              placeholder="0000"
            />
            <p id="team-pin-status" aria-live="polite" className={`min-h-5 text-center text-xs font-black ${isLocked || error ? 'text-red-300' : validating ? 'text-violet-300' : 'text-zinc-500'}`}>
              {isLocked ? `Demasiados intentos. Intenta nuevamente en ${lockedTimeLabel}` : (error || (validating ? 'Validando...' : 'Se validara automaticamente al completar 4 digitos.'))}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={handleCancel} className="kp-button-secondary rounded-2xl px-4 py-3 text-xs font-black uppercase">
                Cancelar
              </button>
              <button type="submit" disabled={validating || isLocked || !isCompletePin(pin)} className="kp-button-primary rounded-2xl px-4 py-3 text-xs font-black uppercase disabled:cursor-not-allowed disabled:opacity-50">
                {validating ? 'Validando...' : 'Ingresar'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-bold leading-relaxed text-amber-100">
              No hay un PIN de Equipo configurado. Crealo desde Mi Perfil &gt; Cuenta y seguridad.
            </div>
            {error && <p className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold text-red-200">{error}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={handleCancel} className="kp-button-secondary rounded-2xl px-4 py-3 text-xs font-black uppercase">
                Cancelar
              </button>
              <button type="button" onClick={goToProfile} className="kp-button-primary rounded-2xl px-4 py-3 text-xs font-black uppercase">
                <span className="inline-flex items-center gap-2"><User size={15} /> Ir a Mi Perfil</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamPinGate;

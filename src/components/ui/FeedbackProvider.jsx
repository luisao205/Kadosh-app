import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

const FeedbackContext = createContext(null);

let externalNotify = null;
let externalConfirm = null;

const toastStyles = {
  success: {
    icon: CheckCircle2,
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100',
  },
  error: {
    icon: XCircle,
    className: 'border-red-500/25 bg-red-500/10 text-red-100',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-amber-500/25 bg-amber-500/10 text-amber-100',
  },
  info: {
    icon: Info,
    className: 'border-blue-500/25 bg-blue-500/10 text-blue-100',
  },
};

export const notifyFeedback = (message, options = {}) => {
  if (externalNotify) externalNotify(message, options);
};

export const confirmFeedback = (options = {}) => {
  if (externalConfirm) return externalConfirm(options);
  return Promise.resolve(false);
};

export const FeedbackProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const resolverRef = useRef(null);
  const previousFocusRef = useRef(null);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const notify = useCallback((message, options = {}) => {
    if (!message) return null;
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const toast = {
      id,
      message,
      type: options.type || 'info',
      title: options.title || '',
      duration: options.duration ?? 5200,
    };
    setToasts(prev => [...prev.slice(-3), toast]);
    if (toast.duration > 0) {
      setTimeout(() => dismissToast(id), toast.duration);
    }
    return id;
  }, [dismissToast]);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    previousFocusRef.current = document.activeElement;
    resolverRef.current = resolve;
    setConfirmState({
      title: options.title || 'Confirmar accion',
      message: options.message || 'Deseas continuar?',
      confirmLabel: options.confirmLabel || 'Confirmar',
      cancelLabel: options.cancelLabel || 'Cancelar',
      variant: options.variant || 'default',
    });
  }), []);

  const closeConfirm = useCallback((result) => {
    if (resolverRef.current) resolverRef.current(result);
    resolverRef.current = null;
    setConfirmState(null);
    requestAnimationFrame(() => {
      if (previousFocusRef.current?.focus) previousFocusRef.current.focus();
      previousFocusRef.current = null;
    });
  }, []);

  useEffect(() => {
    externalNotify = notify;
    externalConfirm = confirm;
    return () => {
      if (externalNotify === notify) externalNotify = null;
      if (externalConfirm === confirm) externalConfirm = null;
    };
  }, [confirm, notify]);

  useEffect(() => {
    if (!confirmState) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeConfirm(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeConfirm, confirmState]);

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}

      <div className="fixed left-0 right-0 top-3 z-[250] flex flex-col items-center gap-2 px-4 pointer-events-none sm:items-end sm:right-4 sm:left-auto" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {toasts.map((toast) => {
          const style = toastStyles[toast.type] || toastStyles.info;
          const Icon = style.icon;
          return (
            <div
              key={toast.id}
              role="status"
              aria-live="polite"
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 ${style.className}`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                {toast.title && <p className="text-xs font-black uppercase tracking-widest opacity-80">{toast.title}</p>}
                <p className="text-sm font-bold leading-snug">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-lg p-1 opacity-70 hover:bg-white/10 hover:opacity-100"
                aria-label="Cerrar mensaje"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-[260] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-confirm-title"
            className="w-full max-w-md rounded-t-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-black/50 sm:rounded-[2rem]"
          >
            <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border ${
              confirmState.variant === 'danger'
                ? 'border-red-500/25 bg-red-500/10 text-red-200'
                : 'border-amber-500/25 bg-amber-500/10 text-amber-200'
            }`}>
              <AlertTriangle size={24} />
            </div>
            <h2 id="feedback-confirm-title" className="text-xl font-black text-white">{confirmState.title}</h2>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-zinc-400">{confirmState.message}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-black text-zinc-300 hover:bg-zinc-800"
              >
                {confirmState.cancelLabel}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => closeConfirm(true)}
                className={`rounded-2xl px-4 py-3 text-sm font-black text-white ${
                  confirmState.variant === 'danger' ? 'bg-red-600 hover:bg-red-500' : 'bg-violet-600 hover:bg-violet-500'
                }`}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
};

export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    return {
      notify: notifyFeedback,
      confirm: confirmFeedback,
    };
  }
  return context;
};

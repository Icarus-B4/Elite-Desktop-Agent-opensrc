'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, AlertTriangle, Info, XCircle, X, Wrench
} from 'lucide-react';

/**
 * Toast-Notification System für Agent-Events.
 * Toast-Typen: success, error, warning, info, tool.
 * Auto-dismiss nach 4s, manuell schließbar.
 */

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'tool' | 'system';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, default 4000
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const TOAST_CONFIG: Record<ToastType, { icon: any; color: string; bg: string; ring: string }> = {
  success: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
  error:   { icon: XCircle,      color: 'text-red-400',     bg: 'bg-red-500/10',     ring: 'ring-red-500/20' },
  warning: { icon: AlertTriangle, color: 'text-amber-400',   bg: 'bg-amber-500/10',   ring: 'ring-amber-500/20' },
  info:    { icon: Info,          color: 'text-primary',    bg: 'bg-primary/10',    ring: 'ring-primary/20' },
  tool:    { icon: Wrench,        color: 'text-purple-400',  bg: 'bg-purple-500/10',  ring: 'ring-purple-500/20' },
  system:  { icon: Info,          color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    ring: 'ring-cyan-500/20' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newToast = { ...toast, id };
    setToasts(prev => [...prev.slice(-4), newToast]); // Max 5 gleichzeitig

    // Auto-dismiss
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, toast.duration || 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast-Container: unten rechts, über der Toolbar */}
      <div className="fixed bottom-20 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map(toast => {
            const cfg = TOAST_CONFIG[toast.type];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, x: 80, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 80, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={`pointer-events-auto flex items-start gap-2.5 min-w-[260px] max-w-[360px] px-3.5 py-3 rounded-xl backdrop-blur-2xl ring-1 shadow-[0_4px_24px_rgba(0,0,0,0.5)] ${cfg.bg} ${cfg.ring}`}
              >
                <Icon className={`size-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-white/80 truncate">{toast.title}</p>
                  {toast.message && (
                    <p className="text-[9px] text-white/40 mt-0.5 line-clamp-2">{toast.message}</p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(toast.id)}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/20 hover:text-white/40 transition-colors flex-shrink-0"
                >
                  <X className="size-3" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/** Hook: Toasts anzeigen */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast muss innerhalb ToastProvider verwendet werden');
  return ctx;
}

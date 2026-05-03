'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'info' | 'success' | 'error';

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

type ToastItem = ToastInput & {
  id: string;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: 'border-slate-200 bg-white text-slate-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const duration = input.duration ?? 4000;
      const nextToast: ToastItem = { id, ...input };

      setToasts((prev) => [...prev, nextToast]);

      if (duration > 0) {
        window.setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3">
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              'rounded-xl border px-4 py-3 shadow-lg backdrop-blur',
              VARIANT_STYLES[item.variant ?? 'info']
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                {item.description && (
                  <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(item.id)}
                className="rounded-md p-1 text-slate-400 hover:text-slate-700"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

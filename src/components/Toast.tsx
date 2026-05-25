import React, { useEffect, useState } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error';

export interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  onClose: (id: string) => void;
}

export function Toast({ id, type, message, onClose }: ToastProps) {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, 4000); // 4 seconds auto-close

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => onClose(id), 300); // Wait for animation
  };

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl p-4 shadow-lg transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        isClosing ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100',
        type === 'success'
          ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200 border border-emerald-100 dark:border-emerald-800/50'
          : 'bg-red-50 text-red-900 dark:bg-red-900/30 dark:text-red-200 border border-red-100 dark:border-red-800/50'
      )}
      role="alert"
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      {type === 'success' ? (
        <Check className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
      )}
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={handleClose}
        className="shrink-0 rounded-lg p-1 opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10 transition-colors"
        aria-label="Закрыть уведомление"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

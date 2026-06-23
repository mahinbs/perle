import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Toast, ToastOptions } from '../components/Toast';

interface ToastState extends ToastOptions {
  id: string;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const showToast = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: ToastState = { ...options, id };
    
    setToasts(prev => [...prev, newToast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 'max(20px, env(safe-area-inset-bottom, 0px))',
          right: 'max(16px, env(safe-area-inset-right, 0px))',
          left: 'auto',
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 12,
          zIndex: 100000,
          pointerEvents: 'none',
          maxWidth: 'min(400px, calc(100vw - 32px))',
        }}
      >
        {toasts.map(toast => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <Toast
              message={toast.message}
              type={toast.type}
              duration={toast.duration}
              onClose={() => removeToast(toast.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};


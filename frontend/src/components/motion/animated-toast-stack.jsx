// Adapted from beui.dev/components/motion/animated-toast-stack.
import { AlertCircle, Check, Info, LoaderCircle, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ToastContext = createContext(null);
const EASE_OUT = [0.16, 1, 0.3, 1];
let sequence = 0;

const icons = { success: Check, error: AlertCircle, info: Info, loading: LoaderCircle };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const notify = useCallback(({ title, description, status = 'info', duration = 4200 }) => {
    const id = `toast-${Date.now()}-${sequence++}`;
    setToasts((items) => [...items, { id, title, description, status, duration }].slice(-4));
    return id;
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);

  return <ToastContext.Provider value={value}>{children}<AnimatedToastStack toasts={toasts} onDismiss={dismiss} /></ToastContext.Provider>;
}

export function useToast() {
  return useContext(ToastContext) || { notify: () => undefined };
}

function AnimatedToastStack({ toasts, onDismiss }) {
  const [target, setTarget] = useState(null);
  useEffect(() => setTarget(document.body), []);
  const stack = <ol className="beui-toast-stack">
    <AnimatePresence initial={false}>
      {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />)}
    </AnimatePresence>
  </ol>;
  return target ? createPortal(stack, target) : null;
}

function ToastItem({ toast, onDismiss }) {
  const reduce = useReducedMotion();
  const timer = useRef(null);
  const Icon = icons[toast.status] || Info;
  useEffect(() => {
    if (toast.duration <= 0) return undefined;
    timer.current = window.setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer.current);
  }, [onDismiss, toast.duration, toast.id]);

  return <motion.li
    role={toast.status === 'error' ? 'alert' : 'status'} aria-live={toast.status === 'error' ? 'assertive' : 'polite'}
    layout
    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.96, filter: 'blur(10px)' }}
    animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
    exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.96, filter: 'blur(8px)', transition: { duration: 0.18, ease: EASE_OUT } }}
    transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.75 }}
    drag={reduce ? false : 'x'} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18}
    onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 72 || Math.abs(info.velocity.x) > 520) onDismiss(toast.id); }}
  >
    <div className={`beui-toast beui-toast--${toast.status}`}>
      <span className="beui-toast__icon">{toast.status === 'loading' ? <LoaderCircle className={reduce ? '' : 'beui-toast__spinner'} size={16} /> : <Icon size={16} />}</span>
      <div><strong>{toast.title}</strong>{toast.description && <p>{toast.description}</p>}</div>
      <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Cerrar notificación"><X size={16} /></button>
    </div>
  </motion.li>;
}

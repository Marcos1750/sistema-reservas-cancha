import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ConfirmDialogContext = createContext(null);

/* Reemplaza window.confirm/window.alert por un modal del sistema de diseño.
   La promesa se resuelve con la elección para no cambiar el flujo de los
   llamadores, que ya esperan una respuesta antes de seguir. */
export function ConfirmDialogProvider({ children }) {
  const [request, setRequest] = useState(null);
  const [open, setOpen] = useState(false);
  const resolverRef = useRef(null);

  /* El pedido queda montado mientras se cierra para no cortar la animación de salida. */
  const settle = useCallback((value) => {
    setOpen(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(value);
  }, []);

  const ask = useCallback(
    (options) =>
      new Promise((resolve) => {
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setRequest(typeof options === 'string' ? { description: options } : options);
        setOpen(true);
      }),
    [],
  );

  const value = useMemo(
    () => ({
      confirm: ask,
      alert: (options) => ask({ mode: 'alert', ...(typeof options === 'string' ? { description: options } : options) }),
    }),
    [ask],
  );

  const isAlert = request?.mode === 'alert';
  const isDanger = request?.tone === 'danger';

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      <AlertDialog open={open} onOpenChange={(next) => !next && settle(false)}>
        {request ? (
          <AlertDialogContent className={isDanger ? 'border-[rgba(237,111,111,.42)]' : undefined}>
            <AlertDialogHeader>
              <AlertDialogTitle>{request.title || (isAlert ? 'No pudimos completar la acción' : '¿Confirmás la acción?')}</AlertDialogTitle>
              <AlertDialogDescription>{request.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {isAlert ? null : (
                <AlertDialogCancel onClick={() => settle(false)}>{request.cancelText || 'Volver'}</AlertDialogCancel>
              )}
              <AlertDialogAction
                variant={isDanger ? 'destructive' : 'default'}
                onClick={() => settle(true)}
              >
                {request.confirmText || (isAlert ? 'Entendido' : 'Confirmar')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </ConfirmDialogContext.Provider>
  );
}

function useConfirmDialogs() {
  const context = useContext(ConfirmDialogContext);
  if (!context) throw new Error('Falta <ConfirmDialogProvider> arriba en el árbol.');
  return context;
}

export function useConfirm() {
  return useConfirmDialogs().confirm;
}

export function useAlert() {
  return useConfirmDialogs().alert;
}

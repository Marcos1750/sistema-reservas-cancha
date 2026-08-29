import { createContext, useContext } from 'react';

export const ConfirmDialogContext = createContext(null);

function useConfirmDialogs() {
  const context = useContext(ConfirmDialogContext);
  if (!context) throw new Error('Falta <ConfirmDialogProvider> arriba en el árbol.');
  return context;
}

/* Devuelve confirm(opciones) -> Promise<boolean>, el reemplazo de window.confirm. */
export function useConfirm() {
  return useConfirmDialogs().confirm;
}

/* Devuelve alert(opciones) -> Promise, el reemplazo de window.alert. */
export function useAlert() {
  return useConfirmDialogs().alert;
}

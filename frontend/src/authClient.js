import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/auth',
  // Si la API se queda esperando (por ejemplo, durante un cold start), Better
  // Auth debe devolver un error para que la interfaz pueda continuar como invitado.
  fetchOptions: {
    timeout: 10_000,
  },
});

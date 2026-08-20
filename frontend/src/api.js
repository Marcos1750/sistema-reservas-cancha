const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function apiFetch(path, options = {}) {
  const headers = options.body && !(options.body instanceof FormData)
    ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
    : options.headers;
  return fetch(API_URL + path, { credentials: 'include', ...options, headers });
}

export async function readApiResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación');
  return body;
}

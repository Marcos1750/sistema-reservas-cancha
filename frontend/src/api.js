const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const API_TIMEOUT_MS = 12_000;

export async function apiFetch(path, { timeout = API_TIMEOUT_MS, signal: externalSignal, ...options } = {}) {
  const controller = new AbortController();
  const abortFromExternalSignal = () => controller.abort();
  const timer = timeout > 0 ? window.setTimeout(() => controller.abort(), timeout) : null;

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
  }

  const headers = options.body && !(options.body instanceof FormData)
    ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
    : options.headers;

  try {
    return await fetch(API_URL + path, { credentials: 'include', ...options, headers, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) throw new Error('La conexión tardó demasiado. Intentá nuevamente.');
    throw error;
  } finally {
    if (timer) window.clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
}

export async function readApiResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación');
  return body;
}

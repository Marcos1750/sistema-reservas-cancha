import crypto from 'node:crypto';

const MP_API = 'https://api.mercadopago.com';

export function paymentExpiry(minutes = 15) {
  return new Date(Date.now() + minutes * 60_000);
}

export function calculateDeposit(amount, percentage) {
  return Math.max(1, Math.ceil((Number(amount) * Number(percentage)) / 100));
}

function encryptionKey() {
  const secret = process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error('MERCADOPAGO_TOKEN_ENCRYPTION_KEY es obligatorio para conectar Mercado Pago');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(value) {
  const [iv, tag, encrypted] = String(value || '').split('.');
  if (!iv || !tag || !encrypted) throw new Error('La conexión de Mercado Pago es inválida');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export function signedState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const secret = process.env.MERCADOPAGO_OAUTH_STATE_SECRET || process.env.BETTER_AUTH_SECRET;
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function readSignedState(value) {
  const [body, signature] = String(value || '').split('.');
  const secret = process.env.MERCADOPAGO_OAUTH_STATE_SECRET || process.env.BETTER_AUTH_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (!body || !signature || received.length !== expectedBuffer.length || !crypto.timingSafeEqual(received, expectedBuffer)) throw new Error('La vinculación de Mercado Pago venció o no es válida');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.expiresAt || Number(payload.expiresAt) < Date.now()) throw new Error('La vinculación de Mercado Pago venció');
  return payload;
}

function credentials() {
  const clientId = process.env.MERCADOPAGO_CLIENT_ID;
  const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET;
  const redirectUri = process.env.MERCADOPAGO_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Faltan las credenciales de Mercado Pago en producción');
  return { clientId, clientSecret, redirectUri };
}

async function mpFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(`${MP_API}${path}`, { ...options, signal: options.signal || AbortSignal.timeout(15_000) });
  } catch (cause) {
    const error = new Error(cause?.name === 'TimeoutError' ? 'Mercado Pago no respondió a tiempo' : 'No pudimos comunicarnos con Mercado Pago');
    error.code = 'provider_unavailable';
    error.cause = cause;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || 'Mercado Pago no pudo procesar la operación');
    error.code = data.error || data.cause?.[0]?.code || `http_${response.status}`;
    error.providerStatus = response.status;
    throw error;
  }
  return data;
}

export function authorizationUrl(state) {
  const { clientId, redirectUri } = credentials();
  const params = new URLSearchParams({ client_id: clientId, response_type: 'code', platform_id: 'mp', redirect_uri: redirectUri, state });
  return `https://auth.mercadopago.com/authorization?${params}`;
}

export async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = credentials();
  return mpFetch('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }) });
}

export async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = credentials();
  return mpFetch('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }) });
}

export async function createCheckoutPreference(accessToken, payment, reservation, complex) {
  const baseUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL;
  if (!baseUrl) throw new Error('APP_URL es obligatorio para crear un pago');
  const data = await mpFetch('/checkout/preferences', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
    items: [{ id: `sena-${payment.id}`, title: `Seña · ${complex.nombre} · ${reservation.fecha} ${reservation.hora}`, quantity: 1, currency_id: 'ARS', unit_price: payment.monto_ars }],
    external_reference: String(payment.id),
    notification_url: `${baseUrl.replace(/\/$/, '')}/api/pagos/mercadopago/webhook?pago=${encodeURIComponent(payment.id)}`,
    back_urls: { success: `${baseUrl.replace(/\/$/, '')}/?pago=exitoso`, pending: `${baseUrl.replace(/\/$/, '')}/?pago=pendiente`, failure: `${baseUrl.replace(/\/$/, '')}/?pago=fallido` },
    expires: true,
    expiration_date_to: payment.expira_at,
    metadata: { payment_id: String(payment.id), complejo_id: String(complex.id) },
  }) });
  return { preferenceId: data.id, checkoutUrl: data.init_point || data.sandbox_init_point };
}

export async function getPayment(accessToken, paymentId) {
  return mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

export async function searchPayments(accessToken, externalReference) {
  const params = new URLSearchParams({
    sort: 'date_created',
    criteria: 'desc',
    external_reference: String(externalReference),
    limit: '1',
  });
  return mpFetch(`/v1/payments/search?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

function subscriptionAccessToken() {
  const token = process.env.MERCADOPAGO_SUBSCRIPTIONS_ACCESS_TOKEN;
  if (!token) throw new Error('MERCADOPAGO_SUBSCRIPTIONS_ACCESS_TOKEN es obligatorio para cobrar suscripciones');
  return token;
}

export async function createSubscriptionCheckout(subscription, plan, { trialDays = 14 } = {}) {
  const baseUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL;
  if (!baseUrl) throw new Error('APP_URL es obligatorio para crear una suscripción');
  const body = {
    reason: `NEW MATCH · Plan ${plan.name}`,
    external_reference: subscription.referencia_externa,
    // En sandbox Mercado Pago exige que el pagador sea una cuenta de prueba.
    // En producción no se define esta variable y se conserva el email real del titular.
    payer_email: process.env.MERCADOPAGO_SUBSCRIPTIONS_TEST_PAYER_EMAIL || subscription.email,
    status: 'pending',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: subscription.precio_ars,
      currency_id: 'ARS',
    },
    back_url: `${baseUrl.replace(/\/$/, '')}/planes?suscripcion=${encodeURIComponent(subscription.referencia_externa)}`,
  };
  if (trialDays > 0) body.auto_recurring.free_trial = { frequency: trialDays, frequency_type: 'days' };
  if (process.env.MERCADOPAGO_SUBSCRIPTIONS_WEBHOOK_URL) body.notification_url = process.env.MERCADOPAGO_SUBSCRIPTIONS_WEBHOOK_URL;
  const data = await mpFetch('/preapproval', {
    method: 'POST',
    headers: { Authorization: `Bearer ${subscriptionAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { providerId: data.id, checkoutUrl: data.init_point || data.sandbox_init_point, payload: data };
}

export async function getSubscription(providerId) {
  return mpFetch(`/preapproval/${encodeURIComponent(providerId)}`, { headers: { Authorization: `Bearer ${subscriptionAccessToken()}` } });
}

export async function getAuthorizedPayment(authorizedPaymentId) {
  return mpFetch(`/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`, { headers: { Authorization: `Bearer ${subscriptionAccessToken()}` } });
}

export async function searchAuthorizedPayments({ preapprovalId = '', paymentId = '' } = {}) {
  const params = new URLSearchParams({ limit: '20' });
  if (preapprovalId) params.set('preapproval_id', String(preapprovalId));
  if (paymentId) params.set('payment_id', String(paymentId));
  if (!preapprovalId && !paymentId) throw new Error('Se necesita una suscripción o un pago para buscar las cuotas');
  return mpFetch(`/authorized_payments/search?${params}`, { headers: { Authorization: `Bearer ${subscriptionAccessToken()}` } });
}

export async function getSubscriptionPayment(paymentId) {
  return mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${subscriptionAccessToken()}` } });
}

export async function cancelSubscription(providerId) {
  return mpFetch(`/preapproval/${encodeURIComponent(providerId)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subscriptionAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'canceled' }),
  });
}

export async function updateSubscriptionAmount(providerId, amount) {
  return mpFetch(`/preapproval/${encodeURIComponent(providerId)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subscriptionAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_recurring: { transaction_amount: amount, currency_id: 'ARS' } }),
  });
}

export function isValidWebhookSignature(headers, paymentId, secretOverride = '') {
  const secret = secretOverride || process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = String(headers['x-signature'] || '');
  const requestId = String(headers['x-request-id'] || '');
  const values = Object.fromEntries(signature.split(',').map((part) => {
    const separator = part.indexOf('=');
    return separator === -1 ? [part.trim(), ''] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }));
  if (!values.ts || !values.v1 || !paymentId) return false;
  const received = Buffer.from(values.v1);
  const resource = String(paymentId).toLowerCase();
  // Mercado Pago ha emitido webhooks sin x-request-id. Algunas variantes
  // conservan el campo vacío en el manifiesto y otras lo omiten por completo.
  // Ambas siguen exigiendo una HMAC válida con la clave secreta.
  const manifests = [
    `id:${resource};request-id:${requestId};ts:${values.ts};`,
    `id:${resource};ts:${values.ts};`,
  ];
  return manifests.some((manifest) => {
    const expected = Buffer.from(crypto.createHmac('sha256', secret).update(manifest).digest('hex'));
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

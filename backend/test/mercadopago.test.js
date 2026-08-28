import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { calculateDeposit, cancelSubscription, decryptSecret, encryptSecret, isValidWebhookSignature, paymentExpiry, readSignedState, searchAuthorizedPayments, signedState } from '../mercadopago.js';

process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY = 'test-key';
process.env.MERCADOPAGO_OAUTH_STATE_SECRET = 'state-key';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'webhook-key';
process.env.MERCADOPAGO_SUBSCRIPTIONS_ACCESS_TOKEN = 'subscription-test-token';

test('calcula la seña redondeando hacia arriba', () => assert.equal(calculateDeposit(9999, 10), 1000));
test('cifra y descifra credenciales de Mercado Pago', () => assert.equal(decryptSecret(encryptSecret('APP_USR-token')), 'APP_USR-token'));
test('firma estados OAuth que vencen', () => assert.equal(readSignedState(signedState({ complexId: 7, expiresAt: Date.now() + 1_000 })).complexId, 7));
test('crea vencimientos de pago futuros', () => assert.ok(paymentExpiry() > new Date()));
test('valida la firma del webhook sin fallar ante firmas malformadas', () => {
  const ts = '123456';
  const signature = crypto.createHmac('sha256', process.env.MERCADOPAGO_WEBHOOK_SECRET).update(`id:456;request-id:req-1;ts:${ts};`).digest('hex');
  assert.equal(isValidWebhookSignature({ 'x-signature': `ts=${ts},v1=${signature}`, 'x-request-id': 'req-1' }, 456), true);
  assert.equal(isValidWebhookSignature({ 'x-signature': 'ts=1,v1=x', 'x-request-id': 'req-1' }, 456), false);
});

test('valida firmas sin x-request-id cuando Mercado Pago no lo envía', () => {
  const ts = '789';
  const signature = crypto.createHmac('sha256', process.env.MERCADOPAGO_WEBHOOK_SECRET).update(`id:99;ts:${ts};`).digest('hex');
  assert.equal(isValidWebhookSignature({ 'x-signature': `ts=${ts},v1=${signature}` }, 99), true);
});

test('valida firmas de Mercado Pago sin separador final en el manifiesto', () => {
  const ts = '790';
  const signature = crypto.createHmac('sha256', process.env.MERCADOPAGO_WEBHOOK_SECRET).update(`id:100;request-id:req-2;ts:${ts}`).digest('hex');
  assert.equal(isValidWebhookSignature({ 'x-signature': `ts=${ts},v1=${signature}`, 'x-request-id': 'req-2' }, 100), true);
});

test('valida firmas con request-id vacío cuando Mercado Pago no lo envía', () => {
  const ts = '987';
  const signature = crypto.createHmac('sha256', process.env.MERCADOPAGO_WEBHOOK_SECRET).update(`id:77;request-id:;ts:${ts};`).digest('hex');
  assert.equal(isValidWebhookSignature({ 'x-signature': `ts=${ts},v1=${signature}` }, 77), true);
});

test('anula la recurrencia con el estado documentado por Mercado Pago', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'preapproval-1', status: 'cancelled' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await cancelSubscription('preapproval-1');
    assert.equal(result.status, 'cancelled');
    assert.equal(request.url, 'https://api.mercadopago.com/preapproval/preapproval-1');
    assert.deepEqual(JSON.parse(request.options.body), { status: 'cancelled' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('busca las cuotas por el id de la suscripción', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await searchAuthorizedPayments({ preapprovalId: 'preapproval-2' });
    assert.match(requestedUrl, /authorized_payments\/search\?/);
    assert.match(requestedUrl, /preapproval_id=preapproval-2/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

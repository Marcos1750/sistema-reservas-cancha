import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { calculateDeposit, decryptSecret, encryptSecret, isValidWebhookSignature, paymentExpiry, readSignedState, signedState } from '../mercadopago.js';

process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY = 'test-key';
process.env.MERCADOPAGO_OAUTH_STATE_SECRET = 'state-key';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'webhook-key';

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

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubscriptionEmail } from '../subscription-email.js';

const baseSubscription = {
  tipo: 'mercadopago',
  plan_codigo: 'pro',
  precio_ars: 39900,
  prueba_finaliza_at: '2026-10-03T03:00:00.000Z',
  proximo_cobro_at: '2026-10-04T03:00:00.000Z',
  gracia_hasta_at: '2026-10-14T03:00:00.000Z',
};

test('compone un aviso de prueba breve, con identidad de marca y plan contratado', () => {
  const email = buildSubscriptionEmail(baseSubscription, 'prueba_iniciada', 'https://newmatch.com.ar');
  assert.equal(email.subject, 'Tu prueba de NEW MATCH empezó');
  assert.match(email.html, /NEW MATCH/);
  assert.match(email.html, /apple-touch-icon-180\.png/);
  assert.match(email.html, /Plan contratado/);
  assert.match(email.html, /Pro/);
  assert.match(email.html, /\$\s?39\.900/);
  assert.match(email.html, /Finaliza el/);
  assert.match(email.text, /Gestionar suscripción: https:\/\/newmatch\.com\.ar\/planes/);
});

test('incluye la fecha de gracia y escapa contenido inesperado del plan', () => {
  const email = buildSubscriptionEmail({ ...baseSubscription, plan_codigo: '<script>' }, 'gracia_3', 'https://newmatch.com.ar/');
  assert.match(email.html, /Acceso activo hasta/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /Tu plan/);
});

test('muestra los planes gratuitos sin inventar un precio mensual', () => {
  const email = buildSubscriptionEmail({ tipo: 'gratuita' }, 'primer_pago', 'https://newmatch.com.ar');
  assert.match(email.html, /Gratuito/);
  assert.match(email.html, /Sin costo/);
});

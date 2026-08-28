import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizedPaymentOutcome, canReuseSubscriptionCheckout, capabilitiesFor, deriveProviderSubscriptionState, isSubscriptionActive, planFor, providerNextPaymentDate, providerTrialWindow, publicSubscription, subscriptionRestrictionsRequired, summarizeAuthorizedPayments } from '../subscriptions.js';

test('los planes comerciales tienen los límites acordados', () => {
  assert.deepEqual(planFor('fundador').maxCourts, 6);
  assert.deepEqual(planFor('estandar').maxComplexes, 1);
  assert.deepEqual(planFor('pro').maxCourts, 20);
});

test('la gracia mantiene el acceso y la vencida lo bloquea', () => {
  assert.equal(isSubscriptionActive({ estado: 'en_gracia', tipo: 'mercadopago' }), true);
  assert.equal(capabilitiesFor({ estado: 'vencida', tipo: 'mercadopago', plan_codigo: 'estandar' }).can_write, false);
});

test('la gracia deja de habilitar acciones al llegar a su fecha límite', () => {
  const now = new Date('2026-08-26T12:00:00.000Z');
  assert.equal(isSubscriptionActive({ estado: 'en_gracia', tipo: 'mercadopago', gracia_hasta_at: '2026-08-26T11:59:59.000Z' }, now), false);
  assert.equal(isSubscriptionActive({ estado: 'en_gracia', tipo: 'mercadopago', gracia_hasta_at: '2026-08-26T12:00:01.000Z' }, now), true);
});

test('una anulación o vencimiento bloquean siempre aunque el control global esté en modo de prueba', () => {
  assert.equal(subscriptionRestrictionsRequired({ estado: 'anulada' }, false), true);
  assert.equal(subscriptionRestrictionsRequired({ estado: 'vencida' }, false), true);
  assert.equal(subscriptionRestrictionsRequired({ estado: 'en_gracia', gracia_hasta_at: '2026-08-26T11:59:59.000Z' }, false, new Date('2026-08-26T12:00:00.000Z')), true);
  assert.equal(subscriptionRestrictionsRequired({ estado: 'sin_suscripcion' }, false), false);
});

test('reutiliza sólo enlaces de checkout pendientes recientes', () => {
  const now = new Date('2026-08-28T12:00:00.000Z');
  assert.equal(canReuseSubscriptionCheckout({ updated_at: '2026-08-28T11:45:00.000Z' }, now), true);
  assert.equal(canReuseSubscriptionCheckout({ updated_at: '2026-08-28T11:20:00.000Z' }, now), false);
  assert.equal(canReuseSubscriptionCheckout({ updated_at: 'fecha inválida' }, now), false);
});

test('el usuario gratuito usa los límites estándar sin cobro', () => {
  const subscription = publicSubscription({ id: 1, tipo: 'gratuita', estado: 'activa', precio_ars: 0, complexes_used: 1, courts_used: 6 });
  assert.equal(subscription.plan.nombre, 'Gratuito');
  assert.equal(subscription.capabilities.can_add_complex, false);
  assert.equal(subscription.capabilities.can_add_court, false);
});

test('interpreta las cuotas autorizadas y conserva la más reciente', () => {
  const billing = summarizeAuthorizedPayments([
    { id: 1, debit_date: '2026-07-01T12:00:00Z', payment: { status: 'approved' } },
    { id: 2, debit_date: '2026-08-01T12:00:00Z', status: 'recycling', payment: { status: 'rejected' } },
  ]);
  assert.equal(billing.latest.id, 2);
  assert.equal(billing.latestOutcome, 'rejected');
  assert.equal(billing.approvedCount, 1);
  assert.equal(authorizedPaymentOutcome({ payment: { status: 'approved', status_detail: 'accredited' } }), 'approved');
});

test('los eventos de Mercado Pago llevan la suscripción por prueba, gracia, recuperación y anulación', () => {
  const now = new Date('2026-08-26T12:00:00Z');
  assert.equal(deriveProviderSubscriptionState({ estado: 'pendiente' }, { status: 'authorized', auto_recurring: { free_trial: { frequency: 14 } } }, {}, now), 'prueba');
  assert.equal(deriveProviderSubscriptionState({ estado: 'pendiente', prueba_reservada_at: now }, { status: 'authorized', auto_recurring: {} }, {}, now), 'prueba');
  assert.equal(deriveProviderSubscriptionState({ estado: 'pendiente' }, { status: 'authorized', auto_recurring: {} }, {}, now), 'en_gracia');
  assert.equal(deriveProviderSubscriptionState({ estado: 'activa', prueba_iniciada_at: now, prueba_finaliza_at: '2026-08-20T12:00:00Z' }, { status: 'authorized' }, { latestOutcome: 'rejected' }, now), 'en_gracia');
  assert.equal(deriveProviderSubscriptionState({ estado: 'vencida', prueba_iniciada_at: now }, { status: 'authorized' }, { latestOutcome: 'approved', approvedCount: 1 }, now), 'activa');
  assert.equal(deriveProviderSubscriptionState({ estado: 'activa' }, { status: 'canceled' }, {}, now), 'anulada');
});

test('lee la próxima renovación desde el campo real de preapproval', () => {
  assert.equal(providerNextPaymentDate({ next_payment_date: '2026-09-01T12:00:00Z' }), '2026-09-01T12:00:00Z');
});

test('alinea el período de prueba con el primer cobro programado por Mercado Pago', () => {
  const window = providerTrialWindow({ next_payment_date: '2026-09-11T07:31:29.000Z' });
  assert.equal(window.startsAt.toISOString(), '2026-08-28T07:31:29.000Z');
  assert.equal(window.endsAt.toISOString(), '2026-09-11T07:31:29.000Z');
});

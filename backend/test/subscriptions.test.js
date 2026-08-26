import test from 'node:test';
import assert from 'node:assert/strict';
import { capabilitiesFor, isSubscriptionActive, planFor, publicSubscription } from '../subscriptions.js';

test('los planes comerciales tienen los límites acordados', () => {
  assert.deepEqual(planFor('fundador').maxCourts, 6);
  assert.deepEqual(planFor('estandar').maxComplexes, 1);
  assert.deepEqual(planFor('pro').maxCourts, 20);
});

test('la gracia mantiene el acceso y la vencida lo bloquea', () => {
  assert.equal(isSubscriptionActive({ estado: 'en_gracia', tipo: 'mercadopago' }), true);
  assert.equal(capabilitiesFor({ estado: 'vencida', tipo: 'mercadopago', plan_codigo: 'estandar' }).can_write, false);
});

test('el usuario gratuito usa los límites estándar sin cobro', () => {
  const subscription = publicSubscription({ id: 1, tipo: 'gratuita', estado: 'activa', precio_ars: 0, complexes_used: 1, courts_used: 6 });
  assert.equal(subscription.plan.nombre, 'Gratuito');
  assert.equal(subscription.capabilities.can_add_complex, false);
  assert.equal(subscription.capabilities.can_add_court, false);
});

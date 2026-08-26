export const SUBSCRIPTION_PLANS = {
  fundador: { code: 'fundador', name: 'Fundador', price: 19900, maxComplexes: 1, maxCourts: 6, trialDays: 14, founder: true },
  estandar: { code: 'estandar', name: 'Estándar', price: 24900, maxComplexes: 1, maxCourts: 6, trialDays: 14 },
  pro: { code: 'pro', name: 'Pro', price: 39900, maxComplexes: 3, maxCourts: 20, trialDays: 14 },
};

export const ACTIVE_SUBSCRIPTION_STATES = new Set(['prueba', 'activa', 'en_gracia']);

export function planFor(code) {
  return SUBSCRIPTION_PLANS[code] || null;
}

export function isSubscriptionActive(subscription) {
  return subscription?.tipo === 'gratuita' || ACTIVE_SUBSCRIPTION_STATES.has(subscription?.estado);
}

export function capabilitiesFor(subscription) {
  const plan = subscription?.tipo === 'gratuita' ? SUBSCRIPTION_PLANS.estandar : planFor(subscription?.plan_codigo);
  const active = isSubscriptionActive(subscription);
  return {
    can_write: active,
    can_add_complex: active && Number(subscription?.complexes_used || 0) < (plan?.maxComplexes || 0),
    can_add_court: active && Number(subscription?.courts_used || 0) < (plan?.maxCourts || 0),
    can_receive_bookings: active,
    max_complexes: plan?.maxComplexes || 0,
    max_canchas: plan?.maxCourts || 0,
  };
}

export function publicSubscription(subscription) {
  if (!subscription) return { estado: 'sin_suscripcion', capabilities: capabilitiesFor(null) };
  const plan = subscription.tipo === 'gratuita' ? SUBSCRIPTION_PLANS.estandar : planFor(subscription.plan_codigo);
  return {
    id: subscription.id,
    tipo: subscription.tipo,
    estado: subscription.estado,
    plan: { code: plan?.code, nombre: subscription.tipo === 'gratuita' ? 'Gratuito' : plan?.name, precio_ars: subscription.precio_ars, max_complejos: plan?.maxComplexes, max_canchas: plan?.maxCourts },
    prueba_finaliza_at: subscription.prueba_finaliza_at,
    proximo_cobro_at: subscription.proximo_cobro_at,
    gracia_hasta_at: subscription.gracia_hasta_at,
    founder_pagos: subscription.founder_pagos || 0,
    founder_consolidado: subscription.founder_consolidado || false,
    complexes_used: Number(subscription.complexes_used || 0),
    courts_used: Number(subscription.courts_used || 0),
    anulado_at: subscription.anulado_at,
    capabilities: capabilitiesFor(subscription),
  };
}

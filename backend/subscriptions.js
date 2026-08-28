export const SUBSCRIPTION_PLANS = {
  fundador: { code: 'fundador', name: 'Fundador', price: 19900, maxComplexes: 1, maxCourts: 6, trialDays: 14, founder: true },
  estandar: { code: 'estandar', name: 'Estándar', price: 24900, maxComplexes: 1, maxCourts: 6, trialDays: 14 },
  pro: { code: 'pro', name: 'Pro', price: 39900, maxComplexes: 3, maxCourts: 20, trialDays: 14 },
};

export const ACTIVE_SUBSCRIPTION_STATES = new Set(['prueba', 'activa', 'en_gracia']);
export const SUBSCRIPTION_CHECKOUT_REUSE_WINDOW_MS = 30 * 60 * 1000;

const APPROVED_PAYMENT_STATES = new Set(['approved', 'accredited']);
const REJECTED_PAYMENT_STATES = new Set(['rejected', 'cancelled', 'canceled', 'refunded', 'charged_back']);
const CANCELED_PROVIDER_STATES = new Set(['cancelled', 'canceled']);

export function planFor(code) {
  return SUBSCRIPTION_PLANS[code] || null;
}

export function isSubscriptionActive(subscription, now = new Date()) {
  if (subscription?.tipo === 'gratuita') return subscription?.estado === 'activa';
  if (!ACTIVE_SUBSCRIPTION_STATES.has(subscription?.estado)) return false;
  if (subscription.estado === 'en_gracia' && subscription.gracia_hasta_at) {
    return new Date(subscription.gracia_hasta_at).getTime() > new Date(now).getTime();
  }
  return true;
}

export function subscriptionRestrictionsRequired(subscription, globallyEnabled = false, now = new Date()) {
  return globallyEnabled
    || ['anulada', 'vencida'].includes(subscription?.estado)
    || (subscription?.estado === 'en_gracia' && !isSubscriptionActive(subscription, now));
}

export function canReuseSubscriptionCheckout(subscription, now = new Date()) {
  const updatedAt = new Date(subscription?.updated_at).getTime();
  return Number.isFinite(updatedAt) && updatedAt > new Date(now).getTime() - SUBSCRIPTION_CHECKOUT_REUSE_WINDOW_MS;
}

export function authorizedPaymentOutcome(invoice) {
  if (!invoice) return 'none';
  const paymentStatus = String(invoice.payment?.status || '').toLowerCase();
  const paymentDetail = String(invoice.payment?.status_detail || '').toLowerCase();
  const invoiceStatus = String(invoice.status || '').toLowerCase();
  const summarized = String(invoice.summarized || '').toLowerCase();
  if (APPROVED_PAYMENT_STATES.has(paymentStatus) || APPROVED_PAYMENT_STATES.has(paymentDetail) || summarized === 'approved') return 'approved';
  if (REJECTED_PAYMENT_STATES.has(paymentStatus) || REJECTED_PAYMENT_STATES.has(paymentDetail) || summarized === 'rejected' || invoiceStatus === 'recycling') return 'rejected';
  return 'pending';
}

function invoiceTimestamp(invoice) {
  const value = invoice?.debit_date || invoice?.last_modified || invoice?.date_created;
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function summarizeAuthorizedPayments(invoices = []) {
  const ordered = [...invoices].sort((left, right) => invoiceTimestamp(right) - invoiceTimestamp(left));
  return {
    latest: ordered[0] || null,
    latestOutcome: authorizedPaymentOutcome(ordered[0]),
    approvedCount: ordered.filter((invoice) => authorizedPaymentOutcome(invoice) === 'approved').length,
  };
}

export function providerNextPaymentDate(provider) {
  return provider?.next_payment_date || provider?.auto_recurring?.next_payment_date || null;
}

export function providerTrialWindow(provider, trialDays = 14, now = new Date()) {
  const nextPayment = providerNextPaymentDate(provider);
  const endsAt = nextPayment ? new Date(nextPayment) : null;
  if (endsAt && !Number.isNaN(endsAt.getTime())) {
    return { startsAt: new Date(endsAt.getTime() - trialDays * 86_400_000), endsAt };
  }
  const startsAt = new Date(now);
  return { startsAt, endsAt: new Date(startsAt.getTime() + trialDays * 86_400_000) };
}

export function deriveProviderSubscriptionState(current, provider, billing = {}, now = new Date()) {
  const currentState = current?.estado || 'pendiente';
  const providerStatus = String(provider?.status || '').toLowerCase();
  if (CANCELED_PROVIDER_STATES.has(providerStatus)) return 'anulada';
  if (providerStatus === 'paused') return 'en_gracia';
  if (billing.latestOutcome === 'approved') return 'activa';
  if (billing.latestOutcome === 'rejected') return 'en_gracia';
  if (!['authorized', 'active'].includes(providerStatus)) return currentState;
  const providerTrialDays = Number(provider?.auto_recurring?.free_trial?.frequency || (current?.prueba_reservada_at ? 14 : 0));
  if (!current?.prueba_iniciada_at) return providerTrialDays > 0 ? 'prueba' : 'en_gracia';
  const trialEndsAt = current.prueba_finaliza_at ? new Date(current.prueba_finaliza_at).getTime() : null;
  if (trialEndsAt && trialEndsAt > new Date(now).getTime()) return 'prueba';
  if (['activa', 'en_gracia', 'vencida'].includes(currentState)) return currentState;
  const charged = Math.max(Number(provider?.summarized?.charged_quantity || provider?.charged_quantity || 0), Number(billing.approvedCount || 0));
  if (charged > 0) return 'activa';
  return 'en_gracia';
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

import { planFor } from './subscriptions.js';

const EMAIL_COPY = {
  prueba_iniciada: { subject: 'Tu prueba de NEW MATCH empezó', title: 'Tu prueba ya está activa', message: 'Tenés 30 días para ordenar la operación de tu complejo.', date: 'prueba_finaliza_at', dateLabel: 'Finaliza el' },
  prueba_7: { subject: 'Tu prueba termina en 7 días', title: 'Tu prueba termina pronto', message: 'Quedan 7 días para definir la continuidad de tu plan.', date: 'prueba_finaliza_at', dateLabel: 'Finaliza el' },
  prueba_3: { subject: 'Tu prueba termina en 3 días', title: 'Tu prueba termina en 3 días', message: 'Mercado Pago realizará el primer cobro al finalizar la prueba.', date: 'prueba_finaliza_at', dateLabel: 'Finaliza el' },
  primer_pago: { subject: 'Tu suscripción está activa', title: 'Tu suscripción está activa', message: 'Recibimos tu primer pago. Ya podés seguir operando con normalidad.', date: 'proximo_cobro_at', dateLabel: 'Próximo cobro' },
  renovacion_3: { subject: 'Tu renovación es en 3 días', title: 'Tu renovación es en 3 días', message: 'Te avisamos con anticipación sobre tu próximo cobro.', date: 'proximo_cobro_at', dateLabel: 'Fecha de cobro' },
  cobro_fallido: { subject: 'No pudimos acreditar tu cobro', title: 'No pudimos acreditar tu cobro', message: 'Tu acceso sigue activo mientras Mercado Pago reintenta el cobro.', date: 'gracia_hasta_at', dateLabel: 'Acceso activo hasta' },
  gracia_3: { subject: 'Tu período de gracia termina en 3 días', title: 'Tu acceso necesita atención', message: 'Actualizá tu medio de pago para mantener el servicio activo.', date: 'gracia_hasta_at', dateLabel: 'Acceso activo hasta' },
  pago_recuperado: { subject: 'Tu pago fue acreditado', title: 'Tu pago fue acreditado', message: 'Tu suscripción vuelve a estar activa.', date: 'proximo_cobro_at', dateLabel: 'Próximo cobro' },
  gracia_vencida: { subject: 'Tu suscripción venció', title: 'Tu suscripción venció', message: 'Tus complejos quedan en modo lectura hasta crear una nueva suscripción.' },
  anulada: { subject: 'Tu suscripción fue anulada', title: 'Tu suscripción fue anulada', message: 'El acceso comercial terminó. No hay devoluciones proporcionales.' },
  precio_30: { subject: 'Próximo cambio de precio', title: 'Tu plan cambiará de valor', message: 'El nuevo valor se aplicará dentro de 30 días.', date: 'proximo_cobro_at', dateLabel: 'Próximo cobro' },
  precio_7: { subject: 'Cambio de precio en 7 días', title: 'Tu plan cambia de valor en 7 días', message: 'El nuevo valor se aplicará en la siguiente renovación.', date: 'proximo_cobro_at', dateLabel: 'Próximo cobro' },
};

const FALLBACK_COPY = { subject: 'Actualización de tu suscripción', title: 'Hay una novedad en tu suscripción', message: 'Podés revisar el estado y las opciones de tu plan cuando quieras.' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'A confirmar';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' }).format(date);
}

function planDetails(subscription = {}) {
  if (subscription.tipo === 'gratuita') return { name: 'Gratuito', price: 'Sin costo' };
  const plan = planFor(subscription.plan_codigo);
  return { name: plan?.name || 'Tu plan', price: formatCurrency(subscription.precio_ars ?? plan?.price) };
}

export function buildSubscriptionEmail(subscription, type, baseUrl) {
  const copy = EMAIL_COPY[type] || FALLBACK_COPY;
  const plan = planDetails(subscription);
  const importantDate = formatDate(subscription?.[copy.date]);
  const safeBaseUrl = String(baseUrl || '').replace(/\/$/, '');
  const plansUrl = `${safeBaseUrl}/planes`;
  const detailRows = [
    ['Plan contratado', plan.name],
    ['Valor mensual', plan.price],
    ...(importantDate ? [[copy.dateLabel, importantDate]] : []),
  ];
  const textDetails = detailRows.map(([label, value]) => `${label}: ${value}`).join('\n');
  const rows = detailRows.map(([label, value]) => `<tr><td style="padding:0 0 10px;color:#9DAAA0;font-size:13px;line-height:20px;">${escapeHtml(label)}</td><td align="right" style="padding:0 0 10px;color:#F4F7F2;font-size:13px;font-weight:700;line-height:20px;">${escapeHtml(value)}</td></tr>`).join('');

  return {
    subject: copy.subject,
    text: `${copy.title}\n\n${copy.message}\n\n${textDetails}\n\nGestionar suscripción: ${plansUrl}`,
    html: `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#0B0E0C;color:#F4F7F2;font-family:Manrope,'Avenir Next','Helvetica Neue',sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0B0E0C;"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#123126;border-radius:16px;overflow:hidden;"><tr><td style="padding:28px 28px 24px;border-bottom:1px solid rgba(244,247,242,.12);"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="42" valign="middle"><img src="${escapeHtml(`${safeBaseUrl}/apple-touch-icon-180.png`)}" width="36" height="36" alt="NEW MATCH" style="display:block;width:36px;height:36px;border:0;border-radius:10px;"></td><td valign="middle" style="padding-left:10px;color:#F4F7F2;font-size:16px;font-weight:800;letter-spacing:.04em;">NEW MATCH</td></tr></table></td></tr><tr><td style="padding:30px 28px 10px;"><h1 style="margin:0;color:#F4F7F2;font-size:27px;line-height:34px;letter-spacing:-.03em;">${escapeHtml(copy.title)}</h1><p style="margin:14px 0 0;color:#D7E0D8;font-size:15px;line-height:23px;">${escapeHtml(copy.message)}</p></td></tr><tr><td style="padding:20px 28px 10px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid rgba(183,238,85,.35);border-bottom:1px solid rgba(244,247,242,.12);padding:18px 0;">${rows}</table></td></tr><tr><td style="padding:24px 28px 32px;"><a href="${escapeHtml(plansUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#B7EE55;color:#123126;font-size:14px;font-weight:800;line-height:20px;text-decoration:none;">Gestionar suscripción</a><p style="margin:20px 0 0;color:#9DAAA0;font-size:12px;line-height:18px;">Este aviso corresponde a tu cuenta de NEW MATCH.</p></td></tr></table></td></tr></table></body></html>`,
  };
}

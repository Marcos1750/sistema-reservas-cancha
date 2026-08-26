import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from './authClient';
import { apiFetch, readApiResponse } from './api';
import { Icon, PitchMark } from './icons';
import { useSessionWithFallback } from './useSessionWithFallback';

const money = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

export default function Planes() {
  const { data: session, isPending } = useSessionWithFallback();
  const userId = session?.user?.id;
  const [plans, setPlans] = useState([]); const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('plan') || ''); const [fiscal, setFiscal] = useState({ razon_social: '', cuit: '', condicion_fiscal: '', domicilio: '' }); const [message, setMessage] = useState(''); const [loading, setLoading] = useState(false);
  const request = async (path, options) => readApiResponse(await apiFetch(path, options));
  useEffect(() => { request('/api/planes').then(setPlans).catch((error) => setMessage(error.message)); }, []);
  useEffect(() => { if (userId) request('/api/suscripcion/datos-fiscales').then(setFiscal).catch(() => {}); }, [userId]);
  const start = async (plan) => {
    if (!session?.user) return authClient.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}/planes?plan=${plan.codigo}` });
    setSelected(plan.codigo); setMessage('');
  };
  const checkout = async (event) => {
    event.preventDefault(); setLoading(true); setMessage('');
    try {
      await request('/api/suscripcion/datos-fiscales', { method: 'PUT', body: JSON.stringify(fiscal) });
      const result = await request('/api/suscripcion/checkout', { method: 'POST', body: JSON.stringify({ plan_codigo: selected }) });
      window.location.assign(result.checkout_url);
    } catch (error) { setMessage(error.message); setLoading(false); }
  };
  return <div className="plans-page"><header className="plans-header"><a className="brand" href="/"><PitchMark /><span>NEW MATCH</span></a><a className="secondary-button" href={session?.user ? '/admin' : '/'}>{session?.user ? 'Ir al panel' : 'Explorar canchas'}</a></header><main className="plans-main"><section className="plans-intro"><h1>Tu operación, sin comisión por reserva.</h1><p>Probá NEW MATCH durante 14 días. El cobro y sus medios se gestionan en el checkout seguro de Mercado Pago.</p></section>{message && <p className="form-error" role="alert">{message}</p>}<section className="plans-grid">{plans.map((plan) => <article className={`plan-card${plan.codigo === 'pro' ? ' plan-card--featured' : ''}`} key={plan.codigo}><div><h2>{plan.nombre}</h2><p>{plan.codigo === 'fundador' ? 'Para los primeros 10 complejos.' : plan.codigo === 'pro' ? 'Para varias sedes y operación en crecimiento.' : 'Todo lo necesario para una sede.'}</p></div><strong>{money(plan.precio_ars)}<small>/mes</small></strong><ul><li>Hasta {plan.max_complejos} {plan.max_complejos === 1 ? 'sede' : 'sedes'}</li><li>Hasta {plan.max_canchas} canchas</li><li>0% de comisión por reserva</li><li>Prueba única de 14 días</li></ul>{plan.codigo === 'fundador' && !plan.fundador_disponible ? <span className="plan-unavailable">Cupos Fundador agotados</span> : <Button type="button" onClick={() => start(plan)}>{session?.user ? 'Iniciar prueba' : 'Continuar con Google'} <Icon name="arrow" size={16} /></Button>}</article>)}</section><section className="plans-custom"><div><h2>¿Más de 3 sedes o 20 canchas?</h2><p>Contanos cómo trabajás y armamos un plan a medida.</p></div><a className="secondary-button" href="mailto:hola@newmatch.app?subject=Plan%20a%20medida">Solicitar plan a medida</a></section>{selected && <section className="fiscal-panel"><div><h2>Datos de facturación</h2><p>Los necesitás una sola vez para iniciar la prueba de 14 días. Después seguís en Mercado Pago; NEW MATCH no recibe datos de tarjeta.</p></div><form onSubmit={checkout}><label>Razón social<input required value={fiscal.razon_social} onChange={(event) => setFiscal({ ...fiscal, razon_social: event.target.value })} /></label><label>CUIT<input required inputMode="numeric" value={fiscal.cuit} onChange={(event) => setFiscal({ ...fiscal, cuit: event.target.value })} /></label><label>Condición fiscal<input required placeholder="Monotributo, Responsable inscripto…" value={fiscal.condicion_fiscal} onChange={(event) => setFiscal({ ...fiscal, condicion_fiscal: event.target.value })} /></label><label>Domicilio<input required value={fiscal.domicilio} onChange={(event) => setFiscal({ ...fiscal, domicilio: event.target.value })} /></label><div className="fiscal-panel__actions"><Button type="submit" disabled={loading}>{loading ? 'Abriendo Mercado Pago…' : 'Ir a Mercado Pago'}</Button><Button variant="secondary" type="button" onClick={() => setSelected('')}>Cancelar</Button></div></form></section>}{isPending && <p className="plans-loading">Cargando tu cuenta…</p>}</main></div>;
}

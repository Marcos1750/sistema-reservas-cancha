import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useConfirm } from './lib/confirmDialog';
import { Icon, PitchMark } from './icons';
import { CalendarPicker } from './CalendarPicker';
import { ActionFeedback } from './ActionFeedback';
import { getAvailabilityStatus } from './lib/availability';
import { getSelectableSlots } from './lib/slotVisibility';
import { splitBookingsByTimeline } from './lib/bookings';
import { formatARS } from './mockData';
import { authClient } from './authClient';
import { apiFetch, readApiResponse } from './api';
import { getComplexTheme, getSportTheme, getUniqueSports } from './sportTheme';
import { useSessionWithFallback } from './useSessionWithFallback';
import { LoadingScreen } from './LoadingScreen';

function toDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nextDateValue(value) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return toDateValue(date);
}

const dateOptions = Array.from({ length: 3 }, (_, offset) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return {
    value: toDateValue(date),
    label: offset === 0 ? 'Hoy' : offset === 1 ? 'Mañana' : new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric' }).format(date),
    sublabel: new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(date).toUpperCase(),
  };
});

function formatBookingDay(value) {
  return value?.slice(-2) || '—';
}

function mapApiBooking(item) {
  const status = { confirmada: 'Confirmado', pendiente_pago: 'Pendiente de pago', cancelada: 'Cancelado', expirada: 'Vencido' }[item.estado] || item.estado;
  const paymentPending = item.pago_estado === 'pendiente' && item.checkout_url && new Date(item.expira_at) > new Date();
  return {
    id: item.id, complex: item.complejo, court: item.cancha, city: item.ciudad, province: item.provincia,
    date: item.fecha, time: item.hora, sport: item.deporte, recurrenceId: item.recurrencia_id,
    status, price: item.precio_ars, canCancel: item.puede_cancelar || item.estado === 'pendiente_pago', whatsapp: item.whatsapp,
    paymentId: item.pago_id, paymentUrl: paymentPending ? item.checkout_url : '', deposit: item.sena_ars,
    depositPercentage: item.porcentaje_sena, balance: item.saldo_ars,
  };
}

function VenueVisual({ complex, sport = 'MULTIDEPORTE', sports: sportsOverride, large = false }) {
  const complexSports = getUniqueSports(sportsOverride || complex?.sports || []);
  const sports = complexSports.length ? complexSports : getUniqueSports([sport]);
  const theme = sport === 'MULTIDEPORTE' ? getComplexTheme(sports) : getSportTheme(sport);
  const isMultisport = theme === 'multisport';
  const label = sport === 'MULTIDEPORTE' ? 'MULTIDEPORTE' : sport.replace('Fútbol ', 'F');
  return (
    <div className={`court-placeholder sport-theme--${theme}${complex?.photoUrl ? ' venue-photo' : ''}${large ? ' court-placeholder--large' : ''}`}>
      <div className="court-placeholder__glow" />
      {complex?.photoUrl ? <img src={complex.photoUrl} alt={`Foto de ${complex.name}`} /> : <>
        {theme === 'football' && <div className="court-placeholder__pitch"><span className="court-placeholder__halfway" /><span className="court-placeholder__circle" /><span className="court-placeholder__box court-placeholder__box--left" /><span className="court-placeholder__box court-placeholder__box--right" /><span className="court-placeholder__spot court-placeholder__spot--left" /><span className="court-placeholder__spot court-placeholder__spot--right" /></div>}
        {theme === 'padel' && <div className="court-placeholder__padel"><span className="padel-wall padel-wall--top" /><span className="padel-wall padel-wall--bottom" /><span className="padel-mesh" /><span className="padel-service padel-service--top" /><span className="padel-service padel-service--bottom" /><span className="padel-center" /><span className="padel-net" /><span className="padel-ball padel-ball--one" /><span className="padel-ball padel-ball--two" /></div>}
        {theme === 'tennis' && <div className="court-placeholder__tennis"><span className="tennis-service tennis-service--top" /><span className="tennis-service tennis-service--bottom" /><span className="tennis-center" /><span className="tennis-net" /><span className="tennis-ball tennis-ball--one" /><span className="tennis-ball tennis-ball--two" /></div>}
        {isMultisport && <div className="court-placeholder__multisport"><span /><span /><span /></div>}
      </>}
      <div className="court-placeholder__meta"><span>NEW MATCH / {label}</span><span>JUGÁ ACÁ</span></div>
    </div>
  );
}

function Brand({ onClick }) {
  return <button className="brand" type="button" onClick={onClick} aria-label="Volver a explorar"><PitchMark /><span>NEW MATCH</span></button>;
}

function AdminEntry({ canManage }) {
  if (!canManage) return null;
  return <a className="admin-entry" href="/admin" aria-label="Acceder al panel de administración"><Icon name="pitch" size={16} /><span className="admin-entry__desktop">Administrar complejos</span><span className="admin-entry__mobile">ADMIN</span></a>;
}

function BottomNav({ current, onChange }) {
  const items = [['explore', 'Explorar', 'home'], ['bookings', 'Mis turnos', 'ticket'], ['saved', 'Guardados', 'heart'], ['profile', 'Perfil', 'user']];
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const lastToggleY = useRef(0);

  useEffect(() => {
    const scrollThreshold = 12;
    let frameId = 0;
    const updateVisibility = () => {
      frameId = 0;
      const currentScrollY = Math.max(window.scrollY, 0);
      const direction = currentScrollY - lastScrollY.current;

      if (currentScrollY <= scrollThreshold) {
        setIsVisible(true);
        lastToggleY.current = currentScrollY;
      } else if (Math.abs(currentScrollY - lastToggleY.current) >= scrollThreshold && direction !== 0) {
        setIsVisible(direction < 0);
        lastToggleY.current = currentScrollY;
      }

      lastScrollY.current = currentScrollY;
    };
    const handleScroll = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updateVisibility);
    };

    lastScrollY.current = Math.max(window.scrollY, 0);
    lastToggleY.current = lastScrollY.current;
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  return <nav className={`bottom-nav${isVisible ? '' : ' bottom-nav--hidden'}`} aria-label="Navegación principal" aria-hidden={!isVisible} onFocusCapture={() => setIsVisible(true)}>{items.map(([id, label, icon]) => <button className={`bottom-nav__item${current === id ? ' is-active' : ''}`} key={id} type="button" onClick={() => { window.scrollTo({ top: 0, behavior: 'auto' }); onChange(id); }}><Icon name={icon} size={19} strokeWidth={current === id ? 2.2 : 1.6} /><span>{label}</span></button>)}</nav>;
}

function PublicSidebar({ current, onChange, session, canManage }) {
  const user = session?.user || session;
  const initials = user?.name?.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'GO';
  const items = [['explore', 'Explorar', 'home'], ['bookings', 'Mis turnos', 'ticket'], ['saved', 'Guardados', 'heart'], ['profile', 'Mi cuenta', 'user']];
  return <aside className="public-sidebar">
    <Brand onClick={() => onChange('explore')} />
    <span className="public-sidebar__label">NAVEGACIÓN</span>
    <nav aria-label="Secciones de NEW MATCH">
      {items.map(([id, label, icon]) => <button className={`public-nav-item${current === id ? ' is-active' : ''}`} key={id} type="button" onClick={() => onChange(id)}><Icon name={icon} size={18} /><span>{label}</span></button>)}
      {canManage && <a className="public-nav-item public-nav-item--admin" href="/admin"><Icon name="pitch" size={18} /><span>Administrar complejos</span></a>}
    </nav>
    <button className="public-sidebar__account" type="button" onClick={() => onChange('profile')}>
      <span>{initials}</span><strong>{user?.name || 'Ingresar a mi cuenta'}</strong><small>{user?.email || 'Guardá tus turnos y favoritos'}</small>
    </button>
  </aside>;
}

function PublicLayout({ current, onChange, session, canManage, showMobileNav = false, children }) {
  return <div className={`public-layout${showMobileNav ? ' public-layout--with-mobile-nav' : ''}`}><PublicSidebar current={current} onChange={onChange} session={session} canManage={canManage} /><div className="public-layout__stage">{children}</div>{showMobileNav && <BottomNav key={current} current={current} onChange={onChange} />}</div>;
}

function DateRail({ selected, onSelect }) {
  const isQuickDate = dateOptions.some((date) => date.value === selected);
  const customDay = isQuickDate ? '' : String(new Date(`${selected}T12:00:00`).getDate());
  return <div className="date-rail" role="tablist" aria-label="Elegí una fecha">
    {dateOptions.map((date) => <Button className={selected === date.value ? 'date-pill is-selected' : 'date-pill'} variant={selected === date.value ? 'chipActive' : 'chip'} key={date.value} type="button" role="tab" aria-selected={selected === date.value} onClick={() => onSelect(date.value)}><span>{date.label}</span><small>{date.sublabel}</small></Button>)}
    <CalendarPicker compact className={isQuickDate ? '' : 'is-selected'} compactValue={customDay} label={isQuickDate ? 'Elegir otra fecha' : `Fecha elegida: ${selected}`} value={selected} onChange={onSelect} min={dateOptions[0].value} />
  </div>;
}

function AvailabilityPanel({ status, slots, selectedTime, onSelectTime, onRetry, onNextDate, date, now }) {
  const selectableSlots = getSelectableSlots(date, slots, now);
  if (status === 'available' && selectableSlots.length) return <div className="time-grid">{selectableSlots.map((slot) => <button className={`time-slot${selectedTime === slot ? ' is-selected' : ''}`} key={slot} type="button" onClick={() => onSelectTime(slot)}><Icon name="clock" size={14} /> {slot}</button>)}</div>;

  const resolvedStatus = status === 'available' ? 'no-upcoming-slots' : status;

  const details = {
    loading: { message: 'Buscando horarios disponibles…', icon: 'calendar' },
    blocked: { message: 'Esta cancha no está disponible en la fecha elegida.', helper: 'Elegí otra fecha o seguí buscando el próximo día.', icon: 'calendar' },
    'no-schedule': { message: 'Esta cancha no tiene horarios disponibles para esta fecha.', helper: 'Elegí otra fecha o seguí buscando el próximo día.', icon: 'calendar' },
    'fully-booked': { message: 'Los horarios de esta fecha ya fueron reservados.', helper: 'Elegí otra fecha o seguí buscando el próximo día.', icon: 'calendar' },
    'no-upcoming-slots': { message: 'Ya no quedan horarios para hoy.', helper: 'Elegí el día siguiente para ver nuevas opciones.', icon: 'clock' },
    error: { message: 'No pudimos cargar los horarios.', helper: 'Intentá nuevamente.', icon: 'back' },
  }[resolvedStatus] || { message: 'Buscando horarios disponibles…', icon: 'calendar' };
  const canMoveDate = resolvedStatus === 'blocked' || resolvedStatus === 'no-schedule' || resolvedStatus === 'fully-booked' || resolvedStatus === 'no-upcoming-slots';

  return <div className={`availability-state availability-state--${resolvedStatus}`} role={resolvedStatus === 'error' ? 'alert' : 'status'} aria-live="polite"><Icon name={details.icon} size={18} /><div><strong>{details.message}</strong>{details.helper && <span>{details.helper}</span>}</div>{resolvedStatus === 'error' && <Button variant="secondary" size="sm" type="button" onClick={onRetry}>Reintentar</Button>}{canMoveDate && <Button variant="secondary" size="sm" type="button" onClick={onNextDate}>Ver día siguiente</Button>}</div>;
}

function ComplexCard({ complex, onOpen, isSaved, onToggleSaved }) {
  const theme = getComplexTheme(complex.sports);
  return <Card asChild className={`court-card complex-card sport-theme--${theme}`}><article><button className="court-card__visual-button" type="button" onClick={() => onOpen(complex)} aria-label={`Ver ${complex.name}`}><VenueVisual complex={complex} sport={theme === 'multisport' ? 'MULTIDEPORTE' : complex.sports[0]} /></button><div className="court-card__body"><div className="court-card__heading"><div><h3>{complex.name}</h3><p><Icon name="pin" size={13} /> {complex.city}, {complex.province} <span className="dot-separator">·</span> {complex.address}</p></div><Button className={`icon-button${isSaved ? ' is-saved' : ''}`} variant="ghost" size="icon" type="button" onClick={() => onToggleSaved(complex.id)} aria-label={isSaved ? 'Quitar complejo de guardados' : 'Guardar complejo'}><Icon name="heart" size={18} /></Button></div><div className="court-card__facts"><Badge>{complex.courtCount} {complex.courtCount === 1 ? 'cancha' : 'canchas'}</Badge>{complex.sports.map((item) => <Badge className={`sport-badge sport-theme--${getSportTheme(item)}`} key={item}>{item}</Badge>)}</div><div className="court-card__footer"><div><small>Desde</small><strong>{complex.price ? formatARS(complex.price) : 'Consultá horarios'}</strong></div><Button className="text-button" variant="ghost" size="sm" type="button" onClick={() => onOpen(complex)}>Ver complejo <Icon name="arrow" size={15} /></Button></div></div></article></Card>;
}

function ExploreScreen({ complexes, query, setQuery, onOpen, saved, onToggleSaved, session, onLogin, canManage }) {
  const filtered = useMemo(() => complexes.filter((complex) => `${complex.name} ${complex.city} ${complex.province} ${complex.sports.join(' ')}`.toLowerCase().includes(query.toLowerCase())), [complexes, query]);
  const initials = session?.user?.name?.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'GO';
  return <div className="app-shell"><header className="app-header"><Brand /><AdminEntry canManage={canManage} /><button className="avatar-button" type="button" aria-label="Abrir perfil" onClick={onLogin}>{initials}</button></header><main className="main-content"><section className="welcome-block"><h1>Tu próximo partido,<br /><em>a un toque.</em></h1><p>Encontrá un complejo, elegí su cancha y reservá tu horario.</p></section><div className="search-field"><Icon name="search" size={19} /><Input aria-label="Buscar complejos" placeholder="Buscar por complejo, ciudad o deporte" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></div><section className="courts-section courts-section--explore"><div className="section-heading"><div><span className="section-kicker">COMPLEJOS DISPONIBLES</span><h2>Elegí dónde jugar</h2></div><span className="result-count">{filtered.length} opciones</span></div>{filtered.length ? <div className="court-list complex-list">{filtered.map((complex) => <ComplexCard key={complex.id} complex={complex} onOpen={onOpen} isSaved={saved.includes(complex.id)} onToggleSaved={onToggleSaved} />)}</div> : <div className="empty-state"><PitchMark compact /><h3>No encontramos ese complejo</h3><p>Probá con otra ciudad, deporte o limpiá la búsqueda.</p><Button variant="secondary" size="sm" type="button" onClick={() => setQuery('')}>Limpiar búsqueda</Button></div>}</section></main></div>;
}

function DetailScreen({ complex, court, onSelectCourt, date, setDate, time, setTime, onBack, onReserve, saved, onToggleSaved, availabilityStatus, onRetryAvailability, now }) {
  const displayPrice = court?.slotPrices?.[time] ?? court?.price ?? 0;
  const selectedTheme = court ? getSportTheme(court.sport) : getComplexTheme(complex.sports);
  return <div className={`app-shell app-shell--detail sport-context sport-theme--${selectedTheme}`}><header className="detail-header"><button className="round-button" type="button" onClick={onBack} aria-label="Volver"><Icon name="back" size={19} /></button><Brand onClick={onBack} /><button className={`round-button${saved.includes(complex.id) ? ' is-saved' : ''}`} type="button" onClick={() => onToggleSaved(complex.id)} aria-label="Guardar complejo"><Icon name="heart" size={18} /></button></header><main className="detail-content complex-detail"><section className="complex-detail__identity"><VenueVisual complex={complex} sport={court?.sport} sports={court ? [court.sport] : complex.sports} large /><div className="detail-intro"><div><span className="detail-eyebrow">COMPLEJO SELECCIONADO</span><h1>{complex.name}</h1><p><Icon name="pin" size={14} /> {complex.city}, {complex.province} <span className="dot-separator">·</span> {complex.address}</p></div></div><p className="detail-description">{complex.description || 'Todo listo para organizar tu próximo partido.'}</p></section><section className="complex-detail__booking"><div className="court-selector"><div className="section-label"><span>Elegí una cancha</span><small>{complex.courts.length} disponibles</small></div><div className="court-selector__grid">{complex.courts.map((item) => <button className={`court-choice sport-theme--${getSportTheme(item.sport)}${court?.id === item.id ? ' is-selected' : ''}`} key={item.id} type="button" onClick={() => onSelectCourt(item)}><span><strong>{item.name}</strong><small>{item.sport} · {item.indoor ? 'Indoor' : 'A cielo abierto'}</small></span><b>{item.price ? formatARS(item.price) : 'Sin precio'}</b></button>)}</div></div><section className="availability"><div className="section-label"><span>Elegí tu horario</span><span className="availability-note"><span className="availability-dot" /> Disponible</span></div><DateRail selected={date} onSelect={setDate} />{court ? <AvailabilityPanel status={availabilityStatus} slots={court.slots} selectedTime={time} onSelectTime={setTime} onRetry={onRetryAvailability} onNextDate={() => setDate(nextDateValue(date))} date={date} now={now} /> : <div className="inline-empty">Elegí una cancha para consultar sus horarios.</div>}</section></section></main><div className={`sticky-cta${time ? '' : ' sticky-cta--awaiting-selection'}`}>{time ? <div><small>Total del turno</small><strong>{formatARS(displayPrice)}</strong><span>/ turno</span></div> : <p>{court ? 'Elegí un horario para ver el total.' : 'Elegí una cancha para continuar.'}</p>}<Button className="primary-button" type="button" disabled={!court || !time} onClick={onReserve}>Reservar turno <Icon name="arrow" size={17} /></Button></div></div>;
}

function BookingScreen({ complex, court, date, time, form, setForm, repeatWeekly, setRepeatWeekly, repeatWeeks, setRepeatWeeks, onBack, onHome, onConfirm, error, defaultName, defaultPhone, submitting }) {
  const price = court.slotPrices?.[time] ?? court.price;
  return <div className={`app-shell app-shell--booking sport-context sport-theme--${getSportTheme(court.sport)}`}><header className="detail-header"><button className="round-button" type="button" onClick={onBack} aria-label="Volver"><Icon name="back" size={19} /></button><Brand onClick={onHome} /><span className="step-count">02 / 02</span></header><main className="booking-content"><div className="booking-summary"><VenueVisual complex={complex} sport={court.sport} sports={[court.sport]} /><div><span className="detail-eyebrow">TU TURNO</span><h2>{complex.name}</h2><strong className="booking-summary__court">{court.name}</strong><p><Icon name="calendar" size={13} /> {date} <span className="dot-separator">·</span> <Icon name="clock" size={13} /> {time}</p></div></div><div className="booking-divider" /><section className="form-section"><span className="section-kicker">DATOS DEL CAPITÁN</span><h1>¿A nombre de quién<br />reservamos?</h1><label>Nombre completo<Input value={form.name || defaultName || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Martín Sosa" autoComplete="name" disabled={submitting} /></label><label>WhatsApp<Input value={form.phone || defaultPhone || ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="11 5555 5555" inputMode="tel" autoComplete="tel" disabled={submitting} /></label>{!court.requiresDeposit && <p className="booking-payment-notice" role="status">{court.ownerReservationFree ? 'Reserva de propietario: confirmación inmediata, sin seña.' : 'Sin seña: la reserva se confirmará de inmediato.'}</p>}<section className="recurring-option"><label><input type="checkbox" checked={repeatWeekly} disabled={submitting} onChange={(event) => setRepeatWeekly(event.target.checked)} /><span><strong>Reservar horario fijo</strong><small>Repite este mismo día y horario todas las semanas.</small></span></label>{repeatWeekly && <label className="recurring-option__weeks">¿Por cuánto tiempo?<select value={repeatWeeks} disabled={submitting} onChange={(event) => setRepeatWeeks(Number(event.target.value))}><option value={4}>4 semanas</option><option value={8}>8 semanas</option><option value={12}>12 semanas</option></select></label>}</section></section></main><div className="sticky-cta sticky-cta--booking"><div><small>{repeatWeekly ? `Total por ${repeatWeeks} semanas` : 'Total del turno'}</small><strong>{formatARS(price * (repeatWeekly ? repeatWeeks : 1))}</strong></div><Button className="primary-button" type="button" disabled={submitting} onClick={onConfirm}>{submitting ? court.requiresDeposit ? 'Preparando pago…' : 'Confirmando…' : repeatWeekly ? 'Confirmar horario fijo' : 'Confirmar reserva'} <Icon name="check" size={17} /></Button><ActionFeedback className="sticky-cta__feedback" message={error} tone="error" /></div></div>;
}

function SuccessScreen({ complex, court, date, time, onDone, repeatWeeks }) {
  return <div className={`success-screen sport-context sport-theme--${getSportTheme(court.sport)}`}><div className="success-grid" /><div className="success-mark"><Icon name="check" size={28} /></div><span className="section-kicker">RESERVA CONFIRMADA</span><h1>{repeatWeeks ? <>Tu horario fijo<br /><em>ya está reservado.</em></> : <>El partido ya<br /><em>tiene cancha.</em></>}</h1><p>{complex.name} · {court.name}<br />{date} a las {time}{repeatWeeks ? ` · por ${repeatWeeks} semanas` : ''}</p><div className="success-ticket"><div><small>UBICACIÓN</small><strong>{complex.city}, {complex.province}</strong></div><div><small>CANCHA</small><strong>{court.name}</strong></div><div><small>DEPORTE</small><strong>{court.sport}</strong></div></div><button className="primary-button" type="button" onClick={onDone}>Volver a explorar <Icon name="arrow" size={17} /></button></div>;
}

function PaymentScreen({ payment, onCancel }) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.location.assign(payment.checkoutUrl), 700);
    return () => window.clearTimeout(timer);
  }, [payment.checkoutUrl]);
  return <div className="success-screen"><div className="success-grid" /><div className="success-mark"><Icon name="arrow" size={28} /></div><span className="section-kicker">SEÑA PENDIENTE</span><h1>Te llevamos a<br /><em>Mercado Pago.</em></h1><p>Tu horario está retenido hasta completar la seña. Si la redirección no se abre, usá el botón de abajo.</p><a className="primary-button" href={payment.checkoutUrl}>Ir a Mercado Pago <Icon name="arrow" size={17} /></a><Button variant="secondary" type="button" onClick={onCancel}>Cancelar solicitud</Button></div>;
}

function BookingsScreen({ bookings, onChange, session, onLogin, onCancel, notice, canManage }) {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [actionFeedback, setActionFeedback] = useState(null);
  const cancel = async (booking) => {
    const result = await onCancel(booking);
    if (result) {
      setActionFeedback({ bookingId: booking.id, ...result });
      if (result.tone === 'success') setActiveTab('history');
    }
  };
  const { upcoming, history } = splitBookingsByTimeline(bookings);
  const visibleBookings = activeTab === 'upcoming' ? upcoming : history;
  const emptyCopy = activeTab === 'upcoming'
    ? { title: 'Todavía no tenés próximos turnos', description: 'Cuando reserves una cancha, aparece acá.', action: 'Explorar complejos' }
    : { title: 'Todavía no hay turnos en tu historial', description: 'Acá vas a encontrar tus reservas anteriores.' };

  return <div className="app-shell">
    <header className="app-header"><Brand onClick={() => onChange('explore')} /><AdminEntry canManage={canManage} /><button className="avatar-button" type="button" onClick={() => onChange('profile')}>{session?.user?.name?.slice(0, 2).toUpperCase() || 'GO'}</button></header>
    <main className="main-content">
      <section className="page-heading"><span className="section-kicker">TUS RESERVAS</span><h1>Mis turnos</h1><p>Tu próximo partido siempre aparece primero.</p></section>
      {session ? <>
        {notice && <p className="form-success" role="status">{notice}</p>}
        <div className="booking-tabs" role="tablist" aria-label="Filtrar turnos">
          <button className={`booking-tab${activeTab === 'upcoming' ? ' is-active' : ''}`} id="upcoming-bookings-tab" type="button" role="tab" aria-selected={activeTab === 'upcoming'} aria-controls="bookings-panel" onClick={() => setActiveTab('upcoming')}>Próximos <span>{upcoming.length}</span></button>
          <button className={`booking-tab${activeTab === 'history' ? ' is-active' : ''}`} id="booking-history-tab" type="button" role="tab" aria-selected={activeTab === 'history'} aria-controls="bookings-panel" onClick={() => setActiveTab('history')}>Historial <span>{history.length}</span></button>
        </div>
        <div className="booking-list" id="bookings-panel" role="tabpanel" aria-labelledby={activeTab === 'upcoming' ? 'upcoming-bookings-tab' : 'booking-history-tab'}>
          {visibleBookings.map((booking) => {
            const cancelled = booking.status === 'Cancelado' || booking.status === 'Vencido';
            const pendingPayment = booking.status === 'Pendiente de pago';
            const whatsappUrl = booking.whatsapp ? `https://wa.me/${booking.whatsapp}?text=${encodeURIComponent(`Hola, necesito gestionar mi reserva en ${booking.complex} del ${booking.date} a las ${booking.time}.`)}` : '';
            return <article className={`booking-card${cancelled ? ' is-cancelled' : ''}${pendingPayment ? ' is-pending-payment' : ''}`} key={booking.id}><div className="booking-card__date"><strong>{formatBookingDay(booking.date)}</strong><span>{new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(new Date(`${booking.date}T12:00:00`)).toUpperCase()}</span></div><div className="booking-card__content"><div><h3>{booking.complex || 'Complejo'}</h3><p>{booking.court} · {booking.date} · {booking.time}</p></div><span className={`status-pill${cancelled ? ' is-cancelled' : pendingPayment ? ' is-pending' : ''}`}><span /> {booking.status || 'Confirmado'}{booking.recurrenceId ? ' · Fijo' : ''}</span><div className="booking-card__meta"><span>{booking.sport || 'Turno'}</span><strong>{booking.price ? formatARS(booking.price) : '—'}</strong></div>{booking.deposit ? <div className="booking-payment"><span>Seña: <strong>{formatARS(booking.deposit)}</strong>{booking.balance !== null ? ` · Saldo en el complejo: ${formatARS(booking.balance)}` : ''}</span>{!pendingPayment && <small>Las señas confirmadas no se reintegran automáticamente.</small>}</div> : null}{!cancelled && <div className="booking-card__actions">{pendingPayment ? <>{booking.paymentUrl && <a className="booking-card__pay" href={booking.paymentUrl}>Pagar seña <Icon name="arrow" size={14} /></a>}<Button variant="secondary" size="sm" type="button" onClick={() => cancel(booking)}>Cancelar solicitud</Button></> : booking.canCancel ? <Button variant="secondary" size="sm" type="button" onClick={() => cancel(booking)}>Cancelar reserva</Button> : whatsappUrl ? <a className="booking-card__whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer">Gestionar por WhatsApp <Icon name="arrow" size={14} /></a> : <small>Para cancelar, contactá al complejo.</small>}</div>}<ActionFeedback message={actionFeedback?.bookingId === booking.id ? actionFeedback.message : ''} tone={actionFeedback?.tone || 'success'} /></div></article>;
          })}
        </div>
        {!visibleBookings.length && <div className="empty-state booking-empty"><PitchMark compact /><h3>{emptyCopy.title}</h3><p>{emptyCopy.description}</p>{emptyCopy.action && <Button variant="secondary" size="sm" type="button" onClick={() => onChange('explore')}>{emptyCopy.action}</Button>}</div>}
      </> : <div className="quiet-panel"><PitchMark compact /><h3>Guardá tus próximos partidos</h3><p>Ingresá con Google para consultar tu historial y reservar.</p><Button type="button" onClick={onLogin}>Continuar con Google <Icon name="arrow" size={17} /></Button></div>}
    </main>
  </div>;
}

function SavedScreen({ complexes, saved, onOpen, onToggleSaved, onChange, session, onLogin, canManage }) {
  const savedComplexes = complexes.filter((complex) => saved.includes(complex.id));
  return <div className="app-shell"><header className="app-header"><Brand onClick={() => onChange('explore')} /><AdminEntry canManage={canManage} /><button className="avatar-button" type="button" onClick={() => onChange('profile')}>{session?.user?.name?.slice(0, 2).toUpperCase() || 'GO'}</button></header><main className="main-content"><section className="page-heading"><span className="section-kicker">TUS COMPLEJOS</span><h1>Guardados</h1><p>Los lugares que querés tener a mano para el próximo partido.</p></section>{session ? savedComplexes.length ? <div className="court-list complex-list">{savedComplexes.map((complex) => <ComplexCard key={complex.id} complex={complex} onOpen={onOpen} isSaved onToggleSaved={onToggleSaved} />)}</div> : <div className="empty-state"><PitchMark compact /><h3>Todavía no guardaste complejos</h3><p>Usá el corazón para encontrarlos rápido después.</p><Button variant="secondary" size="sm" type="button" onClick={() => onChange('explore')}>Explorar complejos</Button></div> : <div className="quiet-panel"><PitchMark compact /><h3>Guardá tus complejos favoritos</h3><p>Ingresá con Google y vas a encontrarlos desde cualquier dispositivo.</p><Button type="button" onClick={onLogin}>Continuar con Google <Icon name="arrow" size={17} /></Button></div>}</main></div>;
}

function ProfileScreen({ profile, session, onChange, onLogin, onLogout, onSave, canManage }) {
  const [draft, setDraft] = useState({ nombre: profile?.nombre || session?.user?.name || '', whatsapp: profile?.whatsapp || '' });
  const [message, setMessage] = useState('');
  if (!session) return <div className="app-shell app-shell--profile"><header className="app-header"><Brand onClick={() => onChange('explore')} /><AdminEntry canManage={canManage} /><span className="avatar-button">GO</span></header><main className="main-content"><section className="page-heading"><span className="section-kicker">TU CUENTA</span><h1>Perfil</h1><p>Ingresá para guardar tus datos de reserva.</p></section><div className="quiet-panel"><PitchMark compact /><h3>Ingresá con Google</h3><p>Vas a poder guardar tu nombre y WhatsApp para reservar más rápido.</p><Button type="button" onClick={onLogin}>Continuar con Google <Icon name="arrow" size={17} /></Button></div></main></div>;
  const save = async (event) => { event.preventDefault(); try { await onSave(draft); setMessage('Datos de reserva guardados.'); } catch (error) { setMessage(error.message); } };
  const isAdmin = ['admin_cancha', 'subadmin', 'superadmin'].includes(profile?.role);
  const canManageSubscription = profile?.role !== 'subadmin';
  return <div className="app-shell app-shell--profile"><header className="app-header"><Brand onClick={() => onChange('explore')} /><AdminEntry canManage={canManage} /><button className="avatar-button" type="button" onClick={() => onChange('profile')}>{session.name?.slice(0, 2).toUpperCase() || 'GO'}</button></header><main className="main-content"><section className="page-heading"><span className="section-kicker">TU CUENTA</span><h1>Mi cuenta</h1><p>{session.email}</p></section><form className="profile-form" onSubmit={save}><div><h2>Datos para reservar</h2><p>Se completan automáticamente cuando pedís un turno.</p></div><label>Nombre para las reservas<Input required minLength="2" value={draft.nombre} onChange={(event) => setDraft({ ...draft, nombre: event.target.value })} /></label><label>WhatsApp<Input required inputMode="tel" value={draft.whatsapp} onChange={(event) => setDraft({ ...draft, whatsapp: event.target.value })} placeholder="11 5555 5555" /></label><Button type="submit">Guardar datos <Icon name="check" size={16} /></Button><ActionFeedback message={message} tone={message.includes('guardados') ? 'success' : 'error'} /></form><section className="profile-links"><h2>Accesos rápidos</h2><button type="button" onClick={() => onChange('bookings')}><span><Icon name="ticket" size={18} /><strong>Mis turnos</strong></span><Icon name="chevron" size={18} /></button><button type="button" onClick={() => onChange('saved')}><span><Icon name="heart" size={18} /><strong>Guardados</strong></span><Icon name="chevron" size={18} /></button>{canManageSubscription && <a href="/planes"><span><Icon name="pitch" size={18} /><strong>Planes y suscripción</strong></span><Icon name="arrow" size={18} /></a>}{isAdmin && <a href="/admin"><span><Icon name="pitch" size={18} /><strong>Panel de gestión</strong></span><Icon name="arrow" size={18} /></a>}</section><Button className="profile-logout" variant="secondary" size="sm" type="button" onClick={onLogout}>Cerrar sesión</Button></main></div>;
}

function mapApiComplex(item) {
  return { id: Number(item.id), name: item.nombre, city: item.ciudad, province: item.provincia, address: item.direccion || 'Dirección a confirmar', description: item.descripcion || '', photoUrl: item.foto_url || '', ownerReservationFree: item.reserva_sin_sena === true, courtCount: Number(item.cantidad_canchas || 0), sports: item.deportes || [], price: Number(item.precio_desde || 0), courts: [] };
}

function complexSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mapApiCourt(item, ownerReservationFree = false) {
  return { id: Number(item.id), name: item.nombre, sport: item.deporte, description: item.descripcion || '', indoor: Boolean(item.indoor), ownerReservationFree, requiresDeposit: item.requiere_sena !== false && !ownerReservationFree, price: Number(item.precio_desde || 0), slots: [], slotPrices: {} };
}

export default function Reservas() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data: session, isPending } = useSessionWithFallback();
  const confirm = useConfirm();
  const sessionUserId = session?.user?.id;
  const [screen, setScreen] = useState(() => new URLSearchParams(window.location.search).has('pago') ? 'bookings' : 'explore');
  const [complexes, setComplexes] = useState([]);
  const [complexesLoaded, setComplexesLoaded] = useState(false);
  const [selectedComplex, setSelectedComplex] = useState(null);
  const [selectedCourt, setSelectedCourt] = useState(null);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value);
  const [selectedTime, setSelectedTime] = useState('');
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  const [error, setError] = useState('');
  const [availabilityStatus, setAvailabilityStatus] = useState('loading');
  const [availabilityRefreshId, setAvailabilityRefreshId] = useState(0);
  const [availabilityNow, setAvailabilityNow] = useState(() => new Date());
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [pendingCheckout, setPendingCheckout] = useState(null);
  const deepLinkHandled = useRef('');
  const [paymentNotice] = useState(() => ({ exitoso: 'Estamos verificando el pago de tu seña.', pendiente: 'Tu pago sigue pendiente. Podés retomarlo desde este turno.', fallido: 'El pago no se completó. Podés intentarlo nuevamente o cancelar la solicitud.' }[new URLSearchParams(window.location.search).get('pago')] || ''));

  useEffect(() => { apiFetch('/api/complejos').then(readApiResponse).then((items) => setComplexes(items.map(mapApiComplex))).catch(() => setComplexes([])).finally(() => setComplexesLoaded(true)); }, []);
  useEffect(() => { if (!session?.user) return; apiFetch('/api/mis-reservas').then(readApiResponse).then((items) => setBookings(items.map(mapApiBooking))).catch(() => setBookings([])); }, [session]);
  useEffect(() => {
    if (!session?.user || !bookings.some((booking) => booking.status === 'Pendiente de pago')) return undefined;
    const timer = window.setTimeout(() => {
      const pendingPaymentIds = bookings.filter((booking) => booking.status === 'Pendiente de pago' && booking.paymentId).map((booking) => booking.paymentId);
      Promise.all(pendingPaymentIds.map((paymentId) => apiFetch(`/api/pagos/${paymentId}`).catch(() => null)))
        .finally(() => apiFetch('/api/mis-reservas').then(readApiResponse).then((items) => setBookings(items.map(mapApiBooking))).catch(() => {}));
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [bookings, session]);
  useEffect(() => { if (!session?.user) return; apiFetch('/api/guardados').then(readApiResponse).then((items) => setSaved(items.map((item) => Number(item.complejo_id)))).catch(() => setSaved([])); }, [session]);
  useEffect(() => {
    if (!sessionUserId) return undefined;

    let active = true;
    let retryTimer;
    apiFetch('/api/perfil').then(readApiResponse).then((nextProfile) => {
      if (active) setProfile(nextProfile);
    }).catch(() => {
      if (active && profileAttempt < 2) retryTimer = window.setTimeout(() => setProfileAttempt((current) => current + 1), 1_500);
    });

    return () => {
      active = false;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [profileAttempt, sessionUserId]);

  useEffect(() => {
    if (!session?.user || !complexesLoaded) return;
    const pending = sessionStorage.getItem('pending-booking');
    if (!pending) return;
    try {
      const draft = JSON.parse(pending);
      apiFetch(`/api/complejos/${draft.complexId}`).then(readApiResponse).then((item) => {
        const complex = { ...mapApiComplex(item), courts: item.canchas.map((court) => mapApiCourt(court, item.reserva_sin_sena === true)) };
        const court = complex.courts.find((candidate) => candidate.id === Number(draft.courtId));
        setSelectedComplex(complex); setSelectedCourt(court || null); setSelectedDate(draft.date || dateOptions[0].value); setSelectedTime(draft.time || ''); sessionStorage.removeItem('pending-booking'); setScreen(court ? 'booking' : 'detail');
      }).catch(() => { sessionStorage.removeItem('pending-booking'); setScreen('explore'); });
    } catch { sessionStorage.removeItem('pending-booking'); }
  }, [session, complexesLoaded]);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('pago')) return;
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (screen !== 'detail' || !selectedCourt?.id) return;
    let active = true;
    apiFetch(`/api/canchas/${selectedCourt.id}/disponibilidad?fecha=${selectedDate}`).then(readApiResponse).then((availability) => {
      if (!active) return;
      const status = getAvailabilityStatus(availability);
      const available = status === 'available' ? availability.slots.filter((slot) => slot.disponible) : [];
      const slotPrices = Object.fromEntries(available.map((slot) => [slot.hora, slot.precio]));
      setSelectedCourt((current) => current?.id === selectedCourt.id ? { ...current, slots: available.map((slot) => slot.hora), slotPrices, price: available.length ? Math.min(...available.map((slot) => Number(slot.precio))) : current.price } : current);
      setAvailabilityStatus(status);
    }).catch(() => {
      if (!active) return;
      setSelectedCourt((current) => current ? { ...current, slots: [], slotPrices: {} } : current);
      setAvailabilityStatus('error');
    });
    return () => { active = false; };
  }, [screen, selectedCourt?.id, selectedDate, availabilityRefreshId]);
  useEffect(() => {
    if (screen !== 'detail') return undefined;
    const timer = window.setInterval(() => {
      const now = new Date();
      setAvailabilityNow(now);
      if (selectedTime && !getSelectableSlots(selectedDate, selectedCourt?.slots, now).includes(selectedTime)) setSelectedTime('');
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [screen, selectedCourt?.slots, selectedDate, selectedTime]);

  const refreshAvailability = () => {
    setAvailabilityStatus('loading');
    setAvailabilityRefreshId((current) => current + 1);
  };
  const chooseDate = (date) => {
    setAvailabilityNow(new Date());
    if (date === selectedDate) {
      refreshAvailability();
      return;
    }
    setAvailabilityStatus('loading');
    setSelectedTime('');
    setSelectedCourt((current) => current ? { ...current, slots: [], slotPrices: {} } : current);
    setSelectedDate(date);
  };
  const retryAvailability = refreshAvailability;
  const loginWithGoogle = () => authClient.signIn.social({ provider: 'google', callbackURL: window.location.href });
  const openComplex = useCallback(async (summary, { updateUrl = true } = {}) => {
    setError('');
    try {
      const item = await readApiResponse(await apiFetch(`/api/complejos/${summary.id}`));
      const complex = { ...mapApiComplex(item), courts: item.canchas.map((court) => mapApiCourt(court, item.reserva_sin_sena === true)) };
      setAvailabilityNow(new Date()); setSelectedComplex(complex); setSelectedCourt(complex.courts[0] || null); setSelectedTime(''); setAvailabilityStatus('loading'); setAvailabilityRefreshId((current) => current + 1); setScreen('detail'); window.scrollTo({ top: 0, behavior: 'smooth' });
      if (updateUrl) navigate(`/complejos/${complexSlug(complex.name)}`);
    } catch (requestError) { setError(requestError.message); }
  }, [navigate]);
  useEffect(() => {
    if (!slug) {
      deepLinkHandled.current = '';
      return;
    }
    if (!complexesLoaded || deepLinkHandled.current === slug) return;
    const target = complexes.find((complex) => String(complex.id) === slug || complexSlug(complex.name) === complexSlug(slug));
    if (target) {
      if (selectedComplex?.id === target.id) {
        deepLinkHandled.current = slug;
        return;
      }
      deepLinkHandled.current = slug;
      openComplex(target, { updateUrl: false });
    } else {
      setError('No encontramos ese complejo.');
    }
  }, [slug, complexes, complexesLoaded, openComplex, selectedComplex]);
  const chooseCourt = (court) => { setAvailabilityNow(new Date()); setAvailabilityStatus('loading'); setAvailabilityRefreshId((current) => current + 1); setSelectedCourt(court); setSelectedTime(''); };
  const toggleSaved = async (id) => {
    if (!session?.user) return loginWithGoogle();
    const alreadySaved = saved.includes(id);
    try {
      await readApiResponse(await apiFetch(alreadySaved ? `/api/guardados/${id}` : '/api/guardados', { method: alreadySaved ? 'DELETE' : 'POST', body: alreadySaved ? undefined : JSON.stringify({ complejo_id: id }) }));
      setSaved((current) => alreadySaved ? current.filter((item) => item !== id) : [...current, id]);
    } catch (requestError) { setError(requestError.message); }
  };
  const beginBooking = () => {
    setError('');
    if (!session?.user) { sessionStorage.setItem('pending-booking', JSON.stringify({ complexId: selectedComplex.id, courtId: selectedCourt.id, date: selectedDate, time: selectedTime })); return loginWithGoogle(); }
    setScreen('booking');
  };
  const confirmBooking = async () => {
    const bookingName = form.name.trim() || profile?.nombre?.trim() || session?.user?.name?.trim();
    const bookingPhone = form.phone || profile?.whatsapp || '';
    if (!bookingName || bookingPhone.replace(/\D/g, '').length < 8) return setError('Completá tu nombre y un WhatsApp válido.');
    setSubmittingBooking(true);
    try {
      const result = await readApiResponse(await apiFetch('/api/reservas', { method: 'POST', body: JSON.stringify({ nombre: bookingName, telefono: bookingPhone, fecha: selectedDate, hora: selectedTime, cancha_id: selectedCourt.id, recurrente: repeatWeekly, semanas: repeatWeeks }) }));
      if (result.requiere_pago && result.pago?.checkout_url) {
        setPendingCheckout({ reservationId: result.id, checkoutUrl: result.pago.checkout_url, complex: selectedComplex.name });
        return;
      }
      if (result.requiere_pago || result.estado !== 'confirmada') throw new Error('No se pudo confirmar la reserva. Intentá nuevamente.');
      const createdReservations = result.reservas || [result];
      const createdBookings = createdReservations.map((item) => mapApiBooking({
        ...item,
        complejo: selectedComplex.name,
        cancha: selectedCourt.name,
        ciudad: selectedComplex.city,
        provincia: selectedComplex.province,
        deporte: selectedCourt.sport,
        puede_cancelar: true,
      }));
      setBookings((current) => [...createdBookings, ...current]);
      setScreen('success');
    } catch (requestError) { setError(requestError.message); } finally { setSubmittingBooking(false); }
  };
  const backToExplore = () => { setScreen('explore'); setSelectedComplex(null); setSelectedCourt(null); setSelectedTime(''); setError(''); setForm((current) => ({ ...current, phone: '' })); setRepeatWeekly(false); setRepeatWeeks(4); navigate('/'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const cancelBooking = async (booking) => { const isPayment = booking.status === 'Pendiente de pago'; if (!(await confirm({ title: isPayment ? '¿Cancelar la solicitud de pago?' : '¿Cancelar tu turno?', description: isPayment ? 'Se cancela la solicitud y el horario vuelve a quedar disponible para otras personas.' : `Vas a cancelar tu turno en ${booking.complex}. El horario queda libre y no se puede deshacer.`, confirmText: isPayment ? 'Cancelar solicitud' : 'Cancelar turno', cancelText: 'Volver', tone: 'danger' }))) return null; setError(''); try { const result = await readApiResponse(await apiFetch(`/api/mis-reservas/${booking.id}/cancelar`, { method: 'POST' })); setBookings((current) => current.map((item) => item.id === booking.id || (result.recurrencia_id && item.recurrenceId === result.recurrencia_id) ? { ...item, status: 'Cancelado', canCancel: false, paymentUrl: '' } : item)); return { tone: 'success', message: 'La reserva fue cancelada.' }; } catch (requestError) { setError(requestError.message); return { tone: 'error', message: requestError.message }; } };
  const cancelPendingCheckout = async () => { if (!pendingCheckout) return; const booking = { id: pendingCheckout.reservationId, complex: pendingCheckout.complex, status: 'Pendiente de pago' }; if (!(await confirm({ title: '¿Cancelar esta solicitud?', description: 'Se cancela la solicitud de pago y el horario vuelve a quedar disponible para otras personas.', confirmText: 'Cancelar solicitud', cancelText: 'Volver', tone: 'danger' }))) return; setError(''); try { await readApiResponse(await apiFetch(`/api/mis-reservas/${booking.id}/cancelar`, { method: 'POST' })); setPendingCheckout(null); setScreen('bookings'); const items = await readApiResponse(await apiFetch('/api/mis-reservas')); setBookings(items.map(mapApiBooking)); } catch (requestError) { setError(requestError.message); } };
  const logout = async () => { await authClient.signOut(); setScreen('explore'); };
  const saveProfile = async (draft) => { const nextProfile = await readApiResponse(await apiFetch('/api/perfil', { method: 'PUT', body: JSON.stringify(draft) })); setProfile(nextProfile); };

  if (isPending) return <LoadingScreen message="Preparando tu sesión…" />;
  const canManage = Boolean(sessionUserId) && ['admin_cancha', 'subadmin', 'superadmin'].includes(profile?.role);
  const layout = (current, child, showMobileNav = false) => <PublicLayout current={current} onChange={setScreen} session={session} canManage={canManage} showMobileNav={showMobileNav}>{child}</PublicLayout>;
  if (pendingCheckout) return <PaymentScreen payment={pendingCheckout} onCancel={cancelPendingCheckout} />;
  if (screen === 'detail' && selectedComplex) return layout('explore', <DetailScreen complex={selectedComplex} court={selectedCourt} onSelectCourt={chooseCourt} date={selectedDate} setDate={chooseDate} time={selectedTime} setTime={setSelectedTime} onBack={backToExplore} onReserve={beginBooking} saved={saved} onToggleSaved={toggleSaved} availabilityStatus={availabilityStatus} onRetryAvailability={retryAvailability} now={availabilityNow} />);
  if (screen === 'booking' && selectedComplex && selectedCourt) return layout(null, <BookingScreen complex={selectedComplex} court={selectedCourt} date={selectedDate} time={selectedTime} form={form} setForm={setForm} repeatWeekly={repeatWeekly} setRepeatWeekly={setRepeatWeekly} repeatWeeks={repeatWeeks} setRepeatWeeks={setRepeatWeeks} onBack={() => setScreen('detail')} onHome={backToExplore} onConfirm={confirmBooking} error={error} defaultName={profile?.nombre || session?.user?.name} defaultPhone={profile?.whatsapp} submitting={submittingBooking} />);
  if (screen === 'success' && selectedComplex && selectedCourt) return layout(null, <SuccessScreen complex={selectedComplex} court={selectedCourt} date={selectedDate} time={selectedTime} repeatWeeks={repeatWeekly ? repeatWeeks : 0} onDone={backToExplore} />);
  const openAccount = () => session?.user ? setScreen('profile') : loginWithGoogle();
  if (screen === 'bookings') return layout('bookings', <BookingsScreen bookings={bookings} onChange={setScreen} session={session} onLogin={loginWithGoogle} onCancel={cancelBooking} notice={paymentNotice} canManage={canManage} />, true);
  if (screen === 'saved') return layout('saved', <SavedScreen complexes={complexes} saved={saved} onOpen={openComplex} onToggleSaved={toggleSaved} onChange={setScreen} session={session} onLogin={loginWithGoogle} canManage={canManage} />, true);
  if (screen === 'profile') return layout('profile', <ProfileScreen key={profile?.email || session?.user?.id || 'guest'} profile={profile} session={session?.user} onChange={setScreen} onLogin={loginWithGoogle} onLogout={logout} onSave={saveProfile} canManage={canManage} />, true);
  return layout('explore', <ExploreScreen complexes={complexes} query={query} setQuery={setQuery} onOpen={openComplex} saved={saved} onToggleSaved={toggleSaved} session={session} onLogin={openAccount} canManage={canManage} />, true);
}

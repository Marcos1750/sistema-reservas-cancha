import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Icon, PitchMark } from './icons';
import { CalendarPicker } from './CalendarPicker';
import { formatARS, mockCourts } from './mockData';
import { authClient } from './authClient';
import { apiFetch, readApiResponse } from './api';

function toDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const dateOptions = Array.from({ length: 4 }, (_, offset) => {
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
  return { Hoy: '19', Mañana: '20', 'Vie 21': '21', 'Sáb 22': '22' }[value] || value.slice(-2);
}

function CourtPlaceholder({ court, large = false }) {
  return (
    <div className={`court-placeholder court-placeholder--${court.accent}${large ? ' court-placeholder--large' : ''}`}>
      <div className="court-placeholder__glow" />
      <div className="court-placeholder__pitch">
        <span className="court-placeholder__halfway" />
        <span className="court-placeholder__circle" />
        <span className="court-placeholder__box court-placeholder__box--left" />
        <span className="court-placeholder__box court-placeholder__box--right" />
        <span className="court-placeholder__spot court-placeholder__spot--left" />
        <span className="court-placeholder__spot court-placeholder__spot--right" />
      </div>
      <div className="court-placeholder__meta"><span>NEW MATCH / {court.sport.replace('Fútbol ', 'F')}</span><span>{court.indoor ? 'INDOOR' : 'OPEN AIR'}</span></div>
    </div>
  );
}

function Brand({ onClick }) {
  return <button className="brand" type="button" onClick={onClick} aria-label="Volver a explorar"><PitchMark /><span>NEW MATCH</span></button>;
}

function BottomNav({ current, onChange }) {
  const items = [['explore', 'Explorar', 'home'], ['bookings', 'Mis turnos', 'ticket'], ['saved', 'Guardados', 'heart'], ['profile', 'Perfil', 'user']];
  return <nav className="bottom-nav" aria-label="Navegación principal">{items.map(([id, label, icon]) => <button className={`bottom-nav__item${current === id ? ' is-active' : ''}`} key={id} type="button" onClick={() => onChange(id)}><Icon name={icon} size={19} strokeWidth={current === id ? 2.2 : 1.6} /><span>{label}</span></button>)}</nav>;
}

function customDateOption(value) {
  const date = new Date(`${value}T12:00:00`);
  return {
    value,
    label: new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric' }).format(date),
    sublabel: new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(date).toUpperCase(),
  };
}

function DateRail({ selected, onSelect }) {
  const visibleDates = dateOptions.some((date) => date.value === selected)
    ? dateOptions
    : [...dateOptions, customDateOption(selected)];
  return <div className="date-rail" role="tablist" aria-label="Elegí una fecha">
    {visibleDates.map((date) => <Button className={selected === date.value ? 'date-pill is-selected' : 'date-pill'} variant={selected === date.value ? 'chipActive' : 'chip'} key={date.value} type="button" role="tab" aria-selected={selected === date.value} onClick={() => onSelect(date.value)}><span>{date.label}</span><small>{date.sublabel}</small></Button>)}
    <CalendarPicker compact label="Elegir otra fecha" value={selected} onChange={onSelect} min={dateOptions[0].value} />
  </div>;
}

function CourtCard({ court, onOpen, isSaved, onToggleSaved }) {
  return <Card asChild className="court-card"><article><button className="court-card__visual-button" type="button" onClick={() => onOpen(court)} aria-label={`Ver detalles de ${court.name}`}><CourtPlaceholder court={court} /></button><div className="court-card__body"><div className="court-card__heading"><div><h3>{court.name}</h3><p><Icon name="pin" size={13} /> {court.city}, {court.province} <span className="dot-separator">·</span> {court.address}</p></div><Button className={`icon-button${isSaved ? ' is-saved' : ''}`} variant="ghost" size="icon" type="button" onClick={() => onToggleSaved(court.id)} aria-label={isSaved ? 'Quitar de guardados' : 'Guardar cancha'}><Icon name="heart" size={18} /></Button></div><div className="court-card__facts"><Badge variant="accent"><Icon name="star" size={13} /> {court.rating} <small>({court.reviews})</small></Badge><Badge>{court.sport}</Badge><Badge>{court.indoor ? 'Indoor' : 'A cielo abierto'}</Badge></div><div className="court-card__footer"><div><small>Desde</small><strong>{formatARS(court.price)}</strong></div><Button className="text-button" variant="ghost" size="sm" type="button" onClick={() => onOpen(court)}>Ver horarios <Icon name="arrow" size={15} /></Button></div></div></article></Card>;
}

function ExploreScreen({ courts, query, setQuery, onOpen, saved, onToggleSaved, session, onLogin, canManage }) {
  const filteredCourts = useMemo(() => courts.filter((court) => {
    const text = `${court.name} ${court.city} ${court.province}`.toLowerCase();
    return text.includes(query.toLowerCase());
  }), [courts, query]);
  const initials = session?.user?.name?.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'GO';
  return <div className="app-shell"><header className="app-header"><Brand />{canManage && <a className="admin-entry" href="/admin"><Icon name="pitch" size={16} /> Administrar canchas</a>}<button className="avatar-button" type="button" aria-label="Abrir perfil" onClick={onLogin}>{initials}</button></header><main className="main-content"><section className="welcome-block"><div className="location-line"><Icon name="pin" size={14} /> <span>Santa Fe, Argentina</span></div><h1>Tu próximo partido,<br /><em>a un toque.</em></h1><p>Encontrá una cancha y elegí tu fecha al reservar.</p></section><div className="search-field"><Icon name="search" size={19} /><Input aria-label="Buscar canchas" placeholder="Buscar por cancha, ciudad o provincia" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></div><section className="courts-section courts-section--explore"><div className="section-heading"><div><span className="section-kicker">CANCHAS DISPONIBLES</span><h2>Elegí dónde jugar</h2></div><span className="result-count">{filteredCourts.length} opciones</span></div>{filteredCourts.length ? <div className="court-list">{filteredCourts.map((court) => <CourtCard key={court.id} court={court} onOpen={onOpen} isSaved={saved.includes(court.id)} onToggleSaved={onToggleSaved} />)}</div> : <div className="empty-state"><PitchMark compact /><h3>No encontramos esa cancha</h3><p>Probá con otra ciudad o limpiá la búsqueda.</p><Button variant="secondary" size="sm" type="button" onClick={() => setQuery('')}>Limpiar búsqueda</Button></div>}</section></main></div>;
}

function DetailScreen({ court, date, setDate, time, setTime, onBack, onReserve, saved, onToggleSaved }) {
  const displayPrice = court.slotPrices?.[time] ?? court.price;
  return <div className="app-shell app-shell--detail"><header className="detail-header"><button className="round-button" type="button" onClick={onBack} aria-label="Volver"><Icon name="back" size={19} /></button><Brand onClick={onBack} /><button className={`round-button${saved.includes(court.id) ? ' is-saved' : ''}`} type="button" onClick={() => onToggleSaved(court.id)} aria-label="Guardar cancha"><Icon name="heart" size={18} /></button></header><main className="detail-content"><CourtPlaceholder court={court} large /><div className="detail-intro"><div><span className="detail-eyebrow">PREDIO SELECCIONADO</span><h1>{court.name}</h1><p><Icon name="pin" size={14} /> {court.city}, {court.province} <span className="dot-separator">·</span> {court.address}</p></div><span className="rating-badge"><Icon name="star" size={13} /> {court.rating}</span></div><p className="detail-description">{court.description}</p><div className="amenity-row">{court.amenities.map((amenity) => <span key={amenity}>{amenity}</span>)}</div><section className="availability"><div className="section-label"><span>Elegí tu horario</span><span className="availability-note"><span className="availability-dot" /> Disponible</span></div><DateRail selected={date} onSelect={setDate} /><div className="time-grid">{court.slots.map((slot) => <button className={`time-slot${time === slot ? ' is-selected' : ''}`} key={slot} type="button" onClick={() => setTime(slot)}><Icon name="clock" size={14} /> {slot}</button>)}</div></section></main><div className="sticky-cta"><div><small>{time ? 'Total del turno' : 'Desde'}</small><strong>{formatARS(displayPrice)}</strong><span>/ turno</span></div><Button className="primary-button" type="button" disabled={!time} onClick={onReserve}>Reservar turno <Icon name="arrow" size={17} /></Button></div></div>;
}

function BookingScreen({ court, date, time, form, setForm, repeatWeekly, setRepeatWeekly, repeatWeeks, setRepeatWeeks, onBack, onConfirm, error, defaultName, defaultPhone }) {
  const price = court.slotPrices?.[time] ?? court.price;
  return <div className="app-shell app-shell--booking"><header className="detail-header"><button className="round-button" type="button" onClick={onBack} aria-label="Volver"><Icon name="back" size={19} /></button><span className="flow-title">Confirmar reserva</span><span className="step-count">02 / 02</span></header><main className="booking-content"><div className="booking-summary"><CourtPlaceholder court={court} /><div><span className="detail-eyebrow">TU TURNO</span><h2>{court.name}</h2><p><Icon name="calendar" size={13} /> {date} <span className="dot-separator">·</span> <Icon name="clock" size={13} /> {time}</p></div></div><div className="booking-divider" /><section className="form-section"><span className="section-kicker">DATOS DEL CAPITÁN</span><h1>¿A nombre de quién<br />reservamos?</h1><label>Nombre completo<Input value={form.name || defaultName || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Martín Sosa" autoComplete="name" /></label><label>WhatsApp<Input value={form.phone || defaultPhone || ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="11 5555 5555" inputMode="tel" autoComplete="tel" /></label><section className="recurring-option"><label><input type="checkbox" checked={repeatWeekly} onChange={(event) => setRepeatWeekly(event.target.checked)} /><span><strong>Reservar horario fijo</strong><small>Repite este mismo día y horario todas las semanas.</small></span></label>{repeatWeekly && <label className="recurring-option__weeks">¿Por cuánto tiempo?<select value={repeatWeeks} onChange={(event) => setRepeatWeeks(Number(event.target.value))}><option value={4}>4 semanas</option><option value={8}>8 semanas</option><option value={12}>12 semanas</option></select></label>}</section>{error && <p className="form-error" role="alert">{error}</p>}</section></main><div className="sticky-cta sticky-cta--booking"><div><small>{repeatWeekly ? `Total por ${repeatWeeks} semanas` : 'Total del turno'}</small><strong>{formatARS(price * (repeatWeekly ? repeatWeeks : 1))}</strong></div><Button className="primary-button" type="button" onClick={onConfirm}>{repeatWeekly ? 'Confirmar horario fijo' : 'Confirmar reserva'} <Icon name="check" size={17} /></Button></div></div>;
}

function SuccessScreen({ court, date, time, onDone, repeatWeeks }) {
  return <div className="success-screen"><div className="success-grid" /><div className="success-mark"><Icon name="check" size={28} /></div><span className="section-kicker">RESERVA CONFIRMADA</span><h1>{repeatWeeks ? <>Tu horario fijo<br /><em>ya está reservado.</em></> : <>El partido ya<br /><em>tiene cancha.</em></>}</h1><p>{court.name}<br />{date} a las {time}{repeatWeeks ? ` · por ${repeatWeeks} semanas` : ''}</p><div className="success-ticket"><div><small>UBICACIÓN</small><strong>{court.city}, {court.province}</strong></div><div><small>DEPORTE</small><strong>{court.sport}</strong></div><div><small>{repeatWeeks ? 'SEMANAS' : 'TOTAL'}</small><strong>{repeatWeeks || formatARS(court.price)}</strong></div></div><button className="primary-button" type="button" onClick={onDone}>Volver a explorar <Icon name="arrow" size={17} /></button></div>;
}

function BookingsScreen({ bookings, onChange, session, onLogin, onCancel, error }) {
  return <div className="app-shell"><header className="app-header"><Brand onClick={() => onChange('explore')} /><button className="avatar-button" type="button" onClick={() => onChange('profile')}>{session?.user?.name?.slice(0, 2).toUpperCase() || 'GO'}</button></header><main className="main-content"><section className="page-heading"><span className="section-kicker">TU HISTORIAL</span><h1>Mis turnos</h1><p>Cancelá desde acá hasta 2 horas antes del turno.</p></section>{session ? <>{error && <p className="form-error" role="alert">{error}</p>}<div className="booking-list">{bookings.map((booking) => {
    const cancelled = booking.status === 'Cancelado';
    const whatsappUrl = booking.whatsapp ? `https://wa.me/${booking.whatsapp}?text=${encodeURIComponent(`Hola, necesito gestionar mi reserva en ${booking.court} del ${booking.date} a las ${booking.time}.`)}` : '';
    return <article className={`booking-card${cancelled ? ' is-cancelled' : ''}`} key={booking.id}><div className="booking-card__date"><strong>{formatBookingDay(booking.date)}</strong><span>AGO</span></div><div className="booking-card__content"><div><h3>{booking.court || 'Cancha'}</h3><p>{booking.date} <span className="dot-separator">·</span> {booking.time}</p></div><span className={`status-pill${cancelled ? ' is-cancelled' : ''}`}><span /> {booking.status || 'Confirmado'}{booking.recurrenceId ? ' · Fijo' : ''}</span><div className="booking-card__meta"><span>{booking.sport || 'Turno'}</span><strong>{booking.price ? formatARS(booking.price) : '—'}</strong></div>{!cancelled && <div className="booking-card__actions">{booking.canCancel ? <Button variant="secondary" size="sm" type="button" onClick={() => onCancel(booking)}>Cancelar reserva</Button> : whatsappUrl ? <a className="booking-card__whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer">Gestionar por WhatsApp <Icon name="arrow" size={14} /></a> : <small>Para cancelar, contactá a la cancha.</small>}</div>}</div></article>;
  })}</div>{!bookings.length && <div className="empty-state"><PitchMark compact /><h3>Todavía no hay turnos</h3><p>Cuando reserves una cancha, aparece acá.</p></div>}</> : <div className="quiet-panel"><PitchMark compact /><h3>Guardá tus próximos partidos</h3><p>Ingresá con Google para consultar tu historial y reservar.</p><Button type="button" onClick={onLogin}>Continuar con Google <Icon name="arrow" size={17} /></Button></div>}</main></div>;
}

function SavedScreen({ courts, saved, onOpen, onToggleSaved, onChange, session, onLogin }) {
  const savedCourts = courts.filter((court) => saved.includes(court.id));
  return <div className="app-shell"><header className="app-header"><Brand onClick={() => onChange('explore')} /><button className="avatar-button" type="button" onClick={() => onChange('profile')}>{session?.user?.name?.slice(0, 2).toUpperCase() || 'GO'}</button></header><main className="main-content"><section className="page-heading"><span className="section-kicker">TUS CANCHAS</span><h1>Guardados</h1><p>Las canchas que querés tener a mano para el próximo partido.</p></section>{session ? savedCourts.length ? <div className="court-list">{savedCourts.map((court) => <CourtCard key={court.id} court={court} onOpen={onOpen} isSaved onToggleSaved={onToggleSaved} />)}</div> : <div className="empty-state"><PitchMark compact /><h3>Todavía no guardaste canchas</h3><p>Usá el corazón en una cancha para encontrarla rápido después.</p><Button variant="secondary" size="sm" type="button" onClick={() => onChange('explore')}>Explorar canchas</Button></div> : <div className="quiet-panel"><PitchMark compact /><h3>Guardá tus canchas favoritas</h3><p>Ingresá con Google y vas a encontrarlas desde cualquier dispositivo.</p><Button type="button" onClick={onLogin}>Continuar con Google <Icon name="arrow" size={17} /></Button></div>}</main></div>;
}

function ProfileScreen({ profile, session, onChange, onLogin, onLogout, onSave }) {
  const [draft, setDraft] = useState({ nombre: profile?.nombre || session?.user?.name || '', whatsapp: profile?.whatsapp || '' });
  const [message, setMessage] = useState('');
  if (!session) return <div className="app-shell"><header className="app-header"><Brand onClick={() => onChange('explore')} /><span className="avatar-button">GO</span></header><main className="main-content"><section className="page-heading"><span className="section-kicker">TU CUENTA</span><h1>Perfil</h1><p>Ingresá para guardar tus datos de reserva.</p></section><div className="quiet-panel"><PitchMark compact /><h3>Ingresá con Google</h3><p>Vas a poder guardar tu nombre y WhatsApp para reservar más rápido.</p><Button type="button" onClick={onLogin}>Continuar con Google <Icon name="arrow" size={17} /></Button></div></main></div>;
  const save = async (event) => {
    event.preventDefault();
    try { await onSave(draft); setMessage('Datos de reserva guardados.'); } catch (error) { setMessage(error.message); }
  };
  const isAdmin = profile?.role === 'admin_cancha' || profile?.role === 'superadmin';
  return <div className="app-shell"><header className="app-header"><Brand onClick={() => onChange('explore')} /><button className="avatar-button" type="button" onClick={() => onChange('profile')}>{session.name?.slice(0, 2).toUpperCase() || 'GO'}</button></header><main className="main-content"><section className="page-heading"><span className="section-kicker">TU CUENTA</span><h1>Mi cuenta</h1><p>{session.email}</p></section><form className="profile-form" onSubmit={save}><div><h2>Datos para reservar</h2><p>Se completan automáticamente cuando pedís un turno.</p></div><label>Nombre para las reservas<Input required minLength="2" value={draft.nombre} onChange={(event) => setDraft({ ...draft, nombre: event.target.value })} /></label><label>WhatsApp<Input required inputMode="tel" value={draft.whatsapp} onChange={(event) => setDraft({ ...draft, whatsapp: event.target.value })} placeholder="11 5555 5555" /></label><Button type="submit">Guardar datos <Icon name="check" size={16} /></Button>{message && <p className={message.includes('guardados') ? 'form-success' : 'form-error'}>{message}</p>}</form><section className="profile-links"><h2>Accesos rápidos</h2><button type="button" onClick={() => onChange('bookings')}><span><Icon name="ticket" size={18} /><strong>Mis turnos</strong></span><Icon name="chevron" size={18} /></button><button type="button" onClick={() => onChange('saved')}><span><Icon name="heart" size={18} /><strong>Guardados</strong></span><Icon name="chevron" size={18} /></button>{isAdmin && <a href="/admin"><span><Icon name="pitch" size={18} /><strong>Panel de gestión</strong></span><Icon name="arrow" size={18} /></a>}</section><Button className="profile-logout" variant="secondary" size="sm" type="button" onClick={onLogout}>Cerrar sesión</Button></main></div>;
}

function dateForSelection(selection) {
  return selection;
}

function mapApiCourt(court) {
  return {
    id: Number(court.id),
    name: court.nombre,
    city: court.ciudad,
    province: court.provincia,
    address: court.direccion || 'Dirección a confirmar',
    sport: court.deporte,
    price: Number(court.precio_desde || 0),
    description: court.descripcion || 'Una cancha lista para tu próximo partido.',
    indoor: court.indoor,
    accent: 'green',
    rating: '—',
    reviews: 0,
    amenities: ['Vestuarios', 'Iluminación', court.indoor ? 'Indoor' : 'A cielo abierto'],
    slots: [],
    slotPrices: {},
  };
}

export default function Reservas() {
  const { data: session, isPending } = authClient.useSession();
  const [screen, setScreen] = useState('explore');
  const [courts, setCourts] = useState([]);
  const [courtsLoaded, setCourtsLoaded] = useState(false);
  const [selectedCourt, setSelectedCourt] = useState(mockCourts[0]);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value);
  const [selectedTime, setSelectedTime] = useState('');
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  const [confirmedRepeatWeeks, setConfirmedRepeatWeeks] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/canchas').then(readApiResponse).then((items) => setCourts(items.map(mapApiCourt))).catch(() => setCourts([])).finally(() => setCourtsLoaded(true));
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    apiFetch('/api/mis-reservas').then(readApiResponse).then((items) => setBookings(items.map((item) => ({
      id: item.id,
      court: item.cancha,
      city: item.ciudad,
      province: item.provincia,
      date: item.fecha,
      time: item.hora,
      sport: item.deporte,
      recurrenceId: item.recurrencia_id,
      status: item.estado === 'confirmada' ? 'Confirmado' : 'Cancelado',
      price: item.precio_ars,
      canCancel: item.puede_cancelar,
      whatsapp: item.whatsapp,
    })))).catch(() => setBookings([]));
  }, [session]);

  useEffect(() => {
    if (!session?.user) return;
    apiFetch('/api/guardados').then(readApiResponse).then((items) => setSaved(items.map((item) => Number(item.cancha_id)))).catch(() => setSaved([]));
  }, [session]);

  useEffect(() => {
    if (!session?.user) return;
    apiFetch('/api/perfil').then(readApiResponse).then(setProfile).catch(() => setProfile(null));
  }, [session]);

  useEffect(() => {
    if (!session?.user || !courtsLoaded) return;
    const pending = sessionStorage.getItem('pending-booking');
    if (!pending) return;
    try {
      const draft = JSON.parse(pending);
      const court = courts.find((item) => String(item.id) === String(draft.courtId));
      const timer = window.setTimeout(() => {
        if (court) setSelectedCourt(court);
        setSelectedDate(draft.date || dateOptions[0].value);
        setSelectedTime(draft.time);
        sessionStorage.removeItem('pending-booking');
        setScreen(court ? 'booking' : 'explore');
      }, 0);
      return () => window.clearTimeout(timer);
    } catch {
      sessionStorage.removeItem('pending-booking');
    }
  }, [session, courts, courtsLoaded]);

  useEffect(() => {
    if (screen !== 'detail' || !Number.isInteger(selectedCourt.id)) return;
    let active = true;
    apiFetch(`/api/canchas/${selectedCourt.id}/disponibilidad?fecha=${dateForSelection(selectedDate)}`)
      .then(readApiResponse)
      .then((availability) => {
        if (!active) return;
        const availableSlots = availability.slots.filter((slot) => slot.disponible);
        const slotPrices = Object.fromEntries(availableSlots.map((slot) => [slot.hora, slot.precio]));
        setSelectedCourt((current) => current.id === selectedCourt.id ? {
          ...current,
          slots: availableSlots.map((slot) => slot.hora),
          slotPrices,
          price: availableSlots.length ? Math.min(...availableSlots.map((slot) => slot.precio)) : current.price,
        } : current);
        setSelectedTime((current) => slotPrices[current] === undefined ? '' : current);
      })
      .catch(() => {
        if (active) setSelectedCourt((current) => ({ ...current, slots: [], slotPrices: {} }));
      });
    return () => { active = false; };
  }, [screen, selectedCourt.id, selectedDate]);

  const loginWithGoogle = () => authClient.signIn.social({ provider: 'google', callbackURL: window.location.href });
  const openCourt = (court) => {
    setSelectedCourt(court);
    setSelectedTime('');
    setScreen('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const toggleSaved = async (id) => {
    if (!session?.user) return loginWithGoogle();
    const alreadySaved = saved.includes(id);
    try {
      await readApiResponse(await apiFetch(alreadySaved ? `/api/guardados/${id}` : '/api/guardados', {
        method: alreadySaved ? 'DELETE' : 'POST',
        body: alreadySaved ? undefined : JSON.stringify({ cancha_id: id }),
      }));
      setSaved((current) => alreadySaved ? current.filter((item) => item !== id) : [...current, id]);
    } catch (requestError) {
      setError(requestError.message);
    }
  };
  const beginBooking = () => {
    setError('');
    if (!session?.user) {
      sessionStorage.setItem('pending-booking', JSON.stringify({ courtId: selectedCourt.id, date: selectedDate, time: selectedTime }));
      return loginWithGoogle();
    }
    setScreen('booking');
  };
  const confirmBooking = async () => {
    const bookingName = form.name.trim() || profile?.nombre?.trim() || session?.user?.name?.trim();
    const bookingPhone = form.phone || profile?.whatsapp || '';
    if (!bookingName || bookingPhone.replace(/\D/g, '').length < 8) return setError('Completá tu nombre y un WhatsApp válido.');
    try {
      const result = await readApiResponse(await apiFetch('/api/reservas', {
        method: 'POST',
        body: JSON.stringify({ nombre: bookingName, telefono: bookingPhone, fecha: dateForSelection(selectedDate), hora: selectedTime, cancha_id: selectedCourt.id, recurrente: repeatWeekly, semanas: repeatWeeks }),
      }));
      const created = result.reservas || [result];
      setBookings((current) => [...created.map((item) => ({ id: item.id, court: selectedCourt.name, city: selectedCourt.city, province: selectedCourt.province, date: item.fecha, time: item.hora, sport: selectedCourt.sport, status: 'Confirmado', price: item.precio_ars || selectedCourt.price, canCancel: true, whatsapp: '', recurrenceId: item.recurrencia_id })), ...current]);
      setConfirmedRepeatWeeks(repeatWeekly ? repeatWeeks : 0);
      setScreen('success');
    } catch (requestError) {
      setError(requestError.message);
    }
  };
  const backToExplore = () => {
    setScreen('explore');
    setSelectedTime('');
    setError('');
    setForm((current) => ({ ...current, phone: '' }));
    setRepeatWeekly(false);
    setRepeatWeeks(4);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancelBooking = async (booking) => {
    if (!window.confirm(`¿Querés cancelar tu turno en ${booking.court}?`)) return;
    setError('');
    try {
      await readApiResponse(await apiFetch(`/api/mis-reservas/${booking.id}/cancelar`, { method: 'POST' }));
      setBookings((current) => current.map((item) => item.id === booking.id ? { ...item, status: 'Cancelado', canCancel: false } : item));
    } catch (requestError) {
      setError(requestError.message);
    }
  };
  const logout = async () => { await authClient.signOut(); setScreen('explore'); };
  const saveProfile = async (draft) => {
    const nextProfile = await readApiResponse(await apiFetch('/api/perfil', { method: 'PUT', body: JSON.stringify(draft) }));
    setProfile(nextProfile);
  };
  if (isPending) return <div className="quiet-panel">Cargando tu sesión…</div>;
  if (screen === 'detail') return <><DetailScreen court={selectedCourt} date={selectedDate} setDate={setSelectedDate} time={selectedTime} setTime={setSelectedTime} onBack={backToExplore} onReserve={beginBooking} saved={saved} onToggleSaved={toggleSaved} /><BottomNav current="explore" onChange={setScreen} /></>;
  if (screen === 'booking') return <BookingScreen court={selectedCourt} date={selectedDate} time={selectedTime} form={form} setForm={setForm} repeatWeekly={repeatWeekly} setRepeatWeekly={setRepeatWeekly} repeatWeeks={repeatWeeks} setRepeatWeeks={setRepeatWeeks} onBack={() => setScreen('detail')} onConfirm={confirmBooking} error={error} defaultName={profile?.nombre || session?.user?.name} defaultPhone={profile?.whatsapp} />;
  if (screen === 'success') return <SuccessScreen court={selectedCourt} date={selectedDate} time={selectedTime} repeatWeeks={confirmedRepeatWeeks} onDone={backToExplore} />;
  const openAccount = () => session?.user ? setScreen('profile') : loginWithGoogle();
  if (screen === 'bookings') return <><BookingsScreen bookings={bookings} onChange={setScreen} session={session} onLogin={loginWithGoogle} onCancel={cancelBooking} error={error} /><BottomNav current="bookings" onChange={setScreen} /></>;
  if (screen === 'saved') return <><SavedScreen courts={courts} saved={saved} onOpen={openCourt} onToggleSaved={toggleSaved} onChange={setScreen} session={session} onLogin={loginWithGoogle} /><BottomNav current="saved" onChange={setScreen} /></>;
  if (screen === 'profile') return <><ProfileScreen key={profile?.email || session?.user?.id || 'guest'} profile={profile} session={session?.user} onChange={setScreen} onLogin={loginWithGoogle} onLogout={logout} onSave={saveProfile} /><BottomNav current="profile" onChange={setScreen} /></>;
  return <><ExploreScreen courts={courts} query={query} setQuery={setQuery} onOpen={openCourt} saved={saved} onToggleSaved={toggleSaved} session={session} onLogin={openAccount} canManage={profile?.role === 'admin_cancha' || profile?.role === 'superadmin'} /><BottomNav current="explore" onChange={setScreen} /></>;
}

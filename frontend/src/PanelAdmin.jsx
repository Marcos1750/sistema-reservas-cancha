import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon, PitchMark } from './icons';
import { authClient } from './authClient';
import { apiFetch, readApiResponse } from './api';

const emptyCourt = { nombre: '', barrio: '', direccion: '', whatsapp: '', tipo: 'Fútbol 5', superficie: 'Césped sintético', descripcion: '', indoor: false };
const defaultSlots = [{ dayOfWeek: 1, start: '18:00', end: '19:00', price: 30000, active: true }];
const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function GoogleAccess({ onLogin, message }) {
  return <div className="admin-login"><div className="admin-login__grid" /><div className="admin-login__card"><div className="admin-login__mark"><PitchMark /></div><span className="section-kicker">EL PATIO / OPERACIONES</span><h1>Panel de gestión</h1><p>{message || 'Ingresá con tu cuenta autorizada para administrar tus canchas.'}</p><Button className="primary-button" type="button" onClick={onLogin}>Continuar con Google <Icon name="arrow" size={17} /></Button></div></div>;
}

function AdminTable({ bookings, onCancel }) {
  return <div className="admin-table"><div className="admin-table__head"><span>Turno</span><span>Cliente</span><span>Cancha</span><span>Estado</span><span /></div>{bookings.map((booking) => {
    const cancelled = booking.estado === 'cancelada';
    return <div className="admin-table__row" key={booking.id}><div className="admin-booking-time"><strong>{booking.hora}</strong><small>{booking.fecha?.slice(8, 10)} {booking.fecha?.slice(5, 7)}</small></div><div><strong>{booking.nombre}</strong><small>{booking.telefono}</small></div><div><strong>{booking.cancha || 'Reserva anterior'}</strong><small>{booking.precio_ars ? `$${Number(booking.precio_ars).toLocaleString('es-AR')}` : 'Sin precio histórico'}</small></div><span className={`admin-status admin-status--${cancelled ? 'cancelada' : 'confirmado'}`}><span />{cancelled ? 'cancelada' : 'confirmada'}</span>{!cancelled && <button className="admin-delete" type="button" onClick={() => onCancel(booking.id)} aria-label={`Cancelar turno de ${booking.nombre}`}><Icon name="plus" size={17} /></button>}</div>;
  })}</div>;
}

function SlotEditor({ court, request }) {
  const [slots, setSlots] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [block, setBlock] = useState({ fecha: '', motivo: '' });
  const [exception, setException] = useState({ fecha: '', start: '18:00', end: '19:00', price: '', available: false });
  const [quickSchedule, setQuickSchedule] = useState({ days: [1, 2, 3, 4, 5], start: '18:00', end: '23:00', duration: 60, price: 30000 });
  const [whatsapp, setWhatsapp] = useState(court.whatsapp || '');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  const showMessage = (text, type = 'success') => {
    setMessage(text);
    setMessageType(type);
  };

  const load = useCallback(async () => {
    const [nextSlots, nextExceptions] = await Promise.all([
      request(`/api/admin/canchas/${court.id}/horarios`),
      request(`/api/admin/canchas/${court.id}/excepciones`),
    ]);
    setSlots(nextSlots);
    setExceptions(nextExceptions);
  }, [court.id, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => load().catch((error) => showMessage(error.message, 'error')), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updateSlot = (index, key, value) => setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? { ...slot, [key]: value } : slot));
  const toggleQuickDay = (dayOfWeek) => setQuickSchedule((current) => ({
    ...current,
    days: current.days.includes(dayOfWeek) ? current.days.filter((day) => day !== dayOfWeek) : [...current.days, dayOfWeek].sort(),
  }));
  const applyQuickSchedule = () => {
    const toMinutes = (value) => {
      const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const startMinutes = toMinutes(quickSchedule.start);
    const endMinutes = toMinutes(quickSchedule.end);
    const duration = Number(quickSchedule.duration);
    const price = Number(quickSchedule.price);
    if (!quickSchedule.days.length || startMinutes === null || endMinutes === null || endMinutes <= startMinutes || !Number.isInteger(duration) || duration < 30 || !Number.isFinite(price) || price < 0) {
      return showMessage('Elegí días, un rango válido, duración y precio.', 'error');
    }
    if ((endMinutes - startMinutes) % duration !== 0) return showMessage('El horario final debe coincidir con la duración del turno.', 'error');
    const formatTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const generated = quickSchedule.days.flatMap((dayOfWeek) => Array.from({ length: (endMinutes - startMinutes) / duration }, (_, index) => ({
      dayOfWeek,
      start: formatTime(startMinutes + index * duration),
      end: formatTime(startMinutes + (index + 1) * duration),
      price: Math.round(price),
      active: true,
    })));
    setSlots((current) => [...current.filter((slot) => !quickSchedule.days.includes(Number(slot.dayOfWeek))), ...generated].sort((a, b) => Number(a.dayOfWeek) - Number(b.dayOfWeek) || a.start.localeCompare(b.start)));
    showMessage(`Se prepararon ${generated.length} horarios. Guardalos para aplicarlos.`);
  };
  const saveSlots = async () => {
    try {
      await request(`/api/admin/canchas/${court.id}/horarios`, { method: 'PUT', body: JSON.stringify({ slots }) });
      showMessage('Horarios y precios guardados.');
    } catch (error) { showMessage(error.message, 'error'); }
  };
  const saveWhatsApp = async (event) => {
    event.preventDefault();
    try {
      await request(`/api/admin/canchas/${court.id}`, { method: 'PATCH', body: JSON.stringify({ whatsapp }) });
      showMessage('WhatsApp de cancelaciones guardado.');
    } catch (error) { showMessage(error.message, 'error'); }
  };
  const saveException = async (event) => {
    event.preventDefault();
    try {
      await request(`/api/admin/canchas/${court.id}/excepciones`, { method: 'POST', body: JSON.stringify(exception) });
      setException({ fecha: '', start: '18:00', end: '19:00', price: '', available: false });
      await load();
      showMessage('Excepción guardada.');
    } catch (error) { showMessage(error.message, 'error'); }
  };
  const saveBlock = async (event) => {
    event.preventDefault();
    try {
      await request(`/api/admin/canchas/${court.id}/bloqueos`, { method: 'POST', body: JSON.stringify(block) });
      setBlock({ fecha: '', motivo: '' });
      showMessage('Día bloqueado para esta cancha.');
    } catch (error) { showMessage(error.message, 'error'); }
  };

  return <section className="admin-manager"><div className="admin-section-heading"><div><span className="section-kicker">OPERACIÓN DE CANCHA</span><h2>{court.nombre}</h2></div><Button variant="secondary" size="sm" type="button" onClick={saveSlots}>Guardar horarios</Button></div><form className="admin-contact-form" onSubmit={saveWhatsApp}><label>WhatsApp para cancelaciones<Input required inputMode="tel" placeholder="Ej. 54911 1234 5678" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} /></label><Button variant="secondary" size="sm" type="submit">Guardar WhatsApp</Button></form><section className="quick-schedule" aria-labelledby="quick-schedule-title"><div><h3 id="quick-schedule-title">Horario habitual</h3><p>Configurá varios días y turnos de una sola vez.</p></div><div className="quick-schedule__days" role="group" aria-label="Días de la semana">{weekdays.map((day, dayOfWeek) => <button className={`quick-day${quickSchedule.days.includes(dayOfWeek) ? ' is-selected' : ''}`} key={day} type="button" onClick={() => toggleQuickDay(dayOfWeek)} aria-pressed={quickSchedule.days.includes(dayOfWeek)}>{day.slice(0, 3)}</button>)}</div><div className="quick-schedule__fields"><label>Desde<Input type="time" value={quickSchedule.start} onChange={(event) => setQuickSchedule({ ...quickSchedule, start: event.target.value })} /></label><label>Hasta<Input type="time" value={quickSchedule.end} onChange={(event) => setQuickSchedule({ ...quickSchedule, end: event.target.value })} /></label><label>Duración<select value={quickSchedule.duration} onChange={(event) => setQuickSchedule({ ...quickSchedule, duration: Number(event.target.value) })}><option value={60}>60 min</option><option value={90}>90 min</option><option value={120}>120 min</option></select></label><label>Precio por turno<Input type="number" min="0" value={quickSchedule.price} onChange={(event) => setQuickSchedule({ ...quickSchedule, price: event.target.value })} /></label><Button type="button" onClick={applyQuickSchedule}>Aplicar horario</Button></div><small>Reemplaza solo los horarios de los días elegidos. Después tocá “Guardar horarios”.</small></section><div className="admin-slot-list">{slots.map((slot, index) => <div className="admin-slot-row" key={`${slot.dayOfWeek}-${slot.start}-${index}`}><select value={slot.dayOfWeek} onChange={(event) => updateSlot(index, 'dayOfWeek', Number(event.target.value))}>{weekdays.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select><Input type="time" value={slot.start} onChange={(event) => updateSlot(index, 'start', event.target.value)} /><Input type="time" value={slot.end} onChange={(event) => updateSlot(index, 'end', event.target.value)} /><Input type="number" min="0" value={slot.price} onChange={(event) => updateSlot(index, 'price', event.target.value)} aria-label="Precio" /><label><input type="checkbox" checked={slot.active !== false} onChange={(event) => updateSlot(index, 'active', event.target.checked)} /> Activo</label><Button variant="secondary" size="sm" type="button" onClick={() => setSlots((current) => current.filter((_, slotIndex) => slotIndex !== index))}>Quitar</Button></div>)}</div><Button variant="secondary" size="sm" type="button" onClick={() => setSlots((current) => [...current, { ...defaultSlots[0] }])}>Agregar horario</Button><div className="admin-split"><form className="admin-form" onSubmit={saveException}><h3>Excepción por fecha</h3><Input type="date" required value={exception.fecha} onChange={(event) => setException({ ...exception, fecha: event.target.value })} /><Input type="time" required value={exception.start} onChange={(event) => setException({ ...exception, start: event.target.value })} /><Input type="time" required value={exception.end} onChange={(event) => setException({ ...exception, end: event.target.value })} /><Input type="number" min="0" placeholder="Precio opcional" value={exception.price} onChange={(event) => setException({ ...exception, price: event.target.value })} /><label><input type="checkbox" checked={exception.available} onChange={(event) => setException({ ...exception, available: event.target.checked })} /> Disponible</label><Button variant="secondary" size="sm" type="submit">Guardar excepción</Button></form><form className="admin-form" onSubmit={saveBlock}><h3>Bloquear día completo</h3><Input type="date" required value={block.fecha} onChange={(event) => setBlock({ ...block, fecha: event.target.value })} /><Input placeholder="Motivo opcional" value={block.motivo} onChange={(event) => setBlock({ ...block, motivo: event.target.value })} /><Button variant="secondary" size="sm" type="submit">Bloquear día</Button></form></div>{exceptions.length > 0 && <div className="admin-exception-list">{exceptions.map((item) => <div key={item.id}>{item.date} · {item.start}-{item.end} · {item.available ? `$${Number(item.price || 0).toLocaleString('es-AR')}` : 'No disponible'} <button type="button" onClick={async () => { await request(`/api/admin/canchas/${court.id}/excepciones/${item.id}`, { method: 'DELETE' }); await load(); }}>Quitar</button></div>)}</div>}{message && <p className={messageType === 'success' ? 'form-success' : 'form-error'}>{message}</p>}</section>;
}

function CourtsManager({ courts, reload, request }) {
  const [form, setForm] = useState(emptyCourt);
  const [selectedCourt, setSelectedCourt] = useState(null);
  const [message, setMessage] = useState('');
  const createCourt = async (event) => {
    event.preventDefault();
    try {
      const court = await request('/api/admin/canchas', { method: 'POST', body: JSON.stringify(form) });
      await request(`/api/admin/canchas/${court.id}/horarios`, { method: 'PUT', body: JSON.stringify({ slots: defaultSlots }) });
      setForm(emptyCourt);
      setSelectedCourt(court);
      await reload();
      setMessage('Cancha creada. Ahora configurá sus horarios y precios.');
    } catch (error) { setMessage(error.message); }
  };
  return <section className="admin-bookings-section"><div className="admin-section-heading"><div><span className="section-kicker">TUS PREDIOS</span><h2>Canchas y precios</h2></div></div><form className="admin-form admin-form--court" onSubmit={createCourt}><Input required placeholder="Nombre de la cancha" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} /><Input required placeholder="Barrio" value={form.barrio} onChange={(event) => setForm({ ...form, barrio: event.target.value })} /><Input placeholder="Dirección" value={form.direccion} onChange={(event) => setForm({ ...form, direccion: event.target.value })} /><Input required inputMode="tel" placeholder="WhatsApp (ej. 54911 1234 5678)" value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} /><Input placeholder="Tipo" value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })} /><Input placeholder="Superficie" value={form.superficie} onChange={(event) => setForm({ ...form, superficie: event.target.value })} /><label><input type="checkbox" checked={form.indoor} onChange={(event) => setForm({ ...form, indoor: event.target.checked })} /> Indoor</label><Button type="submit">Crear cancha</Button></form>{message && <p className="form-error">{message}</p>}<div className="admin-court-list">{courts.map((court) => <button className={`admin-court-card${selectedCourt?.id === court.id ? ' is-selected' : ''}`} type="button" key={court.id} onClick={() => setSelectedCourt(court)}><strong>{court.nombre}</strong><small>{court.barrio} · {court.tipo}</small></button>)}</div>{selectedCourt && <SlotEditor key={selectedCourt.id} court={selectedCourt} request={request} />}</section>;
}

function SuperadminManager({ admins, request, reload }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const invite = async (event) => {
    event.preventDefault();
    try {
      await request('/api/superadmin/admins', { method: 'POST', body: JSON.stringify({ email }) });
      setEmail('');
      setMessage('Administrador autorizado. Al ingresar con Google podrá administrar sus canchas.');
      await reload();
    } catch (error) { setMessage(error.message); }
  };
  return <section className="admin-bookings-section"><div className="admin-section-heading"><div><span className="section-kicker">ACCESOS</span><h2>Administradores</h2></div></div><form className="admin-form admin-form--inline" onSubmit={invite}><Input type="email" required placeholder="correo@ejemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} /><Button type="submit">Autorizar administrador</Button></form>{message && <p className="form-error">{message}</p>}<div className="admin-access-list">{admins.map((admin) => <div key={admin.invitation_id || admin.id} className="admin-access-row"><div><strong>{admin.name}</strong><small>{admin.email}</small></div><span>{admin.role === 'pendiente' ? 'Pendiente de ingreso' : admin.role}</span>{admin.role === 'admin_cancha' && <Button variant="secondary" size="sm" type="button" onClick={async () => { await request(`/api/superadmin/admins/${admin.id}`, { method: 'DELETE' }); await reload(); }}>Quitar acceso</Button>}{admin.role === 'pendiente' && <Button variant="secondary" size="sm" type="button" onClick={async () => { await request(`/api/superadmin/invitaciones/${admin.invitation_id}`, { method: 'DELETE' }); await reload(); }}>Cancelar</Button>}</div>)}</div></section>;
}

export default function PanelAdmin() {
  const { data: session, isPending } = authClient.useSession();
  const [profile, setProfile] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [courts, setCourts] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [filterDate, setFilterDate] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [error, setError] = useState('');
  const request = useCallback(async (path, options) => readApiResponse(await apiFetch(path, options)), []);
  const reload = useCallback(async () => {
    const [nextBookings, nextCourts] = await Promise.all([request('/api/admin/reservas'), request('/api/admin/canchas')]);
    setBookings(nextBookings);
    setCourts(nextCourts);
    if (profile?.role === 'superadmin') setAdmins(await request('/api/superadmin/admins'));
  }, [profile?.role, request]);

  useEffect(() => {
    if (!session?.user) return;
    request('/api/admin/session').then((data) => { setProfile(data.user); }).catch((requestError) => { setProfile(false); setError(requestError.message); });
  }, [session, request]);

  useEffect(() => {
    if (!profile || profile === false) return;
    const timer = window.setTimeout(() => reload().catch((requestError) => setError(requestError.message)), 0);
    return () => window.clearTimeout(timer);
  }, [profile, reload]);

  const filtered = useMemo(() => filterDate ? bookings.filter((booking) => booking.fecha === filterDate) : bookings, [bookings, filterDate]);
  const login = () => authClient.signIn.social({ provider: 'google', callbackURL: window.location.href });
  const logout = async () => { await authClient.signOut(); setProfile(null); };
  const cancelBooking = async (id) => {
    if (!window.confirm('¿Querés cancelar este turno? El horario volverá a estar disponible para reservar.')) return;
    try { await request(`/api/admin/reservas/${id}`, { method: 'DELETE' }); await reload(); } catch (requestError) { setError(requestError.message); }
  };
  if (isPending || (session?.user && profile === null)) return <div className="admin-login"><div className="admin-login__card">Cargando el panel…</div></div>;
  if (!session?.user) return <GoogleAccess onLogin={login} />;
  if (profile === false) return <GoogleAccess onLogin={logout} message={error || 'Tu cuenta no tiene permisos de administración.'} />;
  const isSuperadmin = profile.role === 'superadmin';
  const navItems = [['overview', 'Resumen', 'home'], ['calendar', 'Calendario', 'calendar'], ['courts', 'Canchas', 'pitch'], ...(isSuperadmin ? [['admins', 'Administradores', 'user']] : [])];
  const today = new Date().toISOString().slice(0, 10);
  return <div className="admin-shell"><aside className="admin-sidebar"><button className="brand" type="button" onClick={() => setActiveSection('overview')}><PitchMark /><span>el patio</span></button><div className="admin-sidebar__label">OPERACIONES</div><nav>{navItems.map(([id, label, icon]) => <button className={`admin-nav-item${activeSection === id ? ' is-active' : ''}`} key={id} type="button" onClick={() => setActiveSection(id)}><Icon name={icon} size={18} /><span>{label}</span></button>)}</nav><div className="admin-sidebar__bottom"><button className="admin-nav-item" type="button" onClick={logout}><Icon name="logout" size={18} /><span>Salir</span></button><div className="admin-profile"><span>{profile.name?.slice(0, 2).toUpperCase()}</span><div><strong>{profile.name}</strong><small>{isSuperadmin ? 'Superadministrador' : 'Administrador'}</small></div></div></div></aside><main className="admin-main"><header className="admin-topbar"><div><span className="section-kicker">OPERACIONES</span><h1>Buen día, {profile.name?.split(' ')[0]}.</h1></div><div className="admin-topbar__actions"><span className="avatar-button">{profile.name?.slice(0, 2).toUpperCase()}</span></div></header>{error && <p className="form-error">{error}</p>}{activeSection === 'overview' && <><section className="admin-stats"><div className="admin-stat admin-stat--primary"><span>TURNOS DE HOY</span><strong>{bookings.filter((booking) => booking.fecha === today && booking.estado === 'confirmada').length}</strong><small>Agenda de tus canchas</small></div><div className="admin-stat"><span>CANCHAS ACTIVAS</span><strong>{courts.filter((court) => court.activa).length}</strong><small>Predios publicados</small></div><div className="admin-stat"><span>INGRESOS FUTUROS</span><strong>${bookings.filter((booking) => booking.fecha >= today && booking.estado === 'confirmada').reduce((sum, booking) => sum + Number(booking.precio_ars || 0), 0).toLocaleString('es-AR')}</strong><small>Turnos confirmados</small></div></section><section className="admin-bookings-section"><div className="admin-section-heading"><div><span className="section-kicker">AGENDA</span><h2>Próximos turnos</h2></div></div><AdminTable bookings={bookings.slice(0, 8)} onCancel={cancelBooking} /></section></>}{activeSection === 'calendar' && <section className="admin-bookings-section"><div className="admin-section-heading"><div><span className="section-kicker">AGENDA</span><h2>Reservas</h2></div><div className="admin-filters"><label htmlFor="admin-date">Ver fecha</label><Input id="admin-date" type="date" value={filterDate} onChange={(event) => setFilterDate(event.target.value)} /><Button variant="chip" size="sm" type="button" onClick={() => setFilterDate('')}>Todos</Button></div></div>{filtered.length ? <AdminTable bookings={filtered} onCancel={cancelBooking} /> : <div className="admin-empty"><PitchMark compact /><h3>No hay turnos para esta fecha</h3><p>Probá con otro día o mostrálos todos.</p></div>}</section>}{activeSection === 'courts' && <CourtsManager courts={courts} reload={reload} request={request} />}{activeSection === 'admins' && isSuperadmin && <SuperadminManager admins={admins} request={request} reload={reload} />}</main></div>;
}

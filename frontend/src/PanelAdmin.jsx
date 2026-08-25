import { useCallback, useEffect, useMemo, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CalendarPicker } from './CalendarPicker';
import { Icon, PitchMark } from './icons';
import { authClient } from './authClient';
import { apiFetch, readApiResponse } from './api';
import { getAdminOverviewMetrics, getCalendarBookings } from './lib/adminOverview';
import { getComplexTheme, getSportTheme } from './sportTheme';
import { useSessionWithFallback } from './useSessionWithFallback';

const sports = ['Fútbol 5', 'Pádel', 'Tenis'];
const provinces = ['Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Ciudad Autónoma de Buenos Aires', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'];
const emptyComplex = { nombre: '', ciudad: '', provincia: '', direccion: '', whatsapp: '', descripcion: '', foto_url: '' };
const emptyCourt = { nombre: '', deporte: 'Fútbol 5', descripcion: '', indoor: false };
const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const defaultSlots = [{ dayOfWeek: 1, start: '18:00', end: '19:00', price: 30000, active: true }];

function AdminSportStripes() {
  return null;
}

function GoogleAccess({ onLogin, message }) {
  return <div className="admin-login"><div className="admin-login__grid" /><div className="admin-login__card"><div className="admin-login__mark"><PitchMark /></div><span className="section-kicker">NEW MATCH / OPERACIONES</span><h1>Panel de gestión</h1><p>{message || 'Ingresá con tu cuenta autorizada para administrar tus complejos.'}</p><Button className="primary-button" type="button" onClick={onLogin}>Continuar con Google <Icon name="arrow" size={17} /></Button></div></div>;
}

function AdminTable({ bookings, onCancel }) {
  if (!bookings.length) return <div className="admin-empty"><PitchMark compact /><h3>No hay turnos para mostrar</h3><p>Las próximas reservas van a aparecer acá.</p></div>;
  const labels = { confirmada: 'Confirmada', pendiente_pago: 'Pendiente de pago', cancelada: 'Cancelada', expirada: 'Vencida' };
  return <div className="admin-table"><div className="admin-table__head"><span>Hora</span><span>Cliente</span><span>Lugar</span><span>Estado</span><span /></div>{bookings.map((booking) => {
    const cancellable = booking.estado === 'confirmada' || booking.estado === 'pendiente_pago';
    const statusClass = booking.estado === 'confirmada' ? 'confirmado' : booking.estado;
    return <div className="admin-table__row" key={booking.id}><div className="admin-booking-time"><strong>{booking.hora}</strong><small>{booking.fecha?.slice(8, 10)}/{booking.fecha?.slice(5, 7)}</small></div><div><strong>{booking.nombre}</strong><small>{booking.telefono}</small></div><div><strong>{booking.complejo || 'Complejo eliminado'}</strong><small>{booking.cancha || 'Cancha eliminada'} · {booking.precio_ars ? `$${Number(booking.precio_ars).toLocaleString('es-AR')}` : 'Sin precio'}</small></div><span className={`admin-status admin-status--${statusClass}`}><span />{labels[booking.estado] || booking.estado}</span>{cancellable && <button className="admin-delete" type="button" onClick={() => onCancel(booking.id)} aria-label={`Cancelar turno de ${booking.nombre}`}><Icon name="plus" size={17} /></button>}</div>;
  })}</div>;
}

function SlotEditor({ court, request }) {
  const [slots, setSlots] = useState(defaultSlots);
  const [exceptions, setExceptions] = useState([]);
  const [exception, setException] = useState({ fecha: '', start: '18:00', end: '19:00', price: '', available: false });
  const [block, setBlock] = useState({ fecha: '', motivo: '' });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [quickSchedule, setQuickSchedule] = useState({ days: [1, 2, 3, 4, 5], start: '18:00', end: '23:00', duration: 60, price: '30000' });
  const load = useCallback(async () => {
    const [nextSlots, nextExceptions] = await Promise.all([request(`/api/admin/canchas/${court.id}/horarios`), request(`/api/admin/canchas/${court.id}/excepciones`)]);
    setSlots(nextSlots.length ? nextSlots : defaultSlots); setExceptions(nextExceptions);
  }, [court.id, request]);
  useEffect(() => { const timer = window.setTimeout(() => load().catch((error) => { setMessageType('error'); setMessage(error.message); }), 0); return () => window.clearTimeout(timer); }, [load]);
  const showMessage = (text, type = 'success') => { setMessageType(type); setMessage(text); };
  const updateSlot = (index, field, value) => setSlots((current) => current.map((slot, position) => position === index ? { ...slot, [field]: value } : slot));
  const toggleQuickDay = (day) => setQuickSchedule((current) => ({ ...current, days: current.days.includes(day) ? current.days.filter((item) => item !== day) : [...current.days, day].sort() }));
  const applyQuickSchedule = () => {
    const minutes = (value) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
    const startMinutes = minutes(quickSchedule.start); const endMinutes = minutes(quickSchedule.end); const duration = Number(quickSchedule.duration); const price = Number(quickSchedule.price);
    if (!quickSchedule.days.length || endMinutes <= startMinutes || !Number.isInteger(duration) || duration < 15 || !Number.isFinite(price) || price < 0) return showMessage('Elegí días, un rango válido, duración y precio.', 'error');
    if ((endMinutes - startMinutes) % duration !== 0) return showMessage('El horario final debe coincidir con la duración del turno.', 'error');
    const formatTime = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    const generated = quickSchedule.days.flatMap((dayOfWeek) => Array.from({ length: (endMinutes - startMinutes) / duration }, (_, index) => ({ dayOfWeek, start: formatTime(startMinutes + index * duration), end: formatTime(startMinutes + (index + 1) * duration), price: Math.round(price), active: true })));
    setSlots((current) => [...current.filter((slot) => !quickSchedule.days.includes(Number(slot.dayOfWeek))), ...generated].sort((a, b) => Number(a.dayOfWeek) - Number(b.dayOfWeek) || a.start.localeCompare(b.start)));
    showMessage(`Se prepararon ${generated.length} horarios. Guardalos para aplicarlos.`);
  };
  const saveSlots = async () => { try { await request(`/api/admin/canchas/${court.id}/horarios`, { method: 'PUT', body: JSON.stringify({ slots }) }); showMessage('Horarios y precios guardados.'); } catch (error) { showMessage(error.message, 'error'); } };
  const saveException = async (event) => { event.preventDefault(); try { await request(`/api/admin/canchas/${court.id}/excepciones`, { method: 'POST', body: JSON.stringify(exception) }); setException({ fecha: '', start: '18:00', end: '19:00', price: '', available: false }); await load(); showMessage('Excepción guardada.'); } catch (error) { showMessage(error.message, 'error'); } };
  const saveBlock = async (event) => { event.preventDefault(); try { await request(`/api/admin/canchas/${court.id}/bloqueos`, { method: 'POST', body: JSON.stringify(block) }); setBlock({ fecha: '', motivo: '' }); showMessage('Día bloqueado para esta cancha.'); } catch (error) { showMessage(error.message, 'error'); } };
  return <section className="admin-manager"><div className="admin-section-heading"><div><span className="section-kicker">OPERACIÓN DE CANCHA</span><h2>{court.nombre}</h2></div><Button variant="secondary" size="sm" type="button" onClick={saveSlots}>Guardar horarios</Button></div><section className="quick-schedule" aria-labelledby="quick-schedule-title"><div><h3 id="quick-schedule-title">Horario habitual</h3><p>Configurá varios días y turnos de una sola vez.</p></div><div className="quick-schedule__days" role="group" aria-label="Días de la semana">{weekdays.map((day, dayOfWeek) => <button className={`quick-day${quickSchedule.days.includes(dayOfWeek) ? ' is-selected' : ''}`} key={day} type="button" onClick={() => toggleQuickDay(dayOfWeek)} aria-pressed={quickSchedule.days.includes(dayOfWeek)}>{day.slice(0, 3)}</button>)}</div><div className="quick-schedule__fields"><label>Desde<Input type="time" value={quickSchedule.start} onChange={(event) => setQuickSchedule({ ...quickSchedule, start: event.target.value })} /></label><label>Hasta<Input type="time" value={quickSchedule.end} onChange={(event) => setQuickSchedule({ ...quickSchedule, end: event.target.value })} /></label><label>Duración<select value={quickSchedule.duration} onChange={(event) => setQuickSchedule({ ...quickSchedule, duration: Number(event.target.value) })}><option value={60}>60 min</option><option value={90}>90 min</option><option value={120}>120 min</option></select></label><label>Precio por turno<Input type="number" min="0" value={quickSchedule.price} onChange={(event) => setQuickSchedule({ ...quickSchedule, price: event.target.value })} /></label><Button type="button" onClick={applyQuickSchedule}>Aplicar horario</Button></div><small>Reemplaza solo los horarios de los días elegidos. Después tocá “Guardar horarios”.</small></section><div className="admin-slot-list">{slots.map((slot, index) => <div className="admin-slot-row" key={`${slot.dayOfWeek}-${slot.start}-${index}`}><select aria-label="Día" value={slot.dayOfWeek} onChange={(event) => updateSlot(index, 'dayOfWeek', Number(event.target.value))}>{weekdays.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select><Input aria-label="Hora inicial" type="time" value={slot.start} onChange={(event) => updateSlot(index, 'start', event.target.value)} /><Input aria-label="Hora final" type="time" value={slot.end} onChange={(event) => updateSlot(index, 'end', event.target.value)} /><Input type="number" min="0" value={slot.price} onChange={(event) => updateSlot(index, 'price', event.target.value)} aria-label="Precio" /><label><input type="checkbox" checked={slot.active !== false} onChange={(event) => updateSlot(index, 'active', event.target.checked)} /> Activo</label><Button variant="secondary" size="sm" type="button" onClick={() => setSlots((current) => current.filter((_, position) => position !== index))}>Quitar</Button></div>)}</div><Button variant="secondary" size="sm" type="button" onClick={() => setSlots((current) => [...current, { ...defaultSlots[0] }])}>Agregar horario</Button><div className="admin-split"><form className="admin-form" onSubmit={saveException}><h3>Excepción por fecha</h3><CalendarPicker label="Fecha de la excepción" value={exception.fecha} onChange={(fecha) => setException({ ...exception, fecha })} /><Input type="time" required value={exception.start} onChange={(event) => setException({ ...exception, start: event.target.value })} /><Input type="time" required value={exception.end} onChange={(event) => setException({ ...exception, end: event.target.value })} /><Input type="number" min="0" placeholder="Precio opcional" value={exception.price} onChange={(event) => setException({ ...exception, price: event.target.value })} /><label><input type="checkbox" checked={exception.available} onChange={(event) => setException({ ...exception, available: event.target.checked })} /> Disponible</label><Button variant="secondary" size="sm" type="submit">Guardar excepción</Button></form><form className="admin-form" onSubmit={saveBlock}><h3>Bloquear día completo</h3><CalendarPicker label="Fecha para bloquear" value={block.fecha} onChange={(fecha) => setBlock({ ...block, fecha })} /><Input placeholder="Motivo opcional" value={block.motivo} onChange={(event) => setBlock({ ...block, motivo: event.target.value })} /><Button variant="secondary" size="sm" type="submit">Bloquear día</Button></form></div>{exceptions.length > 0 && <div className="admin-exception-list">{exceptions.map((item) => <div key={item.id}><span>{item.date} · {item.start}-{item.end} · {item.available ? `$${Number(item.price || 0).toLocaleString('es-AR')}` : 'No disponible'}</span><button type="button" onClick={async () => { await request(`/api/admin/canchas/${court.id}/excepciones/${item.id}`, { method: 'DELETE' }); await load(); }}>Quitar</button></div>)}</div>}{message && <p className={messageType === 'success' ? 'form-success' : 'form-error'}>{message}</p>}</section>;
}

function ComplexFields({ value, onChange }) {
  const update = (field, next) => onChange({ ...value, [field]: next });
  return <><label>Nombre del complejo<Input required placeholder="Ej. Club del Parque" value={value.nombre} onChange={(event) => update('nombre', event.target.value)} /></label><label>Ciudad<Input required placeholder="Ej. Santa Fe" value={value.ciudad} onChange={(event) => update('ciudad', event.target.value)} /></label><label>Provincia<select required value={value.provincia} onChange={(event) => update('provincia', event.target.value)}><option value="" disabled>Elegí una provincia</option>{provinces.map((province) => <option key={province} value={province}>{province}</option>)}</select></label><label>Dirección<Input required placeholder="Calle y número" value={value.direccion} onChange={(event) => update('direccion', event.target.value)} /></label><label>WhatsApp<Input required inputMode="tel" placeholder="Ej. 54911 1234 5678" value={value.whatsapp} onChange={(event) => update('whatsapp', event.target.value)} /></label><label className="admin-field--wide">Descripción<Input placeholder="Información general del complejo" value={value.descripcion} onChange={(event) => update('descripcion', event.target.value)} /></label></>;
}

function CourtFields({ value, onChange }) {
  const update = (field, next) => onChange({ ...value, [field]: next });
  return <><label>Nombre de la cancha<Input required placeholder="Ej. Cancha 1" value={value.nombre} onChange={(event) => update('nombre', event.target.value)} /></label><label>Deporte<select required value={value.deporte} onChange={(event) => update('deporte', event.target.value)}>{sports.map((sport) => <option key={sport} value={sport}>{sport}</option>)}</select></label><label>Descripción<Input placeholder="Dato opcional de esta cancha" value={value.descripcion} onChange={(event) => update('descripcion', event.target.value)} /></label><label className="admin-checkbox"><input type="checkbox" checked={value.indoor} onChange={(event) => update('indoor', event.target.checked)} /> Indoor</label></>;
}

function PhotoField({ currentUrl, file, onFile, onRemove }) {
  const localPreview = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);
  const preview = localPreview || currentUrl;
  return <div className="admin-photo-field"><div className="admin-photo-preview">{preview ? <img src={preview} alt="Vista previa del complejo" /> : <div className="admin-photo-placeholder"><PitchMark compact /><span>Se usará el placeholder de NEW MATCH</span></div>}</div><div><label className="secondary-button admin-upload-button">{preview ? 'Cambiar foto' : 'Subir foto'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onFile(event.target.files?.[0] || null)} /></label><small>JPG, PNG o WebP. Máximo 5 MB.</small>{currentUrl && <button className="admin-photo-remove" type="button" onClick={onRemove}>Usar placeholder</button>}</div></div>;
}

async function uploadComplexPhoto(file) {
  if (!file) return '';
  if (file.size > 5 * 1024 * 1024) throw new Error('La foto supera el máximo de 5 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('La foto debe ser JPG, PNG o WebP.');
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const blob = await upload(`complejos/${Date.now()}-${safeName}`, file, { access: 'public', handleUploadUrl: '/api/admin/uploads/complejo' });
  return blob.url;
}

function MercadoPagoSettings({ complex, request }) {
  const [settings, setSettings] = useState(null);
  const [percentage, setPercentage] = useState('10');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    request(`/api/admin/complejos/${complex.id}/mercadopago`).then((data) => {
      if (active) { setSettings(data); setPercentage(String(data.sena_porcentaje || 10)); }
    }).catch((error) => active && setMessage(error.message));
    return () => { active = false; };
  }, [complex.id, request]);
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const data = await request(`/api/admin/complejos/${complex.id}/mercadopago`, { method: 'PATCH', body: JSON.stringify({ sena_porcentaje: Number(percentage) }) });
      setSettings(data); setPercentage(String(data.sena_porcentaje)); setMessage('Porcentaje de seña actualizado.');
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  };
  const disconnect = async () => {
    if (!window.confirm('¿Desconectar Mercado Pago de este complejo? No se podrán crear nuevas reservas hasta reconectarlo.')) return;
    setSaving(true); setMessage('');
    try { await request(`/api/admin/complejos/${complex.id}/mercadopago`, { method: 'DELETE' }); setSettings((current) => ({ ...current, conectado: false, cuenta_id: null })); setMessage('Mercado Pago fue desconectado.'); } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  };
  return <section className="admin-form admin-payment-settings"><div><h3>Señas con Mercado Pago</h3><p>El cliente paga una seña y el dinero entra directo a la cuenta vinculada del complejo.</p></div>{settings ? <><form className="admin-payment-settings__form" onSubmit={save}><label>Porcentaje de seña<input required type="number" min="1" max="100" inputMode="numeric" value={percentage} onChange={(event) => setPercentage(event.target.value)} disabled={saving} /><span>%</span></label><Button variant="secondary" type="submit" disabled={saving}>Guardar porcentaje</Button></form><div className="admin-payment-settings__connection"><div><strong>{settings.conectado ? 'Mercado Pago conectado' : 'Mercado Pago no está conectado'}</strong><small>{settings.conectado ? `Cuenta vinculada${settings.cuenta_id ? ` · ${settings.cuenta_id}` : ''}` : 'Conectalo para poder aceptar nuevas reservas.'}</small></div>{settings.conectado ? <Button className="admin-danger" variant="secondary" size="sm" type="button" onClick={disconnect} disabled={saving}>Desconectar</Button> : <Button type="button" size="sm" onClick={() => window.location.assign(`/api/admin/complejos/${complex.id}/mercadopago/conectar`)}>Conectar Mercado Pago</Button>}</div></> : <p>Consultando la configuración de pagos…</p>}{message && <p className={message.includes('actualizado') || message.includes('desconectado') ? 'form-success' : 'form-error'} role="status">{message}</p>}</section>;
}

function ComplexesManager({ complexes, reload, request }) {
  const [complexForm, setComplexForm] = useState(emptyComplex);
  const [firstCourt, setFirstCourt] = useState(emptyCourt);
  const [createPhoto, setCreatePhoto] = useState(null);
  const [selectedComplex, setSelectedComplex] = useState(null);
  const [selectedCourt, setSelectedCourt] = useState(null);
  const [complexEdit, setComplexEdit] = useState(emptyComplex);
  const [courtEdit, setCourtEdit] = useState(emptyCourt);
  const [newCourt, setNewCourt] = useState(emptyCourt);
  const [editPhoto, setEditPhoto] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [saving, setSaving] = useState(false);
  const selectComplex = (complex) => { setSelectedComplex(complex); setSelectedCourt(null); setComplexEdit({ nombre: complex.nombre || '', ciudad: complex.ciudad || '', provincia: complex.provincia || '', direccion: complex.direccion || '', whatsapp: complex.whatsapp || '', descripcion: complex.descripcion || '', foto_url: complex.foto_url || '' }); setEditPhoto(null); };
  const selectCourt = (court) => { setSelectedCourt(court); setCourtEdit({ nombre: court.nombre || '', deporte: court.deporte || 'Fútbol 5', descripcion: court.descripcion || '', indoor: Boolean(court.indoor) }); };
  const activeComplex = complexes.find((item) => item.id === selectedComplex?.id) || selectedComplex;
  const show = (text, type = 'success') => { setMessageType(type); setMessage(text); };
  const createComplex = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      const foto_url = createPhoto ? await uploadComplexPhoto(createPhoto) : '';
      const created = await request('/api/admin/complejos', { method: 'POST', body: JSON.stringify({ ...complexForm, foto_url, cancha: firstCourt }) });
      const court = created.canchas[0];
      await request(`/api/admin/canchas/${court.id}/horarios`, { method: 'PUT', body: JSON.stringify({ slots: defaultSlots }) });
      setComplexForm(emptyComplex); setFirstCourt(emptyCourt); setCreatePhoto(null); await reload(); show('Complejo creado. Ya podés configurar los horarios de su primera cancha.');
    } catch (error) { show(error.message, 'error'); } finally { setSaving(false); }
  };
  const saveComplex = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      const foto_url = editPhoto ? await uploadComplexPhoto(editPhoto) : complexEdit.foto_url;
      await request(`/api/admin/complejos/${activeComplex.id}`, { method: 'PATCH', body: JSON.stringify({ ...complexEdit, foto_url }) });
      setEditPhoto(null); await reload(); show('Datos del complejo actualizados.');
    } catch (error) { show(error.message, 'error'); } finally { setSaving(false); }
  };
  const deleteComplex = async () => { if (!window.confirm(`¿Eliminar definitivamente “${activeComplex.nombre}” y todas sus canchas? El historial de reservas se conservará.`)) return; try { await request(`/api/admin/complejos/${activeComplex.id}`, { method: 'DELETE' }); setSelectedComplex(null); setSelectedCourt(null); await reload(); show('Complejo eliminado definitivamente.'); } catch (error) { show(error.message, 'error'); } };
  const createCourt = async (event) => { event.preventDefault(); try { const court = await request(`/api/admin/complejos/${activeComplex.id}/canchas`, { method: 'POST', body: JSON.stringify(newCourt) }); await request(`/api/admin/canchas/${court.id}/horarios`, { method: 'PUT', body: JSON.stringify({ slots: defaultSlots }) }); setNewCourt(emptyCourt); await reload(); show('Cancha agregada. Configurá sus horarios y precios.'); } catch (error) { show(error.message, 'error'); } };
  const saveCourt = async (event) => { event.preventDefault(); try { await request(`/api/admin/canchas/${selectedCourt.id}`, { method: 'PATCH', body: JSON.stringify(courtEdit) }); await reload(); show('Datos de la cancha actualizados.'); } catch (error) { show(error.message, 'error'); } };
  const deleteCourt = async () => { if (!window.confirm(`¿Eliminar definitivamente “${selectedCourt.nombre}”? El historial de reservas se conservará.`)) return; try { await request(`/api/admin/canchas/${selectedCourt.id}`, { method: 'DELETE' }); setSelectedCourt(null); await reload(); show('Cancha eliminada definitivamente.'); } catch (error) { show(error.message, 'error'); } };
  return <section className="admin-bookings-section admin-complexes"><div className="admin-section-heading"><div><span className="section-kicker">TUS COMPLEJOS</span><h2>Complejos y canchas</h2></div></div><form className="admin-form admin-complex-create" onSubmit={createComplex}><div className="admin-form__title"><span>1</span><div><h3>Datos del complejo</h3><p>La ubicación, el contacto y la foto se comparten entre sus canchas.</p></div></div><div className="admin-complex-fields"><ComplexFields value={complexForm} onChange={setComplexForm} /></div><PhotoField currentUrl="" file={createPhoto} onFile={setCreatePhoto} onRemove={() => setCreatePhoto(null)} /><div className="admin-form__title"><span>2</span><div><h3>Primera cancha</h3><p>Después vas a poder sumar todas las que necesites.</p></div></div><div className="admin-court-fields"><CourtFields value={firstCourt} onChange={setFirstCourt} /></div><Button type="submit" disabled={saving}>{saving ? 'Creando complejo…' : 'Crear complejo y cancha'}</Button></form>{message && <p className={messageType === 'success' ? 'form-success' : 'form-error'}>{message}</p>}<div className="admin-complex-list">{complexes.map((complex) => { const complexSports = complex.canchas.map((court) => court.deporte); const theme = getComplexTheme(complexSports); return <button className={`admin-complex-card sport-theme--${theme}${activeComplex?.id === complex.id ? ' is-selected' : ''}`} type="button" key={complex.id} onClick={() => selectComplex(complex)}>{complex.foto_url ? <img src={complex.foto_url} alt="" /> : <div className="admin-complex-card__placeholder"><PitchMark /></div>}<AdminSportStripes sports={complexSports} /><span><strong>{complex.nombre}</strong><small>{complex.ciudad}, {complex.provincia}</small><b>{complex.canchas.length} {complex.canchas.length === 1 ? 'cancha' : 'canchas'}</b></span></button>; })}</div>{activeComplex && <div className="admin-complex-workspace"><form className="admin-form admin-complex-edit" onSubmit={saveComplex}><div className="admin-section-heading"><div><span className="section-kicker">DATOS DEL COMPLEJO</span><h3>Editar {activeComplex.nombre}</h3></div><Button className="admin-danger" variant="secondary" size="sm" type="button" onClick={deleteComplex}>Eliminar complejo</Button></div><div className="admin-complex-fields"><ComplexFields value={complexEdit} onChange={setComplexEdit} /></div><PhotoField currentUrl={complexEdit.foto_url} file={editPhoto} onFile={setEditPhoto} onRemove={() => { setEditPhoto(null); setComplexEdit({ ...complexEdit, foto_url: '' }); }} /><Button variant="secondary" type="submit" disabled={saving}>Guardar complejo</Button></form><MercadoPagoSettings key={activeComplex.id} complex={activeComplex} request={request} /><section className="admin-courts-panel"><div className="admin-section-heading"><div><span className="section-kicker">CANCHAS</span><h3>Elegí qué cancha configurar</h3></div></div><div className="admin-court-list">{activeComplex.canchas.map((court) => <button className={`admin-court-card sport-theme--${getSportTheme(court.deporte)}${selectedCourt?.id === court.id ? ' is-selected' : ''}`} type="button" key={court.id} onClick={() => selectCourt(court)}><strong>{court.nombre}</strong><small>{court.deporte} · {court.indoor ? 'Indoor' : 'A cielo abierto'}</small></button>)}</div><form className="admin-form admin-add-court" onSubmit={createCourt}><h3>Agregar otra cancha</h3><div className="admin-court-fields"><CourtFields value={newCourt} onChange={setNewCourt} /></div><Button type="submit">Agregar cancha</Button></form></section>{selectedCourt && <><form className="admin-form admin-court-edit" onSubmit={saveCourt}><div className="admin-section-heading"><div><span className="section-kicker">DATOS DE LA CANCHA</span><h3>Editar {selectedCourt.nombre}</h3></div><Button className="admin-danger" variant="secondary" size="sm" type="button" onClick={deleteCourt}>Eliminar cancha</Button></div><div className="admin-court-fields"><CourtFields value={courtEdit} onChange={setCourtEdit} /></div><Button variant="secondary" type="submit">Guardar cancha</Button></form><SlotEditor key={selectedCourt.id} court={selectedCourt} request={request} /></>}</div>}</section>;
}

function SuperadminManager({ admins, request, reload }) {
  const [email, setEmail] = useState(''); const [message, setMessage] = useState('');
  const invite = async (event) => { event.preventDefault(); try { await request('/api/superadmin/admins', { method: 'POST', body: JSON.stringify({ email }) }); setEmail(''); setMessage('Administrador autorizado. Al ingresar con Google podrá administrar sus complejos.'); await reload(); } catch (error) { setMessage(error.message); } };
  return <section className="admin-bookings-section"><div className="admin-section-heading"><div><span className="section-kicker">ACCESOS</span><h2>Administradores</h2></div></div><form className="admin-form admin-form--inline" onSubmit={invite}><Input type="email" required placeholder="correo@ejemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} /><Button type="submit">Autorizar administrador</Button></form>{message && <p className={message.includes('autorizado') ? 'form-success' : 'form-error'}>{message}</p>}<div className="admin-access-list">{admins.map((admin) => <div key={admin.invitation_id || admin.id} className="admin-access-row"><div><strong>{admin.name}</strong><small>{admin.email}</small></div><span>{admin.role === 'pendiente' ? 'Pendiente de ingreso' : admin.role}</span>{admin.role === 'admin_cancha' && <Button variant="secondary" size="sm" type="button" onClick={async () => { await request(`/api/superadmin/admins/${admin.id}`, { method: 'DELETE' }); await reload(); }}>Quitar acceso</Button>}{admin.role === 'pendiente' && <Button variant="secondary" size="sm" type="button" onClick={async () => { await request(`/api/superadmin/invitaciones/${admin.invitation_id}`, { method: 'DELETE' }); await reload(); }}>Cancelar</Button>}</div>)}</div></section>;
}

export default function PanelAdmin() {
  const { data: session, isPending } = useSessionWithFallback();
  const sessionUserId = session?.user?.id;
  const [profile, setProfile] = useState(null); const [bookings, setBookings] = useState([]); const [complexes, setComplexes] = useState([]); const [admins, setAdmins] = useState([]); const [filterDate, setFilterDate] = useState(''); const [activeSection, setActiveSection] = useState('overview'); const [error, setError] = useState('');
  const [profileAttempt, setProfileAttempt] = useState(0);
  const request = useCallback(async (path, options) => readApiResponse(await apiFetch(path, options)), []);
  const reload = useCallback(async () => { const [nextBookings, nextComplexes] = await Promise.all([request('/api/admin/reservas'), request('/api/admin/complejos')]); setBookings(nextBookings); setComplexes(nextComplexes); if (profile?.role === 'superadmin') setAdmins(await request('/api/superadmin/admins')); }, [profile?.role, request]);
  useEffect(() => {
    if (!sessionUserId) return undefined;

    let active = true;
    let retryTimer;
    request('/api/admin/session').then((data) => {
      if (active) setProfile(data.user);
    }).catch((requestError) => {
      if (!active) return;
      if (profileAttempt < 2) retryTimer = window.setTimeout(() => setProfileAttempt((current) => current + 1), 1_500);
      else { setProfile(false); setError(requestError.message); }
    });

    return () => {
      active = false;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [profileAttempt, request, sessionUserId]);
  useEffect(() => { if (!profile || profile === false) return undefined; const timer = window.setTimeout(() => reload().catch((requestError) => setError(requestError.message)), 0); return () => window.clearTimeout(timer); }, [profile, reload]);
  const calendarBookings = getCalendarBookings(bookings); const filtered = filterDate ? calendarBookings.filter((booking) => booking.fecha === filterDate) : calendarBookings;
  const login = () => authClient.signIn.social({ provider: 'google', callbackURL: window.location.href }); const logout = async () => { await authClient.signOut(); setProfile(null); };
  const cancelBooking = async (id) => { if (!window.confirm('¿Querés cancelar este turno? Si la seña está pendiente, el horario se liberará de inmediato.')) return; try { await request(`/api/admin/reservas/${id}`, { method: 'DELETE' }); await reload(); } catch (requestError) { setError(requestError.message); } };
  if (isPending || (session?.user && profile === null)) return <div className="admin-login"><div className="admin-login__card">Cargando el panel…</div></div>;
  if (!session?.user) return <GoogleAccess onLogin={login} />; if (profile === false) return <GoogleAccess onLogin={login} message={error || 'Esta cuenta no tiene permisos. Elegí la cuenta autorizada de Google para continuar.'} />;
  const isSuperadmin = profile.role === 'superadmin'; const navItems = [['overview', 'Resumen', 'home'], ['calendar', 'Calendario', 'calendar'], ['complexes', 'Complejos', 'pitch'], ...(isSuperadmin ? [['admins', 'Administradores', 'user']] : [])]; const overviewMetrics = getAdminOverviewMetrics(bookings); const courts = complexes.flatMap((complex) => complex.canchas || []);
  return <div className="admin-shell"><aside className="admin-sidebar"><a className="brand" href="/" aria-label="Volver a explorar"><PitchMark /><span>NEW MATCH</span></a><div className="admin-sidebar__label">OPERACIONES</div><nav>{navItems.map(([id, label, icon]) => <button className={`admin-nav-item${activeSection === id ? ' is-active' : ''}`} key={id} type="button" onClick={() => setActiveSection(id)}><Icon name={icon} size={18} /><span>{label}</span></button>)}</nav><div className="admin-sidebar__bottom"><a className="admin-nav-item" href="/"><Icon name="back" size={18} /><span>Ver aplicación</span></a><button className="admin-nav-item" type="button" onClick={logout}><Icon name="logout" size={18} /><span>Salir</span></button><div className="admin-profile"><span>{profile.name?.slice(0, 2).toUpperCase()}</span><div><strong>{profile.name}</strong><small>{isSuperadmin ? 'Superadministrador' : 'Administrador'}</small></div></div></div></aside><main className="admin-main"><header className="admin-topbar"><div><span className="section-kicker">NEW MATCH / OPERACIONES</span><h1>Buen día, {profile.name?.split(' ')[0]}.</h1></div><div className="admin-topbar__actions"><span className="avatar-button">{profile.name?.slice(0, 2).toUpperCase()}</span></div></header>{error && <p className="form-error">{error}</p>}{activeSection === 'overview' && <><section className="admin-stats"><div className="admin-stat admin-stat--primary"><span>TURNOS DE HOY</span><strong>{overviewMetrics.todayBookings}</strong><small>Agenda de tus canchas</small></div><div className="admin-stat"><span>COMPLEJOS</span><strong>{complexes.filter((complex) => complex.activo).length}</strong><small>{courts.filter((court) => court.activa).length} canchas activas</small></div><div className="admin-stat"><span>INGRESOS DE HOY</span><strong className="admin-stat__money"><span>$</span>{overviewMetrics.todayIncome.toLocaleString('es-AR')}</strong><small>Turnos confirmados</small></div><div className="admin-stat"><span>INGRESOS ESTE MES</span><strong className="admin-stat__money"><span>$</span>{overviewMetrics.monthIncome.toLocaleString('es-AR')}</strong><small>Turnos confirmados</small></div></section><section className="admin-bookings-section"><div className="admin-section-heading"><div><span className="section-kicker">AGENDA</span><h2>Próximos turnos</h2></div></div><AdminTable bookings={bookings.slice(0, 8)} onCancel={cancelBooking} /></section></>}{activeSection === 'calendar' && <section className="admin-bookings-section"><div className="admin-section-heading"><div><span className="section-kicker">AGENDA</span><h2>Reservas</h2></div><div className="admin-filters"><CalendarPicker label="Filtrar por fecha" value={filterDate} onChange={setFilterDate} /><Button variant="chip" size="sm" type="button" onClick={() => setFilterDate('')}>Todos</Button></div></div>{filtered.length ? <AdminTable bookings={filtered} onCancel={cancelBooking} /> : <div className="admin-empty"><PitchMark compact /><h3>No hay turnos para esta fecha</h3><p>Probá con otro día o mostrálos todos.</p></div>}</section>}{activeSection === 'complexes' && <ComplexesManager complexes={complexes} reload={reload} request={request} />}{activeSection === 'admins' && isSuperadmin && <SuperadminManager admins={admins} request={request} reload={reload} />}</main></div>;
}

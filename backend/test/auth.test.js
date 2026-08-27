import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/reservas_test';
process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth-12345';
process.env.BETTER_AUTH_URL = 'http://localhost:3001';
process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';

const { ROLES, auth, requireAuth } = await import('../auth.js');
const { canCustomerCancel, canCustomerReleaseReservation, hasCheckoutUrl, requiresReservationPayment, validateComplex, validateCourt, validateProfile, validateReservation, validateScheduleSlots } = await import('../server.js');

function response() {
  return {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('define los tres roles soportados', () => {
  assert.deepEqual(ROLES, ['cliente', 'admin_cancha', 'superadmin']);
});

test('requireAuth rechaza una solicitud sin sesión', async () => {
  const original = auth.api.getSession;
  auth.api.getSession = async () => null;
  try {
    const res = response();
    await requireAuth()({ headers: {} }, res, () => {});
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Autenticación requerida');
  } finally {
    auth.api.getSession = original;
  }
});

test('requireAuth deja pasar al administrador de cancha', async () => {
  const original = auth.api.getSession;
  auth.api.getSession = async () => ({ user: { id: 'admin-1', email: 'admin@example.com', role: 'admin_cancha' } });
  try {
    const req = { headers: {} };
    let called = false;
    await requireAuth(['admin_cancha', 'superadmin'])(req, response(), () => { called = true; });
    assert.equal(called, true);
    assert.equal(req.user.role, 'admin_cancha');
  } finally {
    auth.api.getSession = original;
  }
});

test('una reserva nueva exige una cancha concreta', () => {
  const now = new Date('2026-08-19T12:00:00-03:00');
  assert.equal(validateReservation({ nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-08-20', hora: '18:00-19:00' }, now).error, 'Nombre, teléfono, fecha u horario inválido');
  assert.deepEqual(
    validateReservation({ nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-08-20', hora: '18:00-19:00', cancha_id: 7 }, now),
    { nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-08-20', hora: '18:00-19:00', canchaId: 7, recurrente: false, semanas: 1 },
  );
});

test('sólo el propietario reserva su propia cancha sin seña', () => {
  const courtWithDeposit = { requiere_sena: true, complejo_owner_user_id: 'owner-1' };
  assert.equal(requiresReservationPayment(courtWithDeposit, 'owner-1'), false);
  assert.equal(requiresReservationPayment(courtWithDeposit, 'admin-2'), true);
  assert.equal(requiresReservationPayment(courtWithDeposit, 'superadmin-1'), true);
  assert.equal(requiresReservationPayment({ ...courtWithDeposit, requiere_sena: false }, 'cliente-1'), false);
});

test('un horario fijo valida la cantidad de semanas', () => {
  const now = new Date('2026-08-19T12:00:00-03:00');
  const base = { nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-08-20', hora: '18:00-19:00', cancha_id: 7, recurrente: true };
  assert.equal(validateReservation({ ...base, semanas: 1 }, now).error, 'La cantidad de semanas es inválida');
  assert.equal(validateReservation({ ...base, semanas: 53 }, now).error, 'La cantidad de semanas es inválida');
  assert.deepEqual(validateReservation({ ...base, semanas: 4 }, now), {
    nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-08-20', hora: '18:00-19:00', canchaId: 7, recurrente: true, semanas: 4,
  });
});

test('rechaza reservas cuyo horario ya comenzó', () => {
  const now = new Date('2026-08-20T18:00:00-03:00');
  const base = { nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-08-20', cancha_id: 7 };
  assert.equal(validateReservation({ ...base, hora: '17:00-18:00' }, now).error, 'El horario seleccionado ya comenzó. Elegí uno futuro.');
  assert.equal(validateReservation({ ...base, hora: '18:00-19:00' }, now).error, 'El horario seleccionado ya comenzó. Elegí uno futuro.');
  assert.equal(validateReservation({ ...base, hora: '18:30-19:30' }, now).error, undefined);
});

test('rechaza fechas inexistentes antes de crear una reserva', () => {
  const reservation = validateReservation(
    { nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-02-30', hora: '18:00-19:00', cancha_id: 7 },
    new Date('2026-02-01T12:00:00-03:00'),
  );
  assert.equal(reservation.error, 'Nombre, teléfono, fecha u horario inválido');
});

test('rechaza horarios superpuestos sin confundir turnos contiguos', () => {
  const valid = [
    { dayOfWeek: 1, start: '19:00', end: '20:00', price: 10000 },
    { dayOfWeek: 1, start: '18:00', end: '19:00', price: 10000, active: false },
    { dayOfWeek: 2, start: '18:00', end: '20:00', price: 10000 },
  ];
  assert.equal(validateScheduleSlots(valid), null);
  assert.deepEqual(
    validateScheduleSlots([...valid, { dayOfWeek: 1, start: '18:30', end: '19:30', price: 10000 }]),
    { error: 'Los horarios de un mismo día no pueden superponerse' },
  );
});

test('el cliente puede cancelar hasta dos horas antes del turno', () => {
  const reservation = { estado: 'confirmada', fecha: '2026-08-20', hora: '16:00-17:00' };
  assert.equal(canCustomerCancel(reservation, new Date('2026-08-20T14:00:00-03:00')), true);
  assert.equal(canCustomerCancel(reservation, new Date('2026-08-20T14:00:01-03:00')), false);
  assert.equal(canCustomerCancel({ ...reservation, estado: 'cancelada' }, new Date('2026-08-20T12:00:00-03:00')), false);
});

test('el cliente puede liberar una seña pendiente sin esperar la ventana de cancelación', () => {
  const reservation = { estado: 'pendiente_pago', fecha: '2026-08-20', hora: '16:00-17:00' };
  assert.equal(canCustomerReleaseReservation(reservation, new Date('2026-08-20T15:59:59-03:00')), true);
  assert.equal(canCustomerReleaseReservation({ ...reservation, estado: 'expirada' }, new Date('2026-08-20T12:00:00-03:00')), false);
});

test('sólo acepta enlaces HTTPS de checkout', () => {
  assert.equal(hasCheckoutUrl('https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123'), true);
  assert.equal(hasCheckoutUrl('http://www.mercadopago.com.ar/checkout'), false);
  assert.equal(hasCheckoutUrl('no-es-un-enlace'), false);
});

test('el perfil exige datos válidos para completar una reserva', () => {
  assert.equal(validateProfile({ nombre: 'M', whatsapp: '1155555555' }).error, 'Completá un nombre y WhatsApp válidos');
  assert.deepEqual(validateProfile({ nombre: 'Marcos', whatsapp: '11 5555 5555' }), { nombre: 'Marcos', whatsapp: '1155555555' });
});

test('un complejo exige ubicación y WhatsApp válidos', () => {
  const base = { nombre: 'Complejo Centro', ciudad: 'Rosario', provincia: 'Santa Fe', direccion: 'San Martín 123', whatsapp: '3415551234' };
  assert.equal(validateComplex({ ...base, provincia: '' }).error, 'Nombre, ciudad, provincia y dirección son obligatorios');
  assert.deepEqual(validateComplex(base), {
    nombre: 'Complejo Centro', ciudad: 'Rosario', provincia: 'Santa Fe', direccion: 'San Martín 123', descripcion: '', whatsapp: '5493415551234', fotoUrl: '',
  });
});

test('una cancha exige nombre y un deporte admitido', () => {
  const base = { nombre: 'Cancha Centro', deporte: 'Pádel' };
  assert.equal(validateCourt({ ...base, deporte: 'Fútbol 7' }).error, 'Nombre y deporte son obligatorios');
  assert.deepEqual(validateCourt(base), {
    nombre: 'Cancha Centro', deporte: 'Pádel', descripcion: '', indoor: false, requiereSena: true,
  });
  assert.equal(validateCourt({ ...base, requiere_sena: false }).requiereSena, false);
  assert.equal(validateCourt({ ...base, requiere_sena: 'false' }).error, 'La configuración de seña es inválida');
});

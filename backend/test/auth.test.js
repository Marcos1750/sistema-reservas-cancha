import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/reservas_test';
process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth-12345';
process.env.BETTER_AUTH_URL = 'http://localhost:3001';
process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';

const { ROLES, auth, requireAuth } = await import('../auth.js');
const { canCustomerCancel, validateComplex, validateCourt, validateProfile, validateReservation } = await import('../server.js');

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
  assert.equal(validateReservation({ nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-08-20', hora: '18:00-19:00' }).error, 'Nombre, teléfono, fecha u horario inválido');
  assert.deepEqual(
    validateReservation({ nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-08-20', hora: '18:00-19:00', cancha_id: 7 }),
    { nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-08-20', hora: '18:00-19:00', canchaId: 7, recurrente: false, semanas: 1 },
  );
});

test('un horario fijo valida la cantidad de semanas', () => {
  const base = { nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-08-20', hora: '18:00-19:00', cancha_id: 7, recurrente: true };
  assert.equal(validateReservation({ ...base, semanas: 1 }).error, 'La cantidad de semanas es inválida');
  assert.equal(validateReservation({ ...base, semanas: 53 }).error, 'La cantidad de semanas es inválida');
  assert.deepEqual(validateReservation({ ...base, semanas: 4 }), {
    nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-08-20', hora: '18:00-19:00', canchaId: 7, recurrente: true, semanas: 4,
  });
});

test('el cliente puede cancelar hasta dos horas antes del turno', () => {
  const reservation = { estado: 'confirmada', fecha: '2026-08-20', hora: '16:00-17:00' };
  assert.equal(canCustomerCancel(reservation, new Date('2026-08-20T14:00:00-03:00')), true);
  assert.equal(canCustomerCancel(reservation, new Date('2026-08-20T14:00:01-03:00')), false);
  assert.equal(canCustomerCancel({ ...reservation, estado: 'cancelada' }, new Date('2026-08-20T12:00:00-03:00')), false);
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
    nombre: 'Cancha Centro', deporte: 'Pádel', descripcion: '', indoor: false,
  });
});

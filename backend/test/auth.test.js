import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/reservas_test';
process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth-12345';
process.env.BETTER_AUTH_URL = 'http://localhost:3001';
process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';

const { ROLES, auth, requireAuth } = await import('../auth.js');
const { canCustomerCancel, validateReservation } = await import('../server.js');

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
    { nombre: 'Ana Pérez', telefono: '1155555555', fecha: '2026-08-20', hora: '18:00-19:00', canchaId: 7 },
  );
});

test('el cliente puede cancelar hasta dos horas antes del turno', () => {
  const reservation = { estado: 'confirmada', fecha: '2026-08-20', hora: '16:00-17:00' };
  assert.equal(canCustomerCancel(reservation, new Date('2026-08-20T14:00:00-03:00')), true);
  assert.equal(canCustomerCancel(reservation, new Date('2026-08-20T14:00:01-03:00')), false);
  assert.equal(canCustomerCancel({ ...reservation, estado: 'cancelada' }, new Date('2026-08-20T12:00:00-03:00')), false);
});

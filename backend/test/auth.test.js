const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

process.env.AUTH_SECRET = 'test-auth-secret';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('correct-password', 4);

const { loginAdmin, requireAdmin, signSession } = require('../auth');

test('acepta la contraseña admin correcta y rechaza la incorrecta', async () => {
  assert.equal(await loginAdmin('correct-password'), true);
  assert.equal(await loginAdmin('wrong-password'), false);
});

test('requireAdmin autoriza una sesión JWT válida', () => {
  const token = signSession();
  const request = {
    get(name) {
      return name === 'authorization' ? 'Bearer ' + token : undefined;
    },
  };
  let called = false;
  requireAdmin(request, { status: () => ({ json: () => {} }) }, () => { called = true; });
  assert.equal(called, true);
});

test('requireAdmin rechaza solicitudes sin sesión', () => {
  const response = {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
  };
  requireAdmin({ get: () => undefined }, response, () => {});
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'Autenticación requerida');
});

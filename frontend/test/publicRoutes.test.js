import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingPath,
  complexPath,
  complexSlug,
  hasCompleteBookingSelection,
  publicScreenPath,
  readBookingSelection,
} from '../src/lib/publicRoutes.js';

test('crea slugs estables y rutas públicas conocidas', () => {
  assert.equal(complexSlug('El Patío Fútbol 5'), 'el-patio-futbol-5');
  assert.equal(complexPath({ name: 'El Patio' }), '/complejos/el-patio');
  assert.equal(publicScreenPath('bookings'), '/turnos');
  assert.equal(publicScreenPath('unknown'), '/');
});

test('conserva cancha, fecha y horario en la ruta de reserva', () => {
  const path = bookingPath({ name: 'El Patio' }, 14, '2026-09-18', '21:00-22:00');
  assert.equal(path, '/complejos/el-patio/reservar?cancha=14&fecha=2026-09-18&hora=21%3A00-22%3A00');

  const selection = readBookingSelection(path.slice(path.indexOf('?')));
  assert.deepEqual(selection, { courtId: 14, date: '2026-09-18', time: '21:00-22:00' });
  assert.equal(hasCompleteBookingSelection(selection), true);
});

test('rechaza una ruta de reserva incompleta', () => {
  assert.equal(hasCompleteBookingSelection(readBookingSelection('?cancha=14&fecha=2026-09-18')), false);
  assert.equal(hasCompleteBookingSelection(readBookingSelection('?cancha=x&fecha=ayer&hora=21')), false);
});

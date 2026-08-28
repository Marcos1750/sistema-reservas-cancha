import assert from 'node:assert/strict';
import test from 'node:test';
import { getAdminBookingSections, getAdminOverviewMetrics, getBookingEndAt, getBuenosAiresDate, getCalendarBookings, isBookingUpcoming } from '../src/lib/adminOverview.js';

const now = new Date('2026-09-01T02:30:00.000Z');

test('usa el calendario de Buenos Aires para determinar el día y el mes actual', () => {
  assert.equal(getBuenosAiresDate(now), '2026-08-31');
});

test('resume solo el valor de reservas confirmadas del día y mes correspondientes', () => {
  const metrics = getAdminOverviewMetrics([
    { fecha: '2026-08-31', estado: 'confirmada', precio_ars: 12000 },
    { fecha: '2026-08-31', estado: 'confirmada', precio_ars: '8000' },
    { fecha: '2026-08-20', estado: 'confirmada', precio_ars: 15000 },
    { fecha: '2026-09-01', estado: 'confirmada', precio_ars: 30000 },
    { fecha: '2026-08-31', estado: 'pendiente_pago', precio_ars: 9000 },
    { fecha: '2026-08-31', estado: 'cancelada', precio_ars: 7000 },
    { fecha: '2026-08-31', estado: 'expirada', precio_ars: 6000 },
    { fecha: '2026-08-31', estado: 'confirmada', precio_ars: null },
  ], now);

  assert.deepEqual(metrics, {
    today: '2026-08-31',
    todayBookings: 3,
    todayIncome: 20000,
    monthIncome: 35000,
  });
});

test('mantiene la compatibilidad de getCalendarBookings con un historial de 30 días', () => {
  const bookings = getCalendarBookings([
    { id: 1, fecha: '2026-08-01', hora: '18:00-19:00', estado: 'confirmada' },
    { id: 2, fecha: '2026-08-25', hora: '18:00-19:00', estado: 'confirmada' },
    { id: 3, fecha: '2026-09-02', hora: '18:00-19:00', estado: 'confirmada' },
  ], now);

  assert.deepEqual(bookings.map((booking) => booking.id), [2, 3]);
});

test('clasifica y ordena próximos e historial por fecha y final del turno', () => {
  const at = new Date('2026-09-01T02:30:00.000Z');
  const bookings = [
    { id: 1, fecha: '2026-08-31', hora: '22:00-23:00', estado: 'confirmada' },
    { id: 2, fecha: '2026-09-01', hora: '05:00-06:00', estado: 'confirmada' },
    { id: 3, fecha: '2026-09-01', hora: '04:00-05:00', estado: 'confirmada' },
    { id: 4, fecha: '2026-08-30', hora: '20:00-21:00', estado: 'cancelada' },
    { id: 5, fecha: '2026-07-01', hora: '20:00-21:00', estado: 'confirmada' },
  ];
  const sections = getAdminBookingSections(bookings, at);
  assert.deepEqual(sections.upcoming.map((booking) => booking.id), [3, 2]);
  assert.deepEqual(sections.history.map((booking) => booking.id), [1, 4]);
  assert.equal(isBookingUpcoming(bookings[1], at), true);
  assert.equal(isBookingUpcoming(bookings[0], at), false);
  assert.equal(getBookingEndAt(bookings[0]).toISOString(), '2026-09-01T02:00:00.000Z');
  assert.equal(isBookingUpcoming(bookings[0], new Date('2026-09-01T02:00:00.000Z')), false);
});

test('considera que un turno que termina a medianoche finaliza al día siguiente', () => {
  const booking = { id: 1, fecha: '2026-08-31', hora: '23:00-00:00', estado: 'confirmada' };
  assert.equal(getBookingEndAt(booking).toISOString(), '2026-09-01T03:00:00.000Z');
  assert.equal(isBookingUpcoming(booking, new Date('2026-09-01T02:30:00.000Z')), true);
  assert.equal(isBookingUpcoming(booking, new Date('2026-09-01T03:00:00.000Z')), false);
});

test('no muestra en la agenda las reservas ocultas del historial', () => {
  const sections = getAdminBookingSections([
    { id: 1, fecha: '2026-08-31', hora: '18:00-19:00', estado: 'cancelada', historial_oculto_at: '2026-09-01T00:00:00Z' },
    { id: 2, fecha: '2026-08-31', hora: '19:00-20:00', estado: 'cancelada' },
  ], now);

  assert.deepEqual(sections.history.map((booking) => booking.id), [2]);
  assert.deepEqual(sections.all.map((booking) => booking.id), [2]);
});

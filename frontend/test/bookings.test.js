import assert from 'node:assert/strict';
import test from 'node:test';
import { splitBookingsByTimeline } from '../src/lib/bookings.js';

const now = new Date('2026-08-26T15:00:00.000Z');

test('prioriza el próximo turno y separa el historial', () => {
  const { upcoming, history } = splitBookingsByTimeline([
    { id: 'past', date: '2026-08-25', time: '20:00-21:00', status: 'Confirmado' },
    { id: 'later', date: '2026-08-28', time: '19:00-20:00', status: 'Confirmado' },
    { id: 'next', date: '2026-08-26', time: '13:30-14:30', status: 'Confirmado' },
    { id: 'cancelled', date: '2026-09-01', time: '20:00-21:00', status: 'Cancelado' },
  ], now);

  assert.deepEqual(upcoming.map((booking) => booking.id), ['next', 'later']);
  assert.deepEqual(history.map((booking) => booking.id), ['cancelled', 'past']);
});

test('mantiene pagos pendientes futuros entre los próximos turnos', () => {
  const { upcoming, history } = splitBookingsByTimeline([
    { id: 'expired', date: '2026-08-30', time: '20:00-21:00', status: 'Vencido' },
    { id: 'pending', date: '2026-08-27', time: '20:00-21:00', status: 'Pendiente de pago' },
  ], now);

  assert.deepEqual(upcoming.map((booking) => booking.id), ['pending']);
  assert.deepEqual(history.map((booking) => booking.id), ['expired']);
});

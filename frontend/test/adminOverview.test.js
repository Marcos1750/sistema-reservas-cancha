import assert from 'node:assert/strict';
import test from 'node:test';
import { getAdminOverviewMetrics, getBuenosAiresDate, getCalendarBookings } from '../src/lib/adminOverview.js';

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

test('oculta del calendario los turnos que ya cumplieron una semana', () => {
  const bookings = getCalendarBookings([
    { id: 1, fecha: '2026-08-23' },
    { id: 2, fecha: '2026-08-24' },
    { id: 3, fecha: '2026-08-25' },
    { id: 4, fecha: '2026-09-02' },
  ], now);

  assert.deepEqual(bookings.map((booking) => booking.id), [3, 4]);
});

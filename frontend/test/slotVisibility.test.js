import assert from 'node:assert/strict';
import test from 'node:test';
import { getBuenosAiresDateTime, getSelectableSlots, isSlotSelectable } from '../src/lib/slotVisibility.js';

test('oculta para hoy los horarios cuyo inicio ya pasó en Argentina', () => {
  const now = new Date('2026-08-28T21:20:00.000Z'); // 18:20 en Buenos Aires
  assert.deepEqual(getBuenosAiresDateTime(now), { date: '2026-08-28', minutes: 1100 });
  assert.equal(isSlotSelectable('2026-08-28', '18:00-19:00', now), false);
  assert.equal(isSlotSelectable('2026-08-28', '18:30-19:30', now), true);
  assert.deepEqual(getSelectableSlots('2026-08-28', ['17:00-18:00', '18:00-19:00', '18:30-19:30', '19:00-20:00'], now), ['18:30-19:30', '19:00-20:00']);
});

test('conserva horarios de fechas futuras y descarta fechas anteriores', () => {
  const now = new Date('2026-08-28T21:20:00.000Z');
  assert.equal(isSlotSelectable('2026-08-29', '08:00-09:00', now), true);
  assert.equal(isSlotSelectable('2026-08-27', '23:00-00:00', now), false);
});

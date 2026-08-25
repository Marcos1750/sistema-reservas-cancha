import assert from 'node:assert/strict';
import test from 'node:test';
import { getAvailabilityStatus } from '../src/lib/availability.js';

test('identifica un día sin horarios configurados', () => {
  assert.equal(getAvailabilityStatus({ blocked: false, slots: [] }), 'no-schedule');
});

test('distingue un día bloqueado de un día sin horarios', () => {
  assert.equal(getAvailabilityStatus({ blocked: true, slots: [] }), 'blocked');
});

test('identifica cuando todos los horarios ya fueron reservados', () => {
  assert.equal(getAvailabilityStatus({ blocked: false, slots: [{ disponible: false }] }), 'fully-booked');
});

test('identifica cuando hay al menos un horario disponible', () => {
  assert.equal(getAvailabilityStatus({ blocked: false, slots: [{ disponible: false }, { disponible: true }] }), 'available');
});

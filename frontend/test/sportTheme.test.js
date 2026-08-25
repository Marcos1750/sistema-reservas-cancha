import test from 'node:test';
import assert from 'node:assert/strict';
import { getComplexTheme, getSportTheme, getUniqueSports } from '../src/sportTheme.js';

test('identifica el tema de cada deporte y usa fútbol como respaldo', () => {
  assert.equal(getSportTheme('Fútbol 5'), 'football');
  assert.equal(getSportTheme('Pádel'), 'padel');
  assert.equal(getSportTheme('Tenis'), 'tennis');
  assert.equal(getSportTheme('Otro'), 'football');
});

test('resume correctamente los deportes de un complejo', () => {
  assert.deepEqual(getUniqueSports(['Pádel', 'Tenis', 'Pádel', 'Otro']), ['Pádel', 'Tenis']);
  assert.equal(getComplexTheme(['Pádel']), 'padel');
  assert.equal(getComplexTheme(['Pádel', 'Tenis']), 'multisport');
  assert.equal(getComplexTheme([]), 'multisport');
});

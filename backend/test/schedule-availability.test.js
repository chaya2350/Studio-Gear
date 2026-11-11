const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getKodeshCutoff,
  getPeriodAvailability,
  validateKodeshSlot
} = require('../schedule-availability');

test('defines Kodesh availability for grades ה and ו', () => {
  assert.equal(getKodeshCutoff('ה', 1), '12:20');
  assert.equal(getKodeshCutoff('ה׳', 2), '13:15');
  assert.equal(getKodeshCutoff('ה', 4), '13:15');
  assert.equal(getKodeshCutoff('ו', 2), '12:20');
  assert.equal(getKodeshCutoff('ו', 4), '14:10');
  assert.equal(getKodeshCutoff('ה', 0), null);
  assert.equal(getKodeshCutoff('ו', 0), null);
  assert.equal(getKodeshCutoff('ה', 3), null);
  assert.equal(getKodeshCutoff('ו', 3), null);
  assert.equal(getKodeshCutoff('ו', 1), null);
});

test('allows Kodesh slots only within the configured class and day cutoff', () => {
  assert.equal(validateKodeshSlot({
    class_year: 'ה', day_of_week: 1, start_time: '11:40', end_time: '12:20'
  }).valid, true);

  assert.equal(validateKodeshSlot({
    class_year: 'ה', day_of_week: 1, start_time: '12:00', end_time: '12:40'
  }).valid, false);

  assert.equal(validateKodeshSlot({
    class_year: 'ו', day_of_week: 1, start_time: '09:00', end_time: '09:40'
  }).valid, false);
});

test('classifies Kodesh, instruction, and track periods for each grade and day', () => {
  const period = (start_time, end_time) => ({ start_time, end_time });

  assert.equal(getPeriodAvailability('ה', 0, period('08:30', '09:50')), 'instruction');
  assert.equal(getPeriodAvailability('ה', 1, period('11:40', '12:20')), 'kodesh');
  assert.equal(getPeriodAvailability('ה', 1, period('12:00', '12:45')), 'kodesh');
  assert.equal(getPeriodAvailability('ה', 2, period('13:30', '14:10')), 'instruction');
  assert.equal(getPeriodAvailability('ה', 2, period('14:30', '15:30')), 'instruction');
  assert.equal(getPeriodAvailability('ה', 2, period('14:50', '15:30')), 'track');
  assert.equal(getPeriodAvailability('ה', 2, period('18:30', '20:45')), 'track');
  assert.equal(getPeriodAvailability('ה', 3, period('08:30', '09:50')), 'track');
  assert.equal(getPeriodAvailability('ו', 1, period('08:30', '09:50')), 'track');
  assert.equal(getPeriodAvailability('ו', 2, period('11:40', '12:20')), 'kodesh');
  assert.equal(getPeriodAvailability('ו', 4, period('13:30', '14:10')), 'kodesh');
  assert.equal(getPeriodAvailability('ו', 4, period('14:10', '14:50')), 'track');
});

test('requires a complete, increasing lesson period', () => {
  assert.equal(validateKodeshSlot({
    class_year: 'ו', day_of_week: 4, start_time: '14:10', end_time: ''
  }).valid, false);
  assert.equal(validateKodeshSlot({
    class_year: 'ו', day_of_week: 4, start_time: '14:10', end_time: '14:10'
  }).valid, false);
});

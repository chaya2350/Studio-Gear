const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_ROOMS } = require('../room-map-defaults');

test('room map preserves unique room numbers, fractional floors and leading zeroes', () => {
  const numbers = DEFAULT_ROOMS.map(room => room.number);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.deepEqual([...new Set(DEFAULT_ROOMS.map(room => room.floor))], [4, 3.5, 3, 2, 1, 0.5, 0]);
  assert.ok(numbers.includes('001'));
  assert.ok(numbers.includes('051'));
  assert.equal(DEFAULT_ROOMS.length, 47);
});

test('room flags and source capacities are retained', () => {
  const find = number => DEFAULT_ROOMS.find(room => room.number === number);
  assert.equal(find('407').usable, false);
  assert.equal(find('405').computers, true);
  assert.equal(find('311').projector, true);
  assert.equal(find('201').capacity, 46);
  assert.equal(find('201').capacityNeedsConfirmation, true);
  assert.equal(find('201').airConditioner, '200/210');
  assert.equal(find('005').usable, false);
});

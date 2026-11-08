import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatHebrewDate } from '../src/app/hebrew-date.ts';

test('formats a Gregorian date using the Hebrew calendar', () => {
  const result = formatHebrewDate('2026-09-12');
  assert.match(result, /תשרי/);
  assert.match(result, /תשפ״ז|5787/);
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isUpcomingExam } from '../src/app/pages/exams/upcoming-exams.ts';

test('shows today, future and undated exams but hides past exams', () => {
  const now = new Date(2026, 10, 8, 23, 59);
  assert.equal(isUpcomingExam('2026-11-07', now), false);
  assert.equal(isUpcomingExam('2026-11-08', now), true);
  assert.equal(isUpcomingExam('2026-11-09', now), true);
  assert.equal(isUpcomingExam(null, now), true);
  assert.equal(isUpcomingExam('', now), true);
});

test('compares dates across year and leap-day boundaries', () => {
  assert.equal(isUpcomingExam('2026-12-31', new Date(2027, 0, 1)), false);
  assert.equal(isUpcomingExam('2027-01-01', new Date(2026, 11, 31)), true);
  assert.equal(isUpcomingExam('2024-02-29', new Date(2024, 2, 1)), false);
  assert.equal(isUpcomingExam('2024-02-29', new Date(2024, 1, 29)), true);
});

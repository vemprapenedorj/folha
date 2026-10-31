import test from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, isoWeeksInYear, isoWeekStart } from '../public/week-calendar.js';

test('seleção pelo número da semana usa segunda-feira e respeita a virada do ano', () => {
  assert.deepEqual(isoWeek('2026-10-31'), { year: 2026, number: 44 });
  assert.deepEqual(isoWeek('2026-11-02'), { year: 2026, number: 45 });
  assert.deepEqual(isoWeek('2026-11-09'), { year: 2026, number: 46 });
  assert.equal(isoWeekStart(2026, 46), '2026-11-09');
  assert.equal(isoWeeksInYear(2026), 53);
  assert.equal(isoWeekStart(2026, 53), '2026-12-28');
  assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, number: 53 });
  assert.equal(isoWeeksInYear(2027), 52);
});

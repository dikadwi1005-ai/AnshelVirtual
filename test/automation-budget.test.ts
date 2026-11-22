import assert from 'node:assert/strict';
import test from 'node:test';
import { reserveSourceBudget } from '../server/automation-budget.ts';

test('flight search reservations spread pairs of API calls across the month', () => {
  const state = {};
  const plan = { provider: 'skyscanner', daily: 20, monthly: 64, cost: 2, gapMinutes: 60 };
  const start = Date.parse('2026-07-01T00:00:00+07:00');
  const hour = 3600000;

  assert.equal(reserveSourceBudget(state, plan, start).allowed, true);
  assert.equal(reserveSourceBudget(state, plan, start + hour).allowed, true);
  const deferred = reserveSourceBudget(state, plan, start + 2 * hour);
  assert.equal(deferred.allowed, false);
  assert.equal(deferred.nextAt, start + 24 * hour);
  assert.equal(deferred.monthUsed, 4);

  assert.equal(reserveSourceBudget(state, plan, start + 24 * hour).allowed, true);
  assert.equal(reserveSourceBudget(state, plan, start + 25 * hour).allowed, false);
});

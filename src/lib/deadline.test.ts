/**
 * Lightweight pure tests for deadline & health logic.
 * Run with: npm test
 */

import { getDeadlineState, toLocalDateString } from './utils';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const today = toLocalDateString();
const yesterday = toLocalDateString(new Date(Date.now() - 86400000));
const tomorrow = toLocalDateString(new Date(Date.now() + 86400000));
const inFiveDays = toLocalDateString(new Date(Date.now() + 5 * 86400000));
const inTenDays = toLocalDateString(new Date(Date.now() + 10 * 86400000));

assert(getDeadlineState(null, 'Exploring') === 'none', 'null target → none');
assert(getDeadlineState(null, 'Building') === 'none', 'null target on Building → none');
assert(getDeadlineState(yesterday, 'Live') === 'inactive', 'Live → inactive');
assert(getDeadlineState(yesterday, 'Paused') === 'inactive', 'Paused → inactive');
assert(getDeadlineState(yesterday, 'Archived') === 'inactive', 'Archived → inactive');
assert(getDeadlineState(yesterday, 'Testing') === 'overdue', 'yesterday → overdue');
assert(getDeadlineState(today, 'Exploring') === 'due-today', 'today → due-today');
assert(getDeadlineState(tomorrow, 'Building') === 'due-soon', 'tomorrow → due-soon');
assert(getDeadlineState(inFiveDays, 'Testing') === 'due-soon', '5 days → due-soon');
assert(getDeadlineState(inTenDays, 'Exploring') === 'future', '10 days → future');

console.log('All deadline tests passed.');

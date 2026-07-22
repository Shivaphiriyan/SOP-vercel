import { formatDuration, getWorkweekBounds } from '../../client/src/utils/attendance.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`✓ PASSED: ${message}`);
}

async function runTests() {
  console.log('--- RUNNING ATTENDANCE DURATION AND WORKDAY UNIT TESTS ---\n');

  // 1. Duration calculation: same minute checkout (30 seconds)
  assert(formatDuration(0) === '0m', '0 seconds returns 0m');
  assert(formatDuration(30) === '0m', '30 seconds returns 0m instead of 0.0h');
  assert(formatDuration(45) === '0m', '45 seconds returns 0m');

  // 2. Minutes formatting
  assert(formatDuration(120) === '2m', '120 seconds returns 2m');
  assert(formatDuration(720) === '12m', '720 seconds returns 12m');
  assert(formatDuration(3540) === '59m', '3540 seconds returns 59m');

  // 3. Exact hours formatting
  assert(formatDuration(3600) === '1h', '3600 seconds returns 1h');
  assert(formatDuration(7200) === '2h', '7200 seconds returns 2h');

  // 4. Hours and minutes formatting
  assert(formatDuration(7500) === '2h 05m', '7500 seconds returns 2h 05m');
  assert(formatDuration(30600) === '8h 30m', '30600 seconds (8.5 hours) returns 8h 30m');

  // 5. Overnight shift calculation (8:26 PM to 6:00 AM next day)
  const shiftStart = new Date('2026-07-11T20:26:00Z');
  const shiftEnd = new Date('2026-07-12T06:00:00Z');
  const shiftDurationSec = Math.floor((shiftEnd.getTime() - shiftStart.getTime()) / 1000);
  assert(shiftDurationSec === 34440, 'Overnight shift elapsed seconds is 34,440');
  assert(formatDuration(shiftDurationSec) === '9h 34m', 'Overnight shift duration is formatted as 9h 34m');

  // 6. Workweek bounds calculation (Monday to Sunday)
  const wednesday = new Date('2026-07-22T12:00:00Z'); // Wednesday
  const { start: weekMon, end: weekSun } = getWorkweekBounds(wednesday);
  assert(weekMon.getDay() === 1, 'Workweek start is Monday (day 1)');
  assert(weekSun.getDay() === 0, 'Workweek end is Sunday (day 0)');

  console.log('\n--- ALL ATTENDANCE UNIT TESTS COMPLETED SUCCESSFULLY ---');
}

runTests().catch(err => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});

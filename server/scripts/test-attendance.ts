import {
  calculateAttendanceDurationMs,
  calculateAttendanceDurationSec,
  formatDuration,
  getWorkweekBounds
} from '../src/utils/attendance';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`✓ PASSED: ${message}`);
}

async function runTests() {
  console.log('--- RUNNING ATTENDANCE DURATION UNIT TESTS ---\n');

  // Test 1: 09:14 AM to 06:36 PM (Bug report fix validation)
  const t1_checkIn = '2026-07-23T09:14:00.000Z';
  const t1_checkOut = '2026-07-23T18:36:00.000Z';
  const t1_ms = calculateAttendanceDurationMs(t1_checkIn, t1_checkOut);
  const t1_sec = calculateAttendanceDurationSec(t1_checkIn, t1_checkOut);
  const t1_formatted = formatDuration(t1_sec);
  assert(t1_ms === 33720000, '09:14 AM to 06:36 PM duration in ms is 33,720,000');
  assert(t1_sec === 33720, '09:14 AM to 06:36 PM duration in seconds is 33,720');
  assert(t1_formatted === '9h 22m', '09:14 AM to 06:36 PM duration formats as 9h 22m');

  // Test 2: 09:00 AM to 05:30 PM (Standard shift)
  const t2_checkIn = '2026-07-23T09:00:00.000Z';
  const t2_checkOut = '2026-07-23T17:30:00.000Z';
  const t2_sec = calculateAttendanceDurationSec(t2_checkIn, t2_checkOut);
  const t2_formatted = formatDuration(t2_sec);
  assert(t2_sec === 30600, '09:00 AM to 05:30 PM duration in seconds is 30,600');
  assert(t2_formatted === '8h 30m', '09:00 AM to 05:30 PM duration formats as 8h 30m');

  // Test 3: 10:00 PM to 06:00 AM next day (Overnight shift)
  const t3_checkIn = '2026-07-23T22:00:00.000Z';
  const t3_checkOut = '2026-07-24T06:00:00.000Z';
  const t3_sec = calculateAttendanceDurationSec(t3_checkIn, t3_checkOut);
  const t3_formatted = formatDuration(t3_sec);
  assert(t3_sec === 28800, '10:00 PM to 06:00 AM next day duration in seconds is 28,800');
  assert(t3_formatted === '8h', '10:00 PM to 06:00 AM next day duration formats as 8h');

  // Test 4: Missing checkout (Historical log without allowLive vs active log with allowLive)
  const t4_checkIn = '2026-07-23T09:00:00.000Z';
  const t4_historical_sec = calculateAttendanceDurationSec(t4_checkIn, null, { allowLive: false });
  assert(t4_historical_sec === 0, 'Missing checkout for historical record returns 0s');
  assert(formatDuration(t4_historical_sec) === '0m', 'Missing checkout for historical record formats as 0m');

  const t4_currentTime = new Date('2026-07-23T11:15:00.000Z');
  const t4_live_sec = calculateAttendanceDurationSec(t4_checkIn, null, { allowLive: true, currentTime: t4_currentTime });
  assert(t4_live_sec === 8100, 'Missing checkout with allowLive returns elapsed live seconds (8,100s = 2h 15m)');
  assert(formatDuration(t4_live_sec) === '2h 15m', 'Missing checkout with allowLive formats as 2h 15m');

  // Test 5: Invalid timestamp
  const t5_invalidCheckIn = 'not-a-valid-date';
  const t5_checkOut = '2026-07-23T18:00:00.000Z';
  const t5_sec = calculateAttendanceDurationSec(t5_invalidCheckIn, t5_checkOut);
  assert(t5_sec === 0, 'Invalid checkIn timestamp returns 0 seconds fallback');
  assert(formatDuration(t5_sec) === '0m', 'Invalid timestamp returns 0m format');

  // Test 6: Negative timestamp order (checkOut < checkIn)
  const t6_checkIn = '2026-07-23T18:36:00.000Z';
  const t6_checkOut = '2026-07-23T09:14:00.000Z';
  const t6_sec = calculateAttendanceDurationSec(t6_checkIn, t6_checkOut);
  assert(t6_sec === 0, 'Negative timestamp order returns 0 seconds fallback');
  assert(formatDuration(t6_sec) === '0m', 'Negative timestamp order returns 0m format');

  // Test 7: Long shift (> 24 hours)
  const t7_checkIn = '2026-07-20T08:00:00.000Z';
  const t7_checkOut = '2026-07-21T10:30:00.000Z'; // 26 hours and 30 minutes
  const t7_sec = calculateAttendanceDurationSec(t7_checkIn, t7_checkOut);
  const t7_formatted = formatDuration(t7_sec);
  assert(t7_sec === 95400, '26h 30m shift in seconds is 95,400');
  assert(t7_formatted === '26h 30m', '26h 30m shift formats correctly as 26h 30m');

  // Test 8: Workweek bounds calculation (Monday to Sunday)
  const wednesday = new Date('2026-07-22T12:00:00Z');
  const { start: weekMon, end: weekSun } = getWorkweekBounds(wednesday);
  assert(weekMon.getDay() === 1, 'Workweek start is Monday (day 1)');
  assert(weekSun.getDay() === 0, 'Workweek end is Sunday (day 0)');

  console.log('\n--- ALL ATTENDANCE UNIT TESTS COMPLETED SUCCESSFULLY ---');
}

runTests().catch(err => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});

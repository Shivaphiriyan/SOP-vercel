import assert from 'assert';

function calculateDays(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  const s = new Date(startStr);
  const e = new Date(endStr);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e.getTime() < s.getTime()) return 0;
  const diffTime = Math.abs(e.getTime() - s.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

function validateLeaveNotice(startDateStr: string, noticeDays: number, isEmergency: boolean): { valid: boolean; message?: string } {
  if (isEmergency) return { valid: true };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minAllowed = new Date(today.getTime() + noticeDays * 24 * 60 * 60 * 1000);
  const start = new Date(startDateStr);
  if (start.getTime() < minAllowed.getTime()) {
    return { valid: false, message: `Leave requests must be submitted at least ${noticeDays} days in advance.` };
  }
  return { valid: true };
}

async function runLeaveUnitTests() {
  console.log('--- RUNNING LEAVE REQUEST UNIT TESTS ---');

  // Test 1: Duration calculation
  assert.strictEqual(calculateDays('2026-07-23', '2026-07-25'), 3, '23 Jul to 25 Jul should be 3 days');
  assert.strictEqual(calculateDays('2026-07-23', '2026-07-23'), 1, 'Same day leave should be 1 day');
  assert.strictEqual(calculateDays('2026-07-25', '2026-07-23'), 0, 'End date before start date should be 0 days');
  console.log('✓ PASSED: Duration calculation tests');

  // Test 2: Advance notice period rule
  const today = new Date();
  const validNormalStart = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const invalidNormalStart = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const res1 = validateLeaveNotice(validNormalStart, 5, false);
  assert.strictEqual(res1.valid, true, '6 days in advance should pass 5-day notice rule');

  const res2 = validateLeaveNotice(invalidNormalStart, 5, false);
  assert.strictEqual(res2.valid, false, '1 day in advance should fail 5-day notice rule');
  console.log('✓ PASSED: Advance notice period rule tests');

  // Test 3: Emergency request bypasses notice period rule
  const res3 = validateLeaveNotice(invalidNormalStart, 5, true);
  assert.strictEqual(res3.valid, true, 'Emergency leave should bypass 5-day notice rule');
  console.log('✓ PASSED: Emergency request bypass test');

  console.log('--- ALL LEAVE REQUEST UNIT TESTS COMPLETED SUCCESSFULLY ---');
}

runLeaveUnitTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});

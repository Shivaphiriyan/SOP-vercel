import { getPrisma } from '../src/context';

async function inspectAttendance() {
  console.log('Inspecting attendance_logs database table...');
  const logs = await getPrisma().attendance_logs.findMany({
    orderBy: { check_in_at: 'desc' }
  });
  console.log(`Total attendance records in database: ${logs.length}`);
  
  const corruptLogs = [];

  for (const log of logs) {
    const checkIn = new Date(log.check_in_at);
    const checkOut = log.check_out_at ? new Date(log.check_out_at) : null;
    
    let isCorrupt = false;
    let reason = '';

    if (isNaN(checkIn.getTime())) {
      isCorrupt = true;
      reason = 'Invalid check_in_at timestamp';
    } else if (checkOut) {
      if (isNaN(checkOut.getTime())) {
        isCorrupt = true;
        reason = 'Invalid check_out_at timestamp';
      } else if (checkOut.getTime() < checkIn.getTime()) {
        isCorrupt = true;
        reason = `Negative duration: checkOut (${checkOut.toISOString()}) < checkIn (${checkIn.toISOString()})`;
      } else {
        const diffMs = checkOut.getTime() - checkIn.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours > 24) {
          isCorrupt = true;
          reason = `Unusually long shift (>24h): ${diffHours.toFixed(2)} hours`;
        }
      }
    }
    
    console.log(`Record ID: ${log.id} | User: ${log.user_id} | CheckIn: ${log.check_in_at} | CheckOut: ${log.check_out_at} ${isCorrupt ? `| CORRUPT: ${reason}` : ''}`);
    if (isCorrupt) {
      corruptLogs.push({ log, reason });
    }
  }

  console.log(`\nCorrupt/Abnormal records detected: ${corruptLogs.length}`);
  process.exit(0);
}

inspectAttendance().catch((err) => {
  console.error('Error inspecting attendance:', err);
  process.exit(1);
});

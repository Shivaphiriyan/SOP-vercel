/**
 * Format seconds into concise human-readable duration:
 * - 0m
 * - 12m
 * - 2h 05m
 * - 8h 30m
 */
export const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined || seconds <= 0) return '0m';
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 1) return '0m';
  if (totalMinutes < 60) return `${totalMinutes}m`;
  
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins < 10 ? '0' : ''}${mins}m`;
};

/**
 * Helper to calculate Monday 00:00:00 to Sunday 23:59:59 workweek bounds
 */
export const getWorkweekBounds = (date = new Date()) => {
  const now = new Date(date);
  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const distanceToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const mon = new Date(now);
  mon.setDate(now.getDate() - distanceToMon);
  mon.setHours(0, 0, 0, 0);

  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);

  return { start: mon, end: sun };
};

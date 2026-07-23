export interface DurationOptions {
  currentTime?: Date;
  allowLive?: boolean;
}

/**
 * Calculates duration in milliseconds between two complete timestamps.
 * Returns 0 and logs a dev warning for invalid timestamps or negative timestamp ordering.
 */
export function calculateAttendanceDurationMs(
  checkInInput: string | Date | null | undefined,
  checkOutInput?: string | Date | null | undefined,
  options: DurationOptions = {}
): number {
  if (!checkInInput) {
    return 0;
  }

  const checkIn = new Date(checkInInput);
  if (isNaN(checkIn.getTime())) {
    console.warn(`[Attendance] Warning: Invalid checkIn timestamp provided: ${String(checkInInput)}`);
    return 0;
  }

  let checkOut: Date;
  if (checkOutInput !== null && checkOutInput !== undefined) {
    checkOut = new Date(checkOutInput);
    if (isNaN(checkOut.getTime())) {
      console.warn(`[Attendance] Warning: Invalid checkOut timestamp provided: ${String(checkOutInput)}`);
      return 0;
    }
  } else if (options.allowLive) {
    checkOut = options.currentTime ? new Date(options.currentTime) : new Date();
    if (isNaN(checkOut.getTime())) {
      checkOut = new Date();
    }
  } else {
    // Missing checkout for historical or completed record calculation
    return 0;
  }

  const diffMs = checkOut.getTime() - checkIn.getTime();
  if (diffMs < 0) {
    console.warn(
      `[Attendance] Warning: Invalid negative duration detected. checkIn (${checkIn.toISOString()}) is after checkOut (${checkOut.toISOString()}).`
    );
    return 0;
  }

  return diffMs;
}

/**
 * Calculates duration in seconds between two complete timestamps.
 */
export function calculateAttendanceDurationSec(
  checkInInput: string | Date | null | undefined,
  checkOutInput?: string | Date | null | undefined,
  options: DurationOptions = {}
): number {
  const ms = calculateAttendanceDurationMs(checkInInput, checkOutInput, options);
  return Math.floor(ms / 1000);
}

/**
 * Format seconds into concise human-readable duration:
 * - 0m
 * - 12m
 * - 2h 05m
 * - 8h
 * - 8h 30m
 * - 9h 22m
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds <= 0 || isNaN(seconds)) {
    return '0m';
  }
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 1) {
    return '0m';
  }
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins < 10 ? '0' : ''}${mins}m`;
}

/**
 * Helper to calculate Monday 00:00:00 to Sunday 23:59:59 workweek bounds
 */
export function getWorkweekBounds(date: Date | string = new Date()) {
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
}

/**
 * Helper: UTC/Local workday bounds
 */
export function getWorkdayBounds(d: Date | string = new Date()) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

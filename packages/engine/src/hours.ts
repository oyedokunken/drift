import { OPERATING_END_MIN, OPERATING_START_MIN, OPERATING_TIME_ZONE } from './config.ts';

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: OPERATING_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function part(
  parts: readonly Intl.DateTimeFormatPart[],
  type: 'hour' | 'minute',
): number {
  return Number(parts.find((p) => p.type === type)?.value);
}

/**
 * True when `now` falls inside the hours every Tube line is expected to run. An invalid
 * date is outside them, so a bad clock never raises an alarm.
 */
export function isWithinOperatingHours(now: Date): boolean {
  if (Number.isNaN(now.getTime())) return false;
  const parts = clock.formatToParts(now);
  const minutes = part(parts, 'hour') * 60 + part(parts, 'minute');
  return minutes >= OPERATING_START_MIN && minutes < OPERATING_END_MIN;
}

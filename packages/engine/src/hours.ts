import { OPERATING_TIME_ZONE, SERVICE_WINDOWS, type DayType } from './config.ts';

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: OPERATING_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function part(
  parts: readonly Intl.DateTimeFormatPart[],
  type: 'weekday' | 'hour' | 'minute',
): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

function dayTypeOf(weekday: string): DayType {
  if (weekday === 'Sat') return 'saturday';
  if (weekday === 'Sun') return 'sunday';
  return 'weekday';
}

/**
 * True when `now` falls inside the service window for its London day type. An invalid
 * date is outside every window, so a bad clock never raises an alarm.
 */
export function isWithinOperatingHours(now: Date): boolean {
  if (Number.isNaN(now.getTime())) return false;
  const parts = clock.formatToParts(now);
  const minutes = Number(part(parts, 'hour')) * 60 + Number(part(parts, 'minute'));
  const window = SERVICE_WINDOWS[dayTypeOf(part(parts, 'weekday'))];
  return minutes >= window.startMin && minutes < window.endMin;
}

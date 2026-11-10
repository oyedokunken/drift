import { modeOfLine, type LineId, type ModeId } from '@drift/shared';

/**
 * Every threshold the engine uses. Each value is explained in docs/RULES.md and
 * was chosen from live TfL data observed on 2026-11-08 (a Sunday morning), so
 * all are provisional until overnight and weekday samples confirm them.
 */

/** Predictions older than this are ignored. Cron runs every 60 s and TfL caches for 60 s. */
export const ARRIVALS_MAX_AGE_SEC = 240;

/** "Soon" window for counting vehicles. */
export const NEAR_HORIZON_SEC = 15 * 60;

/** The feed looks ahead about 30 minutes (observed maximum 1831 s). */
export const FAR_HORIZON_SEC = 30 * 60;

/** Healthy Tube lines showed 10 to 68 vehicles in the near window. 3 sits far below all of them. */
export const QUIET_MIN_VEHICLES = 3;

/** Waterloo and City runs two trains, so the general floor would never be met. */
export const QUIET_MIN_VEHICLES_BY_LINE: Readonly<Record<string, number>> = {
  'waterloo-city': 1,
};

/** Below this many vehicles overall, a one sided count may be chance rather than a gap. */
export const LOPSIDED_MIN_TOTAL = 8;

/** A line counts as quiet in the network wide guard below this many near vehicles. */
export const NETWORK_QUIET_VEHICLES = 3;

/** Share of lines that must be quiet before the whole network is treated as quiet. */
export const NETWORK_QUIET_SHARE = 0.7;

/** Fewest fresh lines needed before the network wide guard can apply. */
export const NETWORK_MIN_LINES = 5;

/** About half the quietest healthy line (Circle, 10), so leftover predictions do not trip it. */
export const FLOWING_MIN_VEHICLES = 6;

/** Clearly healthy flow, used to raise confidence. */
export const FLOWING_HIGH_VEHICLES = 12;

/**
 * Typical gap between trains at a platform, as the median over platforms of the gap
 * between the first and second train. Healthy medians on 2026-11-08 were 3 minutes
 * (Victoria), 4 (Bakerloo) and 10 (Circle, the slowest). 15 is a 1.5 times margin, and
 * it can be reached: two trains inside the horizon can be 30 minutes apart.
 */
export const WIDE_HEADWAY_SEC = 15 * 60;

/** Headway this large is unambiguous. Reachable, since the horizon allows 30 minutes. */
export const WIDE_HEADWAY_HIGH_SEC = 25 * 60;

/**
 * A platform whose next train is this far off counts as waiting too long. On
 * 2026-11-08 the longest healthy wait was 18 minutes (Circle) and no platform on the
 * four sampled lines waited 20. Must stay below FAR_HORIZON_SEC to be reachable.
 */
export const LONG_WAIT_SEC = 20 * 60;

/**
 * Share of a line's platforms that must wait at least LONG_WAIT_SEC before the line is
 * flagged. No healthy platform did on the sampled lines, and 14 percent of the Circle
 * line's waited 15 minutes, so 30 percent is about twice the worst near miss.
 */
export const LONG_WAIT_PLATFORM_SHARE = 0.3;

/** A share this large of long waiting platforms is half the line, which is unambiguous. */
export const LONG_WAIT_HIGH_SHARE = 0.5;

/** Fewest platforms with a train before a wait or gap verdict can be trusted. */
export const MIN_PLATFORMS_MEASURED = 5;

/** Below this many measured platforms the wait and gap verdicts have low confidence. */
export const SMALL_SAMPLE_PLATFORMS = 10;

/** The three kinds of day the service window differs by, read in London local time. */
export type DayType = 'weekday' | 'saturday' | 'sunday';

/** A service window in London local time, as minutes after midnight: [start, end). */
export interface ServiceWindow {
  readonly startMin: number;
  readonly endMin: number;
}

/**
 * Hours inside which every line is expected to be running, per day type. All three are
 * provisional and deliberately narrower than the published first and last trains, so
 * the start and end of service never raise an alarm. Outside a window the zero trains
 * rule resolves to unknown, never to a mismatch.
 *
 * - weekday: the 2026-11-09 timetable probe showed Monday to Friday last departures at
 *   about 00:13 to 00:56, so 07:00 to 22:00 leaves hours of margin each side.
 * - saturday: the same probe showed late departures like a weekday, but Saturday
 *   starts later, so the window opens at 08:00 and closes at 21:30.
 * - sunday: the same probe showed Sunday last trains between 20:30 and 21:00 at the
 *   sampled stations, and the data is unreliable. Until a Sunday evening live check
 *   proves otherwise the window opens late (09:00) and closes early (19:30).
 */
export const SERVICE_WINDOWS: Readonly<Record<DayType, ServiceWindow>> = {
  weekday: { startMin: 7 * 60, endMin: 22 * 60 },
  saturday: { startMin: 8 * 60, endMin: 21 * 60 + 30 },
  sunday: { startMin: 9 * 60, endMin: 19 * 60 + 30 },
};

/** Time zone the operating hours are read in, so daylight saving needs no handling. */
export const OPERATING_TIME_ZONE = 'Europe/London';

/**
 * Lines that must be running normally (at least QUIET_MIN_VEHICLES due) before another
 * line with no trains at all can be called a mismatch.
 */
export const NO_TRAINS_MIN_RUNNING_LINES = 4;

/**
 * Lines with a fresh but empty feed at once that point to a feed fault. The worker fetches
 * lines in groups, so one empty response would empty several lines together.
 */
export const NO_TRAINS_FAULT_LINES = 2;

/** With Service Closed, this many vehicles or fewer still agrees with the status. */
export const CLOSED_MAX_VEHICLES = 2;

/** A match this close to a threshold is reported with medium rather than high confidence. */
export const NEAR_THRESHOLD_MARGIN = 0.25;

/** Which rules a line may raise. A rule that is off can never fire, whatever the data. */
export interface RuleSet {
  /**
   * Rules that count distinct vehicles: quiet while good, one sided service, flowing
   * while suspended and closed hours. Needs a feed with usable vehicle ids.
   */
  readonly vehicleCounts: boolean;
  /** Typical gap between trains at a platform. */
  readonly wideGaps: boolean;
  /** Share of platforms with no train due for a long time. */
  readonly longWaits: boolean;
  /** A Good Service line whose feed holds no predictions at all. */
  readonly noTrains: boolean;
}

/**
 * Everything the engine needs to know about a mode. Rules read from a profile, so a new
 * mode is a new entry here and not a fork of the engine.
 */
export interface ModeProfile {
  /** How far ahead a train counts, in seconds. Every time threshold below must fit in it. */
  readonly lookaheadSec: number;
  /**
   * False when the feed leaves `vehicleId` blank. Each prediction at a platform is then
   * one train, and distinct vehicles are not counted at all.
   */
  readonly vehicleIdsUsable: boolean;
  /**
   * True when every rule, and not only no trains, is held to the service window. The
   * Tube relies on its network wide quiet guard instead, which was proven on Tube data.
   */
  readonly allRulesInWindow: boolean;
  readonly rules: RuleSet;
  /** Per line replacements for `rules`, for lines that behave unlike the rest of the mode. */
  readonly lineRules: Readonly<Partial<Record<LineId, RuleSet>>>;
  readonly wideHeadwaySec: number;
  readonly wideHeadwayHighSec: number;
  readonly longWaitSec: number;
  readonly longWaitShare: number;
  readonly longWaitHighShare: number;
  readonly minPlatforms: number;
  readonly smallSamplePlatforms: number;
  readonly serviceWindows: Readonly<Record<DayType, ServiceWindow>>;
}

const ALL_RULES: RuleSet = {
  vehicleCounts: true,
  wideGaps: true,
  longWaits: true,
  noTrains: true,
};

/** The no trains rule only, for lines too infrequent to judge from a single snapshot. */
const NO_TRAINS_ONLY: RuleSet = {
  vehicleCounts: false,
  wideGaps: false,
  longWaits: false,
  noTrains: true,
};

/** The Tube, as every constant above was set from it. */
const TUBE_PROFILE: ModeProfile = {
  lookaheadSec: FAR_HORIZON_SEC,
  vehicleIdsUsable: true,
  allRulesInWindow: false,
  rules: ALL_RULES,
  lineRules: {},
  wideHeadwaySec: WIDE_HEADWAY_SEC,
  wideHeadwayHighSec: WIDE_HEADWAY_HIGH_SEC,
  longWaitSec: LONG_WAIT_SEC,
  longWaitShare: LONG_WAIT_PLATFORM_SHARE,
  longWaitHighShare: LONG_WAIT_HIGH_SHARE,
  minPlatforms: MIN_PLATFORMS_MEASURED,
  smallSamplePlatforms: SMALL_SAMPLE_PLATFORMS,
  serviceWindows: SERVICE_WINDOWS,
};

/**
 * The Elizabeth line, from the live feed on 2026-11-10 at 19:30 London time: 108
 * vehicles, 95 platforms, median gap 5.9 minutes but a 90th percentile gap of 12.6 and
 * 7 of 94 platforms with a gap of 15 minutes or more. Branches run at different
 * frequencies, so the spacing is irregular and the wide gaps rule is off. Only 3 of 94
 * platforms waited 20 minutes, so long waits stays on, with a higher share (40 percent)
 * than the Tube's because a branch with two trains an hour can wait that long legitimately.
 */
const ELIZABETH_PROFILE: ModeProfile = {
  ...TUBE_PROFILE,
  allRulesInWindow: true,
  rules: { ...ALL_RULES, wideGaps: false },
  longWaitShare: 0.4,
  longWaitHighShare: 0.6,
};

/**
 * The DLR, from the live feed on 2026-11-10 at 19:30 London time. `vehicleId` is blank
 * on all 271 predictions, so trains cannot be counted. Each prediction at a platform is
 * a train: median wait 3.2 minutes, median gap 5.0, 90th percentile gap 11.0, 1 of 98
 * platforms waiting 20 minutes. Those sit well inside the Tube's thresholds, which are
 * kept. Only the rules that count vehicles are off.
 */
const DLR_PROFILE: ModeProfile = {
  ...TUBE_PROFILE,
  vehicleIdsUsable: false,
  allRulesInWindow: true,
  rules: { ...ALL_RULES, vehicleCounts: false },
};

/**
 * The Overground, from the live feed on 2026-11-10 at 19:30 London time. Weaver showed a
 * median gap of exactly 15.0 minutes on Good Service and Lioness 13.0, so the wide gaps
 * rule would raise a false alarm on a healthy line and is off for the whole mode.
 * Liberty has 3 platforms and Suffragette 8, and Liberty, Lioness, Suffragette and
 * Weaver run a train every 15 to 30 minutes, so none can be judged by counting trains
 * or waits in one snapshot: they keep only the no trains rule. Mildmay (58 vehicles) and
 * Windrush (87) are frequent enough to keep the vehicle and long wait rules.
 */
const OVERGROUND_PROFILE: ModeProfile = {
  ...TUBE_PROFILE,
  allRulesInWindow: true,
  rules: NO_TRAINS_ONLY,
  lineRules: {
    mildmay: { ...ALL_RULES, wideGaps: false },
    windrush: { ...ALL_RULES, wideGaps: false },
  },
};

/**
 * Bus routes, checked one at a time when a visitor searches for them. Measured live on
 * 2026-11-10 at 19:50 London time on routes 207, 18, 490, W11, 73, 25, 5, 36, H98 and E1:
 * no healthy route had more than 7.7 percent of its stops wait 20 minutes (route 18)
 * except W11, a short route with 26 stops, at 19 percent. 40 percent is twice that.
 * Buses are not counted, so no vehicle rules, and the median gap is not trusted as an
 * alarm because routes bunch, so wide gaps is off. TfL reports a bus route as Good
 * Service or Special Service, so there is little status to contradict.
 */
export const BUS_PROFILE: ModeProfile = {
  ...TUBE_PROFILE,
  allRulesInWindow: true,
  rules: { ...NO_TRAINS_ONLY, longWaits: true },
  longWaitShare: 0.4,
  longWaitHighShare: 0.6,
  minPlatforms: 15,
  smallSamplePlatforms: 30,
};

/**
 * A long wait only counts on a route that normally runs often. A stop waiting 20 minutes
 * is ordinary on a route with a bus every 20, so routes with a typical gap above this are
 * left unknown. Routes checked ran 3.6 to 12 minutes apart at the median.
 */
export const BUS_FREQUENT_MAX_HEADWAY_SEC = 12 * 60;

/**
 * A route with no buses predicted is only a mismatch if an earlier reading, no older
 * than this, showed buses on it. Without that, a route that is not running today cannot
 * be told from one that has stopped.
 */
export const BUS_HISTORY_MAX_AGE_SEC = 90 * 60;

export const MODE_PROFILES: Readonly<Record<ModeId, ModeProfile>> = {
  tube: TUBE_PROFILE,
  'elizabeth-line': ELIZABETH_PROFILE,
  dlr: DLR_PROFILE,
  overground: OVERGROUND_PROFILE,
};

/** The profile for a line, and the rules that apply to that line within it. */
export function profileOf(lineId: LineId): ModeProfile {
  return MODE_PROFILES[modeOfLine(lineId)];
}

export function rulesOf(lineId: LineId): RuleSet {
  return profileOf(lineId).lineRules[lineId] ?? profileOf(lineId).rules;
}

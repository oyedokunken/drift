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

/** With Service Closed, this many vehicles or fewer still agrees with the status. */
export const CLOSED_MAX_VEHICLES = 2;

/** A match this close to a threshold is reported with medium rather than high confidence. */
export const NEAR_THRESHOLD_MARGIN = 0.25;

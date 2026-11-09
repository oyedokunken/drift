import { LINE_IDS, type LineId, type Snapshot, type Verdict } from '@drift/shared';

export const GENERATED_AT = '2026-11-08T09:00:00.000Z';

export function verdict(lineId: LineId, overrides: Partial<Verdict> = {}): Verdict {
  return {
    lineId,
    official: { severity: 10, label: 'Good Service' },
    observed: {
      vehicles15: 30,
      vehicles30: 35,
      inbound15: 15,
      outbound15: 15,
      headwaySec: 300,
      platformsMeasured: 40,
      longWaitPlatforms: 0,
    },
    outcome: 'match',
    ruleId: 'in-step',
    reason: 'Live trains are consistent with the official status.',
    confidence: 'high',
    ...overrides,
  };
}

export const quietVerdict = (lineId: LineId): Verdict =>
  verdict(lineId, {
    observed: {
      vehicles15: 1,
      vehicles30: 4,
      inbound15: 1,
      outbound15: 0,
      headwaySec: 600,
      platformsMeasured: 12,
      longWaitPlatforms: 0,
    },
    outcome: 'mismatch',
    ruleId: 'quiet-while-good',
    reason:
      'Official status is Good Service but only 1 train is due in the next 15 minutes.',
    confidence: 'medium',
  });

export const flowingVerdict = (lineId: LineId): Verdict =>
  verdict(lineId, {
    official: { severity: 2, label: 'Suspended' },
    outcome: 'mismatch',
    ruleId: 'flowing-while-suspended',
    reason: 'Official status is Suspended but 14 trains are due in the next 15 minutes.',
    confidence: 'high',
  });

export const gapsVerdict = (lineId: LineId): Verdict =>
  verdict(lineId, {
    observed: {
      vehicles15: 12,
      vehicles30: 14,
      inbound15: 6,
      outbound15: 6,
      headwaySec: 1080,
      platformsMeasured: 30,
      longWaitPlatforms: 0,
    },
    outcome: 'mismatch',
    ruleId: 'wide-gaps',
    reason: 'Official status is Good Service but trains are typically 18 minutes apart.',
    confidence: 'medium',
  });

export const longWaitsVerdict = (lineId: LineId): Verdict =>
  verdict(lineId, {
    observed: {
      vehicles15: 20,
      vehicles30: 24,
      inbound15: 10,
      outbound15: 10,
      headwaySec: 300,
      platformsMeasured: 40,
      longWaitPlatforms: 20,
    },
    outcome: 'mismatch',
    ruleId: 'long-waits',
    reason:
      'Official status is Good Service but 20 of 40 platforms have no train due for 20 minutes or more.',
    confidence: 'high',
  });

export const unknownVerdict = (
  lineId: LineId,
  ruleId: Verdict['ruleId'] = 'partial-status',
) =>
  verdict(lineId, {
    official: { severity: 4, label: 'Planned Closure' },
    observed: null,
    outcome: 'unknown',
    ruleId,
    reason: 'Live traffic cannot confirm or contradict a partial or planned status.',
    confidence: 'low',
  });

/** An eleven line snapshot where every line matches, unless `verdicts` replace some. */
export function snapshot(
  overrides: Partial<Snapshot> = {},
  replace: readonly Verdict[] = [],
): Snapshot {
  const verdicts = LINE_IDS.map(
    (lineId) => replace.find((v) => v.lineId === lineId) ?? verdict(lineId),
  );
  return {
    generatedAt: GENERATED_AT,
    statusAsOf: GENERATED_AT,
    arrivalsAsOf: '2026-11-08T08:59:30.000Z',
    stale: false,
    verdicts,
    ...overrides,
  };
}

export function snapshotResponse(body: unknown, serverTime = GENERATED_AT): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'X-Server-Time': serverTime },
  });
}

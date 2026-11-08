import { describe, expect, it } from 'vitest';
import { LINE_IDS } from '@drift/shared';
import statusFixture from '../../../packages/engine/fixtures/status-2026-11-08-sunday-morning.json' with { type: 'json' };
import {
  KEY,
  collectLogs,
  fakeFetch,
  json,
  omit,
  statusBody,
  tflPrediction,
  upstreamOptions,
} from '../test/helpers.ts';
import { LINE_GROUPS, fetchGroupPredictions, fetchStatuses } from './tfl.ts';
import { UpstreamError } from './upstream.ts';

function options(body: unknown) {
  const { fetch, calls } = fakeFetch(() => json(body));
  const { log, lines } = collectLogs();
  return { upstream: upstreamOptions(fetch, log), calls, log, lines };
}

describe('fetchStatuses', () => {
  it('reads the real captured status response and keeps only Tube lines', async () => {
    const { upstream } = options(statusFixture);
    const statuses = await fetchStatuses(upstream);
    expect(statuses.map((s) => s.lineId).sort()).toEqual([...LINE_IDS].sort());
  });

  it('keeps every status when a line has several', async () => {
    const { upstream } = options(statusFixture);
    const bakerloo = (await fetchStatuses(upstream)).find((s) => s.lineId === 'bakerloo');
    expect(bakerloo?.statuses).toEqual([
      { severity: 6, label: 'Severe Delays' },
      { severity: 3, label: 'Part Suspended' },
    ]);
  });

  it('asks TfL for the tube status', async () => {
    const { upstream, calls } = options(statusBody(['central']));
    await fetchStatuses(upstream);
    expect(calls[0]?.pathname).toBe('/Line/Mode/tube/Status');
  });

  it('ignores lines Drift does not evaluate and extra fields', async () => {
    const { upstream } = options([
      ...statusBody(['central', 'dlr', 'elizabeth']),
      { unrelated: 1 },
    ]);
    const statuses = await fetchStatuses(upstream);
    expect(statuses.map((s) => s.lineId)).toEqual(['central']);
  });

  it('drops a malformed line but keeps the rest', async () => {
    const broken = { id: 'victoria', lineStatuses: [{ statusSeverity: 'ten' }] };
    const { upstream } = options([...statusBody(['central']), broken]);
    expect((await fetchStatuses(upstream)).map((s) => s.lineId)).toEqual(['central']);
  });

  it.each([
    ['an object instead of a list', { lines: [] }],
    ['an empty list', []],
    ['only unreadable lines', [{ id: 'central' }, { id: 'victoria', lineStatuses: [] }]],
    ['only unknown lines', statusBody(['dlr'])],
    ['null', null],
  ])('fails with a parse error for %s', async (_name, body) => {
    const { upstream } = options(body);
    await expect(fetchStatuses(upstream)).rejects.toMatchObject({
      name: 'UpstreamError',
      failure: 'parse',
    });
  });
});

describe('fetchGroupPredictions', () => {
  it('reduces a full TfL prediction to the fields Drift uses', async () => {
    const { upstream, log } = options([tflPrediction()]);
    const { predictions } = await fetchGroupPredictions(['central'], upstream, log);
    expect(predictions).toEqual([
      {
        lineId: 'central',
        vehicleId: 'v1',
        naptanId: 'stop',
        platformName: 'Westbound - Platform 1',
        direction: 'inbound',
        timeToStation: 120,
      },
    ]);
  });

  it('requests all lines of a group in one call', async () => {
    const { upstream, log, calls } = options([]);
    await fetchGroupPredictions(['piccadilly', 'victoria'], upstream, log);
    expect(calls[0]?.pathname).toBe('/Line/piccadilly,victoria/Arrivals');
  });

  it.each([
    ['inbound', 'inbound'],
    ['outbound', 'outbound'],
    ['', undefined],
    ['sideways', undefined],
  ])('maps direction %j to %j', async (direction, expected) => {
    const { upstream, log } = options([tflPrediction({ direction })]);
    const { predictions } = await fetchGroupPredictions(['central'], upstream, log);
    expect(predictions[0]?.direction).toBe(expected);
  });

  it('leaves direction out when TfL omits it', async () => {
    const { upstream, log } = options([omit(tflPrediction(), 'direction')]);
    const { predictions } = await fetchGroupPredictions(['central'], upstream, log);
    expect(predictions[0]).not.toHaveProperty('direction');
  });

  it('treats a missing vehicle id as blank', async () => {
    const { upstream, log } = options([omit(tflPrediction(), 'vehicleId')]);
    const { predictions } = await fetchGroupPredictions(['central'], upstream, log);
    expect(predictions[0]?.vehicleId).toBe('');
  });

  it('accepts an empty list as a real answer', async () => {
    const { upstream, log } = options([]);
    expect((await fetchGroupPredictions(['central'], upstream, log)).predictions).toEqual(
      [],
    );
  });

  it('drops malformed items, keeps the good ones and logs the count', async () => {
    const { upstream, log, lines } = options([
      tflPrediction(),
      tflPrediction({ timeToStation: 'soon' }),
      tflPrediction({ lineId: 'dlr' }),
    ]);
    const { predictions } = await fetchGroupPredictions(['central'], upstream, log);
    expect(predictions).toHaveLength(1);
    expect(
      lines.some((l) => l.includes('predictions_dropped') && l.includes('"dropped":2')),
    ).toBe(true);
  });

  it.each([
    ['nothing in the list is readable', [tflPrediction({ timeToStation: null })]],
    ['the body is not a list', { error: 'nope' }],
  ])('fails with a parse error when %s', async (_name, body) => {
    const { upstream, log } = options(body);
    const error = await fetchGroupPredictions(['central'], upstream, log).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({ failure: 'parse' });
  });

  it('never puts the key in a parse failure message', async () => {
    const { upstream, log } = options({ error: KEY });
    const error = await fetchGroupPredictions(['central'], upstream, log).catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).not.toContain(KEY);
  });
});

describe('LINE_GROUPS', () => {
  it('covers every Tube line exactly once', () => {
    expect([...LINE_GROUPS.flat()].sort()).toEqual([...LINE_IDS].sort());
  });
});

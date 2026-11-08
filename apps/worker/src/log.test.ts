import { describe, expect, it, vi } from 'vitest';
import { consoleSink, createLogger } from './log.ts';

const KEY = 'sekrit-key-value';

describe('createLogger', () => {
  it('writes one JSON line with level, event and fields', () => {
    const lines: string[] = [];
    const log = createLogger(KEY, (line) => lines.push(line));
    log('info', 'refresh_done', { refreshed: 11, ok: true });
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      level: 'info',
      event: 'refresh_done',
      refreshed: 11,
      ok: true,
    });
  });

  it('redacts the key from any field', () => {
    const lines: string[] = [];
    const log = createLogger(KEY, (line) => lines.push(line));
    log('error', 'failed', {
      reason: `bad ${KEY}`,
      url: `https://x.test/?app_key=${KEY}`,
    });
    expect(lines.join('')).not.toContain(KEY);
    expect(lines.join('')).toContain('[REDACTED]');
  });

  it('works without fields', () => {
    const lines: string[] = [];
    createLogger(KEY, (line) => lines.push(line))('warn', 'hello');
    expect(JSON.parse(lines[0] ?? '')).toEqual({ level: 'warn', event: 'hello' });
  });
});

describe('consoleSink', () => {
  it('writes the line to the console', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleSink('{"a":1}');
    expect(spy).toHaveBeenCalledWith('{"a":1}');
    spy.mockRestore();
  });
});

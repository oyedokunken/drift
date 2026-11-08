import { redact } from './redact.ts';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export interface Logger {
  (level: LogLevel, event: string, fields?: LogFields): void;
}

/**
 * Structured JSON logger. Every line is passed through redaction as a whole, so a key
 * cannot leak through any field, however it got there.
 */
export function createLogger(key: string, sink: (line: string) => void): Logger {
  return (level, event, fields = {}) => {
    sink(redact(JSON.stringify({ level, event, ...fields }), key));
  };
}

/** The sink used in production: Workers collect console output as logs. */
export function consoleSink(line: string): void {
  // eslint-disable-next-line no-console -- the one place structured logs leave the Worker
  console.log(line);
}

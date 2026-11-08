import type { AxeMatchers } from 'vitest-axe/matchers';

declare module 'vitest' {
  // The interface must be extended in place for the matcher types to merge.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

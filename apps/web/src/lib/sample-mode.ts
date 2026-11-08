import { z } from 'zod';

/** The only value that turns sample mode on. Anything else is ignored. */
const sampleParamSchema = z.literal('1');

/** True only for `?sample=1`. The query string is user input, so it is parsed with Zod. */
export function isSampleRequested(search: string): boolean {
  return sampleParamSchema.safeParse(new URLSearchParams(search).get('sample')).success;
}

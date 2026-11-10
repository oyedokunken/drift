import { z } from 'zod';
import { lineIdSchema, modeIdSchema } from './lines.ts';

export const outcomeSchema = z.enum(['match', 'mismatch', 'unknown']);
export const confidenceSchema = z.enum(['high', 'medium', 'low']);

export const RULE_IDS = [
  'quiet-while-good',
  'flowing-while-suspended',
  'wide-gaps',
  'long-waits',
  'no-trains',
  'no-buses',
  'closed-hours',
  'in-step',
  'partial-status',
  'unclassified-status',
  'delays-unverifiable',
  'no-arrivals',
  'network-quiet',
  'not-measurable',
] as const;

export const ruleIdSchema = z.enum(RULE_IDS);

export const observedSchema = z.object({
  vehicles15: z.number().int().nonnegative().nullable(),
  vehicles30: z.number().int().nonnegative().nullable(),
  inbound15: z.number().int().nonnegative().nullable(),
  outbound15: z.number().int().nonnegative().nullable(),
  headwaySec: z.number().nonnegative().nullable(),
  platformsMeasured: z.number().int().nonnegative(),
  longWaitPlatforms: z.number().int().nonnegative(),
});

export const verdictSchema = z.object({
  lineId: lineIdSchema,
  /** The mode of the line. Defaults to the Tube so a snapshot stored before modes existed still parses. */
  mode: modeIdSchema.default('tube'),
  /** The status that drove the verdict, with every label joined when there are several. */
  official: z.object({ severity: z.number().int(), label: z.string().min(1) }),
  /** The live metrics used, or null when there was no usable arrivals data. */
  observed: observedSchema.nullable(),
  outcome: outcomeSchema,
  ruleId: ruleIdSchema,
  reason: z.string().min(1),
  confidence: confidenceSchema,
});

export type Outcome = z.infer<typeof outcomeSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type RuleId = z.infer<typeof ruleIdSchema>;
export type Observed = z.infer<typeof observedSchema>;
export type Verdict = z.infer<typeof verdictSchema>;

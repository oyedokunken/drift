import { LazyMotion, MotionConfig, stagger, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * The animation features are loaded after first paint. The `layout` prop that animates
 * lines when they reorder needs the larger `domMax` set, so it is fetched as its own
 * chunk instead of being part of the initial bundle.
 */
const loadFeatures = () => import('./features.ts').then((module) => module.default);

/**
 * Every animation in the app runs through here. `m` components only, loaded lazily, and
 * `reducedMotion="user"` turns movement into plain fades for people who ask for less.
 */
export function MotionRoot({ children }: { readonly children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}

const EASE = [0.2, 0, 0, 1] as const;

/** Children enter one after another. */
export const listVariants: Variants = {
  hidden: {},
  show: { transition: { delayChildren: stagger(0.05, { startDelay: 0.04 }) } },
};

/** A gentle rise and fade. Nothing bounces. */
export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
};

export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.24, ease: EASE } },
};

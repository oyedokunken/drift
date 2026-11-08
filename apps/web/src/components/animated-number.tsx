import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * A whole number that counts to its new value instead of jumping. The first value is
 * shown straight away, and the animation engine is fetched only when a change needs it.
 */
export function AnimatedNumber({ value }: { readonly value: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    if (reduced === true || current.current === value) {
      current.current = value;
      setShown(value);
      return;
    }

    let stop: (() => void) | undefined;
    let cancelled = false;
    void import('../motion/tween.ts').then(({ animate }) => {
      if (cancelled) return;
      const controls = animate(current.current, value, {
        duration: 0.6,
        ease: [0.2, 0, 0, 1],
        onUpdate: (latest) => {
          current.current = latest;
          setShown(Math.round(latest));
        },
      });
      stop = () => {
        controls.stop();
      };
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [value, reduced]);

  return <span className="hero__count">{shown}</span>;
}

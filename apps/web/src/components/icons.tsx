/**
 * Outcome icons. Solid shapes with heavy strokes, so they hold their contrast at small
 * sizes. Each is decorative: the text beside it carries the meaning.
 */

interface IconProps {
  readonly size?: number | undefined;
}

function Svg({
  size = 22,
  children,
}: IconProps & { readonly children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      {children}
    </svg>
  );
}

/** A solid core blue disc with a white tick. */
export function CheckIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="12" fill="var(--blue-600)" />
      <path
        d="M6.8 12.4 10.4 16 17.4 8.4"
        stroke="var(--white)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** A solid deep blue disc with two lines pulling apart. */
export function DriftIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="12" fill="var(--blue-900)" />
      <path
        d="M5.5 15.5H18.5"
        stroke="var(--blue-200)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M5.5 15.5C10 15.5 12 8.5 18.5 8.5"
        stroke="var(--white)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** A heavy dashed ring, for lines that could not be checked. */
export function DashedIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle
        cx="12"
        cy="12"
        r="10.4"
        stroke="var(--grey-700)"
        strokeWidth="2.6"
        strokeDasharray="4.6 3.4"
      />
    </Svg>
  );
}

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

/** A document with lines, for the open data licence. Uses the colour of its text. */
export function LicenceIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20V3.5Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M9 12h6M9 16h6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** The GitHub mark, solid. */
export function GithubIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        fill="currentColor"
        d="M12 1.5a10.5 10.5 0 0 0-3.32 20.47c.53.1.72-.23.72-.5v-1.8c-2.94.64-3.56-1.4-3.56-1.4-.48-1.22-1.17-1.55-1.17-1.55-.96-.65.07-.64.07-.64 1.06.07 1.62 1.09 1.62 1.09.94 1.62 2.47 1.15 3.07.88.1-.68.37-1.15.67-1.41-2.35-.27-4.82-1.17-4.82-5.22 0-1.15.41-2.09 1.09-2.83-.11-.27-.47-1.34.1-2.8 0 0 .89-.28 2.9 1.08a10 10 0 0 1 5.28 0c2.01-1.36 2.9-1.08 2.9-1.08.57 1.46.21 2.53.1 2.8.68.74 1.09 1.68 1.09 2.83 0 4.06-2.48 4.95-4.84 5.21.38.33.72.97.72 1.96v2.9c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5Z"
      />
    </Svg>
  );
}

/** Angle brackets, for the developer credit. */
export function CodeIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

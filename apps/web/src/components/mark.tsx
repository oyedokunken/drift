/**
 * The two diverging lines of the logo, drawn large and faint behind a band of deep blue.
 * Purely decorative, so it is hidden from assistive technology.
 */
export function BackdropMark({ className }: { readonly className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      fill="none"
      strokeWidth="3.2"
      strokeLinecap="round"
    >
      <path d="M8 32 H40" stroke="var(--blue-200)" />
      <path d="M8 32 C20 32 26 14 40 14" stroke="var(--white)" />
    </svg>
  );
}

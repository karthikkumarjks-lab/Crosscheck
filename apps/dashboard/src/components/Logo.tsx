/**
 * The CrossCheck mark: a rounded badge with a checkmark, in the brand
 * blue gradient -- reads as "verified" at a glance, the core promise of
 * the product (does the Target page match the Master?). Inline SVG (no
 * asset file) so it themes with the rest of the app via currentColor-free
 * gradient stops and renders crisply at any size.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="url(#crosscheck-logo-gradient)" />
      <path d="M9 16.8 13.2 21 23 10.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <defs>
        <linearGradient id="crosscheck-logo-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F9CF9" />
          <stop offset="1" stopColor="#1D5FD6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export const LOGO_FAVICON_DATA_URI =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#1D5FD6"/><path d="M9 16.8 13.2 21 23 10.5" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  );

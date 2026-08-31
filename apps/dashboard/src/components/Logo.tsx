/**
 * The CrossCheck mark: two overlapping "pages" (Master and Target, the
 * two things the product actually compares) with a checkmark badge
 * stamped on the front page's corner -- reads as "two pages, verified"
 * rather than a generic checkmark-in-a-box, which could belong to any
 * product. Inline SVG (no asset file) so it themes cleanly and renders
 * crisply at any size.
 */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3" y="6" width="17" height="21" rx="5" fill="#BFDDFB" />
      <rect x="12" y="9" width="17" height="20" rx="5" fill="url(#crosscheck-logo-gradient)" />
      <rect x="16" y="14" width="9" height="1.6" rx="0.8" fill="white" fillOpacity="0.85" />
      <rect x="16" y="18" width="6" height="1.6" rx="0.8" fill="white" fillOpacity="0.6" />
      <circle cx="24.5" cy="9.5" r="7" fill="white" stroke="url(#crosscheck-logo-gradient)" strokeWidth="1.6" />
      <path d="M21.3 9.7 23.4 11.8 27.6 7.3" stroke="#1D5FD6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <defs>
        <linearGradient id="crosscheck-logo-gradient" x1="12" y1="9" x2="29" y2="29" gradientUnits="userSpaceOnUse">
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
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="6" width="17" height="21" rx="5" fill="#BFDDFB"/><rect x="11" y="9" width="19" height="21" rx="5" fill="#1D5FD6"/><circle cx="25" cy="10" r="7.5" fill="white"/><path d="M21.5 10 23.7 12.2 28 7.6" stroke="#1D5FD6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  );

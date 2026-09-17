/**
 * Generic, bounded denylist of website-chrome / transactional-flow
 * vocabulary (OTP/login, payment, cookie/legal boilerplate, generic CTAs)
 * that must never be accepted as content for any of the Priority Fact
 * Comparison Report's fields, regardless of which heading it happens to
 * sit under.
 *
 * Root cause this exists to guard against: `extract.ts`'s heading-scoping
 * associates every text block with whichever heading was last seen in
 * document order (DOM proximity, not structural containment) — a
 * payment/OTP modal or lead-capture widget rendered between the
 * "Eligibility" heading and the next one inherits "Eligibility" as its
 * section purely by position. Real, live example: an Online Manipal page
 * whose Eligibility field was extracted as "Enter the 4 digit OTP
 * received on Note for online payments Manipal scholarship scheme...".
 * Every entry here is generic across ANY institution's site (never
 * target-specific — no site's own class names or copy), same
 * bounded/auditable/grows-from-real-evidence discipline as
 * `conceptSynonyms.ts`/`eligibilityFacts.ts`.
 */
const CHROME_NOISE_PATTERNS: RegExp[] = [
  /\bOTP\b/i,
  /\d\s*[-\s]?digit\s*(otp|code|pin)\b/i,
  /\bCVV\b/i,
  /\bcaptcha\b/i,
  /\b(log[\s-]?in|sign[\s-]?in|sign[\s-]?up)\b/i,
  /\bforgot\s*(your\s*)?password\b/i,
  /\bcookie(s)?\s*(policy|consent|preferences)\b/i,
  /\bprivacy\s*policy\b/i,
  /\bterms\s*(and|&)\s*conditions\b/i,
  /\badd\s*to\s*cart\b/i,
  /\bcheckout\b/i,
  /\bsubscribe\s*to\s*(our\s*)?newsletter\b/i,
  /\bclick\s*here\b/i,
  /\bsession\s*(has\s*)?expired\b/i,
  /\bplease\s*wait\b/i,
  /\bpage\s*not\s*found\b/i,
  // 2026-08-19: personal-detail registration/KYC form-field labels --
  // live-confirmed collision on a real Academic Bank of Credits (ABC)
  // account FAQ section, whose field-label list ("Roll number issued by
  // the university", "Name (as mentioned in Aadhaar)", "Date of Birth",
  // "Mobile number (linked to their Aadhaar)") is shape-identical to a
  // genuine specialization/subject list (short, capitalized, no digit) --
  // pulled it into the Specializations comparison as if these were
  // program offerings.
  /\baadhaar\b/i,
  /\bdate\s*of\s*birth\b/i,
  /\bmobile\s*number\b/i,
  /\broll\s*number\b/i,
  // 2026-08-19: card-widget "expand" link labels -- live-confirmed on a
  // real faculty-listing section ("Meet your expert faculty"), where
  // every card repeats its own "Read More" link as a separate short text
  // fragment, shape-identical to a named offering.
  /\bread\s*more\b/i,
  /\bview\s*more\b/i,
  /\bsee\s*more\b/i,
  // 2026-09-17: a generic "why choose us" benefits strip -- four short
  // icon-labeled items (regulatory-entitlement, industry-webinar-access,
  // a scholarship percentage, an alumni-network/legacy claim), each also
  // carrying its own one-sentence expansion (and, on some pages, a
  // "label: sentence" or "labelsentence" concatenated form of the same
  // item) -- embedded directly inside the page's real "Rankings &
  // Accreditations" section by DOM position, not under any separate
  // heading of its own, so a heading-level exclusion (like
  // `PROGRAM_USP_BANNER_HEADING_PATTERN`) can't catch it; this needs
  // item-level filtering instead. Live-confirmed word-for-word identical
  // across multiple different `onlinemanipal.com` SMU program pages
  // (distance-mba-smu, distance-mcom-smu) -- user report: "i face lot of
  // miss match in accration part... i need you to check the Logo of each
  // Accreditations and the ranking". None of these phrases describe an
  // actual ranking/accreditation fact.
  /^advantages$/i,
  /\bugc-entitled\s*degrees\b/i,
  /\bwebinars\s*(&|and)?\s*simulations\b|\battend\s*webinars\s*by\s*industry\s*experts\b/i,
  /\bscholarships?\s*up\s*to\s*\d+%|\bavail\s*scholarship\s*benefits\s*under\s*merit\b/i,
  /\b(reputed|prestigious)\s*(\w+\s*)?alumni\s*(status|network)\b|\byears?\s*of\s*\w*\s*legacy\b/i,
];

/** True when `text` is generic transactional/website chrome, never
 * genuine course/programme content — a candidate fact for any of the six
 * primary fields must be rejected outright when this returns true, no
 * matter which heading it was found under. */
export function isPageChromeNoise(text: string): boolean {
  return CHROME_NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

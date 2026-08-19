import type { SemanticFieldCategory } from "../types.js";

/**
 * The small, controlled keyword taxonomy behind `RuleBasedSemanticClassifier`
 * (§19 of the semantic layer plan: "do NOT solve this with a huge
 * hard-coded dictionary of every possible heading"). Each category gets a
 * short list of SIGNAL phrases, not an enumeration of every real-world
 * heading — "Combinations Available" is deliberately absent from
 * SPECIALIZATION's list below; it's recognized instead by content shape
 * (see `ruleBasedClassifier.ts`'s `contentShapeScore`), which is the whole
 * point of this being a classifier rather than a lookup table. Order
 * within this table is the tie-break priority when two categories score
 * equally (matches the Priority Fact Comparison Report's own field order:
 * Accreditation, Specialization, Fees, Duration, Rankings first).
 */
export const SEMANTIC_CATEGORY_KEYWORDS: Record<Exclude<SemanticFieldCategory, "OTHER">, string[]> = {
  ACCREDITATION: ["accreditation", "accreditations", "accredited", "approval", "approvals", "approved by", "recognition", "recognized", "recognised", "entitled", "naac", "ugc", "aicte", "nba accredited", "iso certified", "wes recognized"],
  SPECIALIZATION: [
    "specialization",
    "specializations",
    "specialisation",
    "specialisations",
    "elective",
    "electives",
    "combination",
    "combinations",
    "concentration",
    "concentrations",
    "major",
    "majors",
    "track",
    "tracks",
    "stream",
    "streams",
    "area of specialization",
    "areas of specialization",
  ],
  FEES: ["fee", "fees", "tuition", "cost", "price", "payment", "instalment", "installment", "emi", "programme fee", "program fee", "course fee"],
  COURSE_DURATION: ["duration", "course length", "program length", "programme length", "how long", "semesters", "months to complete", "years to complete"],
  RANKINGS: ["ranking", "rankings", "ranked", "rank", "nirf", "qs world", "qs ranking", "times higher", "ariia", "award", "awards", "awarded"],
  ELIGIBILITY: [
    "eligibility",
    "eligible",
    "who can apply",
    "prerequisite",
    "prerequisites",
    "minimum qualification",
    "eligibility criteria",
    "admission requirements",
    "academic requirements",
    "qualification required",
    "qualifications required",
  ],
  // Deliberately NOT a bare "online" keyword -- live-confirmed false
  // signal on `onlinemanipal.com`: "online" is a branding prefix on
  // nearly every heading on the entire site ("Online BA Course
  // curriculum", "Online BA Course Fee", "Eligibility for online BA"...),
  // not a genuine "here's our delivery mode" statement. It was tying
  // MODE against CURRICULUM's own "curriculum" heading-keyword match (one
  // keyword each = equal score), with the fixed category-priority list
  // arbitrarily picking MODE as the tie-break winner -- and since
  // `extractSemanticFacts` has no extraction branch for MODE at all, the
  // entire real curriculum section (121 text blocks, the actual
  // semester-wise subject list) was silently discarded every time. A page
  // genuinely describing its mode still matches via "mode"/"format"/
  // "delivery mode"/"distance learning"/"on-campus"/"hybrid"/"blended".
  MODE: ["mode", "format", "delivery mode", "distance learning", "on-campus", "hybrid", "blended"],
  ADMISSION: ["admission", "admissions", "application process", "how to apply", "enrollment", "enrolment", "registration process", "selection process"],
  PLACEMENT: ["placement", "placements", "hiring partner", "hiring partners", "career support", "recruiters", "job assistance"],
  // Deliberately NOT a bare "subjects" keyword -- live-confirmed collision
  // with FAQ-style headings like "What are the MBA course subjects?" on a
  // real onlinemanipal.com page, which would otherwise hijack a nearby
  // genuine Specializations section via DOM-proximity heading-scoping
  // (the same pre-existing Sprint 2 imprecision `looksLikeEligibilitySentence`
  // guards against elsewhere). "subjects covered" is specific enough to
  // avoid this; a bare "Subjects" heading is instead expected to be
  // recognized via CURRICULUM's own list-content once real evidence shows
  // it's needed, not added speculatively.
  CURRICULUM: ["curriculum", "syllabus", "subjects covered", "course content", "modules covered"],
  PROGRAM_STRUCTURE: ["program structure", "programme structure", "course structure", "semester wise", "credit structure", "credits"],
};

/** Priority order for tie-breaking equal scores — same order as the
 * table above, expressed as an array since object key order isn't a
 * contract worth relying on for tie-breaking logic. */
export const SEMANTIC_CATEGORY_PRIORITY: Exclude<SemanticFieldCategory, "OTHER">[] = [
  "ACCREDITATION",
  "SPECIALIZATION",
  "FEES",
  "COURSE_DURATION",
  "RANKINGS",
  "ELIGIBILITY",
  "MODE",
  "ADMISSION",
  "PLACEMENT",
  "CURRICULUM",
  "PROGRAM_STRUCTURE",
];

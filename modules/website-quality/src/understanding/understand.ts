import type { EntityGuess, ExtractedClaim, PageType, ParsedLandingPage } from "@crosscheck/core";
import { matchDegreeAndProgram } from "./degree.js";
import { matchInstitutionAndBrand } from "./institution.js";
import { matchPageType } from "./pageType.js";
import { extractClaims } from "./claims.js";
import { extractSpecializations } from "./specializations.js";

export interface Understanding {
  brand: EntityGuess | null;
  institution: EntityGuess | null;
  program: EntityGuess | null;
  degree: EntityGuess | null;
  pageType: EntityGuess<PageType> | null;
  claims: ExtractedClaim[];
  specializations: ExtractedClaim[];
}

/**
 * Component C — orchestrates generic, data-driven understanding of a
 * parsed landing page. See docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md
 * "Relationship to the Sprint 1 Design" for why this doesn't use the
 * Source Registry.
 */
export function understandLandingPage(parsed: ParsedLandingPage): Understanding {
  const { degree, program } = matchDegreeAndProgram(parsed);
  const { institution, brand } = matchInstitutionAndBrand(parsed);
  const pageType = matchPageType(parsed, degree);
  const claims = extractClaims(parsed);
  const specializations = extractSpecializations(parsed);

  return { brand, institution, program, degree, pageType, claims, specializations };
}

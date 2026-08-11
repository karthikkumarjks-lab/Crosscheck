import type { InstitutionResolutionResult, InstitutionSignalResult } from "@crosscheck/core";

const TIER_LABEL: Record<"url" | "pageIdentity" | "logo", string> = {
  url: "URL",
  pageIdentity: "Page content",
  logo: "Logo",
};

function SignalRow({ tier, signal }: { tier: "url" | "pageIdentity" | "logo"; signal: InstitutionSignalResult }) {
  return (
    <li className={`signal-row signal-row--${signal.strength}`}>
      <span className="signal-row__tier">{TIER_LABEL[tier]}</span>
      <span className="signal-row__strength">{signal.strength}</span>
      <span className="signal-row__evidence">{signal.evidence}</span>
    </li>
  );
}

/**
 * Renders the target's own standalone Institution Identity Resolution
 * evidence -- every one of the three signal tiers, always, whether or not
 * it ended up contributing to the final decision. Never hides an
 * "inconclusive"/"none" tier; that absence of evidence is itself part of
 * the audit trail.
 */
export function SignalEvidenceList({ identity }: { identity: InstitutionResolutionResult }) {
  return (
    <div className="signal-evidence">
      <ul className="signal-row-list">
        <SignalRow tier="url" signal={identity.signals.url} />
        <SignalRow tier="pageIdentity" signal={identity.signals.pageIdentity} />
        <SignalRow tier="logo" signal={identity.signals.logo} />
      </ul>
      {identity.status === "conflict" && identity.conflictingInstitutionIds && (
        <p className="signal-evidence__conflict">
          Signals disagree: {identity.conflictingInstitutionIds.join(" vs. ")}. CrossCheck will not choose between them.
        </p>
      )}
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router";
import { createRun } from "../api/client.js";

function parseTargetUrls(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Mirrors the six primary Priority Fact Comparison Report rows
 * (`packages/core`'s `buildPriorityComparison` -- Fee Structure,
 * Eligibility, Specializations, Course Duration, Course Curriculum,
 * Others) so a first-time user sees, before ever running anything, the
 * exact fields their report will contain. Display copy only -- never a
 * second source of truth for what the backend actually compares. */
const CHECKED_FIELDS = [
  { label: "Fee Structure", detail: "Full fee, semester fee, discounts, EMI — compared component by component, not as one number." },
  { label: "Eligibility", detail: "Qualification, minimum percentage, institution requirement, work experience." },
  { label: "Specializations", detail: "Every named specialization or elective, matched by meaning, not exact wording." },
  { label: "Course Duration", detail: "Recognizes equivalent phrasing, e.g. “2 years” and “24 months”." },
  { label: "Course Curriculum", detail: "The real subject list, semester by semester." },
  { label: "Others", detail: "Placement support, projects, certifications, and other program-level facts." },
];

/** The only client-side validation here is "is this shaped like a URL
 * list" -- never whether it will actually resolve. Resolution validity is
 * entirely the backend's call. */
export function NewRunPage() {
  const [masterUrl, setMasterUrl] = useState("");
  const [targetUrlsRaw, setTargetUrlsRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const targetUrls = parseTargetUrls(targetUrlsRaw);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!masterUrl.trim()) {
      setError("Master URL is required.");
      return;
    }
    if (targetUrls.length === 0) {
      setError("At least one target URL is required.");
      return;
    }
    setSubmitting(true);
    try {
      const { runId } = await createRun(masterUrl.trim(), targetUrls);
      navigate(`/runs/${runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run.");
      setSubmitting(false);
    }
  }

  return (
    <div className="new-run-layout">
      <form className="new-run-form" onSubmit={handleSubmit}>
        <h1>New CrossCheck run</h1>
        <p className="new-run-form__intro">Compare a source page against one or more target pages and get a field-by-field report of what matches, what's changed, and what's missing.</p>
        <label className="new-run-form__field">
          Master URL
          <input type="text" value={masterUrl} onChange={(e) => setMasterUrl(e.target.value)} placeholder="Enter your master URL" />
        </label>
        <label className="new-run-form__field">
          Target URLs (one per line)
          <textarea rows={10} value={targetUrlsRaw} onChange={(e) => setTargetUrlsRaw(e.target.value)} placeholder="Enter the list of website URLs to check against the master URL" />
        </label>
        <p className="new-run-form__count">{targetUrls.length} target URL{targetUrls.length === 1 ? "" : "s"}</p>
        {error && <p className="new-run-form__error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Starting…" : "Run comparison"}
        </button>
      </form>

      <aside className="new-run-info" aria-label="What CrossCheck checks">
        <h2 className="new-run-info__title">What gets checked</h2>
        <p className="new-run-info__subtitle">Every run produces the same six-field report, so results are consistent no matter which pages you're comparing.</p>
        <ul className="new-run-info__list">
          {CHECKED_FIELDS.map((field) => (
            <li key={field.label} className="new-run-info__item">
              <span className="new-run-info__check" aria-hidden="true">
                ✓
              </span>
              <div>
                <div className="new-run-info__label">{field.label}</div>
                <div className="new-run-info__detail">{field.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

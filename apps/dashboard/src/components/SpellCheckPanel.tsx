import type { SpellCheckResult, TargetRunResult } from "@crosscheck/core";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlights every occurrence of the misspelled word inside its own
 * excerpt, in red -- 2026-09-03 user request: "i count not able to
 * access the spell check location... highlight the text with red
 * colour to identify". The Master/Target link goes to the real,
 * external, live page (which this tool doesn't control and can't mark
 * up) -- this excerpt, already extracted by the backend, is the one
 * place a location can actually be highlighted, so that's where this
 * renders. Case-insensitive (the word is stored lowercased as the map
 * key, but the excerpt keeps the page's real casing).
 */
function HighlightedExcerpt({ excerpt, word }: { excerpt: string; word: string }) {
  const parts = excerpt.split(new RegExp(`(${escapeRegExp(word)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === word.toLowerCase() ? (
          <mark key={i} className="spell-check-panel__highlight">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * One side (Master or Target) of the spell-check result -- independent
 * checks, never a comparison between the two (2026-09-02 user request:
 * "Dont compare — you say there is spell miss in target and master. If
 * none say 0. Need the count, if I open then it shows the locations").
 * The count always renders, 0 when clean; the word-by-word location
 * breakdown only renders when there's something to show.
 */
function SpellCheckSide({ label, result }: { label: string; result: SpellCheckResult }) {
  return (
    <div className={`spell-check-panel__side spell-check-panel__side--${result.count === 0 ? "clean" : "issues"}`}>
      <h3>
        {label}: {result.count} {result.count === 1 ? "misspelling" : "misspellings"}
      </h3>
      {result.count > 0 && (
        <ul className="spell-check-panel__list">
          {result.items.map((item) => (
            <li key={item.word}>
              <strong>{item.word}</strong>
              <ul className="spell-check-panel__locations">
                {item.locations.map((location, i) => (
                  <li key={i}>
                    <code>{location.fieldKey}</code>: "<HighlightedExcerpt excerpt={location.excerpt} word={item.word} />"
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The full spell-check drill-down for one target -- "opening" this page
 * (via the overview's "View full report" link) is how the overview's
 * count column reaches its locations, per the user's explicit spec.
 * `null` (no successful comparison ran) renders nothing, same convention
 * as every other conditionally-rendered detail-page section.
 */
export function SpellCheckPanel({ spellCheck }: { spellCheck: TargetRunResult["spellCheck"] }) {
  if (!spellCheck) return null;
  return (
    // `id`: the overview's Spell Check "M:<n>"/"T:<n>" links here (see
    // `TargetTable.tsx`'s `SpellCheckSideLink`) -- this is where a
    // misspelling can actually be located, highlighted below; the real
    // page itself isn't and can't be marked up by this tool.
    <section className="spell-check-panel" id="spell-check">
      <h2>Spell Check</h2>
      <p className="target-detail__secondary-note">
        Each page's own text, checked independently — never a comparison between Master and Target. The misspelled word is highlighted below within the extracted
        text.
      </p>
      <div className="spell-check-panel__grid">
        <SpellCheckSide label="Master" result={spellCheck.master} />
        <SpellCheckSide label="Target" result={spellCheck.target} />
      </div>
    </section>
  );
}

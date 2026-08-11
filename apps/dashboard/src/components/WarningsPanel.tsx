/** Always rendered when non-empty, even on `outcome: "success"` -- a
 * warning is never hidden just because the overall result looks fine. */
export function WarningsPanel({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="warnings-panel">
      {warnings.map((w, i) => (
        <li key={i} className="warnings-panel__item">
          {w}
        </li>
      ))}
    </ul>
  );
}

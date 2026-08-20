import { Link } from "react-router";

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="back-link">
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}

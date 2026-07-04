import { Link } from "react-router-dom";

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link className="back" to={to}>
      ← {label}
    </Link>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div className="empty">{label}</div>;
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return <div className="error-box">{message}</div>;
}

export function EmptyState({ icon = "⛳", label }: { icon?: string; label: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      {label}
    </div>
  );
}

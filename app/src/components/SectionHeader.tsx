export function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="sh">
      <div>
        <div className="sh-title">{title}</div>
        {sub && <div className="sh-sub">{sub}</div>}
      </div>
    </div>
  );
}

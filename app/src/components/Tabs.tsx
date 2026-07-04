export function Tabs<T extends string>({
  options,
  active,
  onChange,
}: {
  options: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs">
      {options.map((o) => (
        <button key={o.id} className={`tab ${active === o.id ? "on" : "off"}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
